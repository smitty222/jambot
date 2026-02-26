// src/games/f1race/simulation.js

import { bus, safeCall } from './service.js'
import { creditGameWin } from '../../database/dbwalletmanager.js'
import { updateCarAfterRace } from '../../database/dbcars.js'
import { postMessage } from '../../libs/cometchat.js'
import { getUserNickname } from '../../utils/nickname.js'
import { stat01 } from './utils/track.js'

const ROOM = process.env.ROOM_UUID

// ✅ Slightly longer race = more story, still fast in chat
export const LEGS = 6
const LEG_DELAY_MS = 3900
const FINISH = 1.0

// Tuning
const NOISE_SD = 0.028
const MOMENTUM_BLEND = 0.25

// Tire model
const TIRE_DEG = { soft: 0.030, med: 0.020, hard: 0.014 }
const TIRE_START = { soft: 1.035, med: 1.020, hard: 1.008 }

// Modes
const MODE_MULT = { push: 1.020, norm: 1.000, save: 0.988 }
const MODE_WEAR = { push: 8, norm: 5, save: 3 }
const MODE_DNF = { push: 0.010, norm: 0.005, save: 0.0025 }

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

  const wear = Math.max(0, Math.min(100, Number(car.wear || 0)))
  const wearPenalty = (wear / 100) * 0.10 // up to -10%

  const tireKey = String(car.tireChoice || 'med').toLowerCase()
  const deg = TIRE_DEG[tireKey] ?? TIRE_DEG.med
  const startBoost = TIRE_START[tireKey] ?? TIRE_START.med

  // base degradation
  let tireDrop = deg * legIndex

  // ✅ soft tires fall off late race (creates strategy)
  if (tireKey === 'soft' && legIndex >= 3) tireDrop += 0.015

  const modeKey = String(car.modeChoice || 'norm').toLowerCase()
  const modeMult = MODE_MULT[modeKey] ?? MODE_MULT.norm

  const mapped = 0.97 + base * 0.095
  return Math.max(0.90, Math.min(1.12, (mapped * (startBoost - tireDrop) * (1 - wearPenalty) * modeMult)))
}

// Returns a *race-level* DNF risk (moderate vibe), not per-lap.
function dnfChanceRace (car, track) {
  const reliability = stat01(car.reliability)
  const wear = Math.max(0, Math.min(100, Number(car.wear || 0)))
  const wearRisk = (wear / 100) * 0.02 // ✅ reduced from 0.05

  const tireKey = String(car.tireChoice || 'med').toLowerCase()
  const tireRisk = (tireKey === 'soft') ? 0.010 : (tireKey === 'hard' ? 0.0035 : 0.0065)

  const modeKey = String(car.modeChoice || 'norm').toLowerCase()
  const modeRisk = MODE_DNF[modeKey] ?? MODE_DNF.norm

  const relReduce = (1 - reliability) * 0.015 // ✅ reduced from 0.035

  const base = Number(track.dnfBase || 0.01)
  const pRace = base + wearRisk + tireRisk + modeRisk + relReduce

  // ✅ moderate: keep race-level DNF between 2% and 12% typically, max 18%
  return Math.max(0.02, Math.min(0.18, pRace))
}

function perLegFromRaceProb (pRace, legsRemaining) {
  // Convert race-level probability into a per-leg probability that compounds to pRace
  const L = Math.max(1, legsRemaining)
  return 1 - Math.pow(1 - Math.max(0, Math.min(0.99, pRace)), 1 / L)
}

function gapLabel (leaderProg, prog, legIndex, track) {
  const d = Math.max(0, leaderProg - prog)

  // ✅ spread gaps a bit; allow track tuning if you add track.gapScale later
  const scale = Number(track?.gapScale || 78.0)

  const sec = d * scale
  const decimals = (legIndex >= LEGS - 1) ? 3 : 2
  return `+${sec.toFixed(decimals)}`
}

// Race control
function maybeRaceControlEvent (legIndex) {
  if (legIndex >= LEGS - 1) return null
  const r = rand()
  if (r < 0.075) return { type: 'safety_car' } // rare, but dramatic
  if (r < 0.20) return { type: 'yellow' } // occasional
  return null
}

function applySafetyCarCompression (state) {
  const active = state.filter(s => !s.dnf)
  if (active.length < 2) return

  const leader = active.reduce((m, s) => (s.progress > m.progress ? s : m), active[0])

  for (const s of active) {
    if (s === leader) continue
    const gap = leader.progress - s.progress
    // ✅ compress strongly, but keep a tiny leader buffer
    s.progress = Math.min(leader.progress - 0.002, s.progress + gap * 0.65)
  }
}

