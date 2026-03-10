// src/games/f1race/handlers/commands.js

import { postMessage } from '../../../libs/cometchat.js'
import { readdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getUserWallet, debitGameBet, addToUserWallet, creditGameWin, getProgressiveWealthFee } from '../../../database/dbwalletmanager.js'
import { getUserNickname } from '../../../utils/nickname.js'
import { fetchCurrentUsers } from '../../../utils/API.js'

import { createTeam, getTeamByOwner, updateTeamIdentity } from '../../../database/dbteams.js'
import { getCompactEquippedTitleTag } from '../../../database/dbprestige.js'
import {
  insertCar,
  getAllCars,
  getUserCars,
  setCarWear,
  setCarImageUrl,
  recordCarEntryFee,
  recordCarRepairSpend,
  getUserCarStatsSummary,
  getTopCarsByEarnings,
  getTopOwnersByCarReturn,
  renameCarOwnedByUser,
  deleteCarOwnedByUser
} from '../../../database/dbcars.js'

import { bus, safeCall } from '../service.js'
import { runRace } from '../simulation.js'
import { pickTrack, pickDragTrack } from '../utils/track.js'
import { renderGrid, renderRaceProgress, renderDragProgress, fmtMoney } from '../utils/render.js'

const ROOM = process.env.ROOM_UUID

// ── Economy tuning ─────────────────────────────────────────────────────
const ENTRY_MS = 30_000
const STRAT_MS = 45_000
const MIN_FIELD = 6
const DRAG_ENTRY_MS = 30_000
const DRAG_STRAT_MS = 20_000
const DRAG_FIELD_SIZE = 2
const DRAG_PAYOUT_SPLIT = [100]

const ENTRY_FEE_BY_TIER = {
  starter: Number(process.env.F1_ENTRY_FEE_STARTER ?? 1500),
  pro: Number(process.env.F1_ENTRY_FEE_PRO ?? 2100),
  hyper: Number(process.env.F1_ENTRY_FEE_HYPER ?? 3400),
  legendary: Number(process.env.F1_ENTRY_FEE_LEGENDARY ?? 7200)
}
const HOUSE_RAKE_PCT = Number(process.env.F1_HOUSE_RAKE_PCT ?? 10) // percent
const PRIZE_SPLIT_BY_MODE = {
  rookie: [60, 30, 10], // top 3 paid
  open: [45, 25, 15, 10, 5],
  elite: [50, 23, 13, 9, 5]
}
const GUARANTEED_PURSE_BY_MODE = {
  rookie: Number(process.env.F1_PURSE_FLOOR_ROOKIE ?? 5000),
  open: Number(process.env.F1_PURSE_FLOOR_OPEN ?? 12000),
  elite: Number(process.env.F1_PURSE_FLOOR_ELITE ?? 30000)
}
const DRAG_GUARANTEED_PURSE_BY_TIER = {
  starter: Number(process.env.F1_DRAG_PURSE_FLOOR_STARTER ?? 250),
  pro: Number(process.env.F1_DRAG_PURSE_FLOOR_PRO ?? 500),
  hyper: Number(process.env.F1_DRAG_PURSE_FLOOR_HYPER ?? 900),
  legendary: Number(process.env.F1_DRAG_PURSE_FLOOR_LEGENDARY ?? 1400)
}
const POLE_BONUS = Number(process.env.F1_POLE_BONUS ?? 250)
const FASTEST_LAP_BONUS = Number(process.env.F1_FASTEST_LAP_BONUS ?? 400)

const TEAM_CREATE_FEE = Number(process.env.F1_TEAM_CREATE_FEE ?? 12500)
const TEAM_REROLL_FEE = Number(process.env.F1_TEAM_REROLL_FEE ?? 6500)
const CAR_RENAME_FEE = Number(process.env.F1_CAR_RENAME_FEE ?? 6500)
const REPAIR_COST_PER_WEAR_BY_TIER = {
  starter: Number(process.env.F1_REPAIR_COST_PER_POINT_STARTER ?? 30),
  pro: Number(process.env.F1_REPAIR_COST_PER_POINT_PRO ?? 44),
  hyper: Number(process.env.F1_REPAIR_COST_PER_POINT_HYPER ?? 68),
  legendary: Number(process.env.F1_REPAIR_COST_PER_POINT_LEGENDARY ?? 95)
}
const GARAGE_UPKEEP_PER_EXTRA_CAR_BY_TIER = {
  starter: Number(process.env.F1_GARAGE_UPKEEP_PER_EXTRA_STARTER ?? 200),
  pro: Number(process.env.F1_GARAGE_UPKEEP_PER_EXTRA_PRO ?? 400),
  hyper: Number(process.env.F1_GARAGE_UPKEEP_PER_EXTRA_HYPER ?? 750),
  legendary: Number(process.env.F1_GARAGE_UPKEEP_PER_EXTRA_LEGENDARY ?? 1250)
}

// Betting
const BET_MIN = Number(process.env.F1_BET_MIN ?? 25)
const BET_MAX = Number(process.env.F1_BET_MAX ?? 10000)
const ODDS_EDGE_PCT = Number(process.env.F1_ODDS_EDGE_PCT ?? 15) // house edge in odds calc
const BET_MARKET_MULT_BY_TIER = {
  starter: Number(process.env.F1_BET_MARKET_MULT_STARTER ?? 1.00),
  pro: Number(process.env.F1_BET_MARKET_MULT_PRO ?? 1.03),
  hyper: Number(process.env.F1_BET_MARKET_MULT_HYPER ?? 1.12),
  legendary: Number(process.env.F1_BET_MARKET_MULT_LEGENDARY ?? 1.30)
}

// Car tiers: higher ceiling, not guaranteed wins.
const CAR_TIERS = {
  starter: { price: 30000, base: { power: 56, handling: 55, aero: 54, reliability: 57, tire: 55 }, livery: '🟥' },
  pro: { price: 90000, base: { power: 63, handling: 62, aero: 61, reliability: 64, tire: 62 }, livery: '🟦' },
  hyper: { price: 200000, base: { power: 70, handling: 69, aero: 68, reliability: 71, tire: 69 }, livery: '🟩' },
  legendary: { price: 400000, base: { power: 76, handling: 75, aero: 74, reliability: 77, tire: 75 }, livery: '🟪' }
}
const TIER_ORDER = ['starter', 'pro', 'hyper', 'legendary']
const TIER_PITCH = {
  starter: 'Great first car. Cheap entry and repair costs.',
  pro: 'Reliable all-rounder with stronger race pace.',
  hyper: 'High-end speed package for serious contenders.',
  legendary: 'Top-tier machine built to fight for wins.'
}
const RACE_MODES = {
  rookie: { label: 'ROOKIE', allowedTiers: new Set(['starter', 'pro']), payoutPlan: PRIZE_SPLIT_BY_MODE.rookie },
  open: { label: 'OPEN', allowedTiers: new Set(['starter', 'pro', 'hyper', 'legendary']), payoutPlan: PRIZE_SPLIT_BY_MODE.open },
  elite: { label: 'ELITE', allowedTiers: new Set(['hyper', 'legendary']), payoutPlan: PRIZE_SPLIT_BY_MODE.elite }
}
const TIER_PAYOUT_MULT = { starter: 1.00, pro: 1.08, hyper: 1.22, legendary: 1.40 }
const ELITE_MODE_STAT_DELTA_BY_TIER = {
  hyper: Number(process.env.F1_ELITE_STAT_DELTA_HYPER ?? 1),
  legendary: Number(process.env.F1_ELITE_STAT_DELTA_LEGENDARY ?? -2)
}

// ── Visuals: car images (local tier folders) ───────────────────────────────
// Place your images in:
// src/games/f1race/assets/cars/starter
// src/games/f1race/assets/cars/pro
// src/games/f1race/assets/cars/hyper
// src/games/f1race/assets/cars/legendary
//
// Then expose that folder through a public base URL (raw GitHub, CDN, etc.)
// so chat clients can load the image. By default we point to this repo's raw URL.
const CAR_IMAGE_BASE_URL = (process.env.F1_CAR_IMAGE_BASE_URL ||
  'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/cars').replace(/\/$/, '')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CAR_ASSETS_DIR = path.resolve(__dirname, '../assets/cars')
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const carTierFilesCache = new Map()

function readTierImageFiles (tier) {
  const dir = path.join(CAR_ASSETS_DIR, tier)
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => ALLOWED_IMAGE_EXT.has(path.extname(name).toLowerCase()))
}

function primeCarImageCache () {
  try {
    const tiers = readdirSync(CAR_ASSETS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name.toLowerCase())

    for (const tier of tiers) {
      carTierFilesCache.set(tier, readTierImageFiles(tier))
    }
  } catch {
    carTierFilesCache.clear()
  }
}

primeCarImageCache()

function listTierImageFiles (tierKey) {
  const tier = String(tierKey || '').toLowerCase()
  if (!tier) return []

  if (carTierFilesCache.has(tier)) {
    return carTierFilesCache.get(tier)
  }

  try {
    const files = readTierImageFiles(tier)
    carTierFilesCache.set(tier, files)
    return files
  } catch {
    carTierFilesCache.set(tier, [])
    return []
  }
}

function buildCarImageUrl (tierKey, fileName) {
  const tier = String(tierKey || '').toLowerCase()
  const file = String(fileName || '').trim()
  if (!tier || !file) return null
  return `${CAR_IMAGE_BASE_URL}/${tier}/${encodeURIComponent(file)}`
}

function pickCarImageUrl (tierKey) {
  const tier = String(tierKey || '').toLowerCase()
  const files = listTierImageFiles(tier)
  if (!files.length) return null

  const picked = files[Math.floor(Math.random() * files.length)]
  return buildCarImageUrl(tier, picked)
}

async function ensurePersistentCarImages (cars = []) {
  if (!Array.isArray(cars) || !cars.length) return cars

  for (const car of cars) {
    if (!car || car.imageUrl) continue

    const tierKey = String(car.tier || '').toLowerCase()
    if (!tierKey || tierKey === 'bot') continue

    const imageUrl = pickCarImageUrl(tierKey)
    if (!imageUrl) continue

    car.imageUrl = imageUrl

    if (car.id != null) {
      await safeCall(setCarImageUrl, [car.id, imageUrl]).catch(() => null)
    }
  }

  return cars
}

const DELAY = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function sendLightsOutSequence (room) {
  await postMessage({ room, message: '🚥 Cars lining up on the grid...' })
  await DELAY(1200)

  await postMessage({ room, message: 'Engines revving...' })
  await DELAY(1500)

  // Realistic F1-style red light build
  await postMessage({ room, message: '🔴' })
  await DELAY(1000)

  await postMessage({ room, message: '🔴 🔴' })
  await DELAY(900)

  await postMessage({ room, message: '🔴 🔴 🔴' })
  await DELAY(800)

  await postMessage({ room, message: '🔴 🔴 🔴 🔴' })
  await DELAY(700)

  await postMessage({ room, message: '🔴 🔴 🔴 🔴 🔴' })
  await DELAY(1200)

  // Slight random delay for realism
  await DELAY(400 + Math.random() * 900)

  await postMessage({ room, message: '🟢 LIGHTS OUT!!! 🏁' })
  await DELAY(600)
}

