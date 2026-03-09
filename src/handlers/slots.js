import { debitGameBet, creditGameWin, getUserWallet } from '../database/dbwalletmanager.js'
import db from '../database/db.js'

// Slot symbols
const WILD = '🃏'
const SCATTER = '🎟️'
const LOW_1 = '🍒'
const LOW_2 = '🍋'
const LOW_3 = '🍊'
const MID_1 = '🍉'
const MID_2 = '🔔'
const HIGH_1 = '⭐'
const HIGH_2 = '💎'

const ALL_SYMBOLS = [LOW_1, LOW_2, LOW_3, MID_1, MID_2, HIGH_1, HIGH_2, WILD, SCATTER]
const PAY_SYMBOLS = [LOW_1, LOW_2, LOW_3, MID_1, MID_2, HIGH_1, HIGH_2]

const PAYTABLE = {
  '🍒': { 2: 1.2, 3: 4 },
  '🍋': { 2: 1.2, 3: 4 },
  '🍊': { 2: 1.4, 3: 5 },
  '🍉': { 2: 1.8, 3: 7 },
  '🔔': { 2: 2.2, 3: 10 },
  '⭐': { 2: 3.5, 3: 16 },
  '💎': { 2: 5, 3: 25 }
}

// Tuned small-room profile
const PAY_MULTIPLIER = 0.85

// Bets
const MIN_BET = 1
const MAX_BET = 100000
const DEFAULT_BET = 1

// Progressive jackpot tuning
const JACKPOT_SEED = 100
const JACKPOT_INCREMENT_RATE = 0.02
const JACKPOT_CONTRIB_BET_CAP = 5000
const JACKPOT_MILESTONES = [10000, 25000, 50000, 100000, 250000, 500000, 1000000]

// Collections tuning
const COLLECTION_MIN_BET = 100
const COLLECTION_RESET_KEY = 'slots_collection_reset_yyyymm'

// Feature tuning
const FEATURE_MIN_TRIGGER_BET = 25
const FEATURE_SPINS_AWARD = 6
const FEATURE_RETRIGGER_SCATTERS = 2
const FEATURE_RETRIGGER_SPINS = 1
const FEATURE_START_MULT = 1
const FEATURE_MAX_MULT = 3

function buildStrip (countMap) {
  const out = []
  for (const sym of ALL_SYMBOLS) {
    const n = Number(countMap[sym] || 0)
    for (let i = 0; i < n; i++) out.push(sym)
  }
  return out
}

const REEL_STRIPS = [
  buildStrip({
    '🍒': 3, '🍋': 14, '🍊': 12, '🍉': 9, '🔔': 7, '⭐': 5, '💎': 6, '🃏': 8, '🎟️': 4
  }),
  buildStrip({
    '🍒': 5, '🍋': 12, '🍊': 11, '🍉': 9, '🔔': 7, '⭐': 6, '💎': 7, '🃏': 6, '🎟️': 3
  }),
  buildStrip({
    '🍒': 5, '🍋': 13, '🍊': 11, '🍉': 8, '🔔': 7, '⭐': 5, '💎': 7, '🃏': 6, '🎟️': 3
  })
]

const COLLECTION_GOALS = {
  '🍒': 50,
  '🍋': 50,
  '🍊': 50,
  '🍉': 50,
  '🔔': 30,
  '⭐': 25,
  '💎': 20,
  '🎟️': 25
}

const COLLECTION_REWARDS = {
  '🍒': 500,
  '🍋': 400,
  '🍊': 300,
  '🍉': 600,
  '🔔': 800,
  '⭐': 1000,
  '💎': 1500,
  '🎟️': 750
}

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

function randInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
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

function spinReels () {
  const symbols = []
  for (const strip of REEL_STRIPS) {
    const stop = randInt(0, strip.length - 1)
    symbols.push(strip[stop])
  }
  return symbols
}

function isMatchOrWild (hit, target) {
  return hit === target || hit === WILD
}

function scoreLineLeftToRight (line) {
  let bestMult = 0
  let bestSym = null
  let bestCount = 0

  for (const target of PAY_SYMBOLS) {
    const c1 = isMatchOrWild(line[0], target)
    const c2 = c1 && isMatchOrWild(line[1], target)
    const c3 = c2 && isMatchOrWild(line[2], target)
    const count = c3 ? 3 : (c2 ? 2 : 0)
    if (count < 2) continue

    const mult = Number(PAYTABLE[target]?.[count] || 0)
    if (mult > bestMult) {
      bestMult = mult
      bestSym = target
      bestCount = count
    }
  }

  if (bestMult > 0) {
    return { multiplier: bestMult, symbol: bestSym, count: bestCount }
  }
  return { multiplier: 0, symbol: '', count: 0 }
}

