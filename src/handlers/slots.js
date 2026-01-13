import { addToUserWallet, getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js'
import db from '../database/db.js'

// ───────────────────────────────────────────────────────────
// Slot machine symbols and payouts (ONE LINE)
// ───────────────────────────────────────────────────────────

const symbols = ['🍒', '🍋', '🍊', '🍉', '🔔', '⭐', '💎', '🎟️']

// Weighted reel tuning (sum=100)
const SYMBOL_WEIGHTS = {
  '🍒': 16,
  '🍋': 16,
  '🍊': 14,
  '🍉': 12,
  '🔔': 9,
  '⭐': 13,
  '💎': 10,
  '🎟️': 10
}

// 3-of-a-kind payouts (multiplier × bet) — NORMAL MODE
const payouts = {
  '🍒🍒🍒': 5,
  '🍋🍋🍋': 4,
  '🍊🍊🍊': 3,
  '🍉🍉🍉': 6,
  '🔔🔔🔔': 8,
  '⭐⭐⭐': 10,
  '💎💎💎': 20 // triggers JACKPOT BONUS SESSION (interactive)
  // 🎟️ has no triple payout multiplier; it triggers Feature Mode via symbol count
}

// 2-of-a-kind payouts (any two matching) — NORMAL MODE
const twoMatchPayouts = {
  '🍒🍒': 2,
  '🍋🍋': 1.5,
  '🍊🍊': 1.2,
  '🍉🍉': 2.5,
  '🔔🔔': 3,
  '⭐⭐': 4,
  '💎💎': 5
  // 🎟️🎟️ no normal payout — just feature trigger
}

// Economy tuning (this is actually RTP multiplier; kept name to avoid touching other code)
const HOUSE_EDGE = 0.96

// Progressive jackpot tuning
const JACKPOT_SEED = 100
const JACKPOT_INCREMENT_RATE = 0.15
const JACKPOT_CONTRIB_BET_CAP = 5000

// Jackpot milestones (announce when crossed; persisted)
const JACKPOT_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000]

// BONUS ROUND tuning (triggered by 💎💎💎) — interactive
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

// ✅ FEATURE MODE (🎟️ = 1 premium free spin)
// - Only bets >= FEATURE_MIN_TRIGGER_BET can trigger feature spins
// - Feature spins pay from a fixed paytable (NOT based on bet)
// - Feature spins are interactive: /slots free
const FEATURE_MIN_TRIGGER_BET = 250
const FEATURE_MAX_SPINS_PER_TRIGGER = 3 // max tickets counted from a single spin (since 3 reels)
const FEATURE_MAX_SPINS_PER_SESSION = 15 // sanity cap to avoid weird inflation

// Feature reel excludes tickets so you can’t loop-trigger features
const FEATURE_SYMBOLS = ['🍒', '🍋', '🍊', '🍉', '🔔', '⭐', '💎']

// Feature weights: slightly “premium” feeling (more 🔔/⭐/💎 than base)
const FEATURE_WEIGHTS = {
  '🍒': 14,
  '🍋': 14,
  '🍊': 12,
  '🍉': 10,
  '🔔': 16,
  '⭐': 18,
  '💎': 16
}

// Feature paytable (fixed $ payouts, not multiplier × bet)
const FEATURE_TRIPLE_PAYOUTS = {
  '🍒🍒🍒': 250,
  '🍋🍋🍋': 220,
  '🍊🍊🍊': 200,
  '🍉🍉🍉': 300,
  '🔔🔔🔔': 900,
  '⭐⭐⭐': 1400,
  '💎💎💎': 2500
}

const FEATURE_PAIR_PAYOUTS = {
  '🍒🍒': 75,
  '🍋🍋': 65,
  '🍊🍊': 60,
  '🍉🍉': 90,
  '🔔🔔': 250,
  '⭐⭐': 350,
  '💎💎': 600
}