// ── Helpers ────────────────────────────────────────────────────────────
function rint (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function clamp (n, a, b) { return Math.max(a, Math.min(b, n)) }
function clamp01 (x) { return Math.max(0, Math.min(1, x)) }

function stat01 (v) {
  const n = Number(v || 0)
  return clamp01(n / 100)
}

function carLabel (car) {
  const liv = String(car.livery || '').trim() || '⬛'
  return `${liv} ${car.name}`.trim()
}

function teamLabel (team) {
  if (!team) return '—'
  const badge = String(team.badge || '').trim()
  const nm = String(team.name || '').trim()
  const short = nm.length > 10 ? nm.slice(0, 9) + '…' : nm
  return (badge ? `${badge} ${short}` : short).trim()
}

function compactLeaderboardName (name, uuid, maxLen = 14) {
  const raw = String(name || '').trim()
  if (!raw || /^<@uid:[^>]+>$/.test(raw)) return `user-${String(uuid || '').slice(0, 6)}`
  const clean = raw.replace(/^@/, '').trim()
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}.`
}

function normalizeTierKey (tierKey) {
  const tier = String(tierKey || '').toLowerCase()
  return Object.prototype.hasOwnProperty.call(ENTRY_FEE_BY_TIER, tier) ? tier : 'starter'
}

function normalizeRaceMode (mode) {
  const key = String(mode || 'open').toLowerCase()
  return Object.prototype.hasOwnProperty.call(RACE_MODES, key) ? key : null
}

function raceModeSummary (modeKey) {
  const mode = RACE_MODES[modeKey] || RACE_MODES.open
  const tiers = [...mode.allowedTiers].map(t => t.toUpperCase()).join(', ')
  const split = (mode.payoutPlan || []).join('/')
  return `${mode.label} · Tiers: ${tiers} · Split: ${split}`
}

function getTierEntryFee (tierKey) {
  const normalized = normalizeTierKey(tierKey)
  const raw = Number(ENTRY_FEE_BY_TIER[normalized] ?? ENTRY_FEE_BY_TIER.starter)
  return Math.max(0, Math.floor(raw))
}

function getTierRepairCostPerPoint (tierKey) {
  const normalized = normalizeTierKey(tierKey)
  const raw = Number(REPAIR_COST_PER_WEAR_BY_TIER[normalized] ?? REPAIR_COST_PER_WEAR_BY_TIER.starter)
  return Math.max(0, Math.floor(raw))
}

function getGarageUpkeepPerExtraCar (tierKey) {
  const normalized = normalizeTierKey(tierKey)
  const raw = Number(GARAGE_UPKEEP_PER_EXTRA_CAR_BY_TIER[normalized] ?? GARAGE_UPKEEP_PER_EXTRA_CAR_BY_TIER.starter)
  return Math.max(0, Math.floor(raw))
}

async function chargeF1Cost (userId, amount, category, note, balance = null) {
  const currentBalance = typeof balance === 'number'
    ? balance
    : await safeCall(getUserWallet, [userId]).catch(() => null)
  const wealthFee = getProgressiveWealthFee({ balance: currentBalance, baseAmount: amount, source: 'f1' })

  if (typeof currentBalance !== 'number' || currentBalance < wealthFee.total) {
    return { ok: false, balance: currentBalance, wealthFee }
  }

  const baseOk = await safeCall(debitGameBet, [userId, amount, {
    source: 'f1',
    category,
    note
  }]).catch(() => false)
  if (!baseOk) return { ok: false, balance: currentBalance, wealthFee }

  if (wealthFee.fee > 0) {
    const feeOk = await safeCall(debitGameBet, [userId, wealthFee.fee, {
      source: 'f1',
      category: 'wealth_fee',
      note: `${wealthFee.bandLabel} wealth fee on ${category}`
    }]).catch(() => false)
    if (!feeOk) return { ok: false, balance: currentBalance, wealthFee }
  }

  return { ok: true, balance: currentBalance, wealthFee }
}

function getTierPayoutMultiplier (tierKey) {
  const normalized = normalizeTierKey(tierKey)
  return Number(TIER_PAYOUT_MULT[normalized] ?? 1)
}

function getBetMarketMultiplier (tierKey) {
  const normalized = normalizeTierKey(tierKey)
  const raw = Number(BET_MARKET_MULT_BY_TIER[normalized] ?? BET_MARKET_MULT_BY_TIER.starter)
  return Math.max(0.9, Math.min(1.5, raw))
}

function applyRaceModeBalanceToCar (car, modeKey) {
  if (!car || modeKey !== 'elite') return car

  const tierKey = normalizeTierKey(car?.tier)
  const statDelta = Number(ELITE_MODE_STAT_DELTA_BY_TIER[tierKey] ?? 0)
  if (!Number.isFinite(statDelta) || statDelta === 0) return car

  const tune = (v) => clamp(Math.round(Number(v || 0) + statDelta), 35, 95)
  return {
    ...car,
    power: tune(car.power),
    handling: tune(car.handling),
    aero: tune(car.aero),
    reliability: tune(car.reliability),
    tire: tune(car.tire)
  }
}

function getModeGuaranteedPurse (modeKey) {
  const key = String(modeKey || 'open').toLowerCase()
  const raw = Number(GUARANTEED_PURSE_BY_MODE[key] ?? GUARANTEED_PURSE_BY_MODE.open)
  return Math.max(0, Math.floor(raw))
}

function getDragGuaranteedPurse (tierKey) {
  const key = normalizeTierKey(tierKey)
  const raw = Number(DRAG_GUARANTEED_PURSE_BY_TIER[key] ?? DRAG_GUARANTEED_PURSE_BY_TIER.starter)
  return Math.max(0, Math.floor(raw))
}

function estimateFullRepairCost (car) {
  const tierKey = normalizeTierKey(car?.tier)
  const wearToRemove = Math.max(0, Math.floor(Number(car?.wear || 0)))
  return wearToRemove * getTierRepairCostPerPoint(tierKey)
}

function prizePoolFromGrossFees (grossFees, modeKey = 'open') {
  const gross = Math.max(0, Math.floor(Number(grossFees || 0)))
  const rake = Math.floor(gross * (HOUSE_RAKE_PCT / 100))
  const fromFees = Math.max(0, gross - rake)
  const guaranteed = getModeGuaranteedPurse(modeKey)
  const net = fromFees + guaranteed
  return { gross, rake, fromFees, guaranteed, net }
}

function parseArg (txt, re) {
  return (String(txt || '').match(re) || [])[1]
}

function buildBuyCarShopCard (balance) {
  const bal = Number(balance || 0)

  const lines = []
  lines.push('F1 GARAGE')
  lines.push('')
  lines.push(`Wallet: ${fmtMoney(bal)}`)
  lines.push('')
  lines.push('Choose your tier:')
  lines.push('')

  for (const key of TIER_ORDER) {
    const tier = CAR_TIERS[key]
    const entry = getTierEntryFee(key)
    const repair = getTierRepairCostPerPoint(key)
    const value = estimateTierValueMetrics(key)

    lines.push(`${tier.livery} ${key.toUpperCase()} — ${fmtMoney(tier.price)}`)
    lines.push(`${TIER_PITCH[key]}`)
    lines.push(`Race costs: entry ${fmtMoney(entry)} · repair ${fmtMoney(repair)}/1% wear`)
    lines.push(`Projected return/race (OPEN): ${fmtMoney(value.expectedNetPerRace)}`)
    lines.push(`Approx break-even (OPEN): ${value.breakEvenLabel}`)
    lines.push('')
  }

  lines.push('Browse a tier: /buycar <starter|pro|hyper|legendary>')
  lines.push('Buy exact image: /buycar <tier> <option#>')
  lines.push('Example: /buycar starter 2')

  return lines.join('\n')
}

function toInt (n) {
  return Math.floor(Number(n || 0))
}

function carCareerNet (car) {
  const earnings = toInt(car?.careerEarnings)
  const entry = toInt(car?.entryFeesPaid)
  const repair = toInt(car?.repairSpend)
  const buyin = toInt(car?.price)
  return earnings - entry - repair - buyin
}

function tierBaseStrength (tierKey) {
  const tier = CAR_TIERS[tierKey]
  if (!tier?.base) return 0
  const b = tier.base
  const weighted =
    (Number(b.power || 0) * 0.24) +
    (Number(b.handling || 0) * 0.24) +
    (Number(b.aero || 0) * 0.20) +
    (Number(b.reliability || 0) * 0.20) +
    (Number(b.tire || 0) * 0.12)
  return Math.max(1, weighted)
}

function estimateTierValueMetrics (tierKey) {
  const key = normalizeTierKey(tierKey)
  const entry = getTierEntryFee(key)
  const repairPerPoint = getTierRepairCostPerPoint(key)
  const wearMultByTier = {
    starter: 1.00,
    pro: 0.94,
    hyper: 0.82,
    legendary: 0.70
  }

  const strengths = TIER_ORDER.map((t) => tierBaseStrength(t))
  const adjusted = TIER_ORDER.map((t, i) => strengths[i] * getTierPayoutMultiplier(t))
  const idx = TIER_ORDER.indexOf(key)
  const myStrength = Math.max(1, adjusted[idx] || adjusted[0] || 1)
  const totalStrength = Math.max(1, adjusted.reduce((sum, n) => sum + n, 0))

  // OPEN-mode baseline for shop guidance.
  const avgEntry = Math.floor(TIER_ORDER.reduce((sum, t) => sum + getTierEntryFee(t), 0) / Math.max(1, TIER_ORDER.length))
  const fieldSize = Math.max(6, MIN_FIELD)
  const feePool = Math.floor(avgEntry * fieldSize * (1 - (HOUSE_RAKE_PCT / 100)))
  const pool = feePool + getModeGuaranteedPurse('open')
  const payoutWeights = PRIZE_SPLIT_BY_MODE.open
  const payoutMass = payoutWeights.reduce((sum, w) => sum + Number(w || 0), 0) / 100

  const share = myStrength / totalStrength
  const expectedPrize = Math.floor(pool * payoutMass * share)
  const expectedPole = Math.floor(POLE_BONUS * share)
  const expectedFastLap = Math.floor(FASTEST_LAP_BONUS * share * 1.08)
  const expectedGross = expectedPrize + expectedPole + expectedFastLap

  const expectedWear = Math.max(1, Math.round(5 * (wearMultByTier[key] ?? 1)))
  const expectedRepair = expectedWear * repairPerPoint
  const expectedNetPerRace = expectedGross - entry - expectedRepair

  const buyIn = Number(CAR_TIERS[key]?.price || 0)
  let breakEvenLabel = 'unlikely at average results'
  if (expectedNetPerRace > 0) {
    const races = Math.ceil(buyIn / expectedNetPerRace)
    breakEvenLabel = `~${races} races`
  }

  return { expectedNetPerRace, breakEvenLabel }
}

function estimateResaleValue (car) {
  const price = Math.max(0, toInt(car?.price))
  const tier = String(car?.tier || 'starter').toLowerCase()
  const wear = Math.max(0, Math.min(100, toInt(car?.wear)))
  const wins = Math.max(0, toInt(car?.wins))
  const podiums = Math.max(0, toInt(car?.podiums))
  const earnings = Math.max(0, toInt(car?.careerEarnings))

  const basePctByTier = {
    starter: 0.64,
    pro: 0.58,
    hyper: 0.52,
    legendary: 0.46
  }
  const basePct = basePctByTier[tier] ?? 0.62
  const baseValue = price * basePct

  const wearFloorByTier = {
    starter: 0.35,
    pro: 0.32,
    hyper: 0.28,
    legendary: 0.24
  }
  const wearFactor = Math.max(wearFloorByTier[tier] ?? 0.24, 1 - (wear * 0.0068))

  const perfMultByTier = {
    starter: 0.85,
    pro: 0.92,
    hyper: 1.00,
    legendary: 1.06
  }
  const perfMult = perfMultByTier[tier] ?? 1
  const perfBonusRaw = ((wins * 600) + (podiums * 240) + (earnings * 0.02)) * perfMult
  const perfBonus = Math.min(price * 0.12, perfBonusRaw)

  const raw = Math.floor(baseValue * wearFactor + perfBonus)
  const minFloorByTier = {
    starter: 0.22,
    pro: 0.20,
    hyper: 0.18,
    legendary: 0.15
  }
  const maxCapByTier = {
    starter: 0.72,
    pro: 0.68,
    hyper: 0.62,
    legendary: 0.58
  }
  const minFloor = Math.floor(price * (minFloorByTier[tier] ?? 0.15))
  const maxCap = Math.floor(price * (maxCapByTier[tier] ?? 0.58))
  return Math.max(minFloor, Math.min(maxCap, raw))
}

// Odds calculator (decimal odds)
function computeStrength (car, track) {
  const w = track.weights
  const power = stat01(car.power)
  const handling = stat01(car.handling)
  const aero = stat01(car.aero)
  const reliability = stat01(car.reliability)
  const tire = stat01(car.tire)

  let base =
    w.power * power +
    w.handling * handling +
    w.aero * aero +
    w.tire * tire +
    w.reliability * reliability

  // wear penalty
  const wear = Math.max(0, Math.min(100, Number(car.wear || 0)))
  base *= (1 - (wear / 100) * 0.08) // up to -8%

  return Math.max(0.001, base)
}

function oddsFromStrengths (strengths, cars = []) {
  let marketStrengths = strengths.map((s, i) => {
    const tierKey = normalizeTierKey(cars?.[i]?.tier)
    return Math.max(0.0001, Number(s || 0) * getBetMarketMultiplier(tierKey))
  })

  // In ELITE mode, slightly compress strengths toward the mean so odds board
  // stays tighter and reflects a more competitive top-tier field.
  if (lockedRaceMode === 'elite' && marketStrengths.length > 1) {
    const avg = marketStrengths.reduce((a, b) => a + b, 0) / marketStrengths.length
    const compress = 0.18
    marketStrengths = marketStrengths.map((s) => (s * (1 - compress)) + (avg * compress))
  }

  if (lockedRaceType === 'drag' && marketStrengths.length === 2) {
    const avg = (marketStrengths[0] + marketStrengths[1]) / 2
    const gapRatio = Math.abs(marketStrengths[0] - marketStrengths[1]) / Math.max(1e-9, avg)
    const compress = clamp(0.50 - (gapRatio * 1.10), 0.18, 0.50)
    marketStrengths = marketStrengths.map((s) => (s * (1 - compress)) + (avg * compress))
  }

  const sum = marketStrengths.reduce((a, b) => a + b, 0)
  const edge = clamp(Number(ODDS_EDGE_PCT || 15) / 100, 0, 0.35)

  return marketStrengths.map(s => {
    const p = s / Math.max(1e-9, sum)
    const decRaw = (1 / Math.max(0.0005, p)) * (1 - edge)
    const clamped = clamp(decRaw, 1.01, 15.0)
    return Number(clamped.toFixed(2))
  })
}

function sanityCheckOddsModel () {
  const p = 0.90
  const edge = 0.15
  const dec = clamp((1 / p) * (1 - edge), 1.01, 15.0)
  if (dec < 1.0 || dec > 1.1) {
    console.warn(`[f1race] odds sanity check failed: p=0.90 edge=0.15 => dec=${dec.toFixed(3)} (expected ~1.0-1.1)`)
  }
}

sanityCheckOddsModel()

function formatOdds (dec) {
  if (!Number.isFinite(dec)) return '—'
  return dec.toFixed(2)
}

// ── Team generation ────────────────────────────────────────────────────
function generateTeamIdentity () {
  const BADGES = ['🟥', '🟦', '🟩', '🟨', '🟪', '⬛', '⬜', '🟧', '🟫', '🔺', '🔷', '⭐']
  const COLORS = ['Crimson', 'Cobalt', 'Emerald', 'Golden', 'Violet', 'Onyx', 'Ivory', 'Tangerine', 'Azure', 'Scarlet', 'Sapphire', 'Teal', 'Graphite', 'Carbon', 'Amber', 'Ruby']
  const ANIMALS = ['Falcons', 'Vipers', 'Wolves', 'Ravens', 'Cobras', 'Sharks', 'Panthers', 'Dragons', 'Lynx', 'Scorpions', 'Stallions', 'Phoenix', 'Rockets', 'Titans', 'Eagles', 'Pythons']
  const TECH = ['Apex', 'Turbo', 'Quantum', 'Neon', 'Vortex', 'Pulse', 'Nova', 'Titan', 'Velocity', 'Vector', 'Ignition', 'Fusion', 'Monolith', 'Nitro', 'Tempest', 'Summit']
  const NOUNS = ['Racing', 'Motorsport', 'GP', 'Works', 'Engineering', 'Dynamics', 'Performance', 'Autosport', 'Speedworks', 'Motors', 'Racing Club', 'Competition', 'Powertrain', 'Factory', 'Race Team', 'Motorsport Lab']
  const CITIES = ['Monaco', 'Silverstone', 'Daytona', 'Suzuka', 'Imola', 'Austin', 'Spa', 'Monza', 'Barcelona', 'Singapore', 'Melbourne', 'Baku', 'Doha', 'Abu Dhabi', 'Interlagos', 'Jeddah']

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
  const formats = [
    () => `${pick(TECH)} ${pick(ANIMALS)}`,
    () => `${pick(COLORS)} ${pick(NOUNS)}`,
    () => `${pick(CITIES)} ${pick(ANIMALS)}`,
    () => `${pick(TECH)} ${pick(NOUNS)}`,
    () => `${pick(COLORS)} ${pick(ANIMALS)} ${pick(NOUNS)}`,
    () => `${pick(CITIES)} ${pick(NOUNS)}`
  ]

  const badge = pick(BADGES)
  const name = formats[Math.floor(Math.random() * formats.length)]()
  return { name, badge }
}

// ── Race state ─────────────────────────────────────────────────────────
let isAccepting = false
let isStratOpen = false
let isRunning = false
let isBettingOpen = false

const entered = new Set() // carId
let eligibleByName = new Map() // nameLower -> car
let field = [] // cars in race (with label, teamLabel)
let lockedOddsDec = [] // index-aligned to field
let bets = {} // userId -> [{carIndex, amount}]

let _lastProgress = null

let lockedTrack = null
let lockedEntryGross = 0
let lockedRaceMode = 'open'
let lockedRaceType = 'gp'
let lockedPayoutPlan = PRIZE_SPLIT_BY_MODE.open
let lockedDragTier = null
let entryTimer = null

export function isWaitingForEntries () { return isAccepting === true }

// ── Team command ───────────────────────────────────────────────────────
export async function handleTeamCommand (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const sub = (text.match(/^\/team\s*(.*)$/i) || [])[1]?.trim().toLowerCase() || ''
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  const existing = await safeCall(getTeamByOwner, [userId]).catch(() => null)

  if (!sub || sub.startsWith('create')) {
    if (existing) {
      await postMessage({ room, message: `🏎️ ${nick}, your team is **${existing.name}** ${existing.badge || ''}`.trim() })
      await postMessage({ room, message: `Tip: **/team reroll** (costs ${fmtMoney(TEAM_REROLL_FEE)})` })
      return
    }

    const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
    const createCost = getProgressiveWealthFee({ balance: bal, baseAmount: TEAM_CREATE_FEE, source: 'f1' })
    if (typeof bal === 'number' && bal < createCost.total) {
      await postMessage({ room, message: `❗ ${nick}, creating a team costs **${fmtMoney(createCost.total)}**${createCost.fee > 0 ? ` (${fmtMoney(TEAM_CREATE_FEE)} + ${fmtMoney(createCost.fee)} wealth fee)` : ''}. Balance: **${fmtMoney(bal)}**.` })
      return
    }
    if (TEAM_CREATE_FEE > 0) {
      const charged = await chargeF1Cost(userId, TEAM_CREATE_FEE, 'team_create', 'Create team', bal)
      if (!charged.ok) {
        await postMessage({ room, message: `⚠️ ${nick}, couldn't process team creation payment.` })
        return
      }
    }

    const { name, badge } = generateTeamIdentity()
    createTeam({ ownerId: userId, ownerName: nick, name, badge })
    await postMessage({ room, message: `🏁 ${nick} founded a new team: **${name}** ${badge}\nGarage Level: **1**${createCost.fee > 0 ? `\n💼 Wealth fee: **${fmtMoney(createCost.fee)}**` : ''}` })
    return
  }

  if (sub.startsWith('reroll')) {
    if (!existing) {
      await postMessage({ room, message: `❗ ${nick}, you don’t have a team yet. Use **/team create**.` })
      return
    }
    const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
    const rerollCost = getProgressiveWealthFee({ balance: bal, baseAmount: TEAM_REROLL_FEE, source: 'f1' })
    if (typeof bal === 'number' && bal < rerollCost.total) {
      await postMessage({ room, message: `❗ ${nick}, reroll costs **${fmtMoney(rerollCost.total)}**${rerollCost.fee > 0 ? ` (${fmtMoney(TEAM_REROLL_FEE)} + ${fmtMoney(rerollCost.fee)} wealth fee)` : ''}. Balance: **${fmtMoney(bal)}**.` })
      return
    }
    if (TEAM_REROLL_FEE > 0) {
      const charged = await chargeF1Cost(userId, TEAM_REROLL_FEE, 'team_reroll', 'Reroll team identity', bal)
      if (!charged.ok) {
        await postMessage({ room, message: `⚠️ ${nick}, couldn't process reroll payment.` })
        return
      }
    }

    const { name, badge } = generateTeamIdentity()
    await safeCall(updateTeamIdentity, [userId, name, badge])
    await postMessage({ room, message: `🎲 ${nick} rebranded to **${name}** ${badge}${rerollCost.fee > 0 ? `\n💼 Wealth fee: **${fmtMoney(rerollCost.fee)}**` : ''}` })
    return
  }

  if (!existing) {
    await postMessage({ room, message: `No team found. Create one with **/team create** (costs ${fmtMoney(TEAM_CREATE_FEE)})` })
    return
  }

  await postMessage({ room, message: `🏎️ Team: **${existing.name}** ${existing.badge || ''} · Garage Level: **${existing.garageLevel}**`.trim() })
}

