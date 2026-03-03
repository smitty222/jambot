// src/games/f1race/handlers/commands.js

import { postMessage } from '../../../libs/cometchat.js'
import { readdirSync } from 'fs'
import path from 'path'
import { getUserWallet, debitGameBet } from '../../../database/dbwalletmanager.js'
import { getUserNickname } from '../../../utils/nickname.js'
import { fetchCurrentUsers } from '../../../utils/API.js'

import { createTeam, getTeamByOwner, updateTeamIdentity } from '../../../database/dbteams.js'
import { insertCar, getAllCars, getUserCars, setCarWear, setCarImageUrl } from '../../../database/dbcars.js'

import { bus, safeCall } from '../service.js'
import { runRace, LEGS } from '../simulation.js'
import { pickTrack } from '../utils/track.js'
import { renderGrid, renderRaceProgress, fmtMoney } from '../utils/render.js'

const ROOM = process.env.ROOM_UUID

// ── Economy tuning ─────────────────────────────────────────────────────
const ENTRY_MS = 30_000
const STRAT_MS = 25_000
const MIN_FIELD = 6

const ENTRY_FEE_BY_TIER = {
  starter: Number(process.env.F1_ENTRY_FEE_STARTER ?? 2000),
  pro: Number(process.env.F1_ENTRY_FEE_PRO ?? 3000),
  hyper: Number(process.env.F1_ENTRY_FEE_HYPER ?? 5000),
  legendary: Number(process.env.F1_ENTRY_FEE_LEGENDARY ?? 7500)
}
const HOUSE_RAKE_PCT = Number(process.env.F1_HOUSE_RAKE_PCT ?? 15) // percent
const PRIZE_SPLIT_BY_MODE = {
  rookie: [60, 30, 10], // top 3 paid
  open: [45, 25, 15, 10, 5],
  elite: [50, 23, 13, 9, 5]
}
const POLE_BONUS = Number(process.env.F1_POLE_BONUS ?? 250)
const FASTEST_LAP_BONUS = Number(process.env.F1_FASTEST_LAP_BONUS ?? 300)

const TEAM_CREATE_FEE = Number(process.env.F1_TEAM_CREATE_FEE ?? 50000)
const TEAM_REROLL_FEE = Number(process.env.F1_TEAM_REROLL_FEE ?? 20000)
const REPAIR_COST_PER_WEAR_BY_TIER = {
  starter: Number(process.env.F1_REPAIR_COST_PER_POINT_STARTER ?? 40),
  pro: Number(process.env.F1_REPAIR_COST_PER_POINT_PRO ?? 70),
  hyper: Number(process.env.F1_REPAIR_COST_PER_POINT_HYPER ?? 110),
  legendary: Number(process.env.F1_REPAIR_COST_PER_POINT_LEGENDARY ?? 160)
}

// Betting
const BET_MIN = Number(process.env.F1_BET_MIN ?? 25)
const BET_MAX = Number(process.env.F1_BET_MAX ?? 10000)
const ODDS_EDGE_PCT = Number(process.env.F1_ODDS_EDGE_PCT ?? 15) // house edge in odds calc

// Car tiers: higher ceiling, not guaranteed wins.
const CAR_TIERS = {
  starter: { price: 30000, base: { power: 56, handling: 55, aero: 54, reliability: 57, tire: 55 }, livery: '🟥' },
  pro: { price: 90000, base: { power: 63, handling: 62, aero: 61, reliability: 64, tire: 62 }, livery: '🟦' },
  hyper: { price: 200000, base: { power: 70, handling: 69, aero: 68, reliability: 71, tire: 69 }, livery: '🟩' },
  legendary: { price: 400000, base: { power: 76, handling: 75, aero: 74, reliability: 77, tire: 75 }, livery: '🟪' }
}
const RACE_MODES = {
  rookie: { label: 'ROOKIE', allowedTiers: new Set(['starter', 'pro']), payoutPlan: PRIZE_SPLIT_BY_MODE.rookie },
  open: { label: 'OPEN', allowedTiers: new Set(['starter', 'pro', 'hyper', 'legendary']), payoutPlan: PRIZE_SPLIT_BY_MODE.open },
  elite: { label: 'ELITE', allowedTiers: new Set(['hyper', 'legendary']), payoutPlan: PRIZE_SPLIT_BY_MODE.elite }
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

const CAR_ASSETS_DIR = path.resolve(process.cwd(), 'src/games/f1race/assets/cars')
const ALLOWED_IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

function listTierImageFiles (tierKey) {
  const tier = String(tierKey || '').toLowerCase()
  if (!tier) return []

  try {
    const dir = path.join(CAR_ASSETS_DIR, tier)
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => ALLOWED_IMAGE_EXT.has(path.extname(name).toLowerCase()))
  } catch {
    return []
  }
}

