import { addToUserWallet, getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js'
import db from '../database/db.js'

// ───────────────────────────────────────────────────────────
// Slot machine symbols and payouts (ONE LINE)
// ───────────────────────────────────────────────────────────

const symbols = ['🍒', '🍋', '🍊', '🍉', '🔔', '⭐', '💎']

// 3-of-a-kind payouts (multiplier × bet)
const payouts = {
  '🍒🍒🍒': 5,
  '🍋🍋🍋': 4,
  '🍊🍊🍊': 3,
  '🍉🍉🍉': 6,
  '🔔🔔🔔': 8,
  '⭐⭐⭐': 10,
  '💎💎💎': 20 // triggers BONUS ROUND
}

// 2-of-a-kind payouts (any two matching)
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

// Progressive jackpot tuning
const JACKPOT_SEED = 100
const JACKPOT_INCREMENT_RATE = 0.15
const JACKPOT_CONTRIB_BET_CAP = 5000

// Jackpot milestones (announce when crossed; persisted)
const JACKPOT_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000]

// BONUS ROUND tuning (triggered by 💎💎💎)
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

// FREE SPINS (streak-y like real slots)
// - Trigger: ⭐⭐⭐ grants free spins
// - Cap prevents infinite chains
const FREE_SPINS_ON_STARS_TRIPLE = 2
const MAX_FREE_SPINS_PER_PLAY = 8

// Symbol collection progression (persistent)
// Tier thresholds per symbol; every time you cross another tier, you get a reward.
const COLLECTION_GOALS = {
  '🍒': 50,
  '🍋': 50,
  '🍊': 50,
  '🍉': 50,
  '🔔': 30,
  '⭐': 25,
  '💎': 10
}
const COLLECTION_REWARDS = {
  '🍒': 5000,
  '🍋': 4000,
  '🍊': 3000,
  '🍉': 6000,
  '🔔': 8000,
  '⭐': 10000,
  '💎': 25000
}

// Bets
const MIN_BET = 1
const MAX_BET = 10000
const DEFAULT_BET = 1

// ───────────────────────────────────────────────────────────
// Ensure persistence tables
// ───────────────────────────────────────────────────────────

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS slot_collections (
      userUUID  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run()
} catch (e) {
  console.error('[Slots] Failed ensuring tables:', e)
}

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

// Always commas + 2 decimals (jackpot looks great at scale)
function formatMoney (amount) {
  const n = Number(amount) || 0
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Settings helpers
function readSetting (key) {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
    return row?.value ?? null
  } catch (e) {
    console.error('[Slots] readSetting error:', e)
    return null
  }
}

function writeSetting (key, value) {
  try {
    db.prepare(`
      INSERT INTO app_settings(key, value)
      VALUES(?, ?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value
    `).run(key, String(value))
  } catch (e) {
    console.error('[Slots] writeSetting error:', e)
  }
}

// Jackpot DB helpers
function getJackpotValue () {
  const row = db.prepare('SELECT progressiveJackpot FROM jackpot WHERE id = 1').get()
  return Number(row?.progressiveJackpot || JACKPOT_SEED)
}

function updateJackpotValue (newValue) {
  db.prepare('UPDATE jackpot SET progressiveJackpot = ? WHERE id = 1').run(Number(newValue))
  console.log(`🎰 Jackpot updated: $${newValue}`)
}

// Collection helpers
function getUserCollection (userUUID) {
  try {
    const row = db.prepare('SELECT data FROM slot_collections WHERE userUUID = ?').get(userUUID)
    if (!row?.data) return { counts: {}, tiers: {} }
    const parsed = JSON.parse(row.data)
    return {
      counts: parsed.counts || {},
      tiers: parsed.tiers || {}
    }
  } catch (e) {
    console.error('[Slots] getUserCollection error:', e)
    return { counts: {}, tiers: {} }
  }
}