// ── Car commands ───────────────────────────────────────────────────────
function generateCarName (usedLower) {
  const ADJ = [
    'Neon', 'Apex', 'Turbo', 'Crimson', 'Midnight', 'Solar', 'Phantom', 'Vortex', 'Cobalt', 'Titan',
    'Quantum', 'Iron', 'Velvet', 'Rapid', 'Savage', 'Atomic', 'Inferno', 'Glacial', 'Royal', 'Stealth',
    'Ivory', 'Chrome', 'Scarlet', 'Azure', 'Obsidian', 'Golden', 'Electric', 'Hyper', 'Final', 'Prime'
  ]
  const NOUN = [
    'Viper', 'Wraith', 'Comet', 'Falcon', 'Raven', 'Blitz', 'Mirage', 'Arrow', 'Specter', 'Nova',
    'Eclipse', 'Rocket', 'Cyclone', 'Tempest', 'Raptor', 'Helix', 'Vector', 'Pulse', 'Meteor', 'Axiom',
    'Striker', 'Phantom', 'Horizon', 'Thunder', 'Drift', 'Astra', 'Blade', 'Fury', 'Pioneer', 'Vertex'
  ]
  for (let i = 0; i < 80; i++) {
    const name = `${ADJ[rint(0, ADJ.length - 1)]} ${NOUN[rint(0, NOUN.length - 1)]}`
    if (!usedLower.has(name.toLowerCase())) return name
  }
  return `Apex Viper ${rint(100, 999)}`
}

