// src/games/f1race/simulation.js

import { bus, safeCall } from './service.js'
import { updateCarAfterRaceResult } from '../../database/dbcars.js'
import { stat01, getBestTrackForCar } from './utils/track.js'

export const LEGS = 6
const DRAG_LEGS = 4
const LEG_DELAY_MS = 3900
const DRAG_LEG_DELAY_MS = 2200
const FINISH = 1.0

// Tuning
const NOISE_SD = 0.028
const MOMENTUM_BLEND = 0.25

const STANDARD_TIRE_DEG = 0.020
const STANDARD_TIRE_START = 1.020
const STANDARD_MODE_MULT = 1.000
const STANDARD_MODE_WEAR = 5
const STANDARD_MODE_DNF = 0.005
const TIER_WEAR_MULT = { starter: 1.00, pro: 0.94, hyper: 0.82, legendary: 0.70 }
const OWNER_TRACK_FIT_BONUS = 0.018
const GP_GRID_START_STEP = 0.0011
const DELAY = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function rand () { return Math.random() }
function randRange (a, b) { return a + (b - a) * rand() }
function randn (mean = 0, sd = 1) {
  let u = 0; let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function clamp01 (x) { return Math.max(0, Math.min(1, x)) }
function pick (arr) { return arr[Math.floor(Math.random() * arr.length)] }

// Stable bet key helper:
// - user cars have numeric id -> "car:123"
// - bots (id null) fall back to label -> "label:⬛ Turbo Specter"
function carBetKey (car) {
  if (!car) return ''
  if (car.id != null) return `car:${String(car.id)}`
  const lbl = String(car.label || '').trim()
  return lbl ? `label:${lbl}` : ''
}

function normalizeTierKey (tierKey) {
  const key = String(tierKey || '').toLowerCase()
  return Object.prototype.hasOwnProperty.call(TIER_WEAR_MULT, key) ? key : 'starter'
}

function wearMultiplierForCar (car) {
  const tier = normalizeTierKey(car?.tier)
  return Number(TIER_WEAR_MULT[tier] ?? 1)
}

function computePaceScalar (car, track, legIndex) {
  const power = stat01(car.power)
  const handling = stat01(car.handling)
  const aero = stat01(car.aero)
  const reliability = stat01(car.reliability)
  const tire = stat01(car.tire)

  const w = track.weights
  const base =
    w.power * power +
    w.handling * handling +
    w.aero * aero +
    w.tire * tire +
    w.reliability * reliability

  const trackFitBonus = (car?.ownerId && track?.key && getBestTrackForCar(car)?.key === track.key)
    ? (1 + OWNER_TRACK_FIT_BONUS)
    : 1

  const wear = Math.max(0, Math.min(100, Number(car.wear || 0)))
  const wearPenalty = (wear / 100) * 0.10

  const tireDrop = STANDARD_TIRE_DEG * legIndex

  const mapped = 0.97 + (base * trackFitBonus) * 0.095
  return Math.max(0.90, Math.min(1.12, (mapped * (STANDARD_TIRE_START - tireDrop) * (1 - wearPenalty) * STANDARD_MODE_MULT)))
}

function dnfChanceRace (car, track) {
  const reliability = stat01(car.reliability)
  const wear = Math.max(0, Math.min(100, Number(car.wear || 0)))
  const wearRisk = (wear / 100) * 0.02

  const relReduce = (1 - reliability) * 0.015

  const base = Number(track.dnfBase || 0.01)
  const pRace = base + wearRisk + 0.0065 + STANDARD_MODE_DNF + relReduce
  return Math.max(0.02, Math.min(0.18, pRace))
}

function perLegFromRaceProb (pRace, legsRemaining) {
  const L = Math.max(1, legsRemaining)
  return 1 - Math.pow(1 - Math.max(0, Math.min(0.99, pRace)), 1 / L)
}

function gapLabel (leaderProg, prog, legIndex, track, legsTotal = LEGS) {
  const d = Math.max(0, leaderProg - prog)
  const scale = Number(track?.gapScale || 78.0)
  const sec = d * scale
  const decimals = (legIndex >= legsTotal - 1) ? 3 : 2
  return `+${sec.toFixed(decimals)}`
}

function maybeRaceControlEvent (legIndex, raceType = 'gp', legsTotal = LEGS) {
  if (raceType === 'drag') return null
  if (legIndex >= legsTotal - 1) return null
  const r = rand()
  if (r < 0.075) return { type: 'safety_car' }
  if (r < 0.20) return { type: 'yellow' }
  return null
}

function applySafetyCarCompression (state) {
  const active = state.filter(s => !s.dnf)
  if (active.length < 2) return

  const leader = active.reduce((m, s) => (s.progress > m.progress ? s : m), active[0])

  for (const s of active) {
    if (s === leader) continue
    const gap = leader.progress - s.progress
    s.progress = Math.min(leader.progress - 0.002, s.progress + gap * 0.65)
  }
}

function tryOvertakes ({ state, cars, order, events, leg, track }) {
  if (order.length < 2) return

  let overtakeCount = 0
  const MAX_OVERTAKES_ANNOUNCED = 1

  for (let pos = 1; pos < order.length; pos++) {
    if (overtakeCount >= MAX_OVERTAKES_ANNOUNCED) break

    const back = state[order[pos]]
    const front = state[order[pos - 1]]
    if (back.dnf || front.dnf) continue

    const gap = front.progress - back.progress
    if (gap > 0.004) continue

    const carB = cars[back.index]
    const carF = cars[front.index]

    let p = 0.14
    p += (stat01(carB.handling) - stat01(carF.handling)) * 0.22
    p += (stat01(carB.aero) - stat01(carF.aero)) * 0.18
    p += (stat01(carB.power) - stat01(carF.power)) * 0.12

    if (track?._rc === 'yellow') p *= 0.75
    if (track?._rc === 'safety_car') p *= 0.55

    p = Math.max(0.03, Math.min(0.40, p))

    if (rand() < p) {
      back.progress = Math.min(FINISH, back.progress + 0.0016)
      overtakeCount++

      if (pos <= 6) {
        events.push(pick([
          `🟢 OVERTAKE! ${back.label} gets by ${front.label}!`,
          `⚡ Pass completed — ${back.label} ahead of ${front.label}!`,
          `🔥 Bold move! ${back.label} slips past ${front.label}!`
        ]))
      }
    }
  }
}

export async function runRace ({
  cars,
  track,
  raceType = 'gp',
  raceTier = 'starter',

  // betting
  bets = {},
  lockedOddsDec = []
}) {
  if (!Array.isArray(cars) || cars.length === 0) return
  const raceKind = String(raceType || 'gp').toLowerCase() === 'drag' ? 'drag' : 'gp'
  const legsTotal = raceKind === 'drag' ? DRAG_LEGS : LEGS
  const legDelayMs = raceKind === 'drag' ? DRAG_LEG_DELAY_MS : LEG_DELAY_MS

  const state = cars.map((c, idx) => ({
    index: idx,
    carId: c.id || null,
    ownerId: c.ownerId || null,
    label: c.label,
    teamLabel: c.teamLabel || '—',
    progress: raceKind === 'drag' ? 0 : Math.max(0, (cars.length - 1 - idx) * GP_GRID_START_STEP),
    lastDelta: 0,
    dnf: false,
    dnfReason: null,
    bestLapTime: Infinity,
    startPos: idx
  }))

  let prevOrder = null

  for (let leg = 0; leg < legsTotal; leg++) {
    const active = state.filter(s => !s.dnf)
    if (active.length <= 1) break

    const rcEvent = maybeRaceControlEvent(leg, raceKind, legsTotal)
    track._rc = rcEvent?.type || null

    const avg = active.reduce((sum, s) => sum + s.progress, 0) / active.length

    for (const s of state) {
      if (s.dnf) continue

      const car = cars[s.index]
      const pace = computePaceScalar(car, track, leg)

      const yellowMult = (rcEvent?.type === 'yellow') ? 0.96 : 1.0
      const dragPaceFactor = raceKind === 'drag' ? 8.2 : 9.4
      const raw = (FINISH / (legsTotal * dragPaceFactor)) * pace * yellowMult * (1 + randn(0, NOISE_SD))
      const blended = MOMENTUM_BLEND * s.lastDelta + (1 - MOMENTUM_BLEND) * Math.max(0, raw)

      const diff = s.progress - avg
      const band = 1 - Math.max(-0.06, Math.min(0.06, diff * 0.7))

      const delta = Math.max(0, blended * band)
      s.progress = Math.min(FINISH, s.progress + delta)
      s.lastDelta = delta

      const lapTime = (rcEvent?.type === 'yellow')
        ? 92.2 - (pace * 4.8) + randRange(-0.35, 0.35)
        : 90.0 - (pace * 6.0) + randRange(-0.35, 0.35)
      if (lapTime < s.bestLapTime) s.bestLapTime = lapTime

      if (leg >= 1 && raceKind !== 'drag') {
        const pRace = dnfChanceRace(car, track)
        const legsRemaining = (legsTotal - leg)
        let pLeg = perLegFromRaceProb(pRace, legsRemaining)

        if (rcEvent?.type === 'yellow') pLeg *= 0.80
        if (rcEvent?.type === 'safety_car') pLeg *= 0.65

        if (rand() < pLeg) {
          s.dnf = true
          const reasons = ['Engine', 'Gearbox', 'Hydraulics', 'Crash', 'Overheating', 'Puncture']
          s.dnfReason = reasons[Math.floor(Math.random() * reasons.length)]
        }
      }
    }

    if (rcEvent?.type === 'safety_car') applySafetyCarCompression(state)

    let order = state
      .map((s, i) => ({ i, p: s.progress, dnf: s.dnf }))
      .sort((a, b) => {
        if (a.dnf !== b.dnf) return a.dnf ? 1 : -1
        return b.p - a.p
      })
      .map(x => x.i)

    if (leg === 0) order.forEach((idx, pos) => { state[idx].startPos = pos })

    const events = []
    if (rcEvent?.type === 'safety_car') events.push('🚨 SAFETY CAR DEPLOYED — field bunches up!')
    else if (rcEvent?.type === 'yellow') events.push('🟡 Yellow flag — sector slow.')

    if (raceKind !== 'drag') {
      tryOvertakes({ state, cars, order, events, leg, track })
    }

    order = state
      .map((s, i) => ({ i, p: s.progress, dnf: s.dnf }))
      .sort((a, b) => {
        if (a.dnf !== b.dnf) return a.dnf ? 1 : -1
        return b.p - a.p
      })
      .map(x => x.i)

    const leaderProg = state[order[0]]?.progress ?? 0

    const rows = order.slice(0, Math.min(8, state.length)).map((i) => {
      const s = state[i]
      return {
        index: i,
        label: s.label,
        teamLabel: s.teamLabel,
        progress01: clamp01(s.progress),
        gap: (i === order[0]) ? '+0.00' : gapLabel(leaderProg, s.progress, leg, track, legsTotal),
        dnf: s.dnf,
        dnfReason: s.dnfReason
      }
    })

    const dnfsThisLeg = rows.filter(r => r.dnf).slice(0, 2)
    for (const d of dnfsThisLeg) events.push(`💥 ${d.label} **DNF** (${d.dnfReason})`)

    if (prevOrder) {
      const prevPos = new Map(prevOrder.map((idx, pos) => [idx, pos]))
      const movers = order.slice(0, 8).map((idx, pos) => ({
        idx, pos, gain: (prevPos.has(idx) ? (prevPos.get(idx) - pos) : 0)
      }))
        .filter(x => x.gain >= 2)
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 1)

      for (const m of movers) {
        const label = state[m.idx]?.label
        if (label) {
          events.push(pick([
            `⚡ ${label} slices through traffic — up ${m.gain} places!`,
            `🔥 ${label} with a monster stint — up ${m.gain}!`,
            `🎯 ${label} makes it happen — +${m.gain} positions.`
          ]))
        }
      }
    }

    if (!events.length && rand() < 0.60) {
      events.push(pick([
        '🟢 DRS battle into Turn 1!',
        '🛞 Pace is holding steady through the stint.',
        '🧠 Clean air making a difference.',
        '📻 Team radio is calm but urgent.',
        '⚡ Late braking move up the inside!'
      ]))
    }

    prevOrder = order

    bus.emit('turn', {
      legIndex: leg,
      legsTotal,
      raceType: raceKind,
      raceState: rows,
      events,
      track
    })

    const delay = raceKind === 'drag'
      ? legDelayMs
      : ((leg >= legsTotal - 2) ? Math.max(1600, legDelayMs - 250) : legDelayMs)
    await DELAY(delay)
  }

  const finishOrder = state
    .map((s, i) => ({ i, p: s.progress, dnf: s.dnf }))
    .sort((a, b) => {
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1
      return b.p - a.p
    })
    .map(x => x.i)

  const winnerIdx = finishOrder[0]
  const winnerCar = cars[winnerIdx]
  const winnerKey = carBetKey(winnerCar)

  // Fastest lap among finishers
  const fastest = state.filter(s => !s.dnf).sort((a, b) => a.bestLapTime - b.bestLapTime)[0]
  const fastestLap = fastest
    ? { index: fastest.index, label: fastest.label, ownerId: fastest.ownerId, time: fastest.bestLapTime }
    : null

  // Car wear + win/loss persistence
  try {
    const finishPosByIndex = new Map()
    finishOrder.forEach((idx, pos) => {
      finishPosByIndex.set(idx, pos + 1)
    })

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]
      if (!c?.id) continue
      const wearDelta = Math.max(1, Math.round(STANDARD_MODE_WEAR * wearMultiplierForCar(c)))
      await safeCall(updateCarAfterRaceResult, [c.id, {
        win: i === winnerIdx,
        wearDelta,
        finishPosition: finishPosByIndex.get(i) ?? null,
        dnf: state[i]?.dnf === true
      }])
    }
  } catch (e) {
    console.warn('[f1race] updateCarAfterRaceResult failed:', e?.message)
  }

  return {
    raceTier,
    winnerIdx,
    winnerKey,
    winnerCar,
    finishOrder,
    fastestLap,
    track,
    cars: cars.map((c, i) => ({ index: i, label: c.label, ownerId: c.ownerId || null, imageUrl: c.imageUrl || null })),
    bets,
    lockedOddsDec
  }
}