function saveUserCollection (userUUID, collection) {
  try {
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO slot_collections(userUUID, data, updatedAt)
      VALUES(?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
    `).run(userUUID, JSON.stringify(collection), now)
  } catch (e) {
    console.error('[Slots] saveUserCollection error:', e)
  }
}

// ───────────────────────────────────────────────────────────
// Line evaluation
// ───────────────────────────────────────────────────────────

function evaluateLine (symbolsArr) {
  const str = symbolsArr.join('')

  // 3 of a kind
  if (Object.prototype.hasOwnProperty.call(payouts, str)) {
    return { multiplier: payouts[str], type: 'TRIPLE', line: str }
  }

  // Any 2 of a kind
  const pairs = [
    [symbolsArr[0], symbolsArr[1]],
    [symbolsArr[1], symbolsArr[2]],
    [symbolsArr[0], symbolsArr[2]]
  ]

  for (const [a, b] of pairs) {
    if (a === b) {
      const key = a + b
      if (Object.prototype.hasOwnProperty.call(twoMatchPayouts, key)) {
        return { multiplier: twoMatchPayouts[key], type: 'PAIR', line: str }
      }
    }
  }

  return { multiplier: 0, type: 'NONE', line: str }
}

// ───────────────────────────────────────────────────────────
// Rendering (uniform reel strip)
// ───────────────────────────────────────────────────────────

function renderSlot (a, b, c, prefix = '🎰 SLOTS') {
  return `${prefix}  ${a} ┃ ${b} ┃ ${c}`
}

// ───────────────────────────────────────────────────────────
// BONUS ROUND (jackpot slice)
// ───────────────────────────────────────────────────────────

function runBonusRound (startingJackpot) {
  const freeSpins = randInt(BONUS_SPINS_MIN, BONUS_SPINS_MAX)
  let totalPct = 0
  const lines = []

  lines.push(`🎁 BONUS ROUND! ${freeSpins} Free Spins`)

  for (let i = 1; i <= freeSpins; i++) {
    const pick = weightedPick(BONUS_PERCENT_WEIGHTS)
    totalPct += pick.pct
    lines.push(`  • Bonus Spin ${i}: +${pick.pct}%`)
  }

  totalPct = Math.min(totalPct, BONUS_MAX_TOTAL_PERCENT)

  const jackpotWon = startingJackpot * (totalPct / 100)
  const remaining = Math.max(JACKPOT_SEED, startingJackpot - jackpotWon)

  lines.push(`🏆 JACKPOT SLICE: ${totalPct}% (+$${formatMoney(jackpotWon)})`)

  return { lines, jackpotWon, remaining }
}

// ───────────────────────────────────────────────────────────
// Jackpot milestone announcements
// ───────────────────────────────────────────────────────────

function getLastMilestone () {
  const v = readSetting('slots_jackpot_last_milestone')
  return v ? Number(v) : 0
}

function maybeMilestoneAnnouncement (before, after) {
  // Determine highest milestone crossed
  const last = getLastMilestone()
  const eligible = JACKPOT_MILESTONES.filter(m => m > last && before < m && after >= m)
  if (!eligible.length) return null

  const crossed = Math.max(...eligible)
  writeSetting('slots_jackpot_last_milestone', crossed)

  return `🎉 JACKPOT PASSED $${Math.round(crossed).toLocaleString()}!`
}

// ───────────────────────────────────────────────────────────
// Symbol collection progression
// ───────────────────────────────────────────────────────────

async function applyCollectionProgress (userUUID, spins) {
  // spins: array of arrays, each is [a,b,c]
  const col = getUserCollection(userUUID)
  const counts = col.counts || {}
  const tiers = col.tiers || {}

  // Add counts
  for (const s of spins.flat()) {
    counts[s] = (counts[s] || 0) + 1
  }

  // Check tier ups
  const unlocked = []
  let totalReward = 0

  for (const sym of Object.keys(COLLECTION_GOALS)) {
    const goal = COLLECTION_GOALS[sym]
    const reward = COLLECTION_REWARDS[sym] || 0
    const c = counts[sym] || 0

    const prevTier = Number(tiers[sym] || 0)
    const newTier = Math.floor(c / goal)

    if (newTier > prevTier) {
      const tiersGained = newTier - prevTier
      tiers[sym] = newTier

      const payout = reward * tiersGained
      totalReward += payout

      unlocked.push(`🏅 COLLECTION: ${sym} Tier ${newTier} (+$${formatBalance(payout)})`)
    }
  }

  // Persist updated collection state
  saveUserCollection(userUUID, { counts, tiers })

  // Pay rewards if any
  if (totalReward > 0) {
    await addToUserWallet(userUUID, totalReward)
  }

  return { unlockedLines: unlocked, rewardTotal: totalReward }
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

    // Deduct bet (paid spin only)
    await removeFromUserWallet(userUUID, bet)

    // Jackpot increment (cap contribution) — only on the PAID spin
    let jackpot = getJackpotValue()
    const beforeJackpot = jackpot
    const contribBet = Math.min(bet, JACKPOT_CONTRIB_BET_CAP)
    const jackpotIncrement = contribBet * JACKPOT_INCREMENT_RATE
    jackpot += jackpotIncrement
    updateJackpotValue(jackpot)

    // Milestone announcement (if crossed on this increment)
    const milestoneLine = maybeMilestoneAnnouncement(beforeJackpot, jackpot)

    // We will play 1 paid spin + possible free spins
    let freeSpinsLeft = 0
    let freeSpinsAwardedTotal = 0

    const spinLines = []
    const allSpinResults = [] // for collection progression
    const nearMissLines = []

    let totalWinnings = 0
    let bonusText = ''

    const playOneSpin = (prefix) => {
      const result = spinSlots()
      allSpinResults.push(result)

      const outcome = evaluateLine(result)
      const win = bet * outcome.multiplier * HOUSE_EDGE
      totalWinnings += win

      // Near miss: exactly 2 diamonds (and NOT triple)
      const diamondCount = result.filter(s => s === '💎').length
      if (diamondCount === 2) {
        nearMissLines.push('😮 NEAR MISS: Two 💎!')
      }

      // Free spins: triple stars grants free spins (chainable, but capped)
      if (result.join('') === '⭐⭐⭐' && freeSpinsAwardedTotal < MAX_FREE_SPINS_PER_PLAY) {
        const roomLeft = MAX_FREE_SPINS_PER_PLAY - freeSpinsAwardedTotal
        const grant = Math.min(FREE_SPINS_ON_STARS_TRIPLE, roomLeft)
        if (grant > 0) {
          freeSpinsLeft += grant
          freeSpinsAwardedTotal += grant
          // This message is small but exciting; only triggers on rare ⭐⭐⭐
          spinLines.push(`🎁 FREE SPINS +${grant} (now ${freeSpinsLeft} queued)`)
        }
      }

      // Bonus round: triple diamonds triggers jackpot slice bonus
      if (result.join('') === '💎💎💎') {
        const bonus = runBonusRound(jackpot)
        totalWinnings += bonus.jackpotWon
        jackpot = bonus.remaining
        updateJackpotValue(jackpot)

        bonusText += `\n\n🚨 💎💎💎 BONUS TRIGGERED 💎💎💎 🚨\n${bonus.lines.join('\n')}`
      }

      spinLines.push(renderSlot(result[0], result[1], result[2], prefix))
    }

    // Paid spin (always)
    playOneSpin('🎰 SLOTS')

    // Free spins (if any)
    while (freeSpinsLeft > 0) {
      freeSpinsLeft -= 1
      // Don’t increment jackpot on free spins (keeps the pot sane)
      playOneSpin(`🎰 FREE (${freeSpinsLeft} left)`)
    }

    // Pay out winnings
    if (totalWinnings > 0) {
      await addToUserWallet(userUUID, totalWinnings)
    }

    // Symbol collection progression (paid + free spins count)
    const collection = await applyCollectionProgress(userUUID, allSpinResults)

    // Refresh balance after payouts + collection rewards
    balance = await getUserWallet(userUUID)

    // Build response
    const didWin = totalWinnings > 0
    const resultLine = didWin
      ? `\n💥 WIN: +$${formatMoney(totalWinnings)}`
      : `\n— NO WIN —`

    const jackpotLine = `💰 JACKPOT: $${formatMoney(jackpot)}  📈 +$${formatMoney(jackpotIncrement)}`
    const balanceLine = `🪙 BALANCE: $${formatBalance(balance)}`

    // Keep near-miss messaging from being spammy:
    // Show it once max even if multiple spins had it.
    const nearMiss = nearMissLines.length ? `\n${nearMissLines[0]}` : ''

    const milestone = milestoneLine ? `\n${milestoneLine}` : ''

    const collectionLines = collection.unlockedLines.length
      ? `\n\n${collection.unlockedLines.join('\n')}`
      : ''

    // Final output:
    // - show spin strip(s) first
    // - then result + near miss
    // - then milestone/jackpot/balance
    // - then any collection unlocks
    return [
      spinLines.join('\n'),
      resultLine + nearMiss,
      milestone,
      jackpotLine,
      balanceLine,
      bonusText,
      collectionLines
    ].filter(Boolean).join('\n')
  } catch (err) {
    console.error('Slots error:', err)
    return 'An error occurred while playing slots.'
  }
}

// Command handler: `/slots` or `/slots 500`
async function handleSlotsCommand (userUUID, betSize) {
  const raw = betSize == null ? '' : String(betSize).trim()
  const bet = raw === '' ? DEFAULT_BET : Number(raw)

  if (!bet || bet <= 0) return 'Please enter a valid bet amount.'
  return await playSlots(userUUID, bet)
}

export { playSlots, handleSlotsCommand, getJackpotValue }