export async function handleBuyCar (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const argsRaw = (text.match(/^\/(?:buycar|buy\s+car)(?:\s+(.+))?$/i) || [])[1] || ''
  const parts = argsRaw.trim().split(/\s+/).filter(Boolean)
  const tierArg = parts[0]?.toLowerCase()
  const pickArg = parts[1]
  const tierAliases = { 1: 'starter', 2: 'pro', 3: 'hyper', 4: 'legendary' }
  const tierKey = tierAliases[tierArg] || tierArg
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')
  const bal = await safeCall(getUserWallet, [userId]).catch(() => null)

  if (!tierKey || tierKey === 'help' || tierKey === 'shop' || tierKey === 'list') {
    await postMessage({ room, message: '```\n' + buildBuyCarShopCard(bal) + '\n```' })
    return
  }

  const tier = CAR_TIERS[tierKey]
  if (!tier) {
    await postMessage({
      room,
      message:
        `❗ Unknown tier \`${tierKey}\`.\n` +
        'Use: `/buycar starter`, `/buycar pro`, `/buycar hyper`, `/buycar legendary`\n' +
        'or open the shop with `/buycar`.'
    })
    return
  }

  const tierImageFiles = listTierImageFiles(tierKey).sort((a, b) => a.localeCompare(b))
  if (!pickArg || /^(help|list|show|shop)$/i.test(pickArg)) {
    const lines = []
    lines.push(`${tier.livery} ${tierKey.toUpperCase()} SHOWROOM`)
    lines.push(`Price: ${fmtMoney(tier.price)}`)
    lines.push('')

    if (!tierImageFiles.length) {
      lines.push('No image options are available in this tier yet.')
      lines.push(`You can still buy one with: /buycar ${tierKey} 1`)
      await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
      return
    }

    lines.push('Choose an option number:')
    lines.push('')
    lines.push('Options are shown in image posts below.')
    lines.push('')
    lines.push(`Buy with: /buycar ${tierKey} <option#>`)
    lines.push(`Example: /buycar ${tierKey} 1`)
    await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })

    for (let i = 0; i < Math.min(10, tierImageFiles.length); i++) {
      const file = tierImageFiles[i]
      const url = buildCarImageUrl(tierKey, file)
      if (!url) continue
      await postMessage({
        room,
        message: `Option #${i + 1} — ${tierKey.toUpperCase()}`,
        images: [url]
      })
    }
    if (tierImageFiles.length > 10) {
      await postMessage({ room, message: `…and ${tierImageFiles.length - 10} more options. Use /buycar ${tierKey} <option#>.` })
    }
    return
  }

  const selectedOption = Number.parseInt(String(pickArg), 10)
  if (!Number.isFinite(selectedOption) || selectedOption < 1) {
    await postMessage({
      room,
      message: `❗ ${nick}, choose a valid option number. Browse options with \`/buycar ${tierKey}\`.`
    })
    return
  }
  if (tierImageFiles.length && selectedOption > tierImageFiles.length) {
    await postMessage({
      room,
      message: `❗ ${nick}, option #${selectedOption} doesn't exist for ${tierKey.toUpperCase()}. Use \`/buycar ${tierKey}\` to view options.`
    })
    return
  }

  const team = await safeCall(getTeamByOwner, [userId]).catch(() => null)
  if (!team) {
    await postMessage({
      room,
      message: `❗ ${nick}, you need a garage before buying cars. Use **/team create** first (costs ${fmtMoney(TEAM_CREATE_FEE)}).`
    })
    return
  }

  if (typeof bal !== 'number') {
    await postMessage({ room, message: `⚠️ ${nick}, couldn’t read your wallet. Try again.` })
    return
  }
  const buyCost = getProgressiveWealthFee({ balance: bal, baseAmount: tier.price, source: 'f1' })
  if (bal < buyCost.total) {
    const shortBy = buyCost.total - bal
    await postMessage({
      room,
      message:
        `❗ ${nick}, you need **${fmtMoney(buyCost.total)}** for **${tierKey.toUpperCase()}**${buyCost.fee > 0 ? ` (${fmtMoney(tier.price)} + ${fmtMoney(buyCost.fee)} wealth fee)` : ''}.\n` +
        `Balance: **${fmtMoney(bal)}** · Short by: **${fmtMoney(shortBy)}**.\n` +
        'Run `/buycar` to view all tiers.'
    })
    return
  }

  const chargedBuy = await chargeF1Cost(userId, tier.price, 'asset_buy', `Bought ${tierKey} car`, bal)
  if (!chargedBuy.ok) {
    await postMessage({ room, message: `⚠️ ${nick}, couldn't process car purchase payment.` })
    return
  }

  const all = await safeCall(getAllCars).catch(() => [])
  const used = new Set((all || []).map(c => String(c.name || '').toLowerCase()))
  const name = generateCarName(used)

  const jitter = (x) => clamp(x + rint(-3, 3), 35, 92)

  // ✅ persistent car imageUrl (user-selected when available)
  const selectedFile = tierImageFiles.length ? tierImageFiles[selectedOption - 1] : null
  const imageUrl = selectedFile ? buildCarImageUrl(tierKey, selectedFile) : pickCarImageUrl(tierKey)

  const id = insertCar({
    ownerId: userId,
    ownerName: nick,
    teamId: team?.id ?? null,
    name,
    livery: tier.livery,
    tier: tierKey,
    price: tier.price,
    power: jitter(tier.base.power),
    handling: jitter(tier.base.handling),
    aero: jitter(tier.base.aero),
    reliability: jitter(tier.base.reliability),
    tire: jitter(tier.base.tire),
    wear: 0,
    imageUrl
  })

  if (imageUrl) {
    await safeCall(setCarImageUrl, [id, imageUrl]).catch(() => null)
  }

  const updated = await safeCall(getUserWallet, [userId]).catch(() => null)
  await postMessage({
    room,
    message:
      `✅ ${nick} bought a **${tierKey.toUpperCase()}** car: **${tier.livery} ${name}**\n` +
      `${selectedFile ? `🖼️ Chosen option: **#${selectedOption}**\n` : ''}` +
      `${buyCost.fee > 0 ? `💼 Wealth fee: **${fmtMoney(buyCost.fee)}**\n` : ''}` +
      `💰 Balance: **${fmtMoney(updated)}**\n` +
      'Next: `/mycars`, `/carstats`, `/gp start open`',
    images: imageUrl ? [imageUrl] : undefined
  })
}

export async function handleMyCars (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')
  const team = await safeCall(getTeamByOwner, [userId]).catch(() => null)
  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  await ensurePersistentCarImages(cars)

  if (!cars?.length) {
    await postMessage({ room, message: `${nick}, you don’t own any cars yet. Try **/buycar**.` })
    return
  }

  const lines = []
  const teamBadge = String(team?.badge || '').trim()
  const teamName = String(team?.name || '').trim()
  const garageOwnerLabel = teamName
    ? `${teamBadge ? `${teamBadge} ` : ''}${teamName}`
    : nick
  lines.push(`${garageOwnerLabel}'s Garage (${cars.length})`)
  lines.push('')

  for (const c of cars.slice(0, 12)) {
    const wear = Number(c.wear || 0)
    const wearTag = wear >= 80 ? '⚠️' : (wear >= 60 ? '🟡' : '🟢')
    const earnings = toInt(c.careerEarnings)
    lines.push(`• ${carLabel(c)} — Tier ${String(c.tier || '—').toUpperCase()} · Wear ${wear}% ${wearTag} · W ${c.wins || 0} / R ${c.races || 0} · Return ${fmtMoney(earnings)}`)
  }

  lines.push('')
  lines.push('Show: `/car <car name>`')
  lines.push('Repair: `/repair <car name>`')
  lines.push('Sell: `/sellcar <car name>`')
  await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
}

export async function handleWearCommand (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const nameArg = parseArg(text, /^\/wear(?:\s+(.+))?$/i)
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')
  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  await ensurePersistentCarImages(cars)

  if (!cars?.length) {
    await postMessage({ room, message: `${nick}, you don’t own any cars yet. Try **/buycar**.` })
    return
  }

  if (nameArg) {
    const q = String(nameArg).toLowerCase()
    const car =
      cars.find(c => String(c.name || '').toLowerCase() === q) ||
      cars.find(c => String(c.name || '').toLowerCase().includes(q))

    if (!car) {
      await postMessage({ room, message: `❗ ${nick}, couldn’t find that car in your garage.` })
      return
    }

    const wear = Math.max(0, Math.floor(Number(car.wear || 0)))
    const tierKey = normalizeTierKey(car.tier)
    const fullRepairCost = estimateFullRepairCost(car)
    await postMessage({
      room,
      message:
        `🧰 ${carLabel(car)}\n` +
        `Wear: **${wear}%** · Tier: **${tierKey.toUpperCase()}** · Full repair: **${fmtMoney(fullRepairCost)}**`
    })
    return
  }

  const lines = []
  lines.push(`${nick}'s Wear Report`)
  lines.push('')
  for (const c of cars.slice(0, 12)) {
    const wear = Math.max(0, Math.floor(Number(c.wear || 0)))
    const fullRepairCost = estimateFullRepairCost(c)
    const wearTag = wear >= 80 ? '⚠️' : (wear >= 60 ? '🟡' : '🟢')
    lines.push(`• ${carLabel(c)} — Wear ${wear}% ${wearTag} · Full repair ${fmtMoney(fullRepairCost)}`)
  }
  if (cars.length > 12) lines.push(`…and ${cars.length - 12} more cars.`)
  lines.push('')
  lines.push('Repair one: `/repair <car name>`')
  lines.push('Check one: `/wear <car name>`')
  await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
}

export async function handleCarShow (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const nameArg = parseArg(text, /^\/car\s+(.+)$/i)
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  if (!nameArg) {
    await postMessage({ room, message: 'Usage: **/car <car name>**' })
    return
  }

  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  await ensurePersistentCarImages(cars)
  const q = String(nameArg).toLowerCase()
  const car =
    cars.find(c => String(c.name || '').toLowerCase() === q) ||
    cars.find(c => String(c.name || '').toLowerCase().includes(q))

  if (!car) {
    await postMessage({ room, message: `❗ ${nick}, couldn’t find that car in your garage.` })
    return
  }

  const tierKey = String(car.tier || 'starter').toLowerCase()
  const wear = Number(car.wear || 0)
  const fullRepairCost = estimateFullRepairCost(car)
  const earnings = toInt(car.careerEarnings)
  const entryFees = toInt(car.entryFeesPaid)
  const repairSpend = toInt(car.repairSpend)
  const net = carCareerNet(car)
  const bestFinish = car.bestFinish != null ? `P${car.bestFinish}` : '—'
  const avgFinish = Number(car.finishCount || 0) > 0
    ? `P${(Number(car.finishSum || 0) / Number(car.finishCount || 1)).toFixed(2)}`
    : '—'

  await postMessage({
    room,
    message:
      `🏎️ **${carLabel(car)}**\n` +
      `Team: **${car.teamId ? 'Assigned' : '—'}** · Tier: **${tierKey.toUpperCase()}** · Wear: **${wear}%** · W ${car.wins || 0} / R ${car.races || 0}\n` +
      `Return (earnings only): **${fmtMoney(earnings)}** · Net career: **${fmtMoney(net)}**\n` +
      `Spent: buy ${fmtMoney(car.price || 0)} · entry ${fmtMoney(entryFees)} · repair ${fmtMoney(repairSpend)}\n` +
      `Best finish: **${bestFinish}** · Avg finish: **${avgFinish}** · Podiums: **${toInt(car.podiums)}** · DNFs: **${toInt(car.dnfs)}**\n` +
      `Estimated full repair: **${fmtMoney(fullRepairCost)}**`,
    images: car.imageUrl ? [car.imageUrl] : undefined
  })
}

