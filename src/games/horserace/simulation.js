// src/games/horserace/simulation.js
// 4‑leg race with internal micro‑ticks for smooth movement.
// Slower cadence for drama; final frame nudges winner to the line.

import { bus, safeCall } from './service.js'
import { addToUserWallet } from '../../database/dbwalletmanager.js'
import { updateHorseStats } from '../../database/dbhorses.js'

export const LEGS = 4

// Timing / feel — slower for suspense
const LEG_DELAY_MS = 4800 // was 3500
const SUBTICKS_PER_LEG = 8 // smooth movement
const FINISH = 1.0
const SOFT_CAP_FRACTION = 0.94

// Movement dials
const MOMENTUM_BLEND = 0.40
const NOISE_SD = 0.045
const LEADER_PULL = 0.09
const ENERGY_AMPLITUDE = 0.07
const LANE_BIAS_RANGE = 0.012
const LATE_KICK_PROB = 0.45
const LATE_KICK_BOOST = [1.08, 1.16]
const LATE_KICK_LEG = 3

// Leg distances (sum ≈ 1.0)
const LEG_WEIGHTS = [0.22, 0.28, 0.22, 0.28]

const TOTAL_SUBTICKS = LEGS * SUBTICKS_PER_LEG
const BASELINE_PER_SUBTICK = FINISH / (TOTAL_SUBTICKS + 1)

