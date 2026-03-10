import {
  getUserWallet,
  applyGameDeltaInTransaction,
  syncWalletBalanceFromDb
} from '../database/dbwalletmanager.js'
import db from '../database/db.js'

// ───────────────────────────────────────────────────────────
// Slot machine symbols and payouts (ONE LINE)
// ───────────────────────────────────────────────────────────

const symbols = ['🍒', '🍋', '🍊', '🍉', '🔔', '⭐', '💎', '🎟️']

const SYMBOL_WEIGHTS = {
  '🍒': 17, // was 18
  '🍋': 18,
  '🍊': 16,
  '🍉': 14,
  '🔔': 9,
  '⭐': 12,
  '💎': 10, // was 8 ✅
  '🎟️': 4
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
}

// Economy tuning
const HOUSE_EDGE = 0.9

// Progressive jackpot tuning
const JACKPOT_SEED = 100
const JACKPOT_INCREMENT_RATE = 0.12
const JACKPOT_CONTRIB_BET_CAP = 5000

// Jackpot milestones (announce when crossed; persisted)
const JACKPOT_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000]

// Collections tuning
const COLLECTION_MIN_BET = 100
const COLLECTION_RESET_KEY = 'slots_collection_reset_yyyymm'

// BONUS ROUND tuning (triggered by 💎💎💎) — interactive
const BONUS_SPINS_MIN = 3
const BONUS_SPINS_MAX = 5
const BONUS_MAX_TOTAL_PERCENT = 60
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
// ✅ CHANGE: allow tickets to land DURING feature spins to award more feature spins
// ✅ CHANGE: allow 💎💎💎 during feature spins to TRIGGER jackpot bonus session too (once per feature session)
const FEATURE_MIN_TRIGGER_BET = 250
const FEATURE_MAX_SPINS_PER_TRIGGER = 2
const FEATURE_MAX_SPINS_PER_SESSION = 8
const FEATURE_PAYOUT_MULTIPLIER = 6

// ✅ Feature reel includes tickets so you can extend the round
const FEATURE_SYMBOLS = ['🍒', '🍋', '🍊', '🍉', '🔔', '⭐', '💎', '🎟️']

// ✅ More premium feel + higher win likelihood + tickets rarer in feature
// Sum=100
const FEATURE_WEIGHTS = {
  '🍒': 10,
  '🍋': 10,
  '🍊': 9,
  '🍉': 8,
  '🔔': 18,
  '⭐': 20,
  '💎': 20,
  '🎟️': 5
}

// Feature paytable (base values; multiplied by FEATURE_PAYOUT_MULTIPLIER)
const FEATURE_TRIPLE_PAYOUTS = {
  '🍒🍒🍒': 180,
  '🍋🍋🍋': 160,
  '🍊🍊🍊': 150,
  '🍉🍉🍉': 240,
  '🔔🔔🔔': 700,
  '⭐⭐⭐': 1100,
  '💎💎💎': 2200
}

const FEATURE_PAIR_PAYOUTS = {
  '🍒🍒': 45,
  '🍋🍋': 40,
  '🍊🍊': 35,
  '🍉🍉': 55,
  '🔔🔔': 170,
  '⭐⭐': 240,
  '💎💎': 450
}

// Premium “anywhere” mini-pay (only if no pair/triple)
const FEATURE_ANY_SYMBOL_BONUS = {
  '💎': 32,
  '⭐': 24,
  '🔔': 18
}

const COLLECTION_GOALS = {
  '🍒': 50,
  '🍋': 50,
  '🍊': 50,
  '🍉': 50,
  '🔔': 30,
  '⭐': 25,
  '💎': 20, // was 10
  '🎟️': 25
}

const COLLECTION_REWARDS = {
  '🍒': 250,
  '🍋': 200,
  '🍊': 150,
  '🍉': 300,
  '🔔': 425,
  '⭐': 550,
  '💎': 800,
  '🎟️': 350
}

// Bets
const MIN_BET = 1
const MAX_BET = 25000
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

  db.prepare(`
    CREATE TABLE IF NOT EXISTS slot_bonus_sessions (
      userUUID  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS slot_feature_sessions (
      userUUID  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS slot_jackpot_contributions (
      userUUID               TEXT PRIMARY KEY,
      lifetimeContributed    REAL NOT NULL DEFAULT 0,
      effectiveContributed   REAL NOT NULL DEFAULT 0,
      updatedAt              TEXT NOT NULL
    )
  `).run()
} catch (e) {
  console.error('[Slots] Failed ensuring tables:', e)
}

