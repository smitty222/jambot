// src/games/roulette.js

import { postMessage } from '../libs/cometchat.js'
import {
  getUserWallet,
  creditGameWin,
  debitGameBet
} from '../database/dbwalletmanager.js'
import { getUserNickname } from '../utils/nickname.js' // <- avoid circular import

// Game state
let rouletteGameActive = false
let betsOpen = false
const bets = {}
const room = process.env.ROOM_UUID

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getRouletteColor (number) {
  if (number === 0 || number === '00') return 'green'
  const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
  const black = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]
  if (red.includes(number)) return 'red'
  if (black.includes(number)) return 'black'
  return 'unknown'
}

function getDozenRange (dozen) {
  switch (dozen) {
    case 1: return Array.from({ length: 12 }, (_, i) => i + 1)
    case 2: return Array.from({ length: 12 }, (_, i) => i + 13)
    case 3: return Array.from({ length: 12 }, (_, i) => i + 25)
    default: return []
  }
}

function parse00 (token) {
  // Accept "00" or "0" prefixed variations that might show up
  // Primary goal: support `/00 50` and `/number 00 50`
  return token === '00'
}

// ──────────────────────────────────────────────
// Game flow
// ──────────────────────────────────────────────

export async function startRouletteGame () {
  if (rouletteGameActive) return
  rouletteGameActive = true
  betsOpen = true

  await postMessage({ room, message: '', images: ['https://i.giphy.com/media/qH1jQOvi4WVEvCRvOg/giphy.gif'] })
  await postMessage({ room, message: '🎉 Welcome to the Roulette Table! 🎉' })
  await postMessage({ room, message: '', images: ['https://imgur.com/IyFZlzj.jpg'] })
  await postMessage({ room, message: 'Place your bets! Betting closes in 45 seconds.' })

  await new Promise(res => setTimeout(res, 30_000))
  if (!rouletteGameActive) return
  await postMessage({ room, message: '⌛ 15 seconds left to place bets!' })
  await new Promise(res => setTimeout(res, 15_000))

  await postMessage({ room, message: '', images: ['https://i.giphy.com/media/qNCtzhsWCc7q4D2FB5/giphy.gif'] })
  await closeBets()
}

async function closeBets () {
  if (!rouletteGameActive) return

  // ✅ hard cutoff so late messages don't sneak in after "closed"
  betsOpen = false

  await postMessage({ room, message: '🛑 Betting is now closed!' })
  await new Promise(res => setTimeout(res, 2000))

  if (!Object.keys(bets).length) {
    await postMessage({ room, message: 'No bets were placed. Spinning anyway for fun 🎡' })
  } else {
    let betsMessage = '📋 Bets placed:\n'
    for (const [user, userBets] of Object.entries(bets)) {
      const nickname = await getUserNickname(user)
      betsMessage += `${nickname}:\n`
      betsMessage += userBets.map(bet => {
        if (bet.type === 'number') return `  - Number ${bet.number} ($${bet.amount})`
        if (bet.type === 'dozen') return `  - Dozen ${bet.dozen} ($${bet.amount})`
        return `  - ${bet.type} ($${bet.amount})`
      }).join('\n') + '\n'
    }
    await postMessage({ room, message: betsMessage })
  }

  await new Promise(res => setTimeout(res, 5000))
  await drawWinningNumber()
}

async function drawWinningNumber () {
  // American roulette: 0–36 plus 37 = "00"
  const numbers = [...Array(37).keys(), 37]
  const index = Math.floor(Math.random() * numbers.length)
  const number = numbers[index] // 0..36 or 37 sentinel for "00"
  const value = (number === 37) ? '00' : number // display + color check
  const color = getRouletteColor(value)

  await postMessage({ room, message: `🎯 The wheel landed on ${value} (${color})!` })

  for (const [user, userBets] of Object.entries(bets)) {
    let totalWinnings = 0

    for (const bet of userBets) {
      const amt = bet.amount

      switch (bet.type) {
        case 'red':
        case 'black':
        case 'green':
          if (bet.type === color) totalWinnings += amt * 2
          break

        case 'odd':
          if (number !== 0 && number !== 37 && number % 2 === 1) totalWinnings += amt * 2
          break

        case 'even':
          if (number !== 0 && number !== 37 && number % 2 === 0) totalWinnings += amt * 2
          break

        case 'high':
          if (number >= 19 && number <= 36) totalWinnings += amt * 2
          break

        case 'low':
          if (number >= 1 && number <= 18) totalWinnings += amt * 2
          break

        case 'number': {
          // ✅ Correct straight-up logic:
          // - if bet.number is '00', it only wins when value === '00'
          // - if bet.number is numeric 0..36, it only wins when number matches
          if (bet.number === '00') {
            if (value === '00') totalWinnings += amt * 36
          } else {
            if (bet.number === number) totalWinnings += amt * 36
          }
          break
        }

        case 'dozen':
          // Dozens don't include 0 or 00; using numeric `number` excludes 37 automatically
          if (getDozenRange(bet.dozen).includes(number)) totalWinnings += amt * 3
          break
      }
    }

    const nickname = await getUserNickname(user)

    if (totalWinnings > 0) {
      await creditGameWin(user, totalWinnings)
      await postMessage({ room, message: `💰 ${nickname} won $${totalWinnings}!` })
    } else if (userBets.length) {
      await postMessage({ room, message: `😢 ${nickname} did not win this round.` })
    }
  }

  // Reset state
  Object.keys(bets).forEach(k => delete bets[k])
  betsOpen = false
  rouletteGameActive = false
}

