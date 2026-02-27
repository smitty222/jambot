// src/games/f1race/handlers/commands.js

import { postMessage } from '../../../libs/cometchat.js'
import { getUserWallet, debitGameBet } from '../../../database/dbwalletmanager.js'
import { getUserNickname } from '../../../utils/nickname.js'
import { fetchCurrentUsers } from '../../../utils/API.js'

import { createTeam, getTeamByOwner, updateTeamIdentity } from '../../../database/dbteams.js'
import { insertCar, getAllCars, getUserCars, setCarWear } from '../../../database/dbcars.js'

import { bus, safeCall } from '../service.js'
import { runRace, LEGS } from '../simulation.js'
import { pickTrack } from '../utils/track.js'
import { renderGrid, renderRaceProgress, fmtMoney } from '../utils/render.js'

const ROOM = process.env.ROOM_UUID

// ── Economy tuning ─────────────────────────────────────────────────────
const ENTRY_MS = 30_000
const STRAT_MS = 25_000
const MIN_FIELD = 6

const ENTRY_FEE = Number(process.env.F1_ENTRY_FEE ?? 2000)
const HOUSE_RAKE_PCT = Number(process.env.F1_HOUSE_RAKE_PCT ?? 15) // percent
const PRIZE_SPLIT = [45, 25, 15, 10, 5]
const POLE_BONUS = Number(process.env.F1_POLE_BONUS ?? 250)
const FASTEST_LAP_BONUS = Number(process.env.F1_FASTEST_LAP_BONUS ?? 300)

const TEAM_CREATE_FEE = Number(process.env.F1_TEAM_CREATE_FEE ?? 50000)
const TEAM_REROLL_FEE = Number(process.env.F1_TEAM_REROLL_FEE ?? 20000)

// Betting
const BET_MIN = Number(process.env.F1_BET_MIN ?? 25)
const BET_MAX = Number(process.env.F1_BET_MAX ?? 10000)
const ODDS_EDGE_PCT = Number(process.env.F1_ODDS_EDGE_PCT ?? 15) // house edge in odds calc

// Car tiers
const CAR_TIERS = {
  starter: { price: 30000, base: { power: 55, handling: 55, aero: 52, reliability: 58, tire: 54 }, livery: '🟥' },
  pro: { price: 90000, base: { power: 65, handling: 64, aero: 62, reliability: 62, tire: 60 }, livery: '🟦' },
  hyper: { price: 200000, base: { power: 74, handling: 72, aero: 70, reliability: 66, tire: 66 }, livery: '🟩' },
  legendary: { price: 400000, base: { power: 80, handling: 78, aero: 76, reliability: 70, tire: 70 }, livery: '🟪' }
}
const DEFAULT_TIRE = 'med'
const DEFAULT_MODE = 'norm'

const TIRES = ['soft', 'med', 'hard']
const MODES = ['push', 'norm', 'save']

// ── Visuals: car images (tier pools) ───────────────────────────────────
// Add raw GitHub URLs (recommended) or any stable image URL.
// Example raw URL pattern:
// https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/cars/starter_1.png
const CAR_IMAGE_POOLS = {
  starter: [
    // 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/cars/starter_1.png'
  ],
  pro: [
    // 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/cars/pro_1.png'
  ],
  hyper: [
    // 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/cars/hyper_1.png'
  ],
  legendary: [
    // 'https://raw.githubusercontent.com/smitty222/jambot/main/src/games/f1race/assets/cars/legendary_1.png'
  ]
}

function pickCarImageUrl (tierKey) {
  const pool = CAR_IMAGE_POOLS[String(tierKey || '').toLowerCase()] || []
  if (!pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)]
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

function prizePoolFromEntries (entries) {
  const gross = Math.floor(entries * ENTRY_FEE)
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

  // tire choice effect (pre-race expectation)
  const t = String(car.tireChoice || 'med').toLowerCase()
  if (t === 'soft') base *= 1.03
  else if (t === 'hard') base *= 0.99
  else base *= 1.01

  // mode choice effect (pre-race)
  const m = String(car.modeChoice || 'norm').toLowerCase()
  if (m === 'push') base *= 1.02
  else if (m === 'save') base *= 0.99

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
    const paidP = p * (1 - edge)
    const dec = 1 / Math.max(0.0005, paidP)
    const clamped = clamp(dec, 1.40, 15.0)
    return Number(clamped.toFixed(2))
  })
}

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
let field = [] // cars in race (with label, teamLabel, tireChoice, modeChoice)