// Symbol collection progression (persistent)
const COLLECTION_GOALS = {
  '🍒': 50,
  '🍋': 50,
  '🍊': 50,
  '🍉': 50,
  '🔔': 30,
  '⭐': 25,
  '💎': 10,
  '🎟️': 25 // optional: track tickets too
}
const COLLECTION_REWARDS = {
  '🍒': 5000,
  '🍋': 4000,
  '🍊': 3000,
  '🍉': 6000,
  '🔔': 8000,
  '⭐': 10000,
  '💎': 25000,
  '🎟️': 7500
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

  // Jackpot bonus sessions (interactive 💎💎💎)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS slot_bonus_sessions (
      userUUID  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run()

  // ✅ Feature sessions (interactive 🎟️ free spins)
  db.prepare(`
    CREATE TABLE IF NOT EXISTS slot_feature_sessions (
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

// ───────────────────────────────────────────────────────────
// Weighted symbol rolling (normal + feature)
// ───────────────────────────────────────────────────────────

const WEIGHTED_SYMBOLS = symbols
  .map(sym => ({ sym, w: Number(SYMBOL_WEIGHTS[sym] ?? 0) }))
  .filter(it => it.w > 0)

const WEIGHTED_FEATURE_SYMBOLS = FEATURE_SYMBOLS
  .map(sym => ({ sym, w: Number(FEATURE_WEIGHTS[sym] ?? 0) }))
  .filter(it => it.w > 0)

function randSymbol () {
  if (!WEIGHTED_SYMBOLS.length) {
    return symbols[Math.floor(Math.random() * symbols.length)]
  }
  return weightedPick(WEIGHTED_SYMBOLS).sym
}

function randFeatureSymbol () {
  if (!WEIGHTED_FEATURE_SYMBOLS.length) {
    return FEATURE_SYMBOLS[Math.floor(Math.random() * FEATURE_SYMBOLS.length)]
  }
  return weightedPick(WEIGHTED_FEATURE_SYMBOLS).sym
}

function spinSlots () {
  return [randSymbol(), randSymbol(), randSymbol()]
}

function spinFeatureSlots () {
  return [randFeatureSymbol(), randFeatureSymbol(), randFeatureSymbol()]
}

// ───────────────────────────────────────────────────────────
// Bonus session helpers (interactive 💎💎💎)
// ───────────────────────────────────────────────────────────

function getBonusSession (userUUID) {
  try {
    const row = db.prepare('SELECT data FROM slot_bonus_sessions WHERE userUUID = ?').get(userUUID)
    if (!row?.data) return null
    return JSON.parse(row.data)
  } catch (e) {
    console.error('[Slots] getBonusSession error:', e)
    return null
  }
}

function saveBonusSession (userUUID, session) {
  try {
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO slot_bonus_sessions(userUUID, data, updatedAt)
      VALUES(?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
    `).run(userUUID, JSON.stringify(session), now)
  } catch (e) {
    console.error('[Slots] saveBonusSession error:', e)
  }
}

function clearBonusSession (userUUID) {
  try {
    db.prepare('DELETE FROM slot_bonus_sessions WHERE userUUID = ?').run(userUUID)
  } catch (e) {
    console.error('[Slots] clearBonusSession error:', e)
  }
}

// Hype version bonus spin
async function spinBonusOnce (userUUID) {
  const session = getBonusSession(userUUID)
  if (!session) return `No active bonus round. Hit 💎💎💎 to trigger one!`

  let { spinsLeft, spinsTotal, totalPct, lockedJackpot, startedAt } = session

  spinsLeft = Number(spinsLeft || 0)
  spinsTotal = Number(spinsTotal || 0)
  totalPct = Number(totalPct || 0)
  lockedJackpot = Number(lockedJackpot || 0)

  if (spinsLeft <= 0 || spinsTotal <= 0 || lockedJackpot <= 0) {
    clearBonusSession(userUUID)
    return `Bonus session expired.`
  }

  const spinNumber = (spinsTotal - spinsLeft) + 1

  const pick = weightedPick(BONUS_PERCENT_WEIGHTS)
  totalPct += pick.pct
  spinsLeft -= 1

  const cappedTotal = Math.min(totalPct, BONUS_MAX_TOTAL_PERCENT)

  const lines = []
  lines.push(`🎁 BONUS SPIN ${spinNumber}/${spinsTotal}: +${pick.pct}%  🧮 Total: ${cappedTotal}%`)

  if (pick.pct >= 25) lines.push(`🔥 MASSIVE HIT! 25% spin!`)
  else if (pick.pct >= 20) lines.push(`🚨 BIG HIT! 20% spin!`)

  if (spinsLeft > 0) {
    saveBonusSession(userUUID, { spinsLeft, spinsTotal, totalPct, lockedJackpot, startedAt })
    lines.push(`👉 Type /slots bonus to spin again (${spinsLeft} left).`)
    return lines.join('\n')
  }

  totalPct = Math.min(totalPct, BONUS_MAX_TOTAL_PERCENT)
  const jackpotWon = lockedJackpot * (totalPct / 100)

  if (jackpotWon > 0) await addToUserWallet(userUUID, jackpotWon)

  const currentJackpot = getJackpotValue()
  const newJackpot = Math.max(JACKPOT_SEED, currentJackpot - jackpotWon)
  updateJackpotValue(newJackpot)

  clearBonusSession(userUUID)

  const balance = await getUserWallet(userUUID)

  lines.push(`🏆 JACKPOT SLICE COMPLETE: ${totalPct}%`)
  lines.push(`💰 WON: +$${formatMoney(jackpotWon)} (locked pot: $${formatMoney(lockedJackpot)})`)
  lines.push(`💰 JACKPOT NOW: $${formatMoney(newJackpot)}`)
  lines.push(`🪙 BALANCE: $${formatBalance(balance)}`)

  return lines.join('\n')
}