function pickCarImageUrl (tierKey) {
  const tier = String(tierKey || '').toLowerCase()
  const files = listTierImageFiles(tier)
  if (!files.length) return null

  const picked = files[Math.floor(Math.random() * files.length)]
  return `${CAR_IMAGE_BASE_URL}/${tier}/${encodeURIComponent(picked)}`
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
  const num = String(car.id || rint(10, 99)).padStart(2, '0')
  return `${liv} #${num} ${car.name}`.trim()
}

function teamLabel (team) {
  if (!team) return '—'
  const badge = String(team.badge || '').trim()
  const nm = String(team.name || '').trim()
  const short = nm.length > 10 ? nm.slice(0, 9) + '…' : nm
  return (badge ? `${badge} ${short}` : short).trim()
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

function estimateFullRepairCost (car) {
  const tierKey = normalizeTierKey(car?.tier)
  const wearToRemove = Math.max(0, Math.floor(Number(car?.wear || 0)))
  return wearToRemove * getTierRepairCostPerPoint(tierKey)
}

function prizePoolFromGrossFees (grossFees) {
  const gross = Math.max(0, Math.floor(Number(grossFees || 0)))
  const rake = Math.floor(gross * (HOUSE_RAKE_PCT / 100))
  const net = Math.max(0, gross - rake)
  return { gross, rake, net }
}

function parseArg (txt, re) {
  return (String(txt || '').match(re) || [])[1]
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

function oddsFromStrengths (strengths) {
  const sum = strengths.reduce((a, b) => a + b, 0)
  const edge = clamp(Number(ODDS_EDGE_PCT || 15) / 100, 0, 0.35)

  return strengths.map(s => {
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
  const BADGES = ['🟥', '🟦', '🟩', '🟨', '🟪', '⬛', '⬜', '🟧']
  const COLORS = ['Crimson', 'Cobalt', 'Emerald', 'Golden', 'Violet', 'Onyx', 'Ivory', 'Tangerine']
  const ANIMALS = ['Falcons', 'Vipers', 'Wolves', 'Ravens', 'Cobras', 'Sharks', 'Panthers', 'Dragons']
  const TECH = ['Apex', 'Turbo', 'Quantum', 'Neon', 'Vortex', 'Pulse', 'Nova', 'Titan']
  const NOUNS = ['Racing', 'Motorsport', 'GP', 'Works', 'Engineering', 'Dynamics', 'Performance', 'Autosport']
  const CITIES = ['Monaco', 'Silverstone', 'Daytona', 'Suzuka', 'Imola', 'Austin', 'Spa', 'Monza']

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
  const formats = [
    () => `${pick(TECH)} ${pick(ANIMALS)}`,
    () => `${pick(COLORS)} ${pick(NOUNS)}`,
    () => `${pick(CITIES)} ${pick(ANIMALS)}`,
    () => `${pick(TECH)} ${pick(NOUNS)}`
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
let lockedPayoutPlan = PRIZE_SPLIT_BY_MODE.open

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
    if (typeof bal === 'number' && bal < TEAM_CREATE_FEE) {
      await postMessage({ room, message: `❗ ${nick}, creating a team costs **${fmtMoney(TEAM_CREATE_FEE)}**. Balance: **${fmtMoney(bal)}**.` })
      return
    }
    if (TEAM_CREATE_FEE > 0) await safeCall(debitGameBet, [userId, TEAM_CREATE_FEE])

    const { name, badge } = generateTeamIdentity()
    createTeam({ ownerId: userId, ownerName: nick, name, badge })
    await postMessage({ room, message: `🏁 ${nick} founded a new team: **${name}** ${badge}\nGarage Level: **1**` })
    return
  }

  if (sub.startsWith('reroll')) {
    if (!existing) {
      await postMessage({ room, message: `❗ ${nick}, you don’t have a team yet. Use **/team create**.` })
      return
    }
    const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
    if (typeof bal === 'number' && bal < TEAM_REROLL_FEE) {
      await postMessage({ room, message: `❗ ${nick}, reroll costs **${fmtMoney(TEAM_REROLL_FEE)}**. Balance: **${fmtMoney(bal)}**.` })
      return
    }
    if (TEAM_REROLL_FEE > 0) await safeCall(debitGameBet, [userId, TEAM_REROLL_FEE])

    const { name, badge } = generateTeamIdentity()
    await safeCall(updateTeamIdentity, [userId, name, badge])
    await postMessage({ room, message: `🎲 ${nick} rebranded to **${name}** ${badge}` })
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
  const ADJ = ['Neon', 'Apex', 'Turbo', 'Crimson', 'Midnight', 'Solar', 'Phantom', 'Vortex', 'Cobalt', 'Titan']
  const NOUN = ['Viper', 'Wraith', 'Comet', 'Falcon', 'Raven', 'Blitz', 'Mirage', 'Arrow', 'Specter', 'Nova']
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
  const tierKey = (text.match(/^\/buycar\s*(\w+)?/i) || [])[1]?.toLowerCase()
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  if (!tierKey || tierKey === 'help' || tierKey === 'shop') {
    const lines = [
      '**F1 Garage — Buy a Car**',
      '',
      ...Object.entries(CAR_TIERS).map(([k, v]) => `• **${k}** — ${fmtMoney(v.price)}`),
      '',
      'Buy: `/buycar starter` (or pro/hyper/legendary)'
    ]
    await postMessage({ room, message: lines.join('\n') })
    return
  }

  const tier = CAR_TIERS[tierKey]
  if (!tier) {
    await postMessage({ room, message: `❗ Unknown tier \`${tierKey}\`. Try /buycar` })
    return
  }

  const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
  if (typeof bal !== 'number') {
    await postMessage({ room, message: `⚠️ ${nick}, couldn’t read your wallet. Try again.` })
    return
  }
  if (bal < tier.price) {
    await postMessage({ room, message: `❗ ${nick}, you need **${fmtMoney(tier.price)}**. Balance: **${fmtMoney(bal)}**.` })
    return
  }

  await safeCall(debitGameBet, [userId, tier.price])

  const all = await safeCall(getAllCars).catch(() => [])
  const used = new Set((all || []).map(c => String(c.name || '').toLowerCase()))
  const name = generateCarName(used)

  // auto-create a team if missing
  let team = await safeCall(getTeamByOwner, [userId]).catch(() => null)
  if (!team) {
    const { name: teamName, badge } = generateTeamIdentity()
    createTeam({ ownerId: userId, ownerName: nick, name: teamName, badge })
    team = await safeCall(getTeamByOwner, [userId]).catch(() => null)
    await postMessage({ room, message: `🏁 ${nick} was assigned a team: **${teamName}** ${badge}` })
  }

  const jitter = (x) => clamp(x + rint(-3, 3), 35, 92)

  // ✅ persistent car imageUrl (tier-based)
  const imageUrl = pickCarImageUrl(tierKey)

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
    message: `✅ ${nick} bought a **${tierKey.toUpperCase()}** car: **${tier.livery} #${String(id).padStart(2, '0')} ${name}**\n💰 Balance: **${fmtMoney(updated)}**`,
    images: imageUrl ? [imageUrl] : undefined
  })
}

export async function handleMyCars (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')
  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  await ensurePersistentCarImages(cars)

  if (!cars?.length) {
    await postMessage({ room, message: `${nick}, you don’t own any cars yet. Try **/buycar**.` })
    return
  }

  const lines = []
  lines.push(`${nick}'s Garage (${cars.length})`)
  lines.push('')

  for (const c of cars.slice(0, 12)) {
    const wear = Number(c.wear || 0)
    const wearTag = wear >= 80 ? '⚠️' : (wear >= 60 ? '🟡' : '🟢')
    lines.push(`• ${carLabel(c)} — Tier ${String(c.tier || '—').toUpperCase()} · Wear ${wear}% ${wearTag} · W ${c.wins || 0} / R ${c.races || 0}`)
  }

  lines.push('')
  lines.push('Show: `/car <car name>`')
  lines.push('Repair: `/repair <car name>`')
  await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
}

export async function handleCarShow (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const nameArg = parseArg(text, /^\/car\s+(.+)$/i)
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  if (!nameArg) {
    await postMessage({ room, message: `Usage: **/car <car name>**` })
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

  await postMessage({
    room,
    message:
      `🏎️ **${carLabel(car)}**\n` +
      `Team: **${car.teamId ? 'Assigned' : '—'}** · Tier: **${tierKey.toUpperCase()}** · Wear: **${wear}%** · W ${car.wins || 0} / R ${car.races || 0}\n` +
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
  if (typeof bal !== 'number' || bal < cost) {
    await postMessage({
      room,
      message: `❗ ${nick}, full repair for ${carLabel(car)} costs **${fmtMoney(cost)}** (${wearToRemove} wear × ${fmtMoney(costPerPoint)}). Balance: **${fmtMoney(bal)}**.`
    })
    return
  }

  await safeCall(debitGameBet, [userId, cost])
  await safeCall(setCarWear, [car.id, Math.max(0, currentWear - wearToRemove)])
  const updated = await safeCall(getUserWallet, [userId]).catch(() => null)

  await postMessage({
    room,
    message: `🔧 ${nick} repaired ${carLabel(car)}: **-${wearToRemove}% wear** for **${fmtMoney(cost)}**. Wear is now **0%**.\n💰 Balance: **${fmtMoney(updated)}**`
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
// /bet <car#> <amount>
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

  // Debit stake immediately
  await safeCall(debitGameBet, [sender, amt])

  // Store slip (new format)
  ;(bets[sender] ||= []).push({ betKey, amount: amt })

  // Display odds if available (should be, once you compute odds during betting)
  const dec = lockedOddsDec?.[idx]
  const oddsLabel = Number.isFinite(dec) ? `${dec.toFixed(2)}x` : '—'
  await postMessage({
    room,
    message: `🎟️ ${nick} bets ${fmtMoney(amt)} on #${idx + 1} ${car.label} (odds ${oddsLabel})`
  })
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
      'Tier entry fees (charged at lock-in):\n' +
      `• STARTER: ${fmtMoney(getTierEntryFee('starter'))}\n` +
      `• PRO: ${fmtMoney(getTierEntryFee('pro'))}\n` +
      `• HYPER: ${fmtMoney(getTierEntryFee('hyper'))}\n` +
      `• LEGENDARY: ${fmtMoney(getTierEntryFee('legendary'))}`
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

  setTimeout(lockEntriesAndOpenStrategy, ENTRY_MS)
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

  entered.add(car.id)
  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  await safeCall(postMessage, [{ room: ROOM, message: `✅ ${nick?.replace(/^@/, '')} entered ${carLabel(car)}!` }])
}

// ── Internal helpers ───────────────────────────────────────────────────
function cleanup () {
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
  lockedPayoutPlan = PRIZE_SPLIT_BY_MODE.open
}

async function lockEntriesAndOpenStrategy () {
  try {
    isAccepting = false

    const all = await safeCall(getAllCars).catch(() => [])
    const enteredCars = (all || []).filter(c => entered.has(c.id))
    const need = Math.max(0, MIN_FIELD - enteredCars.length)

    // Charge tier-based entry fees now
    const filtered = []
    let totalEntryGross = 0
    for (const c of enteredCars) {
      const ownerId = c.ownerId
      const tierKey = normalizeTierKey(c.tier)
      const entryFee = getTierEntryFee(tierKey)
      const bal = await safeCall(getUserWallet, [ownerId]).catch(() => null)
      const nick = await safeCall(getUserNickname, [ownerId]).catch(() => '@user')
      if (typeof bal !== 'number' || bal < entryFee) {
        await safeCall(postMessage, [{
          room: ROOM,
          message: `❗ ${nick} could not pay ${tierKey.toUpperCase()} entry fee (${fmtMoney(entryFee)}). ${carLabel(c)} removed from grid.`
        }])
        continue
      }
      await safeCall(debitGameBet, [ownerId, entryFee])
      totalEntryGross += entryFee
      filtered.push(c)
    }
    lockedEntryGross = totalEntryGross

    // bots
    const bots = []
    const used = new Set((all || []).map(c => String(c.name || '').toLowerCase()))
    for (const c of filtered) used.add(String(c.name || '').toLowerCase())

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
        power: rint(50, 70),
        handling: rint(50, 70),
        aero: rint(48, 68),
        reliability: rint(52, 72),
        tire: rint(48, 70),
        wear: 0,
        teamLabel: '—',
        imageUrl: null
      })
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
    })

    // ✅ lock track + odds for the betting window (transparent, fair)
lockedTrack = pickTrack()

const strengths0 = field.map(c => computeStrength(c, lockedTrack))
lockedOddsDec = oddsFromStrengths(strengths0)

    // Open strategy + betting window
    isStratOpen = true
    isBettingOpen = true

    await safeCall(postMessage, [{
      room: ROOM,
      message: `Place your bets!\n` +
        `• /bet <car#> <amount>  (min ${fmtMoney(BET_MIN)})\n`
    }])

    const previewRows = field.map((c, i) => ({
  label: c.label,
  teamLabel: c.teamLabel,
  odds: formatOdds(lockedOddsDec[i])
}))
await safeCall(postMessage, [{
  room: ROOM,
  message: renderGrid(previewRows, { title: 'BETTING BOARD', showOdds: true })
}])

    setTimeout(() => {
      isStratOpen = false
      isBettingOpen = false
      startRaceRun()
    }, STRAT_MS)
  } catch (e) {
    console.error('[f1race] lockEntriesAndOpenStrategy error:', e)
    await safeCall(postMessage, [{ room: ROOM, message: '❌ Could not lock entries.' }])
    cleanup()
  }
}

async function startRaceRun () {
  try {
    isRunning = true
    const track = lockedTrack || pickTrack()

    // Official grid with slight bias (handling+aero)
    const seeded = field.map((c) => {
      const bias = (Number(c.handling || 50) + Number(c.aero || 50)) / 200
      const roll = Math.random() * 0.12
      return { c, q: roll + bias * 0.08 }
    }).sort((a, b) => b.q - a.q).map(x => x.c)

    field = seeded

    const { gross, rake, net } = prizePoolFromGrossFees(lockedEntryGross)
    const poleWinnerOwnerId = field[0]?.ownerId || null

    // ── VISUALS: circuit splash + lights ───────────────────────────────
    // Announce track name first (no bold, explicit format)
await postMessage({
  room: ROOM,
  message: `🏁 Track Name: ${track.name.toUpperCase()}`
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
if (poleWinnerOwnerId && POLE_BONUS > 0) {
  const nick = await safeCall(getUserNickname, [poleWinnerOwnerId]).catch(() => null)
  const tag = nick?.replace(/^@/, '') || `<@uid:${poleWinnerOwnerId}>`
  await safeCall(postMessage, [{
    room: ROOM,
    message: `🎯 Pole Position Bonus goes to ${tag} (${fmtMoney(POLE_BONUS)})`
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
  prizePool: net,
  payoutPlan: lockedPayoutPlan,
  poleBonus: POLE_BONUS,
  fastestLapBonus: FASTEST_LAP_BONUS,
  poleWinnerOwnerId,
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

  bus.on('turn', async ({ legIndex, legsTotal, raceState, events, track }) => {
    const sig = JSON.stringify(raceState.map(r => [r.index, Math.round(r.progress01 * 100), r.dnf ? 1 : 0]))
    if (_lastProgress === sig && (legIndex % 2 === 1)) return
    _lastProgress = sig

    const title = `${track.emoji} ${track.name} — LAP ${legIndex + 1}/${legsTotal}`
    const msg = renderRaceProgress(raceState, { title, barCells: 14, nameWidth: 18 })

    const lines = []
    lines.push(msg)
    if (Array.isArray(events) && events.length) lines.push(events.slice(0, 3).join('\n'))

    await postMessage({ room: ROOM, message: lines.join('\n') })
  })

  bus.on('raceFinished', async ({ finishOrder, cars, payouts, betPayouts, track, prizePool, fastestLap }) => {
    try {
      const top = finishOrder.slice(0, Math.min(8, finishOrder.length))

      const lines = []
      lines.push(`RESULTS — ${track.emoji} ${track.name}`)
      lines.push(`Prize Pool: ${fmtMoney(prizePool)}`)
      lines.push('')

      const paid = top.slice(0, 5).map((idx, place) => {
        const c = cars[idx]
        const tag = c.ownerId ? `<@uid:${c.ownerId}>` : 'House'
        const pay = c.ownerId ? (payouts?.[c.ownerId] || 0) : 0
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

      const betWinners = betPayouts && typeof betPayouts === 'object'
        ? Object.entries(betPayouts).filter(([, amt]) => Number(amt) > 0)
        : []

      if (betWinners.length) {
        for (const [userId, amt] of betWinners.slice(0, 10)) {
          const nick = await safeCall(getUserNickname, [userId]).catch(() => null)
          const tag = nick?.replace(/^@/, '') || `<@uid:${userId}>`
          await postMessage({ room: ROOM, message: `💵 ${tag} wins **${fmtMoney(amt)}** on bets` })
        }

        await postMessage({ room: ROOM, message: '🎟️ Bets settled. Winners have been paid.' })
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
    '/buycar <tier>         - buy a car (starter/pro/hyper/legendary)',
    '/mycars                - list your cars',
    '/car <name>            - show your car (image + stats)',
    '/repair <name>         - fully repair wear on one car',
    '/carpics               - show photos of your cars',
    '',
    '/gp start <mode>       - start a Grand Prix (rookie/open/elite)',
    '(during entry) type your exact car name to enter',
    `(during betting) /bet <car#> <amount> - bet a car to win (min ${fmtMoney(BET_MIN)})`
  ].join('\n')

  await postMessage({ room, message: '```\n' + msg + '\n```' })
}
