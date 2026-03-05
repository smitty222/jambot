import { debitGameBet, creditGameWin, getUserWallet } from '../database/dbwalletmanager.js'
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
  '⭐': 13,
  '💎': 9, // was 8 ✅
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
const HOUSE_EDGE = 0.96

// Progressive jackpot tuning
const JACKPOT_SEED = 100
const JACKPOT_INCREMENT_RATE = 0.15
const JACKPOT_CONTRIB_BET_CAP = 5000

// Jackpot milestones (announce when crossed; persisted)
const JACKPOT_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000]

// Collections tuning
const COLLECTION_MIN_BET = 100
const COLLECTION_RESET_KEY = 'slots_collection_reset_yyyymm'

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
// ✅ CHANGE: allow tickets to land DURING feature spins to award more feature spins
// ✅ CHANGE: allow 💎💎💎 during feature spins to TRIGGER jackpot bonus session too (once per feature session)
const FEATURE_MIN_TRIGGER_BET = 250
const FEATURE_MAX_SPINS_PER_TRIGGER = 3
const FEATURE_MAX_SPINS_PER_SESSION = 15
const FEATURE_PAYOUT_MULTIPLIER = 10 // option 1

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
  '🍒🍒🍒': 350,
  '🍋🍋🍋': 320,
  '🍊🍊🍊': 300,
  '🍉🍉🍉': 450,
  '🔔🔔🔔': 1400,
  '⭐⭐⭐': 2200,
  '💎💎💎': 4000
}

const FEATURE_PAIR_PAYOUTS = {
  '🍒🍒': 120,
  '🍋🍋': 110,
  '🍊🍊': 100,
  '🍉🍉': 150,
  '🔔🔔': 450,
  '⭐⭐': 650,
  '💎💎': 1200
}

// Premium “anywhere” mini-pay (only if no pair/triple)
const FEATURE_ANY_SYMBOL_BONUS = {
  '💎': 90,
  '⭐': 70,
  '🔔': 50
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
  '🍒': 500,
  '🍋': 400,
  '🍊': 300,
  '🍉': 600,
  '🔔': 800,
  '⭐': 1000,
  '💎': 1500, // was 25000 (reduced)
  '🎟️': 750
}

// Bets
const MIN_BET = 1
const MAX_BET = 100000
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
      db.prepare('DELETE FROM slot_collections').run()
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
    db.prepare(`
      INSERT INTO slot_jackpot_contributions (userUUID, lifetimeContributed, effectiveContributed, updatedAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET
        lifetimeContributed = lifetimeContributed + excluded.lifetimeContributed,
        effectiveContributed = effectiveContributed + excluded.effectiveContributed,
        updatedAt = excluded.updatedAt
    `).run(userUUID, inc, inc, now)
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
    db.prepare(`
      UPDATE slot_jackpot_contributions
      SET effectiveContributed = effectiveContributed * ?,
          updatedAt = ?
    `).run(clamped, now)
  } catch (e) {
    console.error('[Slots] scaleEffectiveJackpotContributions error:', e)
  }
}