export async function handleRepairCar (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const nameArg = parseArg(text, /^\/repair\s+(.+)$/i)
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  if (!nameArg) {
    await postMessage({ room, message: 'Usage: **/repair <car name>**' })
    return
  }

  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  await ensurePersistentCarImages(cars)
  const q = String(nameArg).toLowerCase()
  const car =
    cars.find(c => String(c.name || '').toLowerCase() === q) ||
    cars.find(c => String(c.name || '').toLowerCase().includes(q))

  if (!car) {
    await postMessage({ room, message: `❗ ${nick}, couldn’t find that car in your garage.` })
    return
  }

  const currentWear = Math.max(0, Math.floor(Number(car.wear || 0)))
  if (currentWear <= 0) {
    await postMessage({ room, message: `✅ ${carLabel(car)} is already at 0% wear.` })
    return
  }

  const tierKey = normalizeTierKey(car.tier)
  const costPerPoint = getTierRepairCostPerPoint(tierKey)
  const wearToRemove = currentWear
  const cost = wearToRemove * costPerPoint

  const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
  const repairCost = getProgressiveWealthFee({ balance: bal, baseAmount: cost, source: 'f1' })
  if (typeof bal !== 'number' || bal < repairCost.total) {
    await postMessage({
      room,
      message: `❗ ${nick}, full repair for ${carLabel(car)} costs **${fmtMoney(repairCost.total)}**${repairCost.fee > 0 ? ` (${fmtMoney(cost)} + ${fmtMoney(repairCost.fee)} wealth fee)` : ''} (${wearToRemove} wear × ${fmtMoney(costPerPoint)}). Balance: **${fmtMoney(bal)}**.`
    })
    return
  }

  const chargedRepair = await chargeF1Cost(userId, cost, 'repair', `Repair ${car.name || ''}`.trim(), bal)
  if (!chargedRepair.ok) {
    await postMessage({ room, message: `⚠️ ${nick}, couldn't process repair payment.` })
    return
  }
  await safeCall(setCarWear, [car.id, Math.max(0, currentWear - wearToRemove)])
  await safeCall(recordCarRepairSpend, [car.id, cost]).catch(() => null)
  const updated = await safeCall(getUserWallet, [userId]).catch(() => null)

  await postMessage({
    room,
    message: `🔧 ${nick} repaired ${carLabel(car)}: **-${wearToRemove}% wear** for **${fmtMoney(cost)}**${repairCost.fee > 0 ? ` + ${fmtMoney(repairCost.fee)} wealth fee` : ''}. Wear is now **0%**.\n💰 Balance: **${fmtMoney(updated)}**`
  })
}

export async function handleSellCar (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const nameArg = parseArg(text, /^\/sellcar\s+(.+)$/i)
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  if (!nameArg) {
    const cars = await safeCall(getUserCars, [userId]).catch(() => [])
    if (!cars?.length) {
      await postMessage({ room, message: `${nick}, you don’t own any cars yet. Try **/buycar**.` })
      return
    }

    const lines = []
    lines.push(`${nick}'s SELL VALUES`)
    lines.push('')

    const sorted = cars.slice().sort((a, b) => estimateResaleValue(b) - estimateResaleValue(a))
    for (const c of sorted.slice(0, 12)) {
      const resale = estimateResaleValue(c)
      lines.push(`• ${carLabel(c)} — ${fmtMoney(resale)}`)
    }
    if (sorted.length > 12) lines.push(`…and ${sorted.length - 12} more cars.`)

    lines.push('')
    lines.push('Sell one: `/sellcar <car name>`')
    await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
    return
  }

  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  const q = String(nameArg).toLowerCase()
  const car =
    cars.find(c => String(c.name || '').toLowerCase() === q) ||
    cars.find(c => String(c.name || '').toLowerCase().includes(q))

  if (!car) {
    await postMessage({ room, message: `❗ ${nick}, couldn’t find that car in your garage.` })
    return
  }

  const resale = estimateResaleValue(car)
  const sold = await safeCall(deleteCarOwnedByUser, [car.id, userId]).catch(() => false)
  if (!sold) {
    await postMessage({ room, message: `⚠️ ${nick}, couldn't complete that sale. Try again.` })
    return
  }

  await safeCall(creditGameWin, [userId, resale, nick, {
    source: 'f1',
    category: 'asset_sale',
    note: `Sold car ${car.name || ''}`.trim()
  }]).catch(() => null)
  const updated = await safeCall(getUserWallet, [userId]).catch(() => null)
  const original = toInt(car.price)
  const delta = resale - original
  const deltaLabel = `${delta >= 0 ? '+' : ''}${fmtMoney(delta)}`

  await postMessage({
    room,
    message:
      `💸 ${nick} sold **${carLabel(car)}** for **${fmtMoney(resale)}**.\n` +
      `Buy-in: ${fmtMoney(original)} · Sale vs buy-in: ${deltaLabel}\n` +
      `💰 Balance: **${fmtMoney(updated)}**`
  })
}

export async function handleRenameCar (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const argsRaw = (text.match(/^\/(?:renamecar|carrename|rename\s+car)\s+(.+)$/i) || [])[1] || ''
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  if (!argsRaw) {
    await postMessage({ room, message: `Usage: **/renamecar <current name>** (random reroll, costs ${fmtMoney(CAR_RENAME_FEE)})` })
    return
  }

  if (isAccepting || isStratOpen || isRunning) {
    await postMessage({ room, message: `⛔ ${nick}, car renames are disabled while a Grand Prix is active.` })
    return
  }

  const fromName = String(argsRaw.split('|')[0] || '').trim()
  if (!fromName) {
    await postMessage({ room, message: 'Usage: **/renamecar <current name>**' })
    return
  }

  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  if (!cars?.length) {
    await postMessage({ room, message: `${nick}, you don’t own any cars yet. Try **/buycar**.` })
    return
  }

  const q = String(fromName).toLowerCase()
  const car =
    cars.find(c => String(c.name || '').toLowerCase() === q) ||
    cars.find(c => String(c.name || '').toLowerCase().includes(q))

  if (!car) {
    await postMessage({ room, message: `❗ ${nick}, couldn’t find that car in your garage.` })
    return
  }

  const allCars = await safeCall(getAllCars).catch(() => [])
  const used = new Set((allCars || []).map(c => String(c?.name || '').toLowerCase()))
  const newName = generateCarName(used)

  const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
  const renameCost = getProgressiveWealthFee({ balance: bal, baseAmount: CAR_RENAME_FEE, source: 'f1' })
  if (typeof bal !== 'number' || bal < renameCost.total) {
    await postMessage({
      room,
      message: `❗ ${nick}, renaming a car costs **${fmtMoney(renameCost.total)}**${renameCost.fee > 0 ? ` (${fmtMoney(CAR_RENAME_FEE)} + ${fmtMoney(renameCost.fee)} wealth fee)` : ''}. Balance: **${fmtMoney(bal)}**.`
    })
    return
  }

  const chargedRename = await chargeF1Cost(userId, CAR_RENAME_FEE, 'rename_fee', `Rename fee for ${car.name || ''}`.trim(), bal)
  if (!chargedRename.ok) {
    await postMessage({ room, message: `⚠️ ${nick}, couldn't process rename payment. Try again.` })
    return
  }

  const renamed = await safeCall(renameCarOwnedByUser, [car.id, userId, newName]).catch(() => false)
  if (!renamed) {
    await safeCall(addToUserWallet, [userId, CAR_RENAME_FEE + renameCost.fee, nick, {
      source: 'f1',
      category: 'refund',
      note: `Rename refund for ${car.name || ''}`.trim()
    }]).catch(() => null)
    await postMessage({ room, message: `⚠️ ${nick}, couldn't rename that car right now. Your ${fmtMoney(CAR_RENAME_FEE + renameCost.fee)} was refunded.` })
    return
  }

  const updated = await safeCall(getUserWallet, [userId]).catch(() => null)
  await postMessage({
    room,
    message:
      `🎲 ${nick} rerolled **${carLabel(car)}** to **${car.livery || '⬛'} ${newName}** for **${fmtMoney(CAR_RENAME_FEE)}**${renameCost.fee > 0 ? ` + ${fmtMoney(renameCost.fee)} wealth fee` : ''}.\n` +
      `💰 Balance: **${fmtMoney(updated)}**`
  })
}

export async function handleCarPics (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')
  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  await ensurePersistentCarImages(cars)

  if (!cars?.length) {
    await postMessage({ room, message: `${nick}, you don’t own any cars yet. Try **/buycar**.` })
    return
  }

  const withImages = cars.filter(c => c.imageUrl)
  if (!withImages.length) {
    await postMessage({ room, message: `📷 ${nick}, none of your cars currently have images. Buy a new car to get one.` })
    return
  }

  for (const c of withImages.slice(0, 8)) {
    await postMessage({
      room,
      message: `📷 ${carLabel(c)}`,
      images: [c.imageUrl]
    })
  }

  if (withImages.length > 8) {
    await postMessage({ room, message: `…and ${withImages.length - 8} more. Use "/car <name>" for a specific car.` })
  }
}

// ── Betting command ────────────────────────────────────────────────────
// /bet <slot> <amount>
export async function handleBetCommand (ctx) {
  if (!isBettingOpen) return
  const room = ctx?.room || ROOM
  const sender = ctx?.sender
  const txt = String(ctx?.message || '').trim()

  const m = txt.match(/^\/bet\s*(\d+)\s+(\d+)\b/i)
  if (!m) return

  const idx = parseInt(m[1], 10) - 1
  const amt = parseInt(m[2], 10)

  if (Number.isNaN(idx) || idx < 0 || idx >= field.length) return
  if (Number.isNaN(amt) || amt < BET_MIN || amt > BET_MAX) {
    await postMessage({ room, message: `❗ Min bet ${fmtMoney(BET_MIN)} · Max bet ${fmtMoney(BET_MAX)}.` })
    return
  }

  const bal = await safeCall(getUserWallet, [sender]).catch(() => null)
  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  if (typeof bal !== 'number' || bal < amt) {
    await postMessage({ room, message: `❗ ${nick}, insufficient funds. Balance: ${fmtMoney(bal)}.` })
    return
  }

  const car = field[idx]
  if (!car) return

  // ✅ Stable bet identity (fixes array reorder / reseeding bugs)
  // - user cars: car:<id>
  // - bots: label:<label>
  const betKey = (car.id != null)
    ? `car:${String(car.id)}`
    : `label:${String(car.label || '').trim()}`

  if (!betKey || betKey.endsWith(':')) {
    await postMessage({ room, message: `⚠️ ${nick}, couldn't place that bet. Try again.` })
    return
  }

  const slips = (bets[sender] ||= [])
  const alreadyBetSameCar = slips.some((s) => {
    const key = String(s?.betKey || '').trim()
    if (key && key === betKey) return true

    // Back-compat with any legacy slips that may still use carIndex.
    const legacyIdx = Number(s?.carIndex)
    return Number.isFinite(legacyIdx) && legacyIdx === idx
  })
  if (alreadyBetSameCar) {
    await postMessage({
      room,
      message: `❗ ${nick}, you already placed a bet on slot ${idx + 1} (${car.label}) this race. One bet per car.`
    })
    return
  }

  // Debit stake immediately
  await safeCall(debitGameBet, [sender, amt, {
    source: 'f1',
    category: 'bet',
    note: `Bet on ${car.label}`
  }])

  // Store slip (new format)
  slips.push({ betKey, amount: amt })

  // Display odds if available (should be, once you compute odds during betting)
  const dec = lockedOddsDec?.[idx]
  const oddsLabel = Number.isFinite(dec) ? `${dec.toFixed(2)}x` : '—'
  await postMessage({
    room,
    message: `🎟️ ${nick} bets ${fmtMoney(amt)} on slot ${idx + 1}: ${car.label} (odds ${oddsLabel})`
  })
}