let carChoices = new Map() // ownerId -> { tire, mode }
let lockedOddsDec = [] // index-aligned to field
let bets = {} // userId -> [{carIndex, amount}]

let _lastProgress = null

let lockedTrack = null

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
  lines.push('Repair: `/repaircar <car name>` (reduces wear)')
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

  await postMessage({
    room,
    message:
      `🏎️ **${carLabel(car)}**\n` +
      `Team: **${car.teamId ? 'Assigned' : '—'}** · Tier: **${tierKey.toUpperCase()}** · Wear: **${wear}%** · W ${car.wins || 0} / R ${car.races || 0}`,
    images: car.imageUrl ? [car.imageUrl] : undefined
  })
}

export async function handleRepairCar (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()
  const nameArg = parseArg(text, /^\/repaircar\s+(.+)$/i)
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  if (!nameArg) {
    await postMessage({ room, message: `Usage: **/repaircar <car name>**` })
    return
  }

  const cars = await safeCall(getUserCars, [userId]).catch(() => [])
  const car = cars.find(c => String(c.name || '').toLowerCase() === String(nameArg).toLowerCase()) ||
              cars.find(c => String(c.name || '').toLowerCase().includes(String(nameArg).toLowerCase()))

  if (!car) {
    await postMessage({ room, message: `❗ ${nick}, couldn’t find that car in your garage.` })
    return
  }

  const wear = Number(car.wear || 0)
  if (wear <= 0) {
    await postMessage({ room, message: `✅ ${carLabel(car)} is already in perfect condition.` })
    return
  }

  const tier = String(car.tier || 'starter').toLowerCase()
  const mult = (tier === 'legendary') ? 900 : (tier === 'hyper') ? 650 : (tier === 'pro') ? 450 : 300
  const cost = Math.max(1000, Math.floor(wear * mult))

  const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
  if (typeof bal !== 'number' || bal < cost) {
    await postMessage({ room, message: `❗ Repair cost is **${fmtMoney(cost)}**. Your balance: **${fmtMoney(bal)}**.` })
    return
  }

  await safeCall(debitGameBet, [userId, cost])
  await safeCall(setCarWear, [car.id, 0])
  await postMessage({ room, message: `🔧 ${nick} repaired ${carLabel(car)} for **${fmtMoney(cost)}**. Wear reset to 0%.` })
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
export async function startF1Race () {
  if (isAccepting || isStratOpen || isRunning) {
    await safeCall(postMessage, [{ room: ROOM, message: '⛔ A Grand Prix is already in progress.' }])
    return
  }

  isAccepting = true
  isStratOpen = false
  isRunning = false
  isBettingOpen = false
  entered.clear()
  eligibleByName = new Map()
  field = []
  carChoices = new Map()
  lockedOddsDec = []
  bets = {}
  _lastProgress = null

  const all = await safeCall(getAllCars).catch(() => [])
  const activeIds = await safeCall(fetchCurrentUsers).catch(() => [])

  const avail = (all || []).filter(c => c.ownerId && activeIds.includes(c.ownerId) && !c.retired)
  for (const c of avail) eligibleByName.set(String(c.name || '').toLowerCase(), c)

  await safeCall(postMessage, [{
    room: ROOM,
    message: `🏎️ **GRAND PRIX STARTING!** Owners: type your car’s exact name in the next ${ENTRY_MS / 1000}s to enter.\nEntry fee: **${fmtMoney(ENTRY_FEE)}** (charged at lock-in).`
  }])

  if (avail.length) {
    const lines = []
    lines.push('AVAILABLE CARS (owners only — type exact name to enter)')
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
    await safeCall(postMessage, [{ room: ROOM, message: '⚠️ No user cars detected online — bots will fill the grid.' }])
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

/*export async function handleTireChoice (ctx) {
  if (!isStratOpen) return
  const sender = ctx?.sender
  const txt = String(ctx?.message || '').trim()
  const m = txt.match(/^\/tire\s+(soft|med|hard)\b/i)
  if (!m) return

  const tire = m[1].toLowerCase()
  const prev = carChoices.get(sender) || {}
  carChoices.set(sender, { ...prev, tire })

  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  await safeCall(postMessage, [{ room: ROOM, message: `🛞 ${nick} locks **${tire.toUpperCase()}** tires.` }])
}

export async function handleModeChoice (ctx) {
  if (!isStratOpen) return
  const sender = ctx?.sender
  const txt = String(ctx?.message || '').trim()
  const m = txt.match(/^\/mode\s+(push|norm|save)\b/i)
  if (!m) return

  const mode = m[1].toLowerCase()
  const prev = carChoices.get(sender) || {}
  carChoices.set(sender, { ...prev, mode })

  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  await safeCall(postMessage, [{ room: ROOM, message: `🎛️ ${nick} sets mode **${mode.toUpperCase()}**.` }])
}*/

// ── Internal helpers ───────────────────────────────────────────────────
function cleanup () {
  isAccepting = false
  isStratOpen = false
  isRunning = false
  isBettingOpen = false
  entered.clear()
  eligibleByName = new Map()
  field = []
  carChoices = new Map()
  lockedOddsDec = []
  bets = {}
  _lastProgress = null
}

function applyChoicesToField () {
  field = field.map(c => {
    if (!c?.ownerId) return c
    const choice = carChoices.get(c.ownerId) || {}
    const tireChoice = TIRES.includes(choice.tire) ? choice.tire : (c.tireChoice || 'med')
    const modeChoice = MODES.includes(choice.mode) ? choice.mode : (c.modeChoice || 'norm')
    return { ...c, tireChoice, modeChoice }
  })
}

async function lockEntriesAndOpenStrategy () {
  try {
    isAccepting = false

    const all = await safeCall(getAllCars).catch(() => [])
    const enteredCars = (all || []).filter(c => entered.has(c.id))
    const need = Math.max(0, MIN_FIELD - enteredCars.length)

    // Charge entry fees now
    const filtered = []
    for (const c of enteredCars) {
      const ownerId = c.ownerId
      const bal = await safeCall(getUserWallet, [ownerId]).catch(() => null)
      const nick = await safeCall(getUserNickname, [ownerId]).catch(() => '@user')
      if (typeof bal !== 'number' || bal < ENTRY_FEE) {
        await safeCall(postMessage, [{
          room: ROOM,
          message: `❗ ${nick} could not pay entry fee (${fmtMoney(ENTRY_FEE)}). ${carLabel(c)} removed from grid.`
        }])
        continue
      }
      await safeCall(debitGameBet, [ownerId, ENTRY_FEE])
      filtered.push(c)
    }

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
      const ownerId = c.ownerId || null
      return { ...c, label, teamLabel: c.teamLabel || '—', tireChoice: DEFAULT_TIRE, modeChoice: DEFAULT_MODE }
    })

    // ✅ lock track + odds for the betting window (transparent, fair)
lockedTrack = pickTrack()

// Apply current choices (or defaults) before odds
applyChoicesToField()

const strengths0 = field.map(c => computeStrength(c, lockedTrack))
lockedOddsDec = oddsFromStrengths(strengths0)

    // Open strategy + betting window
    isStratOpen = true
    isBettingOpen = true

    await safeCall(postMessage, [{
      room: ROOM,
      message: `Place your bets!\n` +
        //`• /tire soft|med|hard\n` +
        //`• /mode push|norm|save\n` +
        `• /bet <car#> <amount>  (min ${fmtMoney(BET_MIN)})\n`
        //`Default: MED + NORM`
    }])

    const previewRows = field.map((c, i) => ({
  label: c.label,
  teamLabel: c.teamLabel,
  odds: formatOdds(lockedOddsDec[i]),
  tire: c.tireChoice,
  mode: c.modeChoice
}))
await safeCall(postMessage, [{
  room: ROOM,
  message: renderGrid(previewRows, { title: 'BETTING BOARD', showOdds: true })
}])

    setTimeout(() => {
      isStratOpen = false
      isBettingOpen = false
      applyChoicesToField()
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

    const userEntries = field.filter(c => c.ownerId).length
    const { gross, rake, net } = prizePoolFromEntries(userEntries)
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
  payoutPlan: PRIZE_SPLIT,
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
    '/repaircar <name>      - repair wear (cost scales with wear)',
    '',
    '/gp start              - start a Grand Prix',
    '(during entry) type your exact car name to enter',
    '(during strategy) /tire soft|med|hard · /mode push|norm|save',
    `/bet <car#> <amount>   - bet a car to win (min ${fmtMoney(BET_MIN)})`
  ].join('\n')

  await postMessage({ room, message: '```\n' + msg + '\n```' })
}