function rand () { return Math.random() }
function randRange (a, b) { return a + (b - a) * rand() }
function randn (mean = 0, sd = 1) {
  let u = 0; let v = 0; while (!u) u = Math.random(); while (!v) v = Math.random()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function speedFromOdds (decOdds) {
  const f = 1.0 + (3.0 - Number(decOdds || 3.0)) * 0.12 // ~0.85..1.15
  return Math.max(0.85, Math.min(1.15, f))
}

/**
 * Run a single race.  Takes an array of horse objects and an optional map of
 * bets keyed by userId.  Emits real‑time progress events via the bus.
 *
 * @param {Object} opts.horses Array of horses; each should include
 *        at least `id`, `name`, `odds`, `racesParticipated`, `wins` and
 *        `careerLength` properties.
 * @param {Object} [opts.horseBets] Optional mapping from userId to bet slips.
 */
export async function runRace ({ horses, horseBets }) {
  // Build the internal state used to simulate the race.  Each entry tracks
  // progress, lastDelta, speed and other per‑race parameters.
  const state = horses.map((h, idx) => ({
    index: idx,
    name: h.name,
    progress: 0,
    lastDelta: 0,
    speed: speedFromOdds(Number(h.odds || 3.0)) * randRange(0.965, 1.035),
    wavePhase: rand(),
    laneBias: randRange(-LANE_BIAS_RANGE, LANE_BIAS_RANGE) / TOTAL_SUBTICKS,
    kickLeg: null,
    kickBoost: 1.0
  }))

  // Randomly assign late kicks to some horses
  for (const h of state) {
    if (rand() < LATE_KICK_PROB) {
      h.kickLeg = LATE_KICK_LEG
      h.kickBoost = randRange(LATE_KICK_BOOST[0], LATE_KICK_BOOST[1])
    }
  }

  // Simulate each leg and sub‑tick
  for (let leg = 0; leg < LEGS; leg++) {
    const legWeight = LEG_WEIGHTS[leg] ?? (1 / LEGS)
    const perTickScale = (legWeight * TOTAL_SUBTICKS) / SUBTICKS_PER_LEG

    for (let s = 0; s < SUBTICKS_PER_LEG; s++) {
      const avg = state.reduce((sum, h) => sum + h.progress, 0) / state.length

      for (const h of state) {
        const raceFrac = (leg * SUBTICKS_PER_LEG + s + 1) / TOTAL_SUBTICKS
        const energy = 1 + ENERGY_AMPLITUDE * Math.cos(2 * Math.PI * (raceFrac + h.wavePhase))
        const kick = (h.kickLeg === leg) ? h.kickBoost : 1.0

        const raw = BASELINE_PER_SUBTICK * perTickScale * h.speed * energy * kick * (1 + randn(0, NOISE_SD))
        const blended = MOMENTUM_BLEND * h.lastDelta + (1 - MOMENTUM_BLEND) * Math.max(0, raw)

        const diff = h.progress - avg
        const band = 1 - Math.max(-LEADER_PULL, Math.min(LEADER_PULL, diff * 0.9))

        let delta = Math.max(0, blended * band) + h.laneBias

        const isFinalLeg = (leg === LEGS - 1)
        let next = h.progress + delta
        if (!isFinalLeg && next > SOFT_CAP_FRACTION) {
          next = SOFT_CAP_FRACTION - Math.random() * 0.006
          delta = Math.max(0, next - h.progress)
        }

        h.progress = Math.min(FINISH, next)
        h.lastDelta = delta
      }
    }

    // Emit progress for each completed leg
    bus.emit('turn', {
      turnIndex: leg,
      raceState: state.map(x => ({ index: x.index, name: x.name, progress: x.progress })),
      finishDistance: FINISH
    })

    await new Promise(r => setTimeout(r, LEG_DELAY_MS))
  }

  // Determine the winner.  If multiple horses are within 1/16th of the leader
  // the winner is chosen randomly from among them to allow photo‑finishes.
  const maxProg = Math.max(...state.map(h => h.progress))
  const close = state.map((h, i) => ({ i, d: maxProg - h.progress }))
    .filter(x => x.d <= (1 / 16))
    .map(x => x.i)
  const winnerIdx = close.length > 1
    ? close[Math.floor(Math.random() * close.length)]
    : state.reduce((m, h, i, arr) => (h.progress >= arr[m].progress ? i : m), 0)

  state[winnerIdx].progress = FINISH

  // Payout any winning bets
  const payouts = {}
  for (const [userId, slips] of Object.entries(horseBets || {})) {
    let sum = 0
    for (const s of slips) {
      if (s.horseIndex === winnerIdx) {
        const dec = Number(horses[winnerIdx].odds || 3.0)
        sum += Math.floor(s.amount * dec)
      }
    }
    if (sum > 0) {
      payouts[userId] = (payouts[userId] || 0) + sum
      await safeCall(addToUserWallet, [userId, sum])
    }
  }

  // Update horse statistics and automatically retire horses that reach
  // their career limit.  Each horse record includes a `careerLength` set when
  // purchased.  When racesParticipated reaches or exceeds this value the
  // horse is marked retired.
  try {
    for (let i = 0; i < horses.length; i++) {
      const src = horses[i]
      const isWin = i === winnerIdx
      // Calculate the updated stats
      const newRaces = (src.racesParticipated || 0) + 1
      const newWins = (src.wins || 0) + (isWin ? 1 : 0)

      // Prepare update payload
      const update = { racesParticipated: newRaces, wins: newWins }
      const limit = Number(src.careerLength)
      if (Number.isFinite(limit) && newRaces >= limit) {
        update.retired = true
      }
      await safeCall(updateHorseStats, [src.id, update])
    }
  } catch (e) {
    console.warn('[simulation] updateHorseStats failed:', e?.message)
  }

  // Award owner bonus (10% of price) if the winning horse has an owner and a price
  let ownerBonus = null
  const winner = horses[winnerIdx]
  if (winner?.ownerId && Number(winner?.price) > 0) {
    const bonus = Math.floor(Number(winner.price) * 0.10)
    if (bonus > 0) {
      await safeCall(addToUserWallet, [winner.ownerId, bonus])
      ownerBonus = { ownerId: winner.ownerId, amount: bonus }
    }
  }

  // Emit race finished event
  bus.emit('raceFinished', {
    winnerIdx,
    raceState: state.map(x => ({ index: x.index, name: x.name, progress: x.progress })),
    payouts,
    ownerBonus,
    finishDistance: FINISH
  })
}