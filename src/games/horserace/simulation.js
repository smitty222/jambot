// src/games/horserace/simulation.js
//
// (existing header comments omitted for brevity)

import { bus, safeCall } from './service.js'
import { addToUserWallet } from '../../database/dbwalletmanager.js'
import { updateHorseStats } from '../../database/dbhorses.js'
import { maybeInductHorse } from '../../database/dbhorsehof.js'
import { postMessage } from '../../libs/cometchat.js'
import { getUserNickname } from '../../utils/nickname.js'

const ROOM = process.env.ROOM_UUID

export const LEGS = 4

const LEG_DELAY_MS = 4800
const SUBTICKS_PER_LEG = 8
const FINISH = 1.0
const SOFT_CAP_FRACTION = 0.94

const MOMENTUM_BLEND = 0.40
const NOISE_SD = 0.045
const LEADER_PULL = 0.09
const ENERGY_AMPLITUDE = 0.07
const LANE_BIAS_RANGE = 0.012
const LATE_KICK_PROB = 0.40
const LATE_KICK_BOOST = [1.08, 1.16]
const LATE_KICK_LEG = 3

const LEG_WEIGHTS = [0.22, 0.28, 0.22, 0.28]

const TOTAL_SUBTICKS = LEGS * SUBTICKS_PER_LEG
const BASELINE_PER_SUBTICK = FINISH / (TOTAL_SUBTICKS + 1)

