import { debitGameBet, creditGameWin, getUserWallet } from '../database/dbwalletmanager.js'
import db from '../database/db.js'

// Realistic-ish 3x1 slot model:
// - Per-reel strips (not independent weighted symbol picks)
// - Left-to-right adjacent payline wins
// - Wild substitution
// - Scatter-triggered free spins with retriggers and multiplier growth

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

const MIN_BET = 1
const MAX_BET = 100000
const DEFAULT_BET = 1

const JACKPOT_SEED = 100
const JACKPOT_INCREMENT_RATE = 0.02

const FEATURE_MIN_TRIGGER_BET = 100
const FEATURE_SPINS_AWARD = 8
const FEATURE_RETRIGGER_SCATTERS = 2
const FEATURE_RETRIGGER_SPINS = 2
const FEATURE_START_MULT = 2
const FEATURE_MAX_MULT = 5

const PAYTABLE = {
  '🍒': { 2: 1.2, 3: 4 },
  '🍋': { 2: 1.2, 3: 4 },
  '🍊': { 2: 1.4, 3: 5 },
  '🍉': { 2: 1.8, 3: 7 },
  '🔔': { 2: 2.2, 3: 10 },
  '⭐': { 2: 3.5, 3: 16 },
  '💎': { 2: 5, 3: 25 }
}

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
    '🍒': 14, '🍋': 14, '🍊': 12, '🍉': 9, '🔔': 7, '⭐': 5, '💎': 3, '🃏': 2, '🎟️': 2
  }),
  buildStrip({
    '🍒': 13, '🍋': 13, '🍊': 11, '🍉': 9, '🔔': 7, '⭐': 6, '💎': 4, '🃏': 2, '🎟️': 1
  }),
  buildStrip({
    '🍒': 14, '🍋': 14, '🍊': 11, '🍉': 8, '🔔': 7, '⭐': 5, '💎': 3, '🃏': 2, '🎟️': 1
  })
]

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE IF NOT EXISTS slot_v2_feature_sessions (
      userUUID  TEXT PRIMARY KEY,
      data      TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run()
} catch (e) {
  console.error('[SlotsV2] Failed ensuring tables:', e)
}

function formatBalance (balance) {
  const rounded = Math.round(Number(balance) || 0)
  return rounded > 999 ? rounded.toLocaleString() : rounded.toString()
}

function formatMoney (amount) {
  const n = Number(amount) || 0
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function wrapLine (line, max = 44) {
  const text = String(line ?? '')
  if (!text) return ['']
  if (text.length <= max) return [text]

  const out = []
  let cur = ''
  for (const word of text.split(' ')) {
    if (!cur) {
      cur = word
      continue
    }
    if ((cur.length + 1 + word.length) <= max) {
      cur += ` ${word}`
    } else {
      out.push(cur)
      cur = word
    }
  }
  if (cur) out.push(cur)
  return out
}

function joinForChat (lines) {
  const out = []
  for (const line of lines) {
    const parts = String(line ?? '').split('\n')
    for (const p of parts) out.push(...wrapLine(p))
  }
  return out.join('\n')
}

function randInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function readSetting (key) {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
    return row?.value ?? null
  } catch (e) {
    console.error('[SlotsV2] readSetting error:', e)
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
    console.error('[SlotsV2] writeSetting error:', e)
  }
}

function getJackpotValue () {
  const raw = Number(readSetting('slots_v2_progressive_jackpot'))
  if (Number.isFinite(raw) && raw > 0) return raw
  writeSetting('slots_v2_progressive_jackpot', JACKPOT_SEED)
  return JACKPOT_SEED
}

function setJackpotValue (newValue) {
  writeSetting('slots_v2_progressive_jackpot', Math.max(JACKPOT_SEED, Number(newValue) || JACKPOT_SEED))
}

function getFeatureSession (userUUID) {
  try {
    const row = db.prepare('SELECT data FROM slot_v2_feature_sessions WHERE userUUID = ?').get(userUUID)
    if (!row?.data) return null
    return JSON.parse(row.data)
  } catch (e) {
    console.error('[SlotsV2] getFeatureSession error:', e)
    return null
  }
}

function saveFeatureSession (userUUID, session) {
  try {
    const now = new Date().toISOString()
    db.prepare(`
      INSERT INTO slot_v2_feature_sessions(userUUID, data, updatedAt)
      VALUES(?, ?, ?)
      ON CONFLICT(userUUID) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt
    `).run(userUUID, JSON.stringify(session), now)
  } catch (e) {
    console.error('[SlotsV2] saveFeatureSession error:', e)
  }
}