const slotStmts = {
  readSetting: db.prepare('SELECT value FROM app_settings WHERE key = ?'),
  writeSetting: db.prepare(`
    INSERT INTO app_settings(key, value)
    VALUES(?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `),
  clearCollections: db.prepare('DELETE FROM slot_collections'),
  recordJackpotContribution: db.prepare(`
    INSERT INTO slot_jackpot_contributions (userUUID, lifetimeContributed, effectiveContributed, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(userUUID) DO UPDATE SET
      lifetimeContributed = lifetimeContributed + excluded.lifetimeContributed,
      effectiveContributed = effectiveContributed + excluded.effectiveContributed,
      updatedAt = excluded.updatedAt
  `),
  scaleEffectiveContributions: db.prepare(`
    UPDATE slot_jackpot_contributions
    SET effectiveContributed = effectiveContributed * ?,
        updatedAt = ?
  `),
  getUserJackpotContribution: db.prepare(`
    SELECT lifetimeContributed, effectiveContributed
    FROM slot_jackpot_contributions
    WHERE userUUID = ?
  `),
  getJackpotContributionTotals: db.prepare(`
    SELECT COALESCE(SUM(effectiveContributed), 0) AS totalEffective
    FROM slot_jackpot_contributions
  `),
  getJackpotValue: db.prepare('SELECT progressiveJackpot FROM jackpot WHERE id = 1'),
  updateJackpotValue: db.prepare('UPDATE jackpot SET progressiveJackpot = ? WHERE id = 1'),
  getBonusSession: db.prepare('SELECT data FROM slot_bonus_sessions WHERE userUUID = ?'),
  saveBonusSession: db.prepare(`
    INSERT INTO slot_bonus_sessions(userUUID, data, updatedAt)
    VALUES(?, ?, ?)
    ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
  `),
  clearBonusSession: db.prepare('DELETE FROM slot_bonus_sessions WHERE userUUID = ?'),
  getFeatureSession: db.prepare('SELECT data FROM slot_feature_sessions WHERE userUUID = ?'),
  saveFeatureSession: db.prepare(`
    INSERT INTO slot_feature_sessions(userUUID, data, updatedAt)
    VALUES(?, ?, ?)
    ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
  `),
  clearFeatureSession: db.prepare('DELETE FROM slot_feature_sessions WHERE userUUID = ?'),
  getUserCollection: db.prepare('SELECT data FROM slot_collections WHERE userUUID = ?'),
  saveUserCollection: db.prepare(`
    INSERT INTO slot_collections(userUUID, data, updatedAt)
    VALUES(?, ?, ?)
    ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
  `)
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

function readSetting (key) {
  try {
    const row = slotStmts.readSetting.get(key)
    return row?.value ?? null
  } catch (e) {
    console.error('[Slots] readSetting error:', e)
    return null
  }
}

function writeSetting (key, value) {
  try {
    slotStmts.writeSetting.run(key, String(value))
  } catch (e) {
    console.error('[Slots] writeSetting error:', e)
  }
}

function getYearMonthKey (d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

function maybeResetCollectionsMonthly () {
  const current = getYearMonthKey()
  const last = readSetting(COLLECTION_RESET_KEY)

  if (!last) {
    writeSetting(COLLECTION_RESET_KEY, current)
    return { didReset: false, current }
  }

  if (last !== current) {
    try {
      slotStmts.clearCollections.run()
      writeSetting(COLLECTION_RESET_KEY, current)
      console.log(`[Slots] Collections reset for new month: ${current}`)
      return { didReset: true, current }
    } catch (e) {
      console.error('[Slots] Failed to reset collections:', e)
      return { didReset: false, current }
    }
  }

  return { didReset: false, current }
}

function recordJackpotContribution (userUUID, amount) {
  const inc = Math.max(0, Number(amount) || 0)
  if (!userUUID || inc <= 0) return

  try {
    const now = new Date().toISOString()
    slotStmts.recordJackpotContribution.run(userUUID, inc, inc, now)
  } catch (e) {
    console.error('[Slots] recordJackpotContribution error:', e)
  }
}

function scaleEffectiveJackpotContributions (retainedRatio) {
  const ratio = Number(retainedRatio)
  if (!Number.isFinite(ratio)) return

  const clamped = Math.max(0, Math.min(1, ratio))
  const now = new Date().toISOString()

  try {
    slotStmts.scaleEffectiveContributions.run(clamped, now)
  } catch (e) {
    console.error('[Slots] scaleEffectiveJackpotContributions error:', e)
  }
}

function getUserJackpotContributionStats (userUUID) {
  try {
    const row = slotStmts.getUserJackpotContribution.get(userUUID)
    const totals = slotStmts.getJackpotContributionTotals.get()

    const lifetimeContributed = Number(row?.lifetimeContributed || 0)
    const effectiveContributed = Number(row?.effectiveContributed || 0)
    const totalEffective = Number(totals?.totalEffective || 0)
    const effectiveSharePct = totalEffective > 0
      ? (effectiveContributed / totalEffective) * 100
      : 0

    return {
      lifetimeContributed,
      effectiveContributed,
      totalEffective,
      effectiveSharePct
    }
  } catch (e) {
    console.error('[Slots] getUserJackpotContributionStats error:', e)
    return {
      lifetimeContributed: 0,
      effectiveContributed: 0,
      totalEffective: 0,
      effectiveSharePct: 0
    }
  }
}

function getJackpotValue () {
  const row = slotStmts.getJackpotValue.get()
  return Number(row?.progressiveJackpot || JACKPOT_SEED)
}

function updateJackpotValue (newValue) {
  slotStmts.updateJackpotValue.run(Number(newValue))
  console.log(`🎰 Jackpot updated: $${newValue}`)
}

// ───────────────────────────────────────────────────────────
// Weighted symbol rolling (normal + feature)
// ✅ Option A: exclude tickets for bets < FEATURE_MIN_TRIGGER_BET
// ───────────────────────────────────────────────────────────

const WEIGHTED_SYMBOLS = symbols
  .map(sym => ({ sym, w: Number(SYMBOL_WEIGHTS[sym] ?? 0) }))
  .filter(it => it.w > 0)

// ✅ Tickets excluded for low-bet spins (< FEATURE_MIN_TRIGGER_BET)
const WEIGHTED_SYMBOLS_NO_TICKETS = WEIGHTED_SYMBOLS.filter(it => it.sym !== '🎟️')

const WEIGHTED_FEATURE_SYMBOLS = FEATURE_SYMBOLS
  .map(sym => ({ sym, w: Number(FEATURE_WEIGHTS[sym] ?? 0) }))
  .filter(it => it.w > 0)

function randSymbol (bet = 0) {
  const list = bet >= FEATURE_MIN_TRIGGER_BET ? WEIGHTED_SYMBOLS : WEIGHTED_SYMBOLS_NO_TICKETS

  if (!list.length) {
    const fallback = bet >= FEATURE_MIN_TRIGGER_BET
      ? symbols
      : symbols.filter(s => s !== '🎟️')

    return fallback[Math.floor(Math.random() * fallback.length)]
  }

  return weightedPick(list).sym
}

function randFeatureSymbol () {
  if (!WEIGHTED_FEATURE_SYMBOLS.length) {
    return FEATURE_SYMBOLS[Math.floor(Math.random() * FEATURE_SYMBOLS.length)]
  }
  return weightedPick(WEIGHTED_FEATURE_SYMBOLS).sym
}

function spinSlots (bet = 0) {
  return [randSymbol(bet), randSymbol(bet), randSymbol(bet)]
}

function spinFeatureSlots () {
  return [randFeatureSymbol(), randFeatureSymbol(), randFeatureSymbol()]
}

// ───────────────────────────────────────────────────────────
// Bonus session helpers (interactive 💎💎💎)
// ───────────────────────────────────────────────────────────

function getBonusSession (userUUID) {
  try {
    const row = slotStmts.getBonusSession.get(userUUID)
    if (!row?.data) return null
    return JSON.parse(row.data)
  } catch (e) {
    console.error('[Slots] getBonusSession error:', e)
    return null
  }
}

function saveBonusSession (userUUID, session, options = {}) {
  const throwOnError = Boolean(options?.throwOnError)
  try {
    const now = new Date().toISOString()
    slotStmts.saveBonusSession.run(userUUID, JSON.stringify(session), now)
    return true
  } catch (e) {
    console.error('[Slots] saveBonusSession error:', e)
    if (throwOnError) throw e
    return false
  }
}

function clearBonusSession (userUUID, options = {}) {
  const throwOnError = Boolean(options?.throwOnError)
  try {
    slotStmts.clearBonusSession.run(userUUID)
    return true
  } catch (e) {
    console.error('[Slots] clearBonusSession error:', e)
    if (throwOnError) throw e
    return false
  }
}

async function spinBonusOnce (userUUID) {
  const session = getBonusSession(userUUID)
  if (!session) return 'No active bonus round. Hit 💎💎💎 to trigger one!'

  let { spinsLeft, spinsTotal, totalPct, lockedJackpot, startedAt } = session

  spinsLeft = Number(spinsLeft || 0)
  spinsTotal = Number(spinsTotal || 0)
  totalPct = Number(totalPct || 0)
  lockedJackpot = Number(lockedJackpot || 0)

  if (spinsLeft <= 0 || spinsTotal <= 0 || lockedJackpot <= 0) {
    clearBonusSession(userUUID)
    return 'Bonus session expired.'
  }

  const spinNumber = (spinsTotal - spinsLeft) + 1
  const pick = weightedPick(BONUS_PERCENT_WEIGHTS)

  totalPct += pick.pct
  spinsLeft -= 1

  const cappedTotal = Math.min(totalPct, BONUS_MAX_TOTAL_PERCENT)

  const lines = []
  lines.push(`🎁 BONUS SPIN ${spinNumber}/${spinsTotal}: +${pick.pct}%  🧮 Total: ${cappedTotal}%`)
  if (pick.pct >= 25) lines.push('🔥 MASSIVE HIT! 25% spin!')
  else if (pick.pct >= 20) lines.push('🚨 BIG HIT! 20% spin!')

  if (spinsLeft > 0) {
    saveBonusSession(userUUID, { spinsLeft, spinsTotal, totalPct, lockedJackpot, startedAt })
    lines.push(`👉 Type /slots bonus to spin again (${spinsLeft} left).`)
    return lines.join('\n')
  }

  totalPct = Math.min(totalPct, BONUS_MAX_TOTAL_PERCENT)
  const jackpotWon = lockedJackpot * (totalPct / 100)
  let newJackpot = JACKPOT_SEED
  try {
    const settleBonusTx = db.transaction(() => {
      if (jackpotWon > 0) {
        const creditResult = applyGameDeltaInTransaction(userUUID, jackpotWon, {
          updateCache: false,
          meta: {
            source: 'slots',
            category: 'jackpot_bonus',
            note: 'Slots bonus round jackpot slice'
          }
        })
        if (!creditResult.ok) throw new Error('BONUS_CREDIT_FAILED')
      }

      const currentJackpot = getJackpotValue()
      newJackpot = Math.max(JACKPOT_SEED, currentJackpot - jackpotWon)
      updateJackpotValue(newJackpot)

      // Keep "effective" contribution aligned with remaining jackpot-funded pot.
      const beforeContribPot = Math.max(0, currentJackpot - JACKPOT_SEED)
      const afterContribPot = Math.max(0, newJackpot - JACKPOT_SEED)
      const retainedRatio = beforeContribPot > 0 ? (afterContribPot / beforeContribPot) : 1
      scaleEffectiveJackpotContributions(retainedRatio)

      clearBonusSession(userUUID, { throwOnError: true })
    })

    settleBonusTx()
  } catch (e) {
    console.error('[Slots] bonus settlement failed:', e)
    return 'An error occurred while settling your bonus round.'
  }

  const balance = syncWalletBalanceFromDb(userUUID)

  lines.push(`🏆 JACKPOT SLICE COMPLETE: ${totalPct}%`)
  lines.push(`💰 WON: +$${formatMoney(jackpotWon)} (locked pot: $${formatMoney(lockedJackpot)})`)
  lines.push(`🪙 BALANCE: $${formatBalance(balance)}`)
  lines.push(`💰 JACKPOT NOW: $${formatMoney(newJackpot)}`)

  return lines.join('\n')
}

// ───────────────────────────────────────────────────────────
// Feature session helpers (interactive 🎟️ free spins)
// ───────────────────────────────────────────────────────────

function getFeatureSession (userUUID) {
  try {
    const row = slotStmts.getFeatureSession.get(userUUID)
    if (!row?.data) return null
    return JSON.parse(row.data)
  } catch (e) {
    console.error('[Slots] getFeatureSession error:', e)
    return null
  }
}

function saveFeatureSession (userUUID, session, options = {}) {
  const throwOnError = Boolean(options?.throwOnError)
  try {
    const now = new Date().toISOString()
    slotStmts.saveFeatureSession.run(userUUID, JSON.stringify(session), now)
    return true
  } catch (e) {
    console.error('[Slots] saveFeatureSession error:', e)
    if (throwOnError) throw e
    return false
  }
}

function clearFeatureSession (userUUID, options = {}) {
  const throwOnError = Boolean(options?.throwOnError)
  try {
    slotStmts.clearFeatureSession.run(userUUID)
    return true
  } catch (e) {
    console.error('[Slots] clearFeatureSession error:', e)
    if (throwOnError) throw e
    return false
  }
}

function evaluateFeatureLine (symbolsArr) {
  const str = symbolsArr.join('')

  if (Object.prototype.hasOwnProperty.call(FEATURE_TRIPLE_PAYOUTS, str)) {
    return { payout: FEATURE_TRIPLE_PAYOUTS[str] * FEATURE_PAYOUT_MULTIPLIER, type: 'TRIPLE', line: str }
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
        return { payout: FEATURE_PAIR_PAYOUTS[key] * FEATURE_PAYOUT_MULTIPLIER, type: 'PAIR', line: str }
      }
    }
  }

  let bonus = 0
  for (const s of symbolsArr) {
    if (FEATURE_ANY_SYMBOL_BONUS[s]) {
      bonus = Math.max(bonus, FEATURE_ANY_SYMBOL_BONUS[s])
    }
  }
  if (bonus > 0) {
    return { payout: bonus * FEATURE_PAYOUT_MULTIPLIER, type: 'ANY', line: str }
  }

  return { payout: 0, type: 'NONE', line: str }
}

