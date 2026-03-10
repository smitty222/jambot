import {
  getUserWallet,
  applyGameDeltaInTransaction,
  syncWalletBalanceFromDb
} from '../database/dbwalletmanager.js'
import db from '../database/db.js'
import { createSlotsPersistence } from './slotsPersistence.js'
import { createSlotsStateHelpers } from './slotsState.js'

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
const JACKPOT_ASSIST_START = 10000
const JACKPOT_ASSIST_FULL = 250000
const JACKPOT_ASSIST_MAX_CHANCE = 0.12

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

const slotStmts = createSlotsPersistence(db, JACKPOT_SEED)
const {
  readSetting,
  writeSetting,
  maybeResetCollectionsMonthly,
  recordJackpotContribution,
  scaleEffectiveJackpotContributions,
  getUserJackpotContributionStats,
  getJackpotValue,
  updateJackpotValue,
  getBonusSession,
  saveBonusSession,
  clearBonusSession,
  getFeatureSession,
  saveFeatureSession,
  clearFeatureSession,
  applyCollectionProgress
} = createSlotsStateHelpers({
  slotStmts,
  jackpotSeed: JACKPOT_SEED,
  collectionResetKey: COLLECTION_RESET_KEY,
  collectionGoals: COLLECTION_GOALS,
  collectionRewards: COLLECTION_REWARDS,
  formatBalance
})

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

function getYearMonthKey (d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}${m}`
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

function getJackpotAssistChance (jackpotValue) {
  const jackpot = Number(jackpotValue) || 0
  if (jackpot <= JACKPOT_ASSIST_START) return 0

  const span = Math.max(1, JACKPOT_ASSIST_FULL - JACKPOT_ASSIST_START)
  const progress = Math.min(1, (jackpot - JACKPOT_ASSIST_START) / span)
  return progress * JACKPOT_ASSIST_MAX_CHANCE
}

function maybeApplyJackpotAssist (symbolsArr, jackpotValue) {
  const diamondCount = symbolsArr.filter(s => s === '💎').length
  if (diamondCount !== 2) return symbolsArr
  if (symbolsArr.includes('🎟️')) return symbolsArr

  const assistChance = getJackpotAssistChance(jackpotValue)
  if (assistChance <= 0 || Math.random() >= assistChance) return symbolsArr

  return symbolsArr.map(symbol => (symbol === '💎' ? symbol : '💎'))
}

// ───────────────────────────────────────────────────────────
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
      result = maybeApplyJackpotAssist(spinFeatureSlots(), getJackpotValue())

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
        const result = maybeApplyJackpotAssist(spinSlots(bet), jackpot)
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
