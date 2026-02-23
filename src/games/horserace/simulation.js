// src/games/f1race/simulation.js

import { bus, safeCall } from './service.js'
import { creditGameWin } from '../../database/dbwalletmanager.js'
import { updateCarAfterRace } from '../../database/dbcars.js'
import { postMessage } from '../../libs/cometchat.js'
import { getUserNickname } from '../../utils/nickname.js'
import { stat01 } from './utils/track.js'

const ROOM = process.env.ROOM_UUID

export const LEGS = 5
const LEG_DELAY_MS = 4200
const FINISH = 1.0

const NOISE_SD = 0.030
const MOMENTUM_BLEND = 0.35

const TIRE_DEG = { soft: 0.030, med: 0.020, hard: 0.014 }
const TIRE_START = { soft: 1.035, med: 1.020, hard: 1.008 }

const MODE_MULT = { push: 1.020, norm: 1.000, save: 0.988 }
const MODE_WEAR = { push: 8, norm: 5, save: 3 }
const MODE_DNF = { push: 0.012, norm: 0.006, save: 0.003 }

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

function computePaceScalar (car, track, legIndex) {
  // stats 0..1
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

  // wear penalty (0..100)
  const wear = Math.max(0, Math.min(100, Number(car.wear || 0)))
  const wearPenalty = (wear / 100) * 0.10 // up to -10%

  // tire compound dynamics
  const tireKey = String(car.tireChoice || 'med').toLowerCase()
  const deg = TIRE_DEG[tireKey] ?? TIRE_DEG.med
  const startBoost = TIRE_START[tireKey] ?? TIRE_START.med
  const tireDrop = deg * legIndex // more drop each leg

  const modeKey = String(car.modeChoice || 'norm').toLowerCase()
  const modeMult = MODE_MULT[modeKey] ?? MODE_MULT.norm

  // Map base (0..1-ish) into a pace range ~ [0.97..1.06]
  const mapped = 0.97 + base * 0.095

  return Math.max(0.90, Math.min(1.12, (mapped * (startBoost - tireDrop) * (1 - wearPenalty) * modeMult)))
}

function dnfChance (car, track) {
  const reliability = stat01(car.reliability)
  const wear = Math.max(0, Math.min(100, Number(car.wear || 0)))
  const wearRisk = (wear / 100) * 0.05 // up to +5%
  const tireKey = String(car.tireChoice || 'med').toLowerCase()
  const tireRisk = (tireKey === 'soft') ? 0.010 : (tireKey === 'hard' ? 0.004 : 0.007)

  const modeKey = String(car.modeChoice || 'norm').toLowerCase()
  const modeRisk = MODE_DNF[modeKey] ?? MODE_DNF.norm

  // Higher reliability reduces risk.
  const relReduce = (1 - reliability) * 0.035

  const p = track.dnfBase + wearRisk + tireRisk + modeRisk + relReduce
  return Math.max(0.005, Math.min(0.20, p))
}

function gapLabel (leaderProg, prog) {
  // ✅ amplified so it doesn’t all round to +0.0
  const d = Math.max(0, leaderProg - prog)
  const sec = d * 55.0 // tune: bigger number = more visible gaps
  return `+${sec.toFixed(1)}`
}

function pick (arr) { return arr[Math.floor(Math.random() * arr.length)] }

// Random race-control events
function maybeRaceControlEvent (legIndex) {
  // Don’t do crazy stuff on final lap
  if (legIndex >= LEGS - 1) return null

  const r = rand()
  if (r < 0.08) return { type: 'safety_car' } // ~8%
  if (r < 0.22) return { type: 'yellow' }     // ~14% (total 22%)
  return null
}

function applySafetyCarCompression (state) {
  // Pull everyone closer to leader (not DNF)
  const active = state.filter(s => !s.dnf)
  if (active.length < 2) return
  const leader = active.reduce((m, s) => (s.progress > m.progress ? s : m), active[0])
  for (const s of active) {
    if (s === leader) continue
    const gap = leader.progress - s.progress
    // close 55% of the gap (feel dramatic)
    s.progress = Math.min(leader.progress - 0.002, s.progress + gap * 0.55)
  }
}