function getUserJackpotContributionStats (userUUID) {
  try {
    const row = db.prepare(`
      SELECT lifetimeContributed, effectiveContributed
      FROM slot_jackpot_contributions
      WHERE userUUID = ?
    `).get(userUUID)

    const totals = db.prepare(`
      SELECT COALESCE(SUM(effectiveContributed), 0) AS totalEffective
      FROM slot_jackpot_contributions
    `).get()

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
  const row = db.prepare('SELECT progressiveJackpot FROM jackpot WHERE id = 1').get()
  return Number(row?.progressiveJackpot || JACKPOT_SEED)
}

function updateJackpotValue (newValue) {
  db.prepare('UPDATE jackpot SET progressiveJackpot = ? WHERE id = 1').run(Number(newValue))
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

  if (jackpotWon > 0) await creditGameWin(userUUID, jackpotWon)

  const currentJackpot = getJackpotValue()
  const newJackpot = Math.max(JACKPOT_SEED, currentJackpot - jackpotWon)
  updateJackpotValue(newJackpot)

  // Keep "effective" contribution aligned with remaining jackpot-funded pot.
  const beforeContribPot = Math.max(0, currentJackpot - JACKPOT_SEED)
  const afterContribPot = Math.max(0, newJackpot - JACKPOT_SEED)
  const retainedRatio = beforeContribPot > 0 ? (afterContribPot / beforeContribPot) : 1
  scaleEffectiveJackpotContributions(retainedRatio)

  clearBonusSession(userUUID)

  const balance = await getUserWallet(userUUID)

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

  let { spinsLeft, spinsTotal, totalWon, startedAt, jackpotBonusUsed } = session
  spinsLeft = Number(spinsLeft || 0)
  spinsTotal = Number(spinsTotal || 0)
  totalWon = Number(totalWon || 0)
  jackpotBonusUsed = Boolean(jackpotBonusUsed)

  if (spinsLeft <= 0 || spinsTotal <= 0) {
    clearFeatureSession(userUUID)
    return 'Feature session expired.'
  }

  const spinNumber = (spinsTotal - spinsLeft) + 1
  const result = spinFeatureSlots()

  // ✅ NEW: Feature spins can trigger the 💎 BONUS (jackpot slice) once per feature session
  const isTripleDiamonds = result.join('') === '💎💎💎'
  if (isTripleDiamonds && !jackpotBonusUsed) {
    jackpotBonusUsed = true

    const spinsTotalBonus = randInt(BONUS_SPINS_MIN, BONUS_SPINS_MAX)
    const lockedJackpot = getJackpotValue()

    saveBonusSession(userUUID, {
      spinsLeft: spinsTotalBonus,
      spinsTotal: spinsTotalBonus,
      totalPct: 0,
      lockedJackpot,
      startedAt: new Date().toISOString()
    })

    // Pause feature session, keep remaining spins intact
    saveFeatureSession(userUUID, { spinsLeft, spinsTotal, totalWon, startedAt, jackpotBonusUsed })

    return [
      renderSlot(result[0], result[1], result[2], `🎟️ FREE SPIN ${spinNumber}/${spinsTotal}`),
      '\n🚨 💎💎💎 JACKPOT BONUS TRIGGERED (FROM FREE SPINS) 💎💎💎 🚨',
      `🎁 BONUS SPINS: ${spinsTotalBonus}`,
      `💰 Locked Jackpot: $${formatMoney(lockedJackpot)}`,
      `👉 Type '/slots bonus' to start (Spin 1/${spinsTotalBonus}).`,
      `⏸️ Your FREE SPINS session is paused — resume with '/slots free' after the bonus.`
    ].join('\n')
  }

  // tickets can land during feature to award more spins
  const ticketCount = result.filter(s => s === '🎟️').length
  if (ticketCount > 0) {
    const add = Math.min(ticketCount, FEATURE_MAX_SPINS_PER_TRIGGER)
    const roomLeft = FEATURE_MAX_SPINS_PER_SESSION - spinsTotal
    const granted = Math.max(0, Math.min(add, roomLeft))

    if (granted > 0) {
      spinsLeft += granted
      spinsTotal += granted
    }
  }

  const outcome = evaluateFeatureLine(result)
  const win = Number(outcome.payout || 0)

  if (win > 0) {
    totalWon += win
    await creditGameWin(userUUID, win)
  }

  spinsLeft -= 1

  const lines = []
  lines.push(renderSlot(result[0], result[1], result[2], `🎟️ FREE SPIN ${spinNumber}/${spinsTotal}`))

  if (ticketCount > 0) {
    lines.push(`🎟️ +${Math.min(ticketCount, FEATURE_MAX_SPINS_PER_TRIGGER)} EXTRA FEATURE SPIN${ticketCount === 1 ? '' : 'S'}!`)
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

  if (spinsLeft > 0) {
    saveFeatureSession(userUUID, { spinsLeft, spinsTotal, totalWon, startedAt, jackpotBonusUsed })
    lines.push(`👉 Type /slots free to spin again (${spinsLeft} left).`)
    return lines.join('\n')
  }

  clearFeatureSession(userUUID)

  const balance = await getUserWallet(userUUID)
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

  if (totalReward > 0) {
    await creditGameWin(userUUID, totalReward)
  }

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

    await debitGameBet(userUUID, bet)

    let jackpot = getJackpotValue()
    const beforeJackpot = jackpot
    const contribBet = Math.min(bet, JACKPOT_CONTRIB_BET_CAP)
    const jackpotIncrement = contribBet * JACKPOT_INCREMENT_RATE
    jackpot += jackpotIncrement
    updateJackpotValue(jackpot)
    recordJackpotContribution(userUUID, jackpotIncrement)

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
        })

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
          })

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
      await creditGameWin(userUUID, totalWinnings)
    }

    const resetInfo = maybeResetCollectionsMonthly()

    let collection = { unlockedLines: [], rewardTotal: 0 }
    if (bet >= COLLECTION_MIN_BET) {
      collection = await applyCollectionProgress(userUUID, allSpinResults)
    }

    balance = await getUserWallet(userUUID)

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
      `📦 Total Active Pool (tracked): $${formatMoney(stats.totalEffective)}`,
      `📈 Your Active Share: ${stats.effectiveSharePct.toFixed(2)}%`
    ].join('\n')
  }

  const bet = raw === '' ? DEFAULT_BET : Number(raw)
  if (!Number.isFinite(bet) || bet <= 0) return 'Please enter a valid bet amount.'

  return await playSlots(userUUID, bet)
}

export { playSlots, handleSlotsCommand, getJackpotValue, getUserJackpotContributionStats }