function clearFeatureSession (userUUID) {
  try {
    db.prepare('DELETE FROM slot_v2_feature_sessions WHERE userUUID = ?').run(userUUID)
  } catch (e) {
    console.error('[SlotsV2] clearFeatureSession error:', e)
  }
}

function spinReels () {
  const symbols = []
  const stops = []

  for (const strip of REEL_STRIPS) {
    const stop = randInt(0, strip.length - 1)
    stops.push(stop)
    symbols.push(strip[stop])
  }

  return { symbols, stops }
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
    return { multiplier: bestMult, kind: 'LINE', symbol: bestSym, count: bestCount }
  }
  return { multiplier: 0, kind: 'NONE' }
}

function evaluateBaseSpin (line, bet) {
  let win = 0
  const events = []

  const lineOutcome = scoreLineLeftToRight(line)
  if (lineOutcome.multiplier > 0) {
    const lineWin = bet * lineOutcome.multiplier
    win += lineWin
    events.push(`💥 LINE WIN ${lineOutcome.symbol} x${lineOutcome.count}: +$${formatMoney(lineWin)}`)
  }

  const scatters = line.filter(s => s === SCATTER).length
  if (scatters >= 2) {
    const scatterPay = bet * (scatters === 2 ? 1 : 3)
    win += scatterPay
    events.push(`🎟️ SCATTER PAY x${scatters}: +$${formatMoney(scatterPay)}`)
  }

  const jackpotHit = line[0] === HIGH_2 && line[1] === HIGH_2 && line[2] === HIGH_2

  return {
    win,
    events,
    scatters,
    jackpotHit,
    featureTrigger: scatters === 3 && bet >= FEATURE_MIN_TRIGGER_BET
  }
}

function renderSlot (a, b, c, prefix = '🎰 SLOTS V2') {
  return `${prefix}  ${a} ┃ ${b} ┃ ${c}`
}

async function maybePayJackpot (userUUID, jackpotHit) {
  if (!jackpotHit) return { paid: 0, newJackpot: getJackpotValue(), line: '' }

  const current = getJackpotValue()
  const paid = current
  const next = JACKPOT_SEED

  setJackpotValue(next)

  return {
    paid,
    newJackpot: next,
    line: `🏆 PROGRESSIVE JACKPOT HIT: +$${formatMoney(paid)}`
  }
}