async function spinFeatureOnce (userUUID) {
  const session = getFeatureSession(userUUID)
  if (!session) {
    return `No active FREE SPINS feature. Hit 🎟️ during a bet ≥ $${formatBalance(FEATURE_MIN_TRIGGER_BET)} to trigger it!`
  }

  // ✅ If a bonus is active, force bonus to resolve first (feature paused)
  const activeBonus = getBonusSession(userUUID)
  if (activeBonus) {
    return [
      '🚨 You have an active 💎 BONUS ROUND!',
      `👉 Type /slots bonus to spin (${activeBonus.spinsLeft} left).`,
      '⏸️ FREE SPINS are paused until the bonus ends.'
    ].join('\n')
  }

  let spinsLeft = 0
  let spinsTotal = 0
  let totalWon = 0
  let startedAt = null
  let jackpotBonusUsed = false

  let spinNumber = 0
  let result = []
  let ticketCount = 0
  let grantedSpins = 0
  let outcome = { payout: 0, type: 'NONE', line: '' }
  let win = 0

  let triggeredBonusFromFeature = false
  let spinsTotalBonus = 0
  let lockedJackpot = 0
  let finishedFeature = false

  try {
    const settleFeatureTx = db.transaction(() => {
      const fresh = getFeatureSession(userUUID)
      if (!fresh) throw new Error('FEATURE_SESSION_MISSING')

      spinsLeft = Number(fresh.spinsLeft || 0)
      spinsTotal = Number(fresh.spinsTotal || 0)
      totalWon = Number(fresh.totalWon || 0)
      startedAt = fresh.startedAt
      jackpotBonusUsed = Boolean(fresh.jackpotBonusUsed)

      if (spinsLeft <= 0 || spinsTotal <= 0) {
        clearFeatureSession(userUUID, { throwOnError: true })
        throw new Error('FEATURE_SESSION_EXPIRED')
      }

      spinNumber = (spinsTotal - spinsLeft) + 1
      result = spinFeatureSlots()

      // ✅ NEW: Feature spins can trigger the 💎 BONUS (jackpot slice) once per feature session
      const isTripleDiamonds = result.join('') === '💎💎💎'
      if (isTripleDiamonds && !jackpotBonusUsed) {
        triggeredBonusFromFeature = true
        jackpotBonusUsed = true

        spinsTotalBonus = randInt(BONUS_SPINS_MIN, BONUS_SPINS_MAX)
        lockedJackpot = getJackpotValue()

        saveBonusSession(userUUID, {
          spinsLeft: spinsTotalBonus,
          spinsTotal: spinsTotalBonus,
          totalPct: 0,
          lockedJackpot,
          startedAt: new Date().toISOString()
        }, { throwOnError: true })

        // Pause feature session, keep remaining spins intact
        saveFeatureSession(userUUID, { spinsLeft, spinsTotal, totalWon, startedAt, jackpotBonusUsed }, { throwOnError: true })
        return
      }

      // tickets can land during feature to award more spins
      ticketCount = result.filter(s => s === '🎟️').length
      if (ticketCount > 0) {
        const add = Math.min(ticketCount, FEATURE_MAX_SPINS_PER_TRIGGER)
        const roomLeft = FEATURE_MAX_SPINS_PER_SESSION - spinsTotal
        grantedSpins = Math.max(0, Math.min(add, roomLeft))

        if (grantedSpins > 0) {
          spinsLeft += grantedSpins
          spinsTotal += grantedSpins
        }
      }

      outcome = evaluateFeatureLine(result)
      win = Number(outcome.payout || 0)

      if (win > 0) {
        totalWon += win
        const payoutResult = applyGameDeltaInTransaction(userUUID, win, {
          updateCache: false,
          meta: {
            source: 'slots',
            category: 'feature_win',
            note: `Feature spin ${spinNumber}/${spinsTotal}`
          }
        })
        if (!payoutResult.ok) throw new Error('FEATURE_PAYOUT_FAILED')
      }

      spinsLeft -= 1
      if (spinsLeft > 0) {
        saveFeatureSession(userUUID, { spinsLeft, spinsTotal, totalWon, startedAt, jackpotBonusUsed }, { throwOnError: true })
      } else {
        clearFeatureSession(userUUID, { throwOnError: true })
        finishedFeature = true
      }
    })

    settleFeatureTx()
  } catch (e) {
    const code = String(e?.message || '')
    if (code === 'FEATURE_SESSION_EXPIRED' || code === 'FEATURE_SESSION_MISSING') {
      return 'Feature session expired.'
    }
    console.error('[Slots] feature settlement failed:', e)
    return 'An error occurred while settling your free spin.'
  }

  if (triggeredBonusFromFeature) {
    return [
      renderSlot(result[0], result[1], result[2], `🎟️ FREE SPIN ${spinNumber}/${spinsTotal}`),
      '\n🚨 💎💎💎 JACKPOT BONUS TRIGGERED (FROM FREE SPINS) 💎💎💎 🚨',
      `🎁 BONUS SPINS: ${spinsTotalBonus}`,
      `💰 Locked Jackpot: $${formatMoney(lockedJackpot)}`,
      `👉 Type '/slots bonus' to start (Spin 1/${spinsTotalBonus}).`,
      '⏸️ Your FREE SPINS session is paused — resume with \'/slots free\' after the bonus.'
    ].join('\n')
  }

  const lines = []
  lines.push(renderSlot(result[0], result[1], result[2], `🎟️ FREE SPIN ${spinNumber}/${spinsTotal}`))

  if (grantedSpins > 0) {
    lines.push(`🎟️ +${grantedSpins} EXTRA FEATURE SPIN${grantedSpins === 1 ? '' : 'S'}!`)
  }

  if (win > 0) {
    lines.push(`💥 FEATURE WIN: +$${formatMoney(win)}`)
    if (win >= 4000 * FEATURE_PAYOUT_MULTIPLIER) lines.push('🚨 MEGA HIT! 💎💎💎')
    else if (win >= 2200 * FEATURE_PAYOUT_MULTIPLIER) lines.push('🔥 HUGE HIT! ⭐⭐⭐')
    else if (win >= 1400 * FEATURE_PAYOUT_MULTIPLIER) lines.push('🔔 BIG WIN!')
    else if (outcome.type === 'ANY') lines.push('✨ PREMIUM SYMBOL HIT!')
  } else {
    lines.push('— NO WIN —')
  }

  if (!finishedFeature) {
    lines.push(`👉 Type /slots free to spin again (${spinsLeft} left).`)
    return lines.join('\n')
  }

  const balance = syncWalletBalanceFromDb(userUUID)
  lines.push(`💰 TOTAL FEATURE WINS: +$${formatMoney(totalWon)}`)
  lines.push(`🪙 BALANCE: $${formatBalance(balance)}`)

  return lines.join('\n')
}