// ──────────────────────────────────────────────
// Bet handler
// ──────────────────────────────────────────────

export async function handleRouletteBet (payload) {
  // ✅ must be active AND bets must be open
  if (!rouletteGameActive || !betsOpen) return

  const user = payload.sender
  const nickname = await getUserNickname(user)
  const raw = String(payload.message || '').trim()

  if (!raw.startsWith('/')) return

  const parts = raw.split(/\s+/)
  if (parts.length < 2) {
    return postMessage({ room, message: `${nickname}, usage: /<bet> <amount>` })
  }

  const cmdToken = parts[0].substring(1).toLowerCase() // e.g. "red", "17", "number", "dozen", "00"
  const amt = Number(parts[parts.length - 1])

  if (!Number.isFinite(amt) || amt <= 0) {
    return postMessage({ room, message: `${nickname}, please enter a valid bet amount.` })
  }

  // Resolve bet type
  let bet = null

  // `/00 50`
  if (parse00(cmdToken)) {
    bet = { type: 'number', number: '00', amount: amt }
  } else {
    const directNum = Number(cmdToken)

    if (Number.isInteger(directNum) && directNum >= 0 && directNum <= 36) {
      // `/17 50`
      bet = { type: 'number', number: directNum, amount: amt }
    } else if (cmdToken === 'number' && parts.length >= 3) {
      // `/number 17 50` or `/number 00 50`
      const nToken = String(parts[1]).toLowerCase()
      if (parse00(nToken)) {
        bet = { type: 'number', number: '00', amount: amt }
      } else {
        const n = Number(parts[1])
        if (Number.isInteger(n) && n >= 0 && n <= 36) {
          bet = { type: 'number', number: n, amount: amt }
        }
      }
    } else if (cmdToken === 'dozen' && parts.length >= 3) {
      // `/dozen 2 50`
      const d = Number(parts[1])
      if ([1, 2, 3].includes(d)) {
        bet = { type: 'dozen', dozen: d, amount: amt }
      }
    } else if (['red', 'black', 'green', 'odd', 'even', 'high', 'low'].includes(cmdToken)) {
      // `/red 50`, `/odd 25`, etc.
      bet = { type: cmdToken, amount: amt }
    }
  }

  if (!bet) {
    return postMessage({
      room,
      message: `${nickname}, invalid bet. Examples:\n` +
        '• `/red 50`\n' +
        '• `/17 25`\n' +
        '• `/0 10`\n' +
        '• `/00 10`\n' +
        '• `/number 7 25`\n' +
        '• `/number 00 25`\n' +
        '• `/dozen 2 50`'
    })
  }

  // Check & debit balance from real wallet
  const balance = await getUserWallet(user)
  if (balance < amt) {
    return postMessage({ room, message: `${nickname}, insufficient funds. Balance: $${balance}.` })
  }

  const ok = await debitGameBet(user, amt)
  if (!ok) {
    return postMessage({ room, message: `${nickname}, failed to place bet (wallet issue).` })
  }

  if (!bets[user]) bets[user] = []
  bets[user].push(bet)

  const betLabel =
    bet.type === 'number'
      ? `Number ${bet.number}`
      : bet.type === 'dozen'
        ? `Dozen ${bet.dozen}`
        : bet.type

  await postMessage({
    room,
    message: `${nickname} placed $${amt} on ${betLabel}.`
  })
}

// ──────────────────────────────────────────────

export { rouletteGameActive }