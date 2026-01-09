import { addToUserWallet, getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js'
import db from '../database/db.js'

// ───────────────────────────────────────────────────────────
// Slot machine symbols and payouts (ONE LINE)
// ───────────────────────────────────────────────────────────

const symbols = ['🍒', '🍋', '🍊', '🍉', '🔔', '⭐', '💎']

const payouts = {
  '🍒🍒🍒': 5,
  '🍋🍋🍋': 4,
  '🍊🍊🍊': 3,
  '🍉🍉🍉': 6,
  '🔔🔔🔔': 8,
  '⭐⭐⭐': 10,
  '💎💎💎': 20 // triggers BONUS ROUND
}

const twoMatchPayouts = {
  '🍒🍒': 2,
  '🍋🍋': 1.5,
  '🍊🍊': 1.2,
  '🍉🍉': 2.5,
  '🔔🔔': 3,
  '⭐⭐': 4,
  '💎💎': 5
}

// Economy tuning
const HOUSE_EDGE = 0.96

// Progressive jackpot
const JACKPOT_SEED = 100
const JACKPOT_INCREMENT_RATE = 0.15
const JACKPOT_CONTRIB_BET_CAP = 5000

// Bonus round tuning
const BONUS_SPINS_MIN = 3
const BONUS_SPINS_MAX = 5
const BONUS_MAX_TOTAL_PERCENT = 80

const BONUS_PERCENT_WEIGHTS = [
  { pct: 5, w: 26 },
  { pct: 8, w: 22 },
  { pct: 10, w: 18 },
  { pct: 12, w: 14 },
  { pct: 15, w: 10 },
  { pct: 20, w: 7 },
  { pct: 25, w: 3 }
]

// Bets
const MIN_BET = 1
const MAX_BET = 10000
const DEFAULT_BET = 1

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

function randSymbol () {
  return symbols[Math.floor(Math.random() * symbols.length)]
}

function spinSlots () {
  return [randSymbol(), randSymbol(), randSymbol()]
}

function randInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function weightedPick (items) {
  const total = items.reduce((s, it) => s + it.w, 0)
  let r = Math.random() * total
  for (const it of items) {
    r -= it.w
    if (r <= 0) return it
  }
  return items[items.length - 1]
}

export function formatBalance (balance) {
  const rounded = Math.round(Number(balance) || 0)
  return rounded > 999 ? rounded.toLocaleString() : rounded.toString()
}

function formatMoney (amount) {
  const n = Number(amount) || 0
  const isWhole = Math.abs(n - Math.round(n)) < 0.00001
  return isWhole ? formatBalance(n) : n.toFixed(2)
}

// ───────────────────────────────────────────────────────────
// Jackpot DB helpers
// ───────────────────────────────────────────────────────────

function getJackpotValue () {
  const row = db.prepare('SELECT progressiveJackpot FROM jackpot WHERE id = 1').get()
  return Number(row?.progressiveJackpot || JACKPOT_SEED)
}

function updateJackpotValue (newValue) {
  db.prepare('UPDATE jackpot SET progressiveJackpot = ? WHERE id = 1').run(Number(newValue))
  console.log(`🎰 Jackpot updated: $${newValue}`)
}

// ───────────────────────────────────────────────────────────
// Line evaluation
// ───────────────────────────────────────────────────────────

function evaluateLine (symbolsArr) {
  const str = symbolsArr.join('')

  if (Object.prototype.hasOwnProperty.call(payouts, str)) {
    return { multiplier: payouts[str], type: 'TRIPLE' }
  }

  const pairs = [
    [symbolsArr[0], symbolsArr[1]],
    [symbolsArr[1], symbolsArr[2]],
    [symbolsArr[0], symbolsArr[2]]
  ]

  for (const [a, b] of pairs) {
    if (a === b) {
      const key = a + b
      if (Object.prototype.hasOwnProperty.call(twoMatchPayouts, key)) {
        return { multiplier: twoMatchPayouts[key], type: 'PAIR' }
      }
    }
  }

  return { multiplier: 0, type: 'NONE' }
}

// ───────────────────────────────────────────────────────────
// Rendering (REEL STRIP – uniform, chat-safe)
// ───────────────────────────────────────────────────────────

function renderSlot (a, b, c) {
  return `🎰 SLOTS  ${a} ┃ ${b} ┃ ${c}`
}

function sparkleIfWin (symbolsArr, didWin) {
  if (!didWin) return symbolsArr
  return symbolsArr.map(s => `${s}`)
}

// ───────────────────────────────────────────────────────────
// BONUS ROUND
// ───────────────────────────────────────────────────────────

function runBonusRound (startingJackpot) {
  const freeSpins = randInt(BONUS_SPINS_MIN, BONUS_SPINS_MAX)
  let totalPct = 0
  const lines = []

  for (let i = 1; i <= freeSpins; i++) {
    const pick = weightedPick(BONUS_PERCENT_WEIGHTS)
    totalPct += pick.pct
    lines.push(`  • Free Spin ${i}: +${pick.pct}%`)
  }

  totalPct = Math.min(totalPct, BONUS_MAX_TOTAL_PERCENT)
  const jackpotWon = startingJackpot * (totalPct / 100)
  const remaining = Math.max(JACKPOT_SEED, startingJackpot - jackpotWon)

  lines.unshift(`🎁 BONUS ROUND! ${freeSpins} Free Spins`)
  lines.push(`🏆 JACKPOT SLICE: ${totalPct}% (+$${formatMoney(jackpotWon)})`)

  return { lines, jackpotWon, remaining }
}

// ───────────────────────────────────────────────────────────
// Main game
// ───────────────────────────────────────────────────────────

async function playSlots (userUUID, betSize = DEFAULT_BET) {
  const bet = Number(betSize) || 0

  if (bet < MIN_BET || bet > MAX_BET) {
    return `Bet amount must be between $${formatBalance(MIN_BET)} and $${formatBalance(MAX_BET)}.`
  }

  try {
    let balance = await getUserWallet(userUUID)
    if (bet > balance) {
      return `Invalid bet amount. Your balance is $${formatBalance(balance)}.`
    }

    await removeFromUserWallet(userUUID, bet)

    let jackpot = getJackpotValue()
    const contribBet = Math.min(bet, JACKPOT_CONTRIB_BET_CAP)
    const jackpotIncrement = contribBet * JACKPOT_INCREMENT_RATE
    jackpot += jackpotIncrement
    updateJackpotValue(jackpot)

    const result = spinSlots()
    const outcome = evaluateLine(result)

    let winnings = bet * outcome.multiplier * HOUSE_EDGE
    let bonusText = ''
    let jackpotWon = 0

    if (result.join('') === '💎💎💎') {
      const bonus = runBonusRound(jackpot)
      jackpotWon = bonus.jackpotWon
      winnings += jackpotWon
      jackpot = bonus.remaining
      updateJackpotValue(jackpot)
      bonusText = `\n\n🚨 💎💎💎 BONUS TRIGGERED 💎💎💎 🚨\n${bonus.lines.join('\n')}`
    }

    if (winnings > 0) {
      await addToUserWallet(userUUID, winnings)
    }

    balance = await getUserWallet(userUUID)

    const didWin = winnings > 0
    const display = sparkleIfWin(result, didWin)
    const header = renderSlot(display[0], display[1], display[2])

    const resultLine = didWin
      ? `\n\n💥 WIN: +$${formatMoney(winnings)}`
      : `\n\n— NO WIN —`

    const jackpotLine = `💰 JACKPOT: $${formatMoney(jackpot)}  📈 +$${formatMoney(jackpotIncrement)}`
    const balanceLine = `🪙 BALANCE: $${formatBalance(balance)}`

    return `${header}${resultLine}${bonusText}\n${jackpotLine}\n${balanceLine}`
  } catch (err) {
    console.error('Slots error:', err)
    return 'An error occurred while playing slots.'
  }
}

// Command handler
async function handleSlotsCommand (userUUID, betSize) {
  const raw = betSize == null ? '' : String(betSize).trim()
  const bet = raw === '' ? DEFAULT_BET : Number(raw)
  if (!bet || bet <= 0) return 'Please enter a valid bet amount.'
  return await playSlots(userUUID, bet)
}

export { playSlots, handleSlotsCommand, getJackpotValue }
