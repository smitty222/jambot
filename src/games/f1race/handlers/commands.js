// src/games/f1race/handlers/commands.js

import { postMessage } from '../../../libs/cometchat.js'
import { getUserWallet, debitGameBet, creditGameWin } from '../../../database/dbwalletmanager.js'
import { getUserNickname } from '../../../utils/nickname.js'
import { fetchCurrentUsers } from '../../../utils/API.js'

import { createTeam, getTeamByOwner, updateTeamIdentity } from '../../../database/dbteams.js'
import { insertCar, getAllCars, getUserCars, setCarWear, setCarTeam } from '../../../database/dbcars.js'

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
const PRIZE_SPLIT = [45, 25, 15, 10, 5] // top 5 %
const BET_MS = 0 // not used yet (you can add later)

// Car tiers (expensive)
const CAR_TIERS = {
  starter: { price: 30000, base: { power: 55, handling: 55, aero: 52, reliability: 58, tire: 54 }, livery: '🟥' },
  pro: { price: 90000, base: { power: 65, handling: 64, aero: 62, reliability: 62, tire: 60 }, livery: '🟦' },
  hyper: { price: 200000, base: { power: 74, handling: 72, aero: 70, reliability: 66, tire: 66 }, livery: '🟩' },
  legendary: { price: 400000, base: { power: 80, handling: 78, aero: 76, reliability: 70, tire: 70 }, livery: '🟪' }
}

const TIRES = ['soft', 'med', 'hard']
const MODES = ['push', 'norm', 'save']

