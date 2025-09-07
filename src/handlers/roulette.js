import { postMessage } from '../libs/cometchat.js'
import { loadWallets } from '../database/dbwalletmanager.js'
import { getUserNickname } from './message.js'

// Game state
let rouletteGameActive = false
const bets = {}
const defaultWalletSize = 50
const room = process.env.ROOM_UUID

// Winning number color logic
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

function isDirectNumberBet (message) {
  const cmd = message.split(' ')[0].substring(1)
  const number = parseInt(cmd, 10)
  return !isNaN(number) && number >= 0 && number <= 36
}

async function initializeWallet (user) {
  try {
    const wallets = await loadWallets()
    if (!wallets[user]) {
      wallets[user] = { balance: defaultWalletSize }
      return defaultWalletSize
    }
    return wallets[user].balance
  } catch (error) {
    console.error('Wallet init failed:', error)
    throw error
  }
}

export async function startRouletteGame (payload) {
  rouletteGameActive = true

  await postMessage({ room, message: '', images: ['https://i.giphy.com/media/qH1jQOvi4WVEvCRvOg/giphy.gif'] })
  await postMessage({ room, message: '🎉 Welcome to the Roulette Table! 🎉' })
  await postMessage({ room, message: '', images: ['https://imgur.com/IyFZlzj.jpg'] })
  await postMessage({ room, message: 'Place your bets! Betting closes in 90 seconds.' })

  await new Promise(res => setTimeout(res, 75000))
  await postMessage({ room, message: '⌛ 15 seconds left to place bets!' })
  await new Promise(res => setTimeout(res, 15000))

  await postMessage({ room, message: '', images: ['https://i.giphy.com/media/qNCtzhsWCc7q4D2FB5/giphy.gif'] })
  await closeBets()
}

async function closeBets () {
  if (!rouletteGameActive) return
  await postMessage({ room, message: '🛑 Betting is now closed!' })

  await new Promise(res => setTimeout(res, 2000))

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
  await new Promise(res => setTimeout(res, 5000))
  await drawWinningNumber()
}

async function drawWinningNumber () {
  const numbers = [...Array(37).keys(), 37]
  const index = Math.floor(Math.random() * numbers.length)
  const number = numbers[index]
  const value = number === 37 ? '00' : number
  const color = getRouletteColor(value)

  await postMessage({ room, message: `🎯 The wheel landed on ${value} (${color})!` })

  const wallets = await loadWallets()

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
        case 'number':
          if (bet.number === number) totalWinnings += amt * 36
          break
        case 'dozen':
          if (getDozenRange(bet.dozen).includes(number)) totalWinnings += amt * 3
          break
      }
    }

    const nickname = await getUserNickname(user)

    if (totalWinnings > 0) {
      wallets[user].balance += totalWinnings
      await postMessage({ room, message: `💰 ${nickname} won $${totalWinnings}!` })
    } else {
      await postMessage({ room, message: `😢 ${nickname} did not win this round.` })
    }
  }

  Object.keys(bets).forEach(k => delete bets[k])
  rouletteGameActive = false
}

export async function handleRouletteBet (payload) {
  const user = payload.sender
  const nickname = await getUserNickname(user)
  const parts = payload.message.trim().split(' ')
  const cmd = parts[0].substring(1).toLowerCase()
  const amt = parseFloat(parts.at(-1))

  if (isNaN(amt) || amt <= 0) {
    return postMessage({ room, message: `${nickname}, please enter a valid bet amount.` })
  }

  const wallets = await loadWallets()
  if (!wallets[user]) wallets[user] = { balance: defaultWalletSize }
  if (wallets[user].balance < amt) {
    return postMessage({ room, message: `${nickname}, insufficient funds.` })
  }

  wallets[user].balance -= amt

  if (!bets[user]) bets[user] = []

  const isNumber = !isNaN(cmd) && parseInt(cmd) >= 0 && parseInt(cmd) <= 36
  const bet = isNumber
    ? { type: 'number', number: parseInt(cmd), amount: amt }
    : cmd.startsWith('number') && parts.length >= 3
      ? { type: 'number', number: parseInt(parts[1]), amount: amt }
      : cmd.startsWith('dozen') && parts.length >= 3
        ? { type: 'dozen', dozen: parseInt(parts[1]), amount: amt }
        : { type: cmd, amount: amt }

  bets[user].push(bet)

  await postMessage({
    room,
    message: `${nickname} placed $${amt} on ${bet.type}${bet.number !== undefined ? ` ${bet.number}` : bet.dozen ? ` Dozen ${bet.dozen}` : ''}.`
  })
}

export async function handleBalanceCommand (payload) {
  const user = payload.sender
  const nickname = await getUserNickname(user)
  const balance = await initializeWallet(user)
  await postMessage({ room, message: `${nickname}, your balance is $${balance.toLocaleString()}.` })
}

export async function showAllBets () {
  const summary = await Promise.all(Object.entries(bets).map(async ([user, userBets]) => {
    const name = await getUserNickname(user)
    const betList = userBets.map(b => {
      if (b.type === 'number') return `${b.number} ($${b.amount})`
      if (b.type === 'dozen') return `Dozen ${b.dozen} ($${b.amount})`
      return `${b.type} ($${b.amount})`
    }).join(', ')
    return `${name}: ${betList}`
  }))

  await postMessage({ room, message: '🎰 Current Bets:\n' + summary.join('\n') })
}

export {
  rouletteGameActive
}