async function spinFeatureOnce (userUUID) {
  const session = getFeatureSession(userUUID)
  if (!session) {
    return joinForChat([
      'No active FREE SPINS.',
      `Get 3 ${SCATTER} on bet >= $${formatBalance(FEATURE_MIN_TRIGGER_BET)}.`
    ])
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
  const { symbols } = spinReels()
  const result = evaluateBaseSpin(symbols, 1)

  // Feature win uses fixed base unit then multiplier (typical in many games).
  const rawFeatureWin = result.win
  let featureWin = rawFeatureWin * mult

  const retrigger = result.scatters >= FEATURE_RETRIGGER_SCATTERS
  if (retrigger) {
    spinsLeft += FEATURE_RETRIGGER_SPINS
    spinsTotal += FEATURE_RETRIGGER_SPINS
    mult = Math.min(FEATURE_MAX_MULT, mult + 1)
  }

  const jackpot = await maybePayJackpot(userUUID, result.jackpotHit)
  featureWin += jackpot.paid

  if (featureWin > 0) {
    totalWon += featureWin
    await creditGameWin(userUUID, featureWin)
  }

  spinsLeft -= 1

  const lines = []
  lines.push(renderSlot(symbols[0], symbols[1], symbols[2], `🎟️ FREE SPIN ${spinNumber}/${spinsTotal} (x${mult})`))
  if (result.events.length) lines.push(...result.events)
  if (retrigger) lines.push(`🔁 RETRIGGER: +${FEATURE_RETRIGGER_SPINS} spins, multiplier now x${mult}`)
  if (jackpot.line) lines.push(jackpot.line)
  if (featureWin <= 0) lines.push('— NO WIN —')

  if (spinsLeft > 0) {
    saveFeatureSession(userUUID, { spinsLeft, spinsTotal, totalWon, mult })
    lines.push(`👉 Type /slots free to spin again (${spinsLeft} left).`)
    return joinForChat(lines)
  }

  clearFeatureSession(userUUID)
  const balance = await getUserWallet(userUUID)
  lines.push(`💰 TOTAL FEATURE WINS: +$${formatMoney(totalWon)}`)
  lines.push(`🪙 BALANCE: $${formatBalance(balance)}`)
  return joinForChat(lines)
}

async function playSlotsV2 (userUUID, betSize = DEFAULT_BET) {
  const bet = Number(betSize) || 0

  const activeFeature = getFeatureSession(userUUID)
  if (activeFeature) {
    return joinForChat([
      '🎟️ FREE SPINS are active.',
      `👉 Type '/slots2 free' (${activeFeature.spinsLeft} left).`
    ])
  }

  if (bet < MIN_BET || bet > MAX_BET) {
    return joinForChat([
      `Bet must be $${formatBalance(MIN_BET)} to`,
      `$${formatBalance(MAX_BET)}.`
    ])
  }

  try {
    let balance = await getUserWallet(userUUID)
    if (bet > balance) {
      return joinForChat([
        'Invalid bet amount.',
        `Balance: $${formatBalance(balance)}.`
      ])
    }

    await debitGameBet(userUUID, bet)

    const beforeJackpot = getJackpotValue()
    const jackpotInc = bet * JACKPOT_INCREMENT_RATE
    setJackpotValue(beforeJackpot + jackpotInc)

    const { symbols } = spinReels()
    const result = evaluateBaseSpin(symbols, bet)

    const jackpot = await maybePayJackpot(userUUID, result.jackpotHit)
    const totalWin = result.win + jackpot.paid
    if (totalWin > 0) await creditGameWin(userUUID, totalWin)

    let featureMsg = ''
    if (result.featureTrigger) {
      saveFeatureSession(userUUID, {
        spinsLeft: FEATURE_SPINS_AWARD,
        spinsTotal: FEATURE_SPINS_AWARD,
        totalWon: 0,
        mult: FEATURE_START_MULT
      })

      featureMsg = [
        '',
        `🎁 BONUS FEATURE UNLOCKED: ${FEATURE_SPINS_AWARD} FREE SPINS`,
        `⚡ Starting multiplier: x${FEATURE_START_MULT}`,
        `👉 Type '/slots2 free' to start.`
      ].join('\n')
    }

    balance = await getUserWallet(userUUID)
    const newJackpot = jackpot.newJackpot

    return joinForChat([
      renderSlot(symbols[0], symbols[1], symbols[2]),
      result.events.length ? result.events.join('\n') : '— NO WIN —',
      jackpot.line,
      `🪙 BALANCE: $${formatBalance(balance)}`,
      featureMsg,
      `💰 JACKPOT: $${formatMoney(newJackpot)}  📈 +$${formatMoney(jackpotInc)}`
    ].filter(Boolean))
  } catch (err) {
    console.error('[SlotsV2] play error:', err)
    return 'An error occurred while playing slots.'
  }
}

async function handleSlotsV2Command (userUUID, arg) {
  const raw = arg == null ? '' : String(arg).trim().toLowerCase()

  if (raw === 'free') return spinFeatureOnce(userUUID)
  if (raw === 'jackpot' || raw === 'jp') {
    return joinForChat([`💰 V2 JACKPOT: $${formatMoney(getJackpotValue())}`])
  }
  if (raw === 'info' || raw === 'help') {
    return joinForChat([
      '🎰 SLOTS V2 RULES',
      `- Left-to-right line pays with ${WILD} wild substitutions`,
      `- ${SCATTER} scatters pay anywhere (2 or 3 symbols)`,
      `- 3 scatters on bet >= $${formatBalance(FEATURE_MIN_TRIGGER_BET)} = ${FEATURE_SPINS_AWARD} free spins`,
      `- Free spins start at x${FEATURE_START_MULT} and can retrigger`,
      `- 3 ${HIGH_2} symbols hit the progressive jackpot`,
      '- Commands: /slots2 <bet>',
      '- /slots2 free',
      '- /slots2 jackpot'
    ])
  }

  const bet = raw === '' ? DEFAULT_BET : Number(raw)
  if (!Number.isFinite(bet) || bet <= 0) return 'Please enter a valid bet amount.'
  return playSlotsV2(userUUID, bet)
}

// Export aliases so this file can be dropped in as a replacement with minimal wiring changes.
const playSlots = playSlotsV2
const handleSlotsCommand = handleSlotsV2Command

export {
  formatBalance,
  getJackpotValue,
  playSlotsV2,
  handleSlotsV2Command,
  playSlots,
  handleSlotsCommand
}