function rand () { return Math.random() }
function randRange (a, b) { return a + (b - a) * rand() }
function randn (mean = 0, sd = 1) {
  let u = 0; let v = 0
  while (!u) u = Math.random()
  while (!v) v = Math.random()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function speedFromOdds (decOdds) {
  const f = 1.0 + (3.0 - Number(decOdds || 3.0)) * 0.05
  return Math.max(0.95, Math.min(1.07, f))
}

export async function runRace ({ horses, horseBets }) {
  if (!Array.isArray(horses) || horses.length === 0) return

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

  for (const h of state) {
    if (rand() < LATE_KICK_PROB) {
      h.kickLeg = LATE_KICK_LEG
      h.kickBoost = randRange(LATE_KICK_BOOST[0], LATE_KICK_BOOST[1])
    }
  }

  for (let leg = 0; leg < LEGS; leg++) {
    const legWeight = LEG_WEIGHTS[leg] ?? (1 / LEGS)
    const perTickScale = (legWeight * TOTAL_SUBTICKS) / SUBTICKS_PER_LEG

    for (let s = 0; s < SUBTICKS_PER_LEG; s++) {
      const avg = state.reduce((sum, h) => sum + h.progress, 0) / state.length

      for (const h of state) {
        const raceFrac = (leg * SUBTICKS_PER_LEG + s + 1) / TOTAL_SUBTICKS
        const energy = 1 + ENERGY_AMPLITUDE * Math.cos(2 * Math.PI * (raceFrac + h.wavePhase))
        const kick = (h.kickLeg === leg) ? h.kickBoost : 1.0

        const raw = BASELINE_PER_SUBTICK * perTickScale * h.speed * energy *
          kick * (1 + randn(0, NOISE_SD))
        const blended = MOMENTUM_BLEND * h.lastDelta + (1 - MOMENTUM_BLEND) * Math.max(0, raw)

        const diff = h.progress - avg
        const band = 1 - Math.max(-LEADER_PULL, Math.min(LEADER_PULL, diff * 0.9))

        let delta = Math.max(0, blended * band) + h.laneBias

        const isFinalLeg = (leg === LEGS - 1)
        let next = h.progress + delta
        if (!isFinalLeg && next > SOFT_CAP_FRACTION) {
          const capTarget = SOFT_CAP_FRACTION - Math.random() * 0.006
          next = Math.max(h.progress, capTarget)
          delta = Math.max(0, next - h.progress)
        }

        h.progress = Math.min(FINISH, next)
        h.lastDelta = delta
      }
    }

    bus.emit('turn', {
      turnIndex: leg,
      raceState: state.map(x => ({ index: x.index, name: x.name, progress: x.progress })),
      finishDistance: FINISH
    })

    await new Promise(r => setTimeout(r, LEG_DELAY_MS))
  }

  const maxProg = Math.max(...state.map(h => h.progress))
  const closers = state.map((h, i) => ({ i, d: maxProg - h.progress }))
    .filter(x => x.d <= (1 / 16))

  let winnerIdx
  if (closers.length > 1) {
    const weights = closers.map(x => 1 / (x.d + 1e-6))
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    let r = Math.random() * totalWeight
    winnerIdx = closers[closers.length - 1].i
    for (let j = 0; j < closers.length; j++) {
      r -= weights[j]
      if (r <= 0) { winnerIdx = closers[j].i; break }
    }
  } else if (closers.length === 1) {
    winnerIdx = closers[0].i
  } else {
    winnerIdx = state.reduce((m, h, i, arr) => (h.progress >= arr[m].progress ? i : m), 0)
  }

  state[winnerIdx].progress = FINISH

  // --- payouts to bettors ---
  const payouts = {}
  for (const [userId, slips] of Object.entries(horseBets || {})) {
    let sum = 0
    for (const s of slips) {
      if (s.horseIndex === winnerIdx) {
        const w = horses[winnerIdx]
        const num = Number(w?.oddsFrac?.num)
        const den = Number(w?.oddsFrac?.den)
        if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
          const profit = s.amount * (num / den)
          sum += Math.floor(s.amount + profit)
        } else {
          const dec = Number(w?.odds || 3.0)
          sum += Math.floor(s.amount * dec)
        }
      }
    }
    if (sum > 0) {
      payouts[userId] = (payouts[userId] || 0) + sum
      await safeCall(addToUserWallet, [userId, sum])
    }
  }

  // --- update stats + retirement + HoF induction ---
  try {
    for (let i = 0; i < horses.length; i++) {
      const src = horses[i]
      const isWin = i === winnerIdx
      const newRaces = (src.racesParticipated || 0) + 1
      const newWins = (src.wins || 0) + (isWin ? 1 : 0)

      const update = { racesParticipated: newRaces, wins: newWins }
      const limit = Number(src.careerLength)
      const shouldRetire = Number.isFinite(limit) && newRaces >= limit
      if (shouldRetire && !src.retired) {
        update.retired = true
        if (src.ownerId) {
          try {
            const nick = await safeCall(getUserNickname, [src.ownerId]).catch(() => null)
            const ownerTag = nick || `<@uid:${src.ownerId}>`
            const message = `🏁 ${ownerTag}, your horse **${src.name}** has reached its career limit (${limit} races) and has retired.`
            await safeCall(postMessage, [{ room: ROOM, message }])
          } catch (err) {
            console.warn('[simulation] failed to notify owner about retirement:', err?.message)
          }
        }
      }

      // Only update DB-backed horses
      if (src?.id) {
        await safeCall(updateHorseStats, [src.id, update])

        // HoF check uses the UPDATED stats snapshot
        const hofCheck = maybeInductHorse({
          ...src,
          wins: newWins,
          racesParticipated: newRaces,
          retired: !!update.retired || !!src.retired
        })

        if (hofCheck?.inducted) {
          const nick = src?.ownerId ? await safeCall(getUserNickname, [src.ownerId]).catch(() => null) : null
          const ownerTag = nick || (src?.ownerId ? `<@uid:${src.ownerId}>` : 'House')
          await safeCall(postMessage, [{
            room: ROOM,
            message: `🏆 **HALL OF FAME INDUCTION!** **${src.name}** (${ownerTag}) — ${hofCheck.reason}`
          }])
        }
      }
    }
  } catch (e) {
    console.warn('[simulation] updateHorseStats/HOF failed:', e?.message)
  }

  // Owner bonus (you can keep your increased version here if you already changed it)
  let ownerBonus = null
  const winner = horses[winnerIdx]
  if (winner?.ownerId && Number(winner?.price) > 0) {
    const pctRaw = Number(process.env.HORSE_OWNER_BONUS_PCT ?? 0.20)
    const minRaw = Number(process.env.HORSE_OWNER_BONUS_MIN ?? 0)

    const pct = Number.isFinite(pctRaw) ? Math.max(0, Math.min(1, pctRaw)) : 0.20
    const minBonus = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : 0

    const price = Number(winner.price)
    const pctBonus = Math.floor(price * pct)
    const bonus = Math.max(minBonus, pctBonus)

    if (bonus > 0) {
      await safeCall(addToUserWallet, [winner.ownerId, bonus])
      ownerBonus = { ownerId: winner.ownerId, amount: bonus }
    }
  }

  bus.emit('raceFinished', {
    winnerIdx,
    raceState: state.map(x => ({ index: x.index, name: x.name, progress: x.progress })),
    payouts,
    ownerBonus,
    finishDistance: FINISH
  })
}