function evaluateBaseSpin (line, bet) {
  let win = 0
  let lineWin = 0
  let scatterPay = 0

  const lineOutcome = scoreLineLeftToRight(line)
  if (lineOutcome.multiplier > 0) {
    lineWin = bet * lineOutcome.multiplier * PAY_MULTIPLIER
    win += lineWin
  }

  const scatters = line.filter(s => s === SCATTER).length
  if (scatters >= 2) {
    scatterPay = bet * (scatters === 2 ? 1 : 3)
    win += scatterPay
  }

  const jackpotHit = line[0] === HIGH_2 && line[1] === HIGH_2 && line[2] === HIGH_2

  return {
    win,
    lineWin,
    lineSymbol: lineOutcome.symbol,
    lineCount: lineOutcome.count,
    scatterPay,
    scatters,
    jackpotHit,
    featureTrigger: scatters >= 2 && bet >= FEATURE_MIN_TRIGGER_BET
  }
}

function renderSlot (a, b, c, prefix = '🎰 SLOTS') {
  return `${prefix}  ${a} ┃ ${b} ┃ ${c}`
}

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

async function spinFeatureOnce (userUUID) {
  const session = getFeatureSession(userUUID)
  if (!session) {
    return `No active FREE SPINS feature. Hit ${SCATTER}${SCATTER} during a bet ≥ $${formatBalance(FEATURE_MIN_TRIGGER_BET)} to trigger it!`
  }

  let { spinsLeft, spinsTotal, totalWon, mult } = session
  spinsLeft = Number(spinsLeft || 0)
  spinsTotal = Number(spinsTotal || 0)
  totalWon = Number(totalWon || 0)
  mult = Number(mult || FEATURE_START_MULT)

  if (spinsLeft <= 0) {
    clearFeatureSession(userUUID)
    return 'Feature session expired.'
  }

  const spinNumber = (spinsTotal - spinsLeft) + 1
  const result = spinReels()
  const outcome = evaluateBaseSpin(result, 1)

  let win = outcome.win * mult
  if (win > 0) {
    totalWon += win
    await creditGameWin(userUUID, win)
  }

  if (outcome.scatters >= FEATURE_RETRIGGER_SCATTERS) {
    spinsLeft += FEATURE_RETRIGGER_SPINS
    spinsTotal += FEATURE_RETRIGGER_SPINS
    mult = Math.min(FEATURE_MAX_MULT, mult + 1)
  }

  if (outcome.jackpotHit) {
    const jackpotBefore = getJackpotValue()
    const jackpotWin = jackpotBefore
    if (jackpotWin > 0) {
      await creditGameWin(userUUID, jackpotWin)
      totalWon += jackpotWin
    }
    updateJackpotValue(JACKPOT_SEED)

    const beforeContribPot = Math.max(0, jackpotBefore - JACKPOT_SEED)
    const retainedRatio = beforeContribPot > 0 ? 0 : 1
    scaleEffectiveJackpotContributions(retainedRatio)

    win += jackpotWin
  }

  spinsLeft -= 1

  const lines = []
  lines.push(renderSlot(result[0], result[1], result[2], `🎟️ FREE SPIN ${spinNumber}/${spinsTotal}`))

  if (outcome.lineWin > 0) lines.push(`💥 LINE WIN ${outcome.lineSymbol} x${outcome.lineCount}: +$${formatMoney(outcome.lineWin * mult)}`)
  if (outcome.scatterPay > 0) lines.push(`🎟️ SCATTER PAY x${outcome.scatters}: +$${formatMoney(outcome.scatterPay * mult)}`)
  if (outcome.scatters >= FEATURE_RETRIGGER_SCATTERS) lines.push(`🔁 RETRIGGER: +${FEATURE_RETRIGGER_SPINS} FREE SPIN`)
  if (outcome.jackpotHit) lines.push('🏆 JACKPOT HIT DURING FREE SPINS!')

  lines.push(win > 0 ? `💥 FEATURE WIN: +$${formatMoney(win)}` : '— NO WIN —')

  if (spinsLeft > 0) {
    saveFeatureSession(userUUID, { spinsLeft, spinsTotal, totalWon, mult })
    lines.push(`👉 Type /slots free to spin again (${spinsLeft} left).`)
    return lines.join('\n')
  }

  clearFeatureSession(userUUID)

  const balance = await getUserWallet(userUUID)
  lines.push(`💰 TOTAL FEATURE WINS: +$${formatMoney(totalWon)}`)
  lines.push(`🪙 BALANCE: $${formatBalance(balance)}`)

  return lines.join('\n')
}