export async function runRace ({
  cars,
  track,
  prizePool,
  payoutPlan,
  poleBonus = 0,
  fastestLapBonus = 0,
  poleWinnerOwnerId = null
}) {
  if (!Array.isArray(cars) || cars.length === 0) return

  const state = cars.map((c, idx) => ({
    index: idx,
    carId: c.id || null,
    ownerId: c.ownerId || null,
    name: c.name,
    label: c.label,
    teamLabel: c.teamLabel || '—',
    progress: 0,
    lastDelta: 0,
    dnf: false,
    dnfReason: null,
    bestLapTime: Infinity // for fastest lap
  }))

  // Award pole bonus immediately (if eligible)
  if (poleBonus > 0 && poleWinnerOwnerId) {
    await safeCall(creditGameWin, [poleWinnerOwnerId, poleBonus]).catch(() => null)
  }

  let prevOrder = null
  let lastRaceControl = null

  for (let leg = 0; leg < LEGS; leg++) {
    const active = state.filter(s => !s.dnf)
    if (active.length <= 1) break

    const rcEvent = maybeRaceControlEvent(leg)
    lastRaceControl = rcEvent

    // Determine leader avg for mild pack effects
    const avg = active.reduce((sum, s) => sum + s.progress, 0) / active.length

    // Step each car
    for (const s of state) {
      if (s.dnf) continue

      const car = cars[s.index]
      const pace = computePaceScalar(car, track, leg)

      // Yellow flag reduces pace & DNF a touch
      const yellowMult = (rcEvent?.type === 'yellow') ? 0.975 : 1.0

      const raw = (FINISH / (LEGS * 9.2)) * pace * yellowMult * (1 + randn(0, NOISE_SD))
      const blended = MOMENTUM_BLEND * s.lastDelta + (1 - MOMENTUM_BLEND) * Math.max(0, raw)

      // small banding to keep races interesting
      const diff = s.progress - avg
      const band = 1 - Math.max(-0.06, Math.min(0.06, diff * 0.7))

      const delta = Math.max(0, blended * band)
      s.progress = Math.min(FINISH, s.progress + delta)
      s.lastDelta = delta

      // Fastest lap proxy: “lap time” derived from pace + noise.
      // Lower time is better.
      const lapTime = 90.0 - (pace * 6.0) + randRange(-0.35, 0.35)
      if (lapTime < s.bestLapTime) s.bestLapTime = lapTime

      // DNF check on legs 2..last (avoid immediate DNFs)
      if (leg >= 1) {
        const dnfP = dnfChance(car, track) * ((rcEvent?.type === 'yellow') ? 0.92 : 1.0)
        if (rand() < dnfP) {
          s.dnf = true
          const reasons = ['Engine', 'Gearbox', 'Hydraulics', 'Crash', 'Overheating', 'Puncture']
          s.dnfReason = reasons[Math.floor(Math.random() * reasons.length)]
        }
      }
    }

    // Safety car compresses field after movement
    if (rcEvent?.type === 'safety_car') {
      applySafetyCarCompression(state)
    }

    // Determine order
    const order = state
      .map((s, i) => ({ i, p: s.progress, dnf: s.dnf }))
      .sort((a, b) => {
        if (a.dnf !== b.dnf) return a.dnf ? 1 : -1
        return b.p - a.p
      })
      .map(x => x.i)

    const leaderProg = state[order[0]]?.progress ?? 0

    const rows = order
      .slice(0, Math.min(8, state.length))
      .map(i => {
        const s = state[i]
        return {
          index: i,
          label: s.label,
          teamLabel: s.teamLabel,
          progress01: clamp01(s.progress),
          gap: (i === order[0]) ? '+0.0' : gapLabel(leaderProg, s.progress),
          dnf: s.dnf,
          dnfReason: s.dnfReason
        }
      })

    // Event callouts (DNF + overtakes + race control)
    const events = []

    // Race control
    if (rcEvent?.type === 'safety_car') {
      events.push('🚨 SAFETY CAR DEPLOYED — field bunches up!')
    } else if (rcEvent?.type === 'yellow') {
      events.push('🟡 Yellow flag — sector slow.')
    }

    // DNFs this leg
    const dnfsThisLeg = rows.filter(r => r.dnf).slice(0, 2)
    for (const d of dnfsThisLeg) {
      events.push(`💥 ${d.label} **DNF** (${d.dnfReason})`)
    }

    // Overtakes (compare prev order vs current)
    if (prevOrder) {
      const prevPos = new Map(prevOrder.map((idx, pos) => [idx, pos]))
      // Find up to 2 biggest gains among top 6
      const movers = order.slice(0, 6).map((idx, pos) => ({
        idx,
        pos,
        gain: (prevPos.has(idx) ? (prevPos.get(idx) - pos) : 0)
      }))
        .filter(x => x.gain >= 2) // only meaningful
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 2)

      for (const m of movers) {
        const label = state[m.idx]?.label
        const phrases = [
          `⚡ ${label} slices through traffic — up ${m.gain} places!`,
          `🔥 ${label} with a monster move — up ${m.gain}!`,
          `🎯 ${label} executes the pass — +${m.gain} positions.`
        ]
        events.push(pick(phrases))
      }
    }

    // Fallback “hype” if no events
    if (!events.length) {
      const hype = [
        '🟢 DRS battle into Turn 1!',
        '🛞 Tires starting to fall off…',
        '⚡ Late braking move up the inside!',
        '🧠 Strategy paying off — clean air!',
        '📻 “Push push!”'
      ]
      if (rand() < 0.65) events.push(pick(hype))
    }

    prevOrder = order

    bus.emit('turn', {
      legIndex: leg,
      legsTotal: LEGS,
      raceState: rows,
      events,
      track
    })

    await DELAY(LEG_DELAY_MS)
  }

  // Determine finish order (DNFs at back)
  const finishOrder = state
    .map((s, i) => ({ i, p: s.progress, dnf: s.dnf }))
    .sort((a, b) => {
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1
      return b.p - a.p
    })
    .map(x => x.i)

  const winnerIdx = finishOrder[0]

  // ✅ Fastest lap
  const fastest = state
    .filter(s => !s.dnf)
    .sort((a, b) => a.bestLapTime - b.bestLapTime)[0]
  const fastestLap = fastest ? { index: fastest.index, label: fastest.label, ownerId: fastest.ownerId, time: fastest.bestLapTime } : null

  // ✅ Prize payouts: House cars do not receive prize money.
  // Their “place weight” is redistributed among eligible (user-owned) finishers within the paid places.
  const payouts = {}
  const paidPlaces = Math.min(5, finishOrder.length)

  const eligible = []
  for (let place = 0; place < paidPlaces; place++) {
    const idx = finishOrder[place]
    const car = cars[idx]
    if (car?.ownerId) {
      eligible.push({ place, idx, ownerId: car.ownerId, weight: Number(payoutPlan?.[place] ?? 0) })
    }
  }

  const weightSum = eligible.reduce((sum, e) => sum + e.weight, 0)

  if (weightSum > 0) {
    for (const e of eligible) {
      const amt = Math.floor((Number(prizePool || 0) * (e.weight / weightSum)))
      if (amt > 0) {
        payouts[e.ownerId] = (payouts[e.ownerId] || 0) + amt
        await safeCall(creditGameWin, [e.ownerId, amt])
      }
    }
  }

  // Award fastest lap bonus (if user-owned)
  let fastestLapAwarded = null
  if (fastestLapBonus > 0 && fastestLap?.ownerId) {
    await safeCall(creditGameWin, [fastestLap.ownerId, fastestLapBonus]).catch(() => null)
    fastestLapAwarded = { ...fastestLap, bonus: fastestLapBonus }
  }

  // Update DB for user cars (wear + wins + races)
  try {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]
      if (!c?.id) continue // bots not stored
      const modeKey = String(c.modeChoice || 'norm').toLowerCase()
      const wearDelta = MODE_WEAR[modeKey] ?? 5

      const win = i === winnerIdx
      await safeCall(updateCarAfterRace, [c.id, { win, wearDelta }])
    }
  } catch (e) {
    console.warn('[f1race] updateCarAfterRace failed:', e?.message)
  }

  // ✅ Winner reveal pacing
  await safeCall(postMessage, [{ room: ROOM, message: '🏁 **CHECKERED FLAG!**' }])
  await DELAY(850)

  const winner = cars[winnerIdx]
  if (winner?.ownerId) {
    const nick = await safeCall(getUserNickname, [winner.ownerId]).catch(() => null)
    const tag = nick?.replace(/^@/, '') || `<@uid:${winner.ownerId}>`
    await safeCall(postMessage, [{
      room: ROOM,
      message: `🥇 **${winner.label}** wins the ${track.emoji} **${track.name}**! (${tag})`
    }])
  } else {
    await safeCall(postMessage, [{
      room: ROOM,
      message: `🥇 **${winner?.label || 'House Car'}** wins the ${track.emoji} **${track.name}**!`
    }])
  }

  bus.emit('raceFinished', {
    winnerIdx,
    finishOrder,
    cars: cars.map((c, i) => ({ index: i, label: c.label, ownerId: c.ownerId || null })),
    payouts,
    track,
    prizePool,
    fastestLap: fastestLapAwarded,
    poleBonus: poleBonus > 0 ? poleBonus : 0,
    poleWinnerOwnerId: poleWinnerOwnerId || null
  })
}