// ✅ lightweight overtakes that feel meaningful (no spam)
function tryOvertakes ({ state, cars, order, events, leg, track }) {
  if (order.length < 2) return

  let overtakeCount = 0
  const MAX_OVERTAKES_ANNOUNCED = 1 // ✅ keep it hype, not spam

  for (let pos = 1; pos < order.length; pos++) {
    if (overtakeCount >= MAX_OVERTAKES_ANNOUNCED) break

    const back = state[order[pos]]
    const front = state[order[pos - 1]]
    if (back.dnf || front.dnf) continue

    const gap = front.progress - back.progress
    // only when genuinely close
    if (gap > 0.004) continue

    const carB = cars[back.index]
    const carF = cars[front.index]

    let p = 0.14
    p += (stat01(carB.handling) - stat01(carF.handling)) * 0.22
    p += (stat01(carB.aero) - stat01(carF.aero)) * 0.18
    p += (stat01(carB.power) - stat01(carF.power)) * 0.12

    const bMode = String(carB.modeChoice || 'norm').toLowerCase()
    const bTire = String(carB.tireChoice || 'med').toLowerCase()
    if (bMode === 'push') p += 0.05
    if (bMode === 'save') p -= 0.02
    if (bTire === 'soft') p += 0.03
    if (bTire === 'hard') p -= 0.01

    // less passing under yellow/safety conditions
    if (track?._rc === 'yellow') p *= 0.75
    if (track?._rc === 'safety_car') p *= 0.55

    p = Math.max(0.03, Math.min(0.40, p))

    if (rand() < p) {
      // small bump to make the pass "stick"
      back.progress = Math.min(FINISH, back.progress + 0.0016)
      overtakeCount++

      // only announce if the pass is in a visible slice of the field
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
  prizePool,
  payoutPlan,
  poleBonus = 0,
  fastestLapBonus = 0,
  poleWinnerOwnerId = null,

  // betting
  bets = {},
  lockedOddsDec = []
}) {
  if (!Array.isArray(cars) || cars.length === 0) return

  const state = cars.map((c, idx) => ({
    index: idx,
    carId: c.id || null,
    ownerId: c.ownerId || null,
    label: c.label,
    teamLabel: c.teamLabel || '—',
    progress: 0,
    lastDelta: 0,
    dnf: false,
    dnfReason: null,
    bestLapTime: Infinity,
    startPos: idx // will update after first order
  }))

  if (poleBonus > 0 && poleWinnerOwnerId) {
    await safeCall(creditGameWin, [poleWinnerOwnerId, poleBonus]).catch(() => null)
  }

  let prevOrder = null

  for (let leg = 0; leg < LEGS; leg++) {
    const active = state.filter(s => !s.dnf)
    if (active.length <= 1) break

    const rcEvent = maybeRaceControlEvent(leg)
    // stash rc type for overtake dampening without changing your track object elsewhere
    track._rc = rcEvent?.type || null

    const avg = active.reduce((sum, s) => sum + s.progress, 0) / active.length

    for (const s of state) {
      if (s.dnf) continue

      const car = cars[s.index]
      const pace = computePaceScalar(car, track, leg)

      const yellowMult = (rcEvent?.type === 'yellow') ? 0.96 : 1.0

      const raw = (FINISH / (LEGS * 9.4)) * pace * yellowMult * (1 + randn(0, NOISE_SD))
      const blended = MOMENTUM_BLEND * s.lastDelta + (1 - MOMENTUM_BLEND) * Math.max(0, raw)

      const diff = s.progress - avg
      const band = 1 - Math.max(-0.06, Math.min(0.06, diff * 0.7))

      const delta = Math.max(0, blended * band)
      s.progress = Math.min(FINISH, s.progress + delta)
      s.lastDelta = delta

      // Lap times should reflect yellow pace a bit
      const lapTime = (rcEvent?.type === 'yellow')
        ? 92.2 - (pace * 4.8) + randRange(-0.35, 0.35)
        : 90.0 - (pace * 6.0) + randRange(-0.35, 0.35)

      if (lapTime < s.bestLapTime) s.bestLapTime = lapTime

      // ✅ DNF: moderate vibe, based on race-level risk converted to per-leg risk
      if (leg >= 1) {
        const pRace = dnfChanceRace(car, track)
        const legsRemaining = (LEGS - leg)
        let pLeg = perLegFromRaceProb(pRace, legsRemaining)

        // safer under yellow/safety
        if (rcEvent?.type === 'yellow') pLeg *= 0.80
        if (rcEvent?.type === 'safety_car') pLeg *= 0.65

        if (rand() < pLeg) {
          s.dnf = true
          const reasons = ['Engine', 'Gearbox', 'Hydraulics', 'Crash', 'Overheating', 'Puncture']
          s.dnfReason = reasons[Math.floor(Math.random() * reasons.length)]
        }
      }
    }

    if (rcEvent?.type === 'safety_car') {
      applySafetyCarCompression(state)
    }

    let order = state
      .map((s, i) => ({ i, p: s.progress, dnf: s.dnf }))
      .sort((a, b) => {
        if (a.dnf !== b.dnf) return a.dnf ? 1 : -1
        return b.p - a.p
      })
      .map(x => x.i)

    // record starting positions after first sort
    if (leg === 0) {
      order.forEach((idx, pos) => { state[idx].startPos = pos })
    }

    // ✅ overtakes (limited announcements)
    const events = []
    if (rcEvent?.type === 'safety_car') events.push('🚨 SAFETY CAR DEPLOYED — field bunches up!')
    else if (rcEvent?.type === 'yellow') events.push('🟡 Yellow flag — sector slow.')

    tryOvertakes({ state, cars, order, events, leg, track })

    // re-sort after overtake bumps
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
        gap: (i === order[0]) ? '+0.00' : gapLabel(leaderProg, s.progress, leg, track),
        dnf: s.dnf,
        dnfReason: s.dnfReason
      }
    })

    // DNFs this leg (announce max 2)
    const dnfsThisLeg = rows.filter(r => r.dnf).slice(0, 2)
    for (const d of dnfsThisLeg) events.push(`💥 ${d.label} **DNF** (${d.dnfReason})`)

    // Movers highlight (only meaningful moves)
    if (prevOrder) {
      const prevPos = new Map(prevOrder.map((idx, pos) => [idx, pos]))
      const movers = order.slice(0, 8).map((idx, pos) => ({
        idx, pos, gain: (prevPos.has(idx) ? (prevPos.get(idx) - pos) : 0)
      }))
        .filter(x => x.gain >= 2)
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 1) // ✅ keep it tight

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
        '🛞 Tires starting to fall off…',
        '🧠 Strategy paying off — clean air!',
        '📻 “Push push!”',
        '⚡ Late braking move up the inside!'
      ]))
    }

    prevOrder = order

    bus.emit('turn', { legIndex: leg, legsTotal: LEGS, raceState: rows, events, track })

    const delay = (leg >= LEGS - 2) ? 3000 : LEG_DELAY_MS
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

  // Fastest lap among finishers
  const fastest = state.filter(s => !s.dnf).sort((a, b) => a.bestLapTime - b.bestLapTime)[0]
  const fastestLap = fastest
    ? { index: fastest.index, label: fastest.label, ownerId: fastest.ownerId, time: fastest.bestLapTime }
    : null

  // Prize payouts: redistribute house weight to user-owned finishers in paid places
  const payouts = {}
  const paidPlaces = Math.min(5, finishOrder.length)

  const eligible = []
  for (let place = 0; place < paidPlaces; place++) {
    const idx = finishOrder[place]
    const car = cars[idx]
    if (car?.ownerId) eligible.push({ place, idx, ownerId: car.ownerId, weight: Number(payoutPlan?.[place] ?? 0) })
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

  let fastestLapAwarded = null
  if (fastestLapBonus > 0 && fastestLap?.ownerId) {
    await safeCall(creditGameWin, [fastestLap.ownerId, fastestLapBonus]).catch(() => null)
    fastestLapAwarded = { ...fastestLap, bonus: fastestLapBonus }
  }

  // ✅ Bet settlement (win-only)
  const betPayouts = {}
  for (const [userId, slips] of Object.entries(bets || {})) {
    let totalWin = 0
    for (const s of (slips || [])) {
      const idx = Number(s.carIndex)
      const amt = Number(s.amount)
      if (!Number.isFinite(idx) || !Number.isFinite(amt) || amt <= 0) continue
      if (idx === winnerIdx) {
        const dec = Number(lockedOddsDec?.[idx] ?? 0)
        if (Number.isFinite(dec) && dec > 1.01) totalWin += Math.floor(amt * dec)
        else totalWin += Math.floor(amt * 2)
      }
    }
    if (totalWin > 0) {
      betPayouts[userId] = (betPayouts[userId] || 0) + totalWin
      await safeCall(creditGameWin, [userId, totalWin])
    }
  }

  // Car wear + win/loss persistence
  try {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i]
      if (!c?.id) continue
      const modeKey = String(c.modeChoice || 'norm').toLowerCase()
      const wearDelta = MODE_WEAR[modeKey] ?? 5
      await safeCall(updateCarAfterRace, [c.id, { win: i === winnerIdx, wearDelta }])
    }
  } catch (e) {
    console.warn('[f1race] updateCarAfterRace failed:', e?.message)
  }

  await safeCall(postMessage, [{ room: ROOM, message: '🏁 **CHECKERED FLAG!**' }])
  await DELAY(850)

  const winner = cars[winnerIdx]
  if (winner?.ownerId) {
    const nick = await safeCall(getUserNickname, [winner.ownerId]).catch(() => null)
    const tag = nick?.replace(/^@/, '') || `<@uid:${winner.ownerId}>`
    await safeCall(postMessage, [{ room: ROOM, message: `🥇 **${winner.label}** wins the ${track.emoji} **${track.name}**! (${tag})` }])
  } else {
    await safeCall(postMessage, [{ room: ROOM, message: `🥇 **${winner?.label || 'House Car'}** wins the ${track.emoji} **${track.name}**!` }])
  }

  bus.emit('raceFinished', {
    winnerIdx,
    finishOrder,
    cars: cars.map((c, i) => ({ index: i, label: c.label, ownerId: c.ownerId || null })),
    payouts,
    betPayouts,
    track,
    prizePool,
    fastestLap: fastestLapAwarded,
    poleBonus: poleBonus > 0 ? poleBonus : 0,
    poleWinnerOwnerId: poleWinnerOwnerId || null
  })
}