async function playSlots (userUUID, betSize = DEFAULT_BET) {
  const bet = Number(betSize) || 0

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

    const result = spinReels()
    const outcome = evaluateBaseSpin(result, bet)

    const spinLines = [renderSlot(result[0], result[1], result[2], '🎰 SLOTS')]

    if (outcome.lineWin > 0) {
      spinLines.push(`💥 LINE WIN ${outcome.lineSymbol} x${outcome.lineCount}: +$${formatMoney(outcome.lineWin)}`)
    }
    if (outcome.scatterPay > 0) {
      spinLines.push(`🎟️ SCATTER PAY x${outcome.scatters}: +$${formatMoney(outcome.scatterPay)}`)
    }

    let totalWinnings = outcome.win
    if (outcome.jackpotHit) {
      const jackpotBefore = getJackpotValue()
      const jackpotWin = jackpotBefore
      if (jackpotWin > 0) totalWinnings += jackpotWin

      updateJackpotValue(JACKPOT_SEED)
      jackpot = JACKPOT_SEED

      const beforeContribPot = Math.max(0, jackpotBefore - JACKPOT_SEED)
      const retainedRatio = beforeContribPot > 0 ? 0 : 1
      scaleEffectiveJackpotContributions(retainedRatio)

      spinLines.push(`🏆 JACKPOT HIT: +$${formatMoney(jackpotWin)}`)
    }

    if (totalWinnings > 0) {
      await creditGameWin(userUUID, totalWinnings)
    }

    let featureTriggerMessage = ''
    if (outcome.featureTrigger) {
      saveFeatureSession(userUUID, {
        spinsLeft: FEATURE_SPINS_AWARD,
        spinsTotal: FEATURE_SPINS_AWARD,
        totalWon: 0,
        mult: FEATURE_START_MULT
      })

      featureTriggerMessage = [
        '\n🎟️ FREE SPINS FEATURE UNLOCKED 🎟️',
        `🎁 You won ${FEATURE_SPINS_AWARD} FEATURE SPINS`,
        `👉 Type '/slots free' to start (Spin 1/${FEATURE_SPINS_AWARD}).`
      ].join('\n')
    }

    const resetInfo = maybeResetCollectionsMonthly()

    let collection = { unlockedLines: [], progressLines: [], rewardTotal: 0 }
    if (bet >= COLLECTION_MIN_BET) {
      collection = await applyCollectionProgress(userUUID, [result])
    }

    balance = await getUserWallet(userUUID)

    const resultLine = totalWinnings > 0
      ? `\n💥 WIN: +$${formatMoney(totalWinnings)}`
      : '\n— NO WIN —'

    const balanceLine = `🪙 BALANCE: $${formatBalance(balance)}`
    const jackpotLine = `💰 JACKPOT: $${formatMoney(jackpot)}  📈 +$${formatMoney(jackpotIncrement)}`
    const milestone = milestoneLine ? `\n${milestoneLine}` : ''
    const resetLine = resetInfo.didReset ? `🗓️ Monthly Collections Reset! (New season: ${resetInfo.current})` : ''

    const collectionLines = (collection.unlockedLines.length || collection.progressLines.length)
      ? `\n\n${[
          ...collection.unlockedLines,
          ...collection.progressLines
        ].join('\n')}`
      : ''

    return [
      spinLines.join('\n'),
      resultLine,
      milestone,
      resetLine,
      balanceLine,
      featureTriggerMessage,
      collectionLines,
      ' ',
      jackpotLine
    ].filter(Boolean).join('\n')
  } catch (err) {
    console.error('Slots error:', err)
    return 'An error occurred while playing slots.'
  }
}

async function handleSlotsCommand (userUUID, arg) {
  const raw = arg == null ? '' : String(arg).trim().toLowerCase()

  if (raw === 'bonus') {
    return 'Bonus mode was replaced. Use /slots free when feature spins are active.'
  }
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
  if (raw === 'info' || raw === 'help') {
    return [
      '🎰 SLOTS RULES',
      `- Left-to-right pays with ${WILD} wild substitutions`,
      `- ${SCATTER}${SCATTER} or ${SCATTER}${SCATTER}${SCATTER} scatters pay anywhere`,
      `- ${SCATTER}${SCATTER}+ on bet >= $${formatBalance(FEATURE_MIN_TRIGGER_BET)} triggers ${FEATURE_SPINS_AWARD} free spins`,
      '- Use /slots free during free spins',
      '- Jackpot hits on 💎💎💎'
    ].join('\n')
  }

  const bet = raw === '' ? DEFAULT_BET : Number(raw)
  if (!Number.isFinite(bet) || bet <= 0) return 'Please enter a valid bet amount.'

  return await playSlots(userUUID, bet)
}

export { playSlots, handleSlotsCommand, getJackpotValue, getUserJackpotContributionStats }