// ───────────────────────────────────────────────────────────
// Feature session helpers (interactive 🎟️ free spins)
// ───────────────────────────────────────────────────────────

function getFeatureSession (userUUID) {
  try {
    const row = db.prepare('SELECT data FROM slot_feature_sessions WHERE userUUID = ?').get(userUUID)
    if (!row?.data) return null
    return JSON.parse(row.data)
  } catch (e) {
    console.error('[Slots] getFeatureSession error:', e)
    return null
  }
}

function saveFeatureSession (userUUID, session) {
  try {
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO slot_feature_sessions(userUUID, data, updatedAt)
      VALUES(?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
    `).run(userUUID, JSON.stringify(session), now)
  } catch (e) {
    console.error('[Slots] saveFeatureSession error:', e)
  }
}

function clearFeatureSession (userUUID) {
  try {
    db.prepare('DELETE FROM slot_feature_sessions WHERE userUUID = ?').run(userUUID)
  } catch (e) {
    console.error('[Slots] clearFeatureSession error:', e)
  }
}

function evaluateFeatureLine (symbolsArr) {
  const str = symbolsArr.join('')

  if (Object.prototype.hasOwnProperty.call(FEATURE_TRIPLE_PAYOUTS, str)) {
    return { payout: FEATURE_TRIPLE_PAYOUTS[str], type: 'TRIPLE', line: str }
  }

  const pairs = [
    [symbolsArr[0], symbolsArr[1]],
    [symbolsArr[1], symbolsArr[2]],
    [symbolsArr[0], symbolsArr[2]]
  ]

  for (const [a, b] of pairs) {
    if (a === b) {
      const key = a + b
      if (Object.prototype.hasOwnProperty.call(FEATURE_PAIR_PAYOUTS, key)) {
        return { payout: FEATURE_PAIR_PAYOUTS[key], type: 'PAIR', line: str }
      }
    }
  }

  return { payout: 0, type: 'NONE', line: str }
}

async function spinFeatureOnce (userUUID) {
  const session = getFeatureSession(userUUID)
  if (!session) {
    return `No active FREE SPINS feature. Hit 🎟️ during a bet ≥ $${formatBalance(FEATURE_MIN_TRIGGER_BET)} to trigger it!`
  }

  let { spinsLeft, spinsTotal, totalWon, startedAt } = session
  spinsLeft = Number(spinsLeft || 0)
  spinsTotal = Number(spinsTotal || 0)
  totalWon = Number(totalWon || 0)

  if (spinsLeft <= 0 || spinsTotal <= 0) {
    clearFeatureSession(userUUID)
    return `Feature session expired.`
  }

  const spinNumber = (spinsTotal - spinsLeft) + 1

  const result = spinFeatureSlots()
  const outcome = evaluateFeatureLine(result)

  const win = Number(outcome.payout || 0)
  if (win > 0) {
    totalWon += win
    await addToUserWallet(userUUID, win)
  }

  spinsLeft -= 1

  const lines = []
  lines.push(renderSlot(result[0], result[1], result[2], `🎟️ FREE SPIN ${spinNumber}/${spinsTotal}`))

  if (win > 0) {
    lines.push(`💥 FEATURE WIN: +$${formatMoney(win)}`)
    if (win >= 2500) lines.push(`🚨 MEGA HIT! 💎💎💎 in the feature!`)
    else if (win >= 1400) lines.push(`🔥 HUGE HIT! ⭐⭐⭐ in the feature!`)
    else if (win >= 900) lines.push(`🔔 BIG WIN!`)
  } else {
    lines.push(`— NO WIN —`)
  }

  if (spinsLeft > 0) {
    saveFeatureSession(userUUID, { spinsLeft, spinsTotal, totalWon, startedAt })
    lines.push(`👉 Type /slots free to spin again (${spinsLeft} left).`)
    return lines.join('\n')
  }

  clearFeatureSession(userUUID)

  const balance = await getUserWallet(userUUID)

  lines.push(`🏁 FEATURE COMPLETE`)
  lines.push(`💰 TOTAL FEATURE WINS: +$${formatMoney(totalWon)}`)
  lines.push(`🪙 BALANCE: $${formatBalance(balance)}`)

  return lines.join('\n')
}

// ───────────────────────────────────────────────────────────
// Collection helpers
// ───────────────────────────────────────────────────────────

function getUserCollection (userUUID) {
  try {
    const row = db.prepare('SELECT data FROM slot_collections WHERE userUUID = ?').get(userUUID)
    if (!row?.data) return { counts: {}, tiers: {} }
    const parsed = JSON.parse(row.data)
    return { counts: parsed.counts || {}, tiers: parsed.tiers || {} }
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
// Line evaluation (normal mode)
// ───────────────────────────────────────────────────────────

function evaluateLine (symbolsArr) {
  const str = symbolsArr.join('')

  if (Object.prototype.hasOwnProperty.call(payouts, str)) {
    return { multiplier: payouts[str], type: 'TRIPLE', line: str }
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
        return { multiplier: twoMatchPayouts[key], type: 'PAIR', line: str }
      }
    }
  }

  return { multiplier: 0, type: 'NONE', line: str }
}

// ───────────────────────────────────────────────────────────
// Rendering
// ───────────────────────────────────────────────────────────

function renderSlot (a, b, c, prefix = '🎰 SLOTS') {
  return `${prefix}  ${a} ┃ ${b} ┃ ${c}`
}

// ───────────────────────────────────────────────────────────
// Jackpot milestone announcements
// ───────────────────────────────────────────────────────────

function getLastMilestone () {
  const v = readSetting('slots_jackpot_last_milestone')
  return v ? Number(v) : 0
}

function maybeMilestoneAnnouncement (before, after) {
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
  const col = getUserCollection(userUUID)
  const counts = col.counts || {}
  const tiers = col.tiers || {}

  for (const s of spins.flat()) {
    counts[s] = (counts[s] || 0) + 1
  }

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

  saveUserCollection(userUUID, { counts, tiers })

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

  // Force resolve interactive modes first
  const activeBonus = getBonusSession(userUUID)
  if (activeBonus) {
    return [
      `🚨 You have an active 💎 BONUS ROUND!`,
      `👉 Type /slots bonus to spin (${activeBonus.spinsLeft} left).`
    ].join('\n')
  }

  const activeFeature = getFeatureSession(userUUID)
  if (activeFeature) {
    return [
      `🎟️ You’re in FREE SPINS FEATURE MODE!`,
      `👉 Type /slots free to spin (${activeFeature.spinsLeft} left).`
    ].join('\n')
  }

  if (bet < MIN_BET || bet > MAX_BET) {
    return `Bet amount must be between $${formatBalance(MIN_BET)} and $${formatBalance(MAX_BET)}.`
  }

  try {
    let balance = await getUserWallet(userUUID)
    if (bet > balance) {
      return `Invalid bet amount. Your balance is $${formatBalance(balance)}.`
    }

    await removeFromUserWallet(userUUID, bet)

    // Jackpot increment (only on paid spin)
    let jackpot = getJackpotValue()
    const beforeJackpot = jackpot
    const contribBet = Math.min(bet, JACKPOT_CONTRIB_BET_CAP)
    const jackpotIncrement = contribBet * JACKPOT_INCREMENT_RATE
    jackpot += jackpotIncrement
    updateJackpotValue(jackpot)

    const milestoneLine = maybeMilestoneAnnouncement(beforeJackpot, jackpot)

    const spinLines = []
    const allSpinResults = []
    const nearMissLines = []

    let totalWinnings = 0
    let bonusTriggerMessage = ''
    let featureTriggerMessage = ''

    let bonusTriggeredThisPlay = false
    let featureTriggeredThisPlay = false

    const playOneSpin = (prefix) => {
      const result = spinSlots()
      allSpinResults.push(result)

      const outcome = evaluateLine(result)
      const win = bet * outcome.multiplier * HOUSE_EDGE
      totalWinnings += win

      const diamondCount = result.filter(s => s === '💎').length
      if (diamondCount === 2) nearMissLines.push('😮 NEAR MISS: Two 💎!')

      // 💎 Jackpot bonus session trigger (interactive)
      if (result.join('') === '💎💎💎' && !bonusTriggeredThisPlay) {
        bonusTriggeredThisPlay = true

        const spinsTotal = randInt(BONUS_SPINS_MIN, BONUS_SPINS_MAX)
        const lockedJackpot = jackpot

        saveBonusSession(userUUID, {
          spinsLeft: spinsTotal,
          spinsTotal,
          totalPct: 0,
          lockedJackpot,
          startedAt: new Date().toISOString()
        })

        bonusTriggerMessage = [
          `\n🚨 💎💎💎 BONUS TRIGGERED 💎💎💎 🚨`,
          `🎁 FEATURE ROUND UNLOCKED: ${spinsTotal} BONUS SPINS`,
          `💰 Locked Jackpot: $${formatMoney(lockedJackpot)}`,
          `👉 Type /slots bonus to start (Spin 1/${spinsTotal}).`
        ].join('\n')
      }

      // 🎟️ Feature trigger: each 🎟️ = 1 premium feature free spin
      // Only eligible if PAID bet >= $250
      if (!featureTriggeredThisPlay && bet >= FEATURE_MIN_TRIGGER_BET) {
        const ticketCountRaw = result.filter(s => s === '🎟️').length
        const ticketCount = Math.min(ticketCountRaw, FEATURE_MAX_SPINS_PER_TRIGGER)

        if (ticketCount > 0) {
          featureTriggeredThisPlay = true

          const spinsTotal = Math.min(ticketCount, FEATURE_MAX_SPINS_PER_SESSION)

          saveFeatureSession(userUUID, {
            spinsLeft: spinsTotal,
            spinsTotal,
            totalWon: 0,
            startedAt: new Date().toISOString()
          })

          featureTriggerMessage = [
            `\n🎟️ FREE SPINS FEATURE UNLOCKED 🎟️`,
            `🎁 You won ${spinsTotal} FEATURE SPIN${spinsTotal === 1 ? '' : 'S'} (🎟️ = 1 spin)`,
            `💰 Feature spins pay PREMIUM fixed prizes (not based on your bet).`,
            `👉 Type /slots free to start (Spin 1/${spinsTotal}).`
          ].join('\n')
        }
      }

      spinLines.push(renderSlot(result[0], result[1], result[2], prefix))
    }

    // Paid spin only (no old star-based free-spin loop anymore)
    playOneSpin('🎰 SLOTS')

    // Pay out normal winnings (feature payouts are handled in /slots free)
    if (totalWinnings > 0) {
      await addToUserWallet(userUUID, totalWinnings)
    }

    const collection = await applyCollectionProgress(userUUID, allSpinResults)
    balance = await getUserWallet(userUUID)

    const didWin = totalWinnings > 0
    const resultLine = didWin
      ? `\n💥 WIN: +$${formatMoney(totalWinnings)}`
      : `\n— NO WIN —`

    const jackpotLine = `💰 JACKPOT: $${formatMoney(jackpot)}  📈 +$${formatMoney(jackpotIncrement)}`
    const balanceLine = `🪙 BALANCE: $${formatBalance(balance)}`

    const nearMiss = nearMissLines.length ? `\n${nearMissLines[0]}` : ''
    const milestone = milestoneLine ? `\n${milestoneLine}` : ''

    const collectionLines = collection.unlockedLines.length
      ? `\n\n${collection.unlockedLines.join('\n')}`
      : ''

    // Note: if feature triggered and bonus triggered same play, user must resolve bonus first (guard at top)
    return [
      spinLines.join('\n'),
      resultLine + nearMiss,
      milestone,
      jackpotLine,
      balanceLine,
      bonusTriggerMessage,
      featureTriggerMessage,
      collectionLines
    ].filter(Boolean).join('\n')
  } catch (err) {
    console.error('Slots error:', err)
    return 'An error occurred while playing slots.'
  }
}

// Command handler: `/slots` or `/slots 500` or `/slots bonus` or `/slots free`
async function handleSlotsCommand (userUUID, betSize) {
  const raw = betSize == null ? '' : String(betSize).trim().toLowerCase()

  if (raw === 'bonus') return await spinBonusOnce(userUUID)
  if (raw === 'free') return await spinFeatureOnce(userUUID)

  const bet = raw === '' ? DEFAULT_BET : Number(raw)
  if (!bet || bet <= 0) return 'Please enter a valid bet amount.'

  return await playSlots(userUUID, bet)
}

export { playSlots, handleSlotsCommand, getJackpotValue }