export async function handleCarStats (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const txt = String(ctx?.message || '').trim()
  const nameArg = parseArg(txt, /^\/carstats(?:\s+(.+))?$/i)
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')
  const cars = await safeCall(getUserCars, [userId]).catch(() => [])

  if (!cars?.length) {
    await postMessage({ room, message: `${nick}, you don’t own any cars yet. Try **/buycar**.` })
    return
  }

  if (nameArg) {
    const q = String(nameArg).toLowerCase()
    const car =
      cars.find(c => String(c.name || '').toLowerCase() === q) ||
      cars.find(c => String(c.name || '').toLowerCase().includes(q))

    if (!car) {
      await postMessage({ room, message: `❗ ${nick}, couldn’t find that car in your garage.` })
      return
    }

    const avgFinish = Number(car.finishCount || 0) > 0
      ? (Number(car.finishSum || 0) / Number(car.finishCount || 1)).toFixed(2)
      : null

    const lines = []
    lines.push(`CAR STATS — ${carLabel(car)}`)
    lines.push('')
    lines.push(`Return (earnings only): ${fmtMoney(toInt(car.careerEarnings))}`)
    lines.push(`Net career: ${fmtMoney(carCareerNet(car))}`)
    lines.push(`Buy-in: ${fmtMoney(toInt(car.price))} · Entry Fees: ${fmtMoney(toInt(car.entryFeesPaid))} · Repairs: ${fmtMoney(toInt(car.repairSpend))}`)
    lines.push(`Races: ${toInt(car.races)} · Wins: ${toInt(car.wins)} · Podiums: ${toInt(car.podiums)} · DNFs: ${toInt(car.dnfs)}`)
    lines.push(`Poles: ${toInt(car.polePositions)} · Fastest Laps: ${toInt(car.fastestLaps)}`)
    lines.push(`Best Finish: ${car.bestFinish != null ? `P${car.bestFinish}` : '—'} · Avg Finish: ${avgFinish ? `P${avgFinish}` : '—'}`)
    await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
    return
  }

  const totals = await safeCall(getUserCarStatsSummary, [userId]).catch(() => null)
  const topCars = await safeCall(getTopCarsByEarnings, [userId, 5]).catch(() => [])

  const totalEarnings = toInt(totals?.totalCarEarnings)
  const totalBuy = toInt(totals?.totalPurchaseSpend)
  const totalEntry = toInt(totals?.totalEntryFeesPaid)
  const totalRepair = toInt(totals?.totalRepairSpend)
  const netNoBuyIn = totalEarnings - totalEntry - totalRepair
  const allInNet = netNoBuyIn - totalBuy
  const avgFinish = Number(totals?.totalFinishCount || 0) > 0
    ? (Number(totals.totalFinishSum || 0) / Number(totals.totalFinishCount || 1)).toFixed(2)
    : null

  const lines = []
  lines.push(`${nick}'s F1 STATS`)
  lines.push('')
  lines.push(`Cars owned: ${toInt(totals?.carsOwned)}`)
  lines.push(`Return (earnings only): ${fmtMoney(totalEarnings)}`)
  lines.push(`Costs: buy ${fmtMoney(totalBuy)} · entry ${fmtMoney(totalEntry)} · repair ${fmtMoney(totalRepair)}`)
  lines.push(`Net (no buy-in): ${fmtMoney(netNoBuyIn)} · Net (all-in): ${fmtMoney(allInNet)}`)
  lines.push(`Races: ${toInt(totals?.totalRaces)} · Wins: ${toInt(totals?.totalWins)} · Podiums: ${toInt(totals?.totalPodiums)} · DNFs: ${toInt(totals?.totalDnfs)}`)
  lines.push(`Poles: ${toInt(totals?.totalPoles)} · Fastest Laps: ${toInt(totals?.totalFastestLaps)} · Avg Finish: ${avgFinish ? `P${avgFinish}` : '—'}`)

  if (topCars.length) {
    lines.push('')
    lines.push('Top Cars by Return:')
    topCars.forEach((c, idx) => {
      lines.push(`${idx + 1}. ${carLabel(c)} · ${fmtMoney(toInt(c.careerEarnings))}`)
    })
  }

  lines.push('')
  lines.push('Details: `/carstats <car name>`')
  await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
}

export async function handleF1Stats (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')
  const totals = await safeCall(getUserCarStatsSummary, [userId]).catch(() => null)
  const topCars = await safeCall(getTopCarsByEarnings, [userId, 3]).catch(() => [])

  const carsOwned = toInt(totals?.carsOwned)
  if (!carsOwned) {
    await postMessage({ room, message: `${nick}, you don’t own any cars yet. Try **/buycar**.` })
    return
  }

  const totalEarnings = toInt(totals?.totalCarEarnings)
  const totalBuy = toInt(totals?.totalPurchaseSpend)
  const totalEntry = toInt(totals?.totalEntryFeesPaid)
  const totalRepair = toInt(totals?.totalRepairSpend)
  const netNoBuyIn = totalEarnings - totalEntry - totalRepair
  const allInNet = netNoBuyIn - totalBuy
  const avgFinish = Number(totals?.totalFinishCount || 0) > 0
    ? (Number(totals.totalFinishSum || 0) / Number(totals.totalFinishCount || 1)).toFixed(2)
    : null

  const lines = []
  lines.push(`🏁 **${nick} — F1 Driver Report**`)
  lines.push(`🏎️ Cars: **${carsOwned}** · Races: **${toInt(totals?.totalRaces)}** · Wins: **${toInt(totals?.totalWins)}** · Podiums: **${toInt(totals?.totalPodiums)}**`)
  lines.push(`📉 DNFs: **${toInt(totals?.totalDnfs)}** · ⚡ Poles: **${toInt(totals?.totalPoles)}** · ⏱️ Fastest Laps: **${toInt(totals?.totalFastestLaps)}**`)
  lines.push(`🎯 Avg Finish: **${avgFinish ? `P${avgFinish}` : '—'}**`)
  lines.push('')
  lines.push(`💰 Return (earnings): **${fmtMoney(totalEarnings)}**`)
  lines.push(`🧾 Costs: buy **${fmtMoney(totalBuy)}** · entry **${fmtMoney(totalEntry)}** · repair **${fmtMoney(totalRepair)}**`)
  lines.push(`📈 Net (no buy-in): **${fmtMoney(netNoBuyIn)}**`)
  lines.push(`🏦 Net (all-in): **${fmtMoney(allInNet)}**`)

  if (topCars.length) {
    lines.push('')
    lines.push('🔥 **Top Cars by Return**')
    topCars.forEach((c, idx) => {
      lines.push(`${idx + 1}. ${carLabel(c)} · **${fmtMoney(toInt(c.careerEarnings))}**`)
    })
  }

  lines.push('')
  lines.push('More: `/carstats` · `/carstats <car name>` · `/f1leaderboard`')
  await postMessage({ room, message: lines.join('\n') })
}

export async function handleF1Leaderboard (ctx) {
  const room = ctx?.room || ROOM
  const txt = String(ctx?.message || '').trim()
  const rawLimit = parseArg(txt, /^\/f1leaderboard(?:\s+(\d+))?$/i)
  const limit = rawLimit ? Math.max(1, Math.min(25, parseInt(rawLimit, 10) || 10)) : 10
  const rows = await safeCall(getTopOwnersByCarReturn, [limit]).catch(() => [])

  if (!rows.length) {
    await postMessage({ room, message: 'No F1 owner stats yet. Run a few races first.' })
    return
  }

  const lines = []
  lines.push(`F1 LEADERBOARD — TOP OWNERS BY CAR RETURN (Top ${limit})`)
  lines.push('')

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const titleTag = row?.ownerId ? getCompactEquippedTitleTag(row.ownerId, 7) : ''
    const ownerName = compactLeaderboardName(row?.ownerName || row?.ownerId || 'Unknown', row?.ownerId, titleTag ? 10 : 14)
    lines.push(
      `${i + 1}. ${titleTag ? `${titleTag} ` : ''}${ownerName} ${fmtMoney(toInt(row.totalCarReturn))}`
    )
    lines.push(
      `   Cars ${toInt(row.carsOwned)} · W ${toInt(row.totalWins)} / R ${toInt(row.totalRaces)}`
    )
  }

  lines.push('')
  lines.push('Return = prize/pole/fastest-lap earnings from owned cars (betting excluded).')
  await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
}

// ── Race lifecycle ─────────────────────────────────────────────────────
export async function startF1Race (modeArg = 'open') {
  if (isAccepting || isStratOpen || isRunning) {
    await safeCall(postMessage, [{ room: ROOM, message: '⛔ A Grand Prix is already in progress.' }])
    return
  }

  const normalizedMode = normalizeRaceMode(modeArg)
  if (!normalizedMode) {
    await safeCall(postMessage, [{
      room: ROOM,
      message: `❗ Unknown race mode \`${String(modeArg)}\`. Use: \`/gp start rookie\`, \`/gp start open\`, or \`/gp start elite\`.`
    }])
    return
  }
  const modeConfig = RACE_MODES[normalizedMode]

  isAccepting = true
  isStratOpen = false
  isRunning = false
  isBettingOpen = false
  entered.clear()
  eligibleByName = new Map()
  field = []
  lockedOddsDec = []
  bets = {}
  _lastProgress = null
  lockedEntryGross = 0
  lockedRaceMode = normalizedMode
  lockedRaceType = 'gp'
  lockedDragTier = null
  lockedPayoutPlan = modeConfig.payoutPlan || PRIZE_SPLIT_BY_MODE.open

  const all = await safeCall(getAllCars).catch(() => [])
  await ensurePersistentCarImages(all)
  const activeIds = await safeCall(fetchCurrentUsers).catch(() => [])

  const avail = (all || []).filter(c =>
    c.ownerId &&
    activeIds.includes(c.ownerId) &&
    !c.retired &&
    modeConfig.allowedTiers.has(normalizeTierKey(c.tier))
  )
  for (const c of avail) eligibleByName.set(String(c.name || '').toLowerCase(), c)

  await safeCall(postMessage, [{
    room: ROOM,
    message:
      `🏎️ **${modeConfig.label} GRAND PRIX STARTING!** Owners: type your car’s exact name in the next ${ENTRY_MS / 1000}s to enter.\n` +
      `${raceModeSummary(normalizedMode)}\n` +
      `${normalizedMode === 'elite' ? 'Elite balance: HYPER gets a small pace bump; LEGENDARY gets a small pace trim.\n' : ''}` +
      `Guaranteed purse floor (${modeConfig.label}): ${fmtMoney(getModeGuaranteedPurse(normalizedMode))}\n` +
      'Tier entry fees (charged at lock-in):\n' +
      `• STARTER: ${fmtMoney(getTierEntryFee('starter'))}\n` +
      `• PRO: ${fmtMoney(getTierEntryFee('pro'))}\n` +
      `• HYPER: ${fmtMoney(getTierEntryFee('hyper'))}\n` +
      `• LEGENDARY: ${fmtMoney(getTierEntryFee('legendary'))}\n` +
      'Garage upkeep per extra active car (charged on entry):\n' +
      `• STARTER: ${fmtMoney(getGarageUpkeepPerExtraCar('starter'))}\n` +
      `• PRO: ${fmtMoney(getGarageUpkeepPerExtraCar('pro'))}\n` +
      `• HYPER: ${fmtMoney(getGarageUpkeepPerExtraCar('hyper'))}\n` +
      `• LEGENDARY: ${fmtMoney(getGarageUpkeepPerExtraCar('legendary'))}`
  }])

  if (avail.length) {
    const lines = []
    lines.push(`AVAILABLE CARS — ${modeConfig.label} MODE (owners only — type exact name to enter)`)
    lines.push('')
    const list = avail.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).slice(0, 20)
    for (const c of list) {
      const ownerNick = await safeCall(getUserNickname, [c.ownerId]).catch(() => null)
      const owner = ownerNick ? String(ownerNick).replace(/^@/, '') : 'Unknown'
      lines.push(`• ${carLabel(c)} — ${owner}  (enter: ${c.name})`)
    }
    if (avail.length > 20) lines.push(`\n… and ${avail.length - 20} more cars online.`)

    await safeCall(postMessage, [{ room: ROOM, message: '```' + '\n' + lines.join('\n') + '\n```' }])
  } else {
    await safeCall(postMessage, [{ room: ROOM, message: `⚠️ No eligible user cars detected online for ${modeConfig.label} mode — bots will fill the grid.` }])
  }

  entryTimer = setTimeout(lockEntriesAndOpenStrategy, ENTRY_MS)
}