// ── Helpers ────────────────────────────────────────────────────────────
function rint (min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function clamp (n, a, b) { return Math.max(a, Math.min(b, n)) }

function carLabel (car) {
  const liv = String(car.livery || '').trim()
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

// ── Race state ─────────────────────────────────────────────────────────
let isAccepting = false
let isStratOpen = false
let isRunning = false

const entered = new Set() // carId
let eligibleByName = new Map() // nameLower -> car
let field = [] // cars in race (with label, teamLabel, tireChoice, modeChoice)
let carChoices = new Map() // ownerId -> { tire, mode }

let _lastProgress = null

export function isWaitingForEntries () { return isAccepting === true }

// ── Commands ───────────────────────────────────────────────────────────

export async function handleTeamCommand (ctx) {
  const room = ctx?.room || ROOM
  const userId = ctx?.sender
  const text = String(ctx?.message || '').trim()

  const sub = (text.match(/^\/team\s*(.*)$/i) || [])[1]?.trim().toLowerCase() || ''
  const nick = await safeCall(getUserNickname, [userId]).catch(() => '@user')

  // If they already have a team, show it (and optionally allow /team reroll)
  const existing = await safeCall(getTeamByOwner, [userId]).catch(() => null)

  // /team create  OR  /team
  if (!sub || sub.startsWith('create')) {
    if (existing) {
      await postMessage({ room, message: `🏎️ ${nick}, your team is **${existing.name}** ${existing.badge || ''}`.trim() })
      await postMessage({ room, message: `Tip: Want a new random team? Use **/team reroll** (costs money).` })
      return
    }

    // Team creation fee (optional)
    const fee = Number(process.env.F1_TEAM_CREATE_FEE ?? 25000)
    const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
    if (typeof bal === 'number' && bal < fee) {
      await postMessage({ room, message: `❗ ${nick}, creating a team costs **${fmtMoney(fee)}**. Your balance: **${fmtMoney(bal)}**.` })
      return
    }
    if (fee > 0) await safeCall(debitGameBet, [userId, fee])

    const { name, badge } = generateTeamIdentity()
    const teamId = createTeam({ ownerId: userId, ownerName: nick, name, badge })

    await postMessage({
      room,
      message: `🏁 ${nick} founded a new team: **${name}** ${badge}\nGarage Level: **1**`
    })
    return
  }

  // Optional: /team reroll (money sink)
  if (sub.startsWith('reroll')) {
    if (!existing) {
      await postMessage({ room, message: `❗ ${nick}, you don’t have a team yet. Use **/team create**.` })
      return
    }

    const rerollFee = Number(process.env.F1_TEAM_REROLL_FEE ?? 5000)
    const bal = await safeCall(getUserWallet, [userId]).catch(() => null)
    if (typeof bal === 'number' && bal < rerollFee) {
      await postMessage({ room, message: `❗ ${nick}, a reroll costs **${fmtMoney(rerollFee)}**. Your balance: **${fmtMoney(bal)}**.` })
      return
    }
    if (rerollFee > 0) await safeCall(debitGameBet, [userId, rerollFee])

    const { name, badge } = generateTeamIdentity()
    // easiest: update teams row (you’ll need a tiny DB helper) OR delete+recreate.
    // If you want minimal DB changes: add updateTeamIdentity in dbteams.js (below).
    await safeCall(updateTeamIdentity, [userId, name, badge])

    await postMessage({ room, message: `🎲 ${nick} rebranded their team to **${name}** ${badge}` })
    return
  }

  // default: show team
  if (!existing) {
    await postMessage({ room, message: `No team found. Create one with **/team create**` })
    return
  }

  await postMessage({
    room,
    message: `🏎️ Team: **${existing.name}** ${existing.badge || ''} · Garage Level: **${existing.garageLevel}**`.trim()
  })
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

  const team = await safeCall(getTeamByOwner, [userId]).catch(() => null)

  const jitter = (x) => clamp(x + rint(-3, 3), 35, 90)
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
    wear: 0
  })

  const updated = await safeCall(getUserWallet, [userId]).catch(() => null)
  await postMessage({
    room,
    message: `✅ ${nick} bought a **${tierKey.toUpperCase()}** car: **${tier.livery} #${String(id).padStart(2, '0')} ${name}**\n💰 Balance: **${fmtMoney(updated)}**`
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
  lines.push('Repair: `/repaircar <car name>` (reduces wear)')
  await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
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

  // Repair cost scales with wear + tier
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

// ── Race lifecycle ─────────────────────────────────────────────────────

export async function startF1Race () {
  if (isAccepting || isStratOpen || isRunning) {
    await safeCall(postMessage, [{ room: ROOM, message: '⛔ A Grand Prix is already in progress.' }])
    return
  }

  isAccepting = true
  isStratOpen = false
  isRunning = false
  entered.clear()
  eligibleByName = new Map()
  field = []
  carChoices = new Map()
  _lastProgress = null

  const all = await safeCall(getAllCars).catch(() => [])
  const activeIds = await safeCall(fetchCurrentUsers).catch(() => [])

  // Eligible = user cars, owner online, not retired
  const avail = (all || []).filter(c => c.ownerId && activeIds.includes(c.ownerId) && !c.retired)

  for (const c of avail) {
    eligibleByName.set(String(c.name || '').toLowerCase(), c)
  }

  await safeCall(postMessage, [{
    room: ROOM,
    message: `🏎️ **GRAND PRIX STARTING!** Owners: type your car’s exact name in the next ${ENTRY_MS / 1000}s to enter.\nEntry fee: **${fmtMoney(ENTRY_FEE)}** (taken at lock-in).`
  }])

  if (avail.length) {
    const lines = []
    lines.push('AVAILABLE CARS (owners only — type exact name to enter)')
    lines.push('')

    // show up to 20
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

  // owner-only
  if (String(car.ownerId) !== String(sender)) return
  if (entered.has(car.id)) return

  entered.add(car.id)

  const nick = await safeCall(getUserNickname, [sender]).catch(() => '@user')
  await safeCall(postMessage, [{
    room: ROOM,
    message: `✅ ${nick?.replace(/^@/, '')} entered ${carLabel(car)}!`
  }])
}

export async function handleTireChoice (ctx) {
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
}

// ── Internal helpers ───────────────────────────────────────────────────

function cleanup () {
  isAccepting = false
  isStratOpen = false
  isRunning = false
  entered.clear()
  eligibleByName = new Map()
  field = []
  carChoices = new Map()
  _lastProgress = null
}

function generateCarName (usedLower) {
  const ADJ = ['Neon', 'Apex', 'Turbo', 'Crimson', 'Midnight', 'Solar', 'Phantom', 'Vortex', 'Cobalt', 'Titan']
  const NOUN = ['Viper', 'Wraith', 'Comet', 'Falcon', 'Raven', 'Blitz', 'Mirage', 'Arrow', 'Specter', 'Nova']
  for (let i = 0; i < 80; i++) {
    const name = `${ADJ[rint(0, ADJ.length - 1)]} ${NOUN[rint(0, NOUN.length - 1)]}`
    if (!usedLower.has(name.toLowerCase())) return name
  }
  return `Apex Viper ${rint(100, 999)}`
}
function generateTeamIdentity () {
  const BADGES = ['🟥', '🟦', '🟩', '🟨', '🟪', '⬛', '⬜', '🟧']
  const COLORS = ['Crimson', 'Cobalt', 'Emerald', 'Golden', 'Violet', 'Onyx', 'Ivory', 'Tangerine']
  const ANIMALS = ['Falcons', 'Vipers', 'Wolves', 'Ravens', 'Cobras', 'Sharks', 'Panthers', 'Dragons']
  const TECH = ['Apex', 'Turbo', 'Quantum', 'Neon', 'Vortex', 'Pulse', 'Nova', 'Titan']
  const NOUNS = ['Racing', 'Motorsport', 'GP', 'Works', 'Engineering', 'Dynamics', 'Performance', 'Autosport']
  const CITIES = ['Monaco', 'Silverstone', 'Daytona', 'Suzuka', 'Imola', 'Austin', 'Spa', 'Monza']

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

  // Mix formats so it doesn’t feel repetitive
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

async function lockEntriesAndOpenStrategy () {
  try {
    isAccepting = false

    // Build field from entered cars
    const all = await safeCall(getAllCars).catch(() => [])
    const enteredCars = (all || []).filter(c => entered.has(c.id))

    // If nobody entered, still run with bots (but prize pool small)
    const need = Math.max(0, MIN_FIELD - enteredCars.length)

    // Charge entry fees for entered owners now (so they can’t “enter for free”)
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
        wear: 0
      })
    }

    // Attach team label
    const withTeam = []
    for (const c of filtered) {
      const team = c.teamId ? await safeCall(getTeamByOwner, [c.ownerId]).catch(() => null) : null
      withTeam.push({ ...c, teamLabel: teamLabel(team) })
    }

    field = [...withTeam, ...bots].map(c => {
      const label = carLabel(c)
      const ownerId = c.ownerId || null
      const choice = ownerId ? (carChoices.get(ownerId) || {}) : {}

      const tireChoice = TIRES.includes(choice.tire) ? choice.tire : 'med'
      const modeChoice = MODES.includes(choice.mode) ? choice.mode : 'norm'

      return {
        ...c,
        label,
        teamLabel: c.teamLabel || '—',
        tireChoice,
        modeChoice
      }
    })

    // Strategy window (let owners set tire/mode)
    isStratOpen = true

    await safeCall(postMessage, [{
      room: ROOM,
      message: `🧠 **Strategy lock** (${STRAT_MS / 1000}s): choose your tires + mode.\n` +
        `• /tire soft|med|hard\n` +
        `• /mode push|norm|save\n` +
        `Default: MED + NORM`
    }])

    // Show preliminary grid preview (order will be set at start)
    const previewRows = field.map(c => ({
      label: c.label,
      teamLabel: c.teamLabel,
      tire: c.tireChoice,
      mode: c.modeChoice
    }))
    await safeCall(postMessage, [{ room: ROOM, message: renderGrid(previewRows, { title: 'GRID PREVIEW' }) }])

    setTimeout(() => {
      isStratOpen = false
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

    const track = pickTrack()

    // "Grid" shuffle with slight bias: handling+aero
    const seeded = field.map((c) => {
      const bias = (Number(c.handling || 50) + Number(c.aero || 50)) / 200 // ~0.5
      const roll = Math.random() * 0.12
      return { c, q: roll + bias * 0.08 }
    }).sort((a, b) => b.q - a.q).map(x => x.c)

    field = seeded

    const { gross, rake, net } = prizePoolFromEntries(field.filter(c => c.ownerId).length)

    await safeCall(postMessage, [{
      room: ROOM,
      message: `🏁 **LIGHTS OUT!** ${track.emoji} ${track.name}\n` +
        `Entry fees: ${fmtMoney(gross)} · House rake: ${fmtMoney(rake)} · Prize pool: **${fmtMoney(net)}**`
    }])

    const gridRows = field.map(c => ({
      label: c.label,
      teamLabel: c.teamLabel,
      tire: c.tireChoice,
      mode: c.modeChoice
    }))
    await safeCall(postMessage, [{ room: ROOM, message: renderGrid(gridRows, { title: 'OFFICIAL GRID' }) }])

    await runRace({
      cars: field,
      bets: {}, // later
      track,
      prizePool: net,
      payoutPlan: PRIZE_SPLIT
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
    // reduce spam: only post when progress meaningfully changes
    const sig = JSON.stringify(raceState.map(r => [r.index, Math.round(r.progress01 * 100)]))
    if (_lastProgress === sig && (legIndex % 2 === 1)) return
    _lastProgress = sig

    const title = `${track.emoji} ${track.name} — LAP ${legIndex + 1}/${legsTotal}`
    const msg = renderRaceProgress(raceState, { title, barCells: 14, nameWidth: 18 })

    const lines = []
    lines.push(msg)
    if (Array.isArray(events) && events.length) lines.push(events.slice(0, 2).join('\n'))

    await postMessage({ room: ROOM, message: lines.join('\n') })
  })

  bus.on('raceFinished', async ({ finishOrder, cars, payouts, track, prizePool }) => {
    try {
      const top = finishOrder.slice(0, Math.min(8, finishOrder.length))
      const podium = top.slice(0, 5).map((idx, place) => {
        const c = cars[idx]
        const tag = c.ownerId ? `<@uid:${c.ownerId}>` : 'House'
        const pay = c.ownerId ? (payouts?.[c.ownerId] || 0) : 0
        return `${place + 1}. ${c.label} — ${tag}${pay ? ` · ${fmtMoney(pay)}` : ''}`
      })

      await postMessage({
        room: ROOM,
        message: '```\n' + [
          `RESULTS — ${track.emoji} ${track.name}`,
          `Prize Pool: ${fmtMoney(prizePool)}`,
          '',
          ...podium
        ].join('\n') + '\n```'
      })
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
    '/team create <name>  - create your team (garage)',
    '/buycar <tier>       - buy a car (starter/pro/hyper/legendary)',
    '/mycars              - list your cars',
    '/repaircar <name>    - repair wear (cost scales with wear)',
    '',
    '/gp start            - start a Grand Prix (one race event)',
    '(during entry) type your exact car name to enter',
    '(during strategy) /tire soft|med|hard and /mode push|norm|save'
  ].join('\n')

  await postMessage({ room, message: '```\n' + msg + '\n```' })
}