// ───────────────────────────────────────────────────────────
// Collection helpers
// ───────────────────────────────────────────────────────────

function getUserCollection (userUUID) {
  try {
    const row = slotStmts.getUserCollection.get(userUUID)
    if (!row?.data) return { counts: {}, tiers: {}, halfNotifs: {} }
    const parsed = JSON.parse(row.data)
    return {
      counts: parsed.counts || {},
      tiers: parsed.tiers || {},
      halfNotifs: parsed.halfNotifs || {}
    }
  } catch (e) {
    console.error('[Slots] getUserCollection error:', e)
    return { counts: {}, tiers: {}, halfNotifs: {} }
  }
}

function saveUserCollection (userUUID, collection) {
  try {
    const now = new Date().toISOString()
    slotStmts.saveUserCollection.run(userUUID, JSON.stringify(collection), now)
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

function applyCollectionProgress (userUUID, spins) {
  const col = getUserCollection(userUUID)
  const counts = col.counts || {}
  const tiers = col.tiers || {}
  const halfNotifs = col.halfNotifs || {}

  const beforeCounts = { ...counts }

  for (const s of spins.flat()) {
    counts[s] = (counts[s] || 0) + 1
  }

  const unlocked = []
  const progress = []
  let totalReward = 0

  for (const sym of Object.keys(COLLECTION_GOALS)) {
    const goal = COLLECTION_GOALS[sym]
    const reward = COLLECTION_REWARDS[sym] || 0

    const before = Number(beforeCounts[sym] || 0)
    const after = Number(counts[sym] || 0)

    const prevTier = Number(tiers[sym] || 0)
    const newTier = Math.floor(after / goal)

    const nextTier = prevTier + 1
    const halfThreshold = (prevTier * goal) + Math.ceil(goal / 2)
    const lastHalfTierNotified = Number(halfNotifs[sym] || 0)

    if (
      nextTier > prevTier &&
      lastHalfTierNotified < nextTier &&
      before < halfThreshold &&
      after >= halfThreshold &&
      newTier === prevTier
    ) {
      halfNotifs[sym] = nextTier
      const currentInTier = after - (prevTier * goal)
      progress.push(`⏳ COLLECTION: ${sym} halfway to Tier ${nextTier} (${currentInTier}/${goal})`)
    }

    if (newTier > prevTier) {
      const tiersGained = newTier - prevTier
      tiers[sym] = newTier

      const payout = reward * tiersGained
      totalReward += payout

      unlocked.push(`🏅 COLLECTION: ${sym} Tier ${newTier} (+$${formatBalance(payout)})`)
      halfNotifs[sym] = Math.max(Number(halfNotifs[sym] || 0), newTier)
    }
  }

  saveUserCollection(userUUID, { counts, tiers, halfNotifs })

  return { unlockedLines: unlocked, progressLines: progress, rewardTotal: totalReward }
}

// ───────────────────────────────────────────────────────────
// Main game
// ───────────────────────────────────────────────────────────

async function playSlots (userUUID, betSize = DEFAULT_BET) {
  const bet = Number(betSize) || 0

  const activeBonus = getBonusSession(userUUID)
  if (activeBonus) {
    return [
      '🚨 You have an active 💎 BONUS ROUND!',
      `👉 Type /slots bonus to spin (${activeBonus.spinsLeft} left).`
    ].join('\n')
  }

  const activeFeature = getFeatureSession(userUUID)
  if (activeFeature) {
    return [
      '🎟️ You’re in FREE SPINS FEATURE MODE!',
      `👉 Type '/slots free' to spin (${activeFeature.spinsLeft} left).`
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

    let jackpot = 0
    let jackpotIncrement = 0
    let milestoneLine = null
    let resetInfo = { didReset: false, current: getYearMonthKey() }
    let collection = { unlockedLines: [], progressLines: [], rewardTotal: 0 }

    const spinLines = []
    const allSpinResults = []
    const nearMissLines = []

    let totalWinnings = 0
    let bonusTriggerMessage = ''
    let featureTriggerMessage = ''

    let bonusTriggeredThisPlay = false
    let featureTriggeredThisPlay = false

    const settleSpinTx = db.transaction(() => {
      const debitResult = applyGameDeltaInTransaction(userUUID, -Math.abs(bet), {
        requireSufficientFunds: true,
        updateCache: false,
        meta: {
          source: 'slots',
          category: 'bet',
          note: `Base spin bet ${formatBalance(bet)}`
        }
      })

      if (!debitResult.ok) {
        throw new Error('INSUFFICIENT_FUNDS')
      }

      jackpot = getJackpotValue()
      const beforeJackpot = jackpot
      const contribBet = Math.min(bet, JACKPOT_CONTRIB_BET_CAP)
      jackpotIncrement = contribBet * JACKPOT_INCREMENT_RATE
      jackpot += jackpotIncrement
      updateJackpotValue(jackpot)
      recordJackpotContribution(userUUID, jackpotIncrement)

      milestoneLine = maybeMilestoneAnnouncement(beforeJackpot, jackpot)

      const playOneSpin = (prefix) => {
        // ✅ Option A in action: tickets can’t appear if bet < FEATURE_MIN_TRIGGER_BET
        const result = spinSlots(bet)
        allSpinResults.push(result)

        const outcome = evaluateLine(result)
        const win = bet * outcome.multiplier * HOUSE_EDGE
        totalWinnings += win

        const diamondCount = result.filter(s => s === '💎').length
        if (diamondCount === 2) nearMissLines.push('😮 NEAR MISS: Two 💎!')

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
          }, { throwOnError: true })

          bonusTriggerMessage = [
            '\n🚨 💎💎💎 BONUS TRIGGERED 💎💎💎 🚨',
            `🎁 FEATURE ROUND UNLOCKED: ${spinsTotal} BONUS SPINS`,
            `💰 Locked Jackpot: $${formatMoney(lockedJackpot)}`,
            `👉 Type '/slots bonus' to start (Spin 1/${spinsTotal}).`
          ].join('\n')
        }

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
              startedAt: new Date().toISOString(),
              jackpotBonusUsed: false // ✅ NEW: feature can trigger jackpot once
            }, { throwOnError: true })

            featureTriggerMessage = [
              '\n🎟️ FREE SPINS FEATURE UNLOCKED 🎟️',
              `🎁 You won ${spinsTotal} FEATURE SPIN${spinsTotal === 1 ? '' : 'S'}`,
              `👉 Type '/slots free' to start (Spin 1/${spinsTotal}).`
            ].join('\n')
          }
        }

        spinLines.push(renderSlot(result[0], result[1], result[2], prefix))
      }

      playOneSpin('🎰 SLOTS')

      if (totalWinnings > 0) {
        const payoutResult = applyGameDeltaInTransaction(userUUID, totalWinnings, {
          updateCache: false,
          meta: {
            source: 'slots',
            category: 'spin_win',
            note: `Base spin payout on $${formatBalance(bet)} bet`
          }
        })
        if (!payoutResult.ok) throw new Error('PAYOUT_FAILED')
      }

      resetInfo = maybeResetCollectionsMonthly()

      if (bet >= COLLECTION_MIN_BET) {
        collection = applyCollectionProgress(userUUID, allSpinResults)
        if (collection.rewardTotal > 0) {
          const collectionPayout = applyGameDeltaInTransaction(userUUID, collection.rewardTotal, {
            updateCache: false,
            meta: {
              source: 'slots',
              category: 'collection_reward',
              note: 'Slots collection tier reward'
            }
          })
          if (!collectionPayout.ok) throw new Error('COLLECTION_PAYOUT_FAILED')
        }
      }
    })

    settleSpinTx()
    balance = syncWalletBalanceFromDb(userUUID)

    const didWin = totalWinnings > 0
    const resultLine = didWin
      ? `\n💥 WIN: +$${formatMoney(totalWinnings)}`
      : '\n— NO WIN —'
    const balanceLine = `🪙 BALANCE: $${formatBalance(balance)}`
    const jackpotLine = `💰 JACKPOT: $${formatMoney(jackpot)}  📈 +$${formatMoney(jackpotIncrement)}`
    const nearMiss = nearMissLines.length ? `\n${nearMissLines[0]}` : ''
    const milestone = milestoneLine ? `\n${milestoneLine}` : ''
    const resetLine = resetInfo.didReset ? `🗓️ Monthly Collections Reset! (New season: ${resetInfo.current})` : ''

    const collectionLines = (collection.unlockedLines.length || collection.progressLines?.length)
      ? `\n\n${[
          ...(collection.unlockedLines || []),
          ...(collection.progressLines || [])
        ].join('\n')}`
      : ''

    // ✅ Balance above, jackpot last, with a visual gap before jackpot
    return [
      spinLines.join('\n'),
      resultLine + nearMiss,
      milestone,
      resetLine,
      balanceLine,
      bonusTriggerMessage,
      featureTriggerMessage,
      collectionLines,
      ' ', // spacer line (survives filter(Boolean))
      jackpotLine // jackpot at very bottom
    ].filter(Boolean).join('\n')
  } catch (err) {
    if (String(err?.message || '') === 'INSUFFICIENT_FUNDS') {
      const balance = syncWalletBalanceFromDb(userUUID)
      return `Invalid bet amount. Your balance is $${formatBalance(balance)}.`
    }
    console.error('Slots error:', err)
    return 'An error occurred while playing slots.'
  }
}