export async function startDragRace (tierArg = 'starter') {
  if (isAccepting || isStratOpen || isRunning) {
    await safeCall(postMessage, [{ room: ROOM, message: '⛔ A race is already in progress.' }])
    return
  }

  const dragTier = normalizeTierKey(tierArg)
  const tierKeyRaw = String(tierArg || '').toLowerCase()
  const isKnownTier = Object.prototype.hasOwnProperty.call(ENTRY_FEE_BY_TIER, tierKeyRaw)
  if (!isKnownTier) {
    await safeCall(postMessage, [{
      room: ROOM,
      message: '❗ Unknown drag tier. Use: `/drag start starter`, `/drag start pro`, `/drag start hyper`, or `/drag start legendary`.'
    }])
    return
  }

  isAccepting = true
  isStratOpen = false
  isRunning = false
  isBettingOpen = false
  entered.clear()
  eligibleByName = new Map()
  field = []
  lockedOddsDec = []
  bets = {}
  _lastProgress = null
  lockedEntryGross = 0
  lockedRaceMode = 'open'
  lockedRaceType = 'drag'
  lockedDragTier = dragTier
  lockedPayoutPlan = DRAG_PAYOUT_SPLIT

  const all = await safeCall(getAllCars).catch(() => [])
  await ensurePersistentCarImages(all)
  const activeIds = await safeCall(fetchCurrentUsers).catch(() => [])

  const avail = (all || []).filter(c =>
    c.ownerId &&
    activeIds.includes(c.ownerId) &&
    !c.retired &&
    normalizeTierKey(c.tier) === dragTier
  )
  for (const c of avail) eligibleByName.set(String(c.name || '').toLowerCase(), c)

  await safeCall(postMessage, [{
    room: ROOM,
    message:
      `🛣️ **DRAG RACE STARTING (${dragTier.toUpperCase()})** — first 2 eligible owners to enter are locked in.\n` +
      'Type your exact car name in chat to enter.\n' +
      `Rules: same-tier only (${dragTier.toUpperCase()}) · 1v1 straight-line race · winner-take-all · empty slots filled by house bots.\n` +
      'Entry fee: FREE\n' +
      `Guaranteed drag purse floor: ${fmtMoney(getDragGuaranteedPurse(dragTier))}`
  }])

  if (avail.length) {
    const lines = []
    lines.push(`AVAILABLE DRAG CARS — ${dragTier.toUpperCase()} TIER`)
    lines.push('')
    const list = avail.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))).slice(0, 20)
    for (const c of list) {
      const ownerNick = await safeCall(getUserNickname, [c.ownerId]).catch(() => null)
      const owner = ownerNick ? String(ownerNick).replace(/^@/, '') : 'Unknown'
      lines.push(`• ${carLabel(c)} — ${owner}  (enter: ${c.name})`)
    }
    if (avail.length > 20) lines.push(`\n… and ${avail.length - 20} more cars online.`)
    await safeCall(postMessage, [{ room: ROOM, message: '```' + '\n' + lines.join('\n') + '\n```' }])
  } else {
    await safeCall(postMessage, [{ room: ROOM, message: `⚠️ No eligible ${dragTier.toUpperCase()} cars are online right now.` }])
  }

  entryTimer = setTimeout(lockEntriesAndOpenStrategy, DRAG_ENTRY_MS)
}

export async function handleCarEntryAttempt (ctx) {
  if (!isAccepting) return
  const sender = ctx?.sender
  const raw = String(ctx?.message || '').trim()
  if (!raw) return

  const car = eligibleByName.get(raw.toLowerCase())
  if (!car) return
  if (String(car.ownerId) !== String(sender)) return
  if (entered.has(car.id)) return
  if (lockedRaceType === 'drag') {
    if (normalizeTierKey(car?.tier) !== lockedDragTier) return
    if (entered.size >= DRAG_FIELD_SIZE) return
  }

  entered.add(car.id)
  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  await safeCall(postMessage, [{ room: ROOM, message: `✅ ${nick?.replace(/^@/, '')} entered ${carLabel(car)}!` }])

  if (lockedRaceType === 'drag' && entered.size >= DRAG_FIELD_SIZE) {
    if (entryTimer) {
      clearTimeout(entryTimer)
      entryTimer = null
    }
    await lockEntriesAndOpenStrategy()
  }
}

// ── Internal helpers ───────────────────────────────────────────────────
function cleanup () {
  if (entryTimer) {
    clearTimeout(entryTimer)
    entryTimer = null
  }
  isAccepting = false
  isStratOpen = false
  isRunning = false
  isBettingOpen = false
  entered.clear()
  eligibleByName = new Map()
  field = []
  lockedOddsDec = []
  bets = {}
  _lastProgress = null
  lockedEntryGross = 0
  lockedRaceMode = 'open'
  lockedRaceType = 'gp'
  lockedDragTier = null
  lockedPayoutPlan = PRIZE_SPLIT_BY_MODE.open
}

async function lockEntriesAndOpenStrategy () {
  try {
    entryTimer = null
    isAccepting = false

    const all = await safeCall(getAllCars).catch(() => [])
    const enteredCars = (all || []).filter(c => entered.has(c.id))
      .filter(c => (lockedRaceType === 'drag' ? normalizeTierKey(c.tier) === lockedDragTier : true))
    const targetFieldSize = lockedRaceType === 'drag' ? DRAG_FIELD_SIZE : MIN_FIELD
    const need = Math.max(0, targetFieldSize - enteredCars.length)

    // Charge tier-based entry fees now
    const filtered = []
    let totalEntryGross = 0
    for (const c of enteredCars) {
      const ownerId = c.ownerId
      const tierKey = normalizeTierKey(c.tier)
      const entryFee = lockedRaceType === 'drag' ? 0 : getTierEntryFee(tierKey)
      const ownerCars = await safeCall(getUserCars, [ownerId]).catch(() => [])
      const activeOwnedCars = Array.isArray(ownerCars)
        ? ownerCars.filter(car => !car?.retired).length
        : 1
      const upkeepFee = lockedRaceType === 'drag'
        ? 0
        : Math.max(0, activeOwnedCars - 1) * getGarageUpkeepPerExtraCar(tierKey)
      const bal = await safeCall(getUserWallet, [ownerId]).catch(() => null)
      const wealthFee = getProgressiveWealthFee({ balance: bal, baseAmount: entryFee + upkeepFee, source: 'f1' })
      const totalCharge = entryFee + upkeepFee + wealthFee.fee
      const nick = await safeCall(getUserNickname, [ownerId]).catch(() => '@user')
      if (typeof bal !== 'number' || bal < totalCharge) {
        await safeCall(postMessage, [{
          room: ROOM,
          message: `❗ ${nick} could not pay ${tierKey.toUpperCase()} race costs (${fmtMoney(totalCharge)} = entry ${fmtMoney(entryFee)} + upkeep ${fmtMoney(upkeepFee)}${wealthFee.fee > 0 ? ` + wealth fee ${fmtMoney(wealthFee.fee)}` : ''}). ${carLabel(c)} removed from grid.`
        }])
        continue
      }
      if (entryFee > 0) {
        await safeCall(debitGameBet, [ownerId, entryFee, {
          source: 'f1',
          category: 'entry_fee',
          note: `${lockedRaceMode} ${tierKey} race entry`
        }])
      }
      if (upkeepFee > 0) {
        await safeCall(debitGameBet, [ownerId, upkeepFee, {
          source: 'f1',
          category: 'garage_upkeep',
          note: `${Math.max(0, activeOwnedCars - 1)} extra active car(s)`
        }])
      }
      if (wealthFee.fee > 0) {
        await safeCall(debitGameBet, [ownerId, wealthFee.fee, {
          source: 'f1',
          category: 'wealth_fee',
          note: `${wealthFee.bandLabel} wealth fee on race entry`
        }])
      }
      if (entryFee > 0 && c?.id != null) {
        await safeCall(recordCarEntryFee, [c.id, entryFee]).catch(() => null)
      }
      totalEntryGross += entryFee
      filtered.push(c)
    }
    lockedEntryGross = totalEntryGross

    // bots (grand prix + drag backfill)
    const bots = []
    const used = new Set((all || []).map(c => String(c.name || '').toLowerCase()))
    for (const c of filtered) used.add(String(c.name || '').toLowerCase())

    const botRangeByMode = {
      rookie: {
        power: [54, 64], handling: [54, 64], aero: [52, 62], reliability: [55, 66], tire: [53, 64]
      },
      open: {
        power: [58, 70], handling: [58, 70], aero: [56, 68], reliability: [59, 72], tire: [57, 70]
      },
      elite: {
        power: [67, 79], handling: [67, 79], aero: [66, 78], reliability: [68, 80], tire: [67, 79]
      }
    }
    const botRange = botRangeByMode[lockedRaceMode] || botRangeByMode.open

    if (lockedRaceType === 'drag') {
      const dragTier = normalizeTierKey(lockedDragTier || 'starter')
      const base = CAR_TIERS[dragTier]?.base || CAR_TIERS.starter.base
      const dragLivery = CAR_TIERS[dragTier]?.livery || '⬛'
      const dragBotBiasByTier = { starter: 0, pro: 1, hyper: 2, legendary: 3 }
      const botBias = Number(dragBotBiasByTier[dragTier] ?? 0)
      const jitterDrag = (x) => clamp(Number(x || 50) + botBias + rint(-2, 4), 35, 96)
      for (let i = 0; i < need; i++) {
        const name = generateCarName(used)
        used.add(name.toLowerCase())
        bots.push({
          id: null,
          ownerId: null,
          name,
          livery: dragLivery,
          tier: dragTier,
          price: 0,
          power: jitterDrag(base.power),
          handling: jitterDrag(base.handling),
          aero: jitterDrag(base.aero),
          reliability: jitterDrag(base.reliability),
          tire: jitterDrag(base.tire),
          wear: 0,
          teamLabel: 'BOT',
          imageUrl: null
        })
      }
    } else {
      for (let i = 0; i < need; i++) {
        const name = generateCarName(used)
        used.add(name.toLowerCase())
        bots.push({
          id: null,
          ownerId: null,
          name,
          livery: '⬛',
          tier: 'bot',
          price: 0,
          power: rint(botRange.power[0], botRange.power[1]),
          handling: rint(botRange.handling[0], botRange.handling[1]),
          aero: rint(botRange.aero[0], botRange.aero[1]),
          reliability: rint(botRange.reliability[0], botRange.reliability[1]),
          tire: rint(botRange.tire[0], botRange.tire[1]),
          wear: 0,
          teamLabel: '—',
          imageUrl: null
        })
      }
    }

    // team labels
    const withTeam = []
    for (const c of filtered) {
      const team = await safeCall(getTeamByOwner, [c.ownerId]).catch(() => null)
      withTeam.push({ ...c, teamLabel: teamLabel(team) })
    }

    field = [...withTeam, ...bots].map(c => {
      const label = carLabel(c)
      return { ...c, label, teamLabel: c.teamLabel || '—' }
    }).map(c => applyRaceModeBalanceToCar(c, lockedRaceMode))

    // ✅ lock track + odds for the betting window (transparent, fair)
    lockedTrack = (lockedRaceType === 'drag') ? pickDragTrack() : pickTrack()

    const strengths0 = field.map(c => computeStrength(c, lockedTrack))
    lockedOddsDec = oddsFromStrengths(strengths0, field)

    // Open strategy + betting window
    isStratOpen = true
    isBettingOpen = true

    await safeCall(postMessage, [{
      room: ROOM,
      message: `${lockedRaceType === 'drag' ? 'Drag odds are live!' : 'Place your bets!'}\n` +
        `• /bet <slot> <amount>  (min ${fmtMoney(BET_MIN)})\n` +
        `• Slot = betting board row number (1-${field.length})\n`
    }])

    const previewRows = field.map((c, i) => ({
      label: c.label,
      teamLabel: c.teamLabel,
      odds: formatOdds(lockedOddsDec[i])
    }))
    await safeCall(postMessage, [{
      room: ROOM,
      message: renderGrid(previewRows, {
        title: lockedRaceType === 'drag' ? 'DRAG BETTING BOARD' : 'BETTING BOARD',
        showOdds: true,
        showSetup: false
      })
    }])

    setTimeout(() => {
      isStratOpen = false
      isBettingOpen = false
      startRaceRun()
    }, lockedRaceType === 'drag' ? DRAG_STRAT_MS : STRAT_MS)
  } catch (e) {
    console.error('[f1race] lockEntriesAndOpenStrategy error:', e)
    await safeCall(postMessage, [{ room: ROOM, message: '❌ Could not lock entries.' }])
    cleanup()
  }
}