// Command handler
async function handleSlotsCommand (userUUID, arg) {
  const raw = arg == null ? '' : String(arg).trim().toLowerCase()

  if (raw === 'bonus') return await spinBonusOnce(userUUID)
  if (raw === 'free') return await spinFeatureOnce(userUUID)
  if (raw === 'effective' || raw === 'eff') {
    const stats = getUserJackpotContributionStats(userUUID)
    return `🪙 Active Jackpot Contribution: $${formatMoney(stats.effectiveContributed)} (${stats.effectiveSharePct.toFixed(2)}% share)`
  }
  if (raw === 'lifetime' || raw === 'life') {
    const stats = getUserJackpotContributionStats(userUUID)
    return `🧾 Lifetime Jackpot Contributed: $${formatMoney(stats.lifetimeContributed)}`
  }
  if (raw === 'stats') {
    const stats = getUserJackpotContributionStats(userUUID)
    return [
      '📊 SLOTS JACKPOT STATS',
      `🧾 Lifetime Contributed: $${formatMoney(stats.lifetimeContributed)}`,
      `🪙 Active Contribution: $${formatMoney(stats.effectiveContributed)}`,
      `📈 Your Active Share: ${stats.effectiveSharePct.toFixed(2)}%`
    ].join('\n')
  }

  const bet = raw === '' ? DEFAULT_BET : Number(raw)
  if (!Number.isFinite(bet) || bet <= 0) return 'Please enter a valid bet amount.'

  return await playSlots(userUUID, bet)
}

export { playSlots, handleSlotsCommand, getJackpotValue, getUserJackpotContributionStats }