async function startRaceRun () {
  try {
    isRunning = true
    const track = lockedTrack || (lockedRaceType === 'drag' ? pickDragTrack() : pickTrack())

    // Official grid with slight bias (handling+aero)
    const seeded = field.map((c) => {
      const bias = lockedRaceType === 'drag'
        ? ((Number(c.power || 50) * 1.7 + Number(c.tire || 50) + Number(c.aero || 50)) / 370)
        : ((Number(c.handling || 50) + Number(c.aero || 50)) / 200)
      const roll = Math.random() * 0.12
      return { c, q: roll + bias * 0.08 }
    }).sort((a, b) => b.q - a.q).map(x => x.c)

    field = seeded

    const prizeBreakdown = lockedRaceType === 'drag'
      ? (() => {
          const gross = Math.max(0, Math.floor(Number(lockedEntryGross || 0)))
          const rake = Math.floor(gross * (HOUSE_RAKE_PCT / 100))
          const fromFees = Math.max(0, gross - rake)
          const guaranteed = getDragGuaranteedPurse(lockedDragTier || 'starter')
          return { gross, rake, fromFees, guaranteed, net: fromFees + guaranteed }
        })()
      : prizePoolFromGrossFees(lockedEntryGross, lockedRaceMode)
    const { gross, rake, fromFees, guaranteed, net } = prizeBreakdown
    const poleWinnerOwnerId = field[0]?.ownerId || null

    await postMessage({
      room: ROOM,
      message:
        `💰 Prize Pool: ${fmtMoney(net)} (fees ${fmtMoney(fromFees)} + floor ${fmtMoney(guaranteed)}; rake ${fmtMoney(rake)} from ${fmtMoney(gross)} gross fees)` +
        `${lockedRaceType === 'drag' ? `\nTier: ${String(lockedDragTier || '').toUpperCase()} · Winner takes all.` : ''}`
    })
    await DELAY(500)

    // ── VISUALS: circuit splash + lights ───────────────────────────────
    // Announce track name first (no bold, explicit format)
    await postMessage({
      room: ROOM,
      message: `${lockedRaceType === 'drag' ? '🛣️ Strip Name' : '🏁 Track Name'}: ${track.name.toUpperCase()}`
    })

    await DELAY(600)

    // Then send image
    if (track?.imageUrl) {
      await postMessage({
        room: ROOM,
        message: '',
        images: [track.imageUrl]
      })
      await DELAY(900)
    }

    await DELAY(1200)

    // 2) Pole bonus announcement also feels better pre-start (optional)
    if (lockedRaceType !== 'drag' && poleWinnerOwnerId && POLE_BONUS > 0) {
      const nick = await safeCall(getUserNickname, [poleWinnerOwnerId]).catch(() => null)
      const tag = nick?.replace(/^@/, '') || `<@uid:${poleWinnerOwnerId}>`
      const poleDisplayBonus = Math.floor(POLE_BONUS * getTierPayoutMultiplier(field[0]?.tier))
      await safeCall(postMessage, [{
        room: ROOM,
        message: `🎯 Pole Position Bonus goes to ${tag} (${fmtMoney(poleDisplayBonus)})`
      }])
      await DELAY(800)
    }

    await postMessage({ room: ROOM, message: 'Final checks complete.' })
    await DELAY(900)

    // 3) Now do the dramatic lights
    await sendLightsOutSequence(ROOM)

    // 4) Start the race
    await runRace({
      cars: field,
      track,
      raceType: lockedRaceType,
      prizePool: net,
      payoutPlan: lockedPayoutPlan,
      poleBonus: lockedRaceType === 'drag' ? 0 : POLE_BONUS,
      fastestLapBonus: lockedRaceType === 'drag' ? 0 : FASTEST_LAP_BONUS,
      poleWinnerOwnerId,
      poleWinnerCarId: field[0]?.id ?? null,
      bets,
      lockedOddsDec
    })
  } catch (e) {
    console.error('[f1race] startRaceRun error:', e)
    await safeCall(postMessage, [{ room: ROOM, message: '❌ Race failed to start.' }])
    cleanup()
  }
}

// ── Event rendering (CometChat TV mode) ────────────────────────────────
const LISTENER_GUARD_KEY = '__JAMBOT_F1RACE_LISTENERS__'
if (!globalThis[LISTENER_GUARD_KEY]) {
  globalThis[LISTENER_GUARD_KEY] = true

  bus.on('turn', async ({ legIndex, legsTotal, raceType, raceState, events, track }) => {
    const sig = JSON.stringify(raceState.map(r => [r.index, Math.round(r.progress01 * 100), r.dnf ? 1 : 0]))
    if (_lastProgress === sig && (legIndex % 2 === 1)) return
    _lastProgress = sig

    const msg = raceType === 'drag'
      ? renderDragProgress(raceState, {
        title: `${track.emoji} ${track.name} — PROGRESS`,
        barCells: 24,
        nameWidth: 18
      })
      : renderRaceProgress(raceState, {
        title: `${track.emoji} ${track.name} — LAP ${legIndex + 1}/${legsTotal}`,
        nameWidth: 18
      })

    const lines = []
    lines.push(msg)
    if (Array.isArray(events) && events.length) lines.push(events.slice(0, 3).join('\n'))

    await postMessage({ room: ROOM, message: lines.join('\n') })
  })

  bus.on('raceFinished', async ({ finishOrder, cars, payouts, payoutDetails, betPayouts, betSettlements, track, prizePool, fastestLap }) => {
    try {
      const top = finishOrder.slice(0, Math.min(8, finishOrder.length))
      const payoutByIndex = new Map(
        (Array.isArray(payoutDetails) ? payoutDetails : [])
          .map((row) => [Number(row?.idx), Number(row?.amount || 0)])
      )

      const lines = []
      lines.push(`RESULTS — ${track.emoji} ${track.name}`)
      lines.push(`Prize Pool: ${fmtMoney(prizePool)}`)
      lines.push('')

      const paid = top.slice(0, 5).map((idx, place) => {
        const c = cars[idx]
        const tag = c.ownerId ? `<@uid:${c.ownerId}>` : 'House'
        const pay = c.ownerId ? (payoutByIndex.get(Number(idx)) || 0) : 0
        return `${place + 1}. ${c.label} — ${tag}${pay ? ` · ${fmtMoney(pay)}` : ''}`
      })
      lines.push(...paid)

      if (fastestLap?.ownerId) {
        lines.push('')
        lines.push(`⚡ Fastest Lap: ${fastestLap.label} · Bonus: ${fmtMoney(fastestLap.bonus)}`)
      }

      await postMessage({ room: ROOM, message: '```\n' + lines.join('\n') + '\n```' })

      const winnerIdx = finishOrder?.[0]
      const winnerCar = (winnerIdx != null) ? cars?.[winnerIdx] : null
      if (winnerCar?.imageUrl) {
        await postMessage({
          room: ROOM,
          message: `🏆 Winner photo: **${winnerCar.label}**`,
          images: [winnerCar.imageUrl]
        })
      }

      const raceMap = (payouts && typeof payouts === 'object') ? payouts : {}
      const betMap = (betSettlements && typeof betSettlements === 'object') ? betSettlements : {}
      const users = [...new Set([...Object.keys(raceMap), ...Object.keys(betMap)])]

      if (users.length) {
        const rows = []
        const fmtSignedMoney = (n) => `${n >= 0 ? '+' : '-'}${fmtMoney(Math.abs(n))}`
        rows.push('SETTLEMENT BREAKDOWN')
        rows.push('')

        for (const userId of users.slice(0, 12)) {
          const nick = await safeCall(getUserNickname, [userId]).catch(() => null)
          const tag = nick?.replace(/^@/, '') || `<@uid:${userId}>`
          const raceWin = Math.max(0, Math.floor(Number(raceMap[userId] || 0)))
          const b = betMap[userId] || { staked: 0, returned: 0, net: 0 }
          const betReturned = Math.max(0, Math.floor(Number(b.returned || 0)))
          const betNet = Math.floor(Number(b.net || 0))
          const totalNet = raceWin + betNet
          rows.push(
            `${tag} · Race ${fmtMoney(raceWin)} · Bet return ${fmtMoney(betReturned)} (net ${fmtSignedMoney(betNet)}) · Total net ${fmtSignedMoney(totalNet)}`
          )
        }

        await postMessage({ room: ROOM, message: '```\n' + rows.join('\n') + '\n```' })
      }

      const betWinners = betPayouts && typeof betPayouts === 'object'
        ? Object.entries(betPayouts).filter(([, amt]) => Number(amt) > 0)
        : []
      if (betWinners.length) {
        await postMessage({ room: ROOM, message: '🎟️ Bets settled. Bet return and net are shown in the settlement breakdown.' })
      }
    } finally {
      cleanup()
    }
  })
}

// ── Help ───────────────────────────────────────────────────────────────
export async function handleF1Help (ctx) {
  const room = ctx?.room || ROOM
  const msg = [
    'F1 RACE COMMANDS',
    '',
    `/team create           - create your team (costs ${fmtMoney(TEAM_CREATE_FEE)})`,
    `/team reroll           - randomize team name/badge (costs ${fmtMoney(TEAM_REROLL_FEE)})`,
    '/buycar <tier>         - browse a tier showroom with image options',
    '/buycar <tier> <#>     - buy selected option # from that tier',
    '/mycars                - list your cars',
    '/carstats [name]       - return/profit stats for your garage or one car',
    '/f1stats               - quick garage summary stats',
    '/f1leaderboard [count] - top owners by total car return',
    '/wear [name]           - show wear for all cars or one car',
    '/car <name>            - show your car (image + stats)',
    '/repair <name>         - fully repair wear on one car',
    `/renamecar <name>      - reroll car name randomly (costs ${fmtMoney(CAR_RENAME_FEE)})`,
    '/sellcar <name>        - sell a car back for cash',
    '/carpics               - show photos of your cars',
    '',
    '/gp start <mode>       - start a Grand Prix (rookie/open/elite)',
    '/drag start <tier>     - start a 1v1 drag race (same tier only)',
    '(during entry) type your exact car name to enter',
    `(during betting) /bet <slot> <amount> - bet by board row number shown on board (min ${fmtMoney(BET_MIN)})`
  ].join('\n')

  await postMessage({ room, message: '```\n' + msg + '\n```' })
}
