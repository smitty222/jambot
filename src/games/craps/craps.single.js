// src/games/craps/craps.single.js
// Clean-room rebuild of a *single-file controller* for craps, compatible with the
// existing `routeCrapsMessage` import used in message.js.
//
// Goals (based on your earlier preferences):
//  - No auto-restart. Round ends with a prompt to type `/craps start`.
//  - Keep message ordering deterministic by awaiting every postMessage sequentially.
//  - Track roll count per round and keep a simple in-memory "record" for most rolls.
//  - Clear, simple commands: 
//      /craps help
//      /craps start
//      /craps join
//      /craps table
//      /craps bet pass <amt>
//      /craps bet dont <amt>
//      /craps roll   (shooter only)
//
// Nice-to-have and TODOs:
//  - Add Come / Place bets (framework points marked).
//  - Optional DB persistence for records (in-memory for now).

import { postMessage } from '../../libs/cometchat.js'
import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../../database/dbwalletmanager.js'
import { PHASES } from './crapsState.js'

const mention = (uuid) => `<@uid:${uuid}>`
const ROOM = (typeof process !== 'undefined' && process.env && process.env.ROOM_UUID) || ''

// Payouts (simplified):
// Pass line: even money on point made; lose on 7-out; on come-out 7/11 wins, 2/3/12 loses.
const MIN_BET = Number(process.env.CRAPS_MIN_BET ?? 5)
const MAX_BET = Number(process.env.CRAPS_MAX_BET ?? 10000)

const state = {
  phase: PHASES.IDLE,
  tableUsers: [],          // array of uuids (turn order)
  shooterIdx: 0,
  point: null,             // number or null
  rollCount: 0,
  record: { rolls: 0, shooter: null }, // in-memory record
  // Bets (line bets only for v1)
  pass: Object.create(null),      // uuid -> amt
  dontPass: Object.create(null)   // uuid -> amt
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function isShooter(uuid) {
  return state.tableUsers.length > 0 && state.tableUsers[state.shooterIdx] === uuid
}

function dice() {
  const d1 = 1 + Math.floor(Math.random() * 6)
  const d2 = 1 + Math.floor(Math.random() * 6)
  return [d1, d2, d1 + d2]
}

function resetBets() {
  state.pass = Object.create(null)
  state.dontPass = Object.create(null)
}

async function announce(room, msg) {
  await postMessage({ room, message: msg })
}

function betsSummary() {
  const lines = []
  const p = Object.entries(state.pass).map(([u,a]) => `${mention(u)} $${a}`)
  const dp = Object.entries(state.dontPass).map(([u,a]) => `${mention(u)} $${a}`)
  if (p.length) lines.push(`Pass: ${p.join(', ')}`)
  if (dp.length) lines.push(`Don't Pass: ${dp.join(', ')}`)
  return lines.join('\\n') || 'No bets on the table.'
}

// ─────────────────────────────────────────────────────────────
// Round control
// ─────────────────────────────────────────────────────────────
async function startRound(room) {
  state.phase = PHASES.COME_OUT
  state.point = null
  state.rollCount = 0
  resetBets()
  if (state.tableUsers.length === 0) {
    await announce(room, `No one is seated. Use **/craps join** to sit and **/craps start** to begin.`)
    state.phase = PHASES.IDLE
    return
  }
  const shooter = state.tableUsers[state.shooterIdx]
  await announce(room, `🎲 Craps — Come-out roll. Shooter: ${mention(shooter)}. Place your **pass**/**don’t** bets. Min $${MIN_BET}. When ready, shooter uses **/craps roll**.`)
}

// advance shooter (keep tableUsers order)
function nextShooter() {
  if (state.tableUsers.length === 0) return
  state.shooterIdx = (state.shooterIdx + 1) % state.tableUsers.length
}

async function endRound(room, reason) {
  state.phase = PHASES.ROUND_END
  await announce(room, reason ? `Round over — ${reason}` : `Round over.`)
  // record
  if (state.rollCount > state.record.rolls) {
    state.record = { rolls: state.rollCount, shooter: state.tableUsers[state.shooterIdx] || null }
    await announce(room, `🏆 New record: ${state.record.rolls} rolls by ${state.record.shooter ? mention(state.record.shooter) : '—' }`)
  }
  await announce(room, `Type **/craps start** for a new round.`)
}

// ─────────────────────────────────────────────────────────────
// Bets
// ─────────────────────────────────────────────────────────────
async function placeLineBet(kind, user, amount, room) {
  const amt = Number(amount || 0)
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) {
    await announce(room, `${mention(user)} invalid amount. Min $${MIN_BET}, Max $${MAX_BET}.`)
    return
  }
  if (state.phase !== PHASES.COME_OUT && state.phase !== PHASES.POINT) {
    await announce(room, `${mention(user)} betting is closed right now.`)
    return
  }
  // Only allow pass/don't during come-out or fresh point (simplified)
  const book = (kind === 'pass') ? state.pass : state.dontPass
  if (book[user]) {
    await announce(room, `${mention(user)} you already have a ${kind} bet of $${book[user]}.`)
    return
  }
  const balance = await getUserWallet(user)
  if (Number(balance) < amt) {
    await announce(room, `${mention(user)} insufficient funds. Balance $${balance}.`)
    return
  }
  const ok = await removeFromUserWallet(user, amt)
  if (!ok) {
    await announce(room, `${mention(user)} wallet error. Bet not placed.`)
    return
  }
  book[user] = amt
  await announce(room, `✅ ${mention(user)} placed ${kind.toUpperCase()} $${amt}.`)
  await announce(room, betsSummary())
}

// ─────────────────────────────────────────────────────────────
// Roll logic
// ─────────────────────────────────────────────────────────────
async function shooterRoll(user, room) {
  if (!isShooter(user)) {
    await announce(room, `${mention(user)} only the shooter may roll.`)
    return
  }
  if (state.phase !== PHASES.COME_OUT && state.phase !== PHASES.POINT) {
    await announce(room, `Not a rolling phase.`)
    return
  }
  const [d1, d2, total] = dice()
  state.rollCount++
  await announce(room, `🎲 Roll: **${d1} + ${d2} = ${total}**${state.point ? `  (point is ${state.point})` : ''}`)

  if (state.phase === PHASES.COME_OUT) {
    if (total === 7 || total === 11) {
      // pass wins, dont loses
      await payPass(room, 'win')
      await payDont(room, 'lose')
      await endRound(room, `come-out ${total} (natural).`)
      nextShooter()
      return
    }
    if ([2,3,12].includes(total)) {
      // pass loses; on 12, don't pass pushes traditionally, but we'll treat 12 as push for dont
      await payPass(room, 'lose')
      if (total === 12) await payDont(room, 'push')
      else await payDont(room, 'win') // 2/3 pay for don't
      await endRound(room, `come-out craps ${total}.`)
      nextShooter()
      return
    }
    // establish point
    state.point = total
    state.phase = PHASES.POINT
    await announce(room, `Point established: **${state.point}**. You may place/re-bet line bets. Shooter: **/craps roll** when ready.`)
    return
  }

  // POINT phase
  if (state.phase === PHASES.POINT) {
    if (total === state.point) {
      await payPass(room, 'win')
      await payDont(room, 'lose')
      await endRound(room, `point **${state.point}** made!`)
      nextShooter()
      return
    }
    if (total === 7) {
      await payPass(room, 'lose')
      await payDont(room, 'win')
      await endRound(room, `seven-out.`)
      nextShooter()
      return
    }
    // otherwise just keep rolling
    return
  }
}

// ─────────────────────────────────────────────────────────────
// Payouts
// ─────────────────────────────────────────────────────────────
async function payPass(room, outcome) {
  const lines = []
  for (const [u, amt] of Object.entries(state.pass)) {
    if (outcome === 'win') {
      await addToUserWallet(u, amt * 2)
      lines.push(`${mention(u)} +$${amt}`)
    } else if (outcome === 'push') {
      await addToUserWallet(u, amt)
      lines.push(`${mention(u)} push (returned $${amt})`)
    } else {
      lines.push(`${mention(u)} -$${amt}`)
    }
  }
  if (lines.length) await announce(room, `Pass line results:\\n${lines.join('\\n')}`)
}

async function payDont(room, outcome) {
  const lines = []
  for (const [u, amt] of Object.entries(state.dontPass)) {
    if (outcome === 'win') {
      await addToUserWallet(u, amt * 2)
      lines.push(`${mention(u)} +$${amt}`)
    } else if (outcome === 'push') {
      await addToUserWallet(u, amt)
      lines.push(`${mention(u)} push (returned $${amt})`)
    } else {
      lines.push(`${mention(u)} -$${amt}`)
    }
  }
  if (lines.length) await announce(room, `Don't Pass results:\\n${lines.join('\\n')}`)
}

// ─────────────────────────────────────────────────────────────
// Table mgmt
// ─────────────────────────────────────────────────────────────
async function joinTable(user, nick, room) {
  if (!state.tableUsers.includes(user)) {
    state.tableUsers.push(user)
    await announce(room, `🪑 ${mention(user)} joined the craps table.`)
  }
}

async function leaveTable(user, room) {
  const i = state.tableUsers.indexOf(user)
  if (i !== -1) {
    state.tableUsers.splice(i, 1)
    // fix shooter index if needed
    if (state.shooterIdx >= state.tableUsers.length) state.shooterIdx = 0
    await announce(room, `👋 ${mention(user)} left the craps table.`)
  }
}

function tableView() {
  const shooter = state.tableUsers[state.shooterIdx] || null
  const seats = state.tableUsers.map(u => `${u === shooter ? '🎯' : '•'} ${mention(u)}`).join('\\n')
  const lines = [
    `Phase: ${state.phase}`,
    state.point ? `Point: ${state.point}` : `Point: —`,
    `Rolls this round: ${state.rollCount}`,
    `Record: ${state.record.rolls} roll(s) ${state.record.shooter ? `by ${mention(state.record.shooter)}` : ''}`,
    ``,
    `Bets:`,
    betsSummary(),
    ``,
    `Seats:`,
    seats || 'No one seated.'
  ]
  return lines.join('\\n')
}

// ─────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────
export async function routeCrapsMessage(payload) {
  const msg = (payload.message || '').trim()
  const room = payload.room || ROOM
  const sender = payload.sender
  const uuid = sender?.uuid || sender?.uid || sender?.id || sender

  if (!msg.toLowerCase().startsWith('/craps')) return false

  const parts = msg.split(/\s+/).slice(1) // remove /craps
  const sub = (parts[0] || '').toLowerCase()

  switch (sub) {
    case 'help':
    case 'h':
      await postMessage({ room, message: `**Craps Commands**
/craps join — sit at the table
/craps start — begin a new round (come-out)
/craps table — show table & bets
/craps bet pass <amt>
/craps bet dont <amt>
/craps roll — shooter rolls` })
      return true

    case 'join':
      await joinTable(uuid, sender?.nickname, room)
      return true

    case 'start':
      await startRound(room)
      return true

    case 'table':
      await postMessage({ room, message: tableView() })
      return true

    case 'bet':
      {
        // Normalize apostrophes so "don't" and "dont" are treated the same
        const kindRaw = (parts[1] || '').toLowerCase()
        const kind = kindRaw.replace(/['’]/g, '')
        const amt = parts[2]
        if (!['pass','dont','dontpass'].includes(kind)) {
          await postMessage({ room, message: `Usage: /craps bet pass <amt>  or  /craps bet dont <amt>` })
          return true
        }
        const norm = kind.startsWith('dont') ? 'dont' : 'pass'
        await placeLineBet(norm, uuid, amt, room)
        return true
      }

    case 'roll':
      await shooterRoll(uuid, room)
      return true

    default:
      // bare "/craps" shows table
      if (!sub) {
        await postMessage({ room, message: tableView() })
        return true
      }
      await postMessage({ room, message: `Unknown craps subcommand. Try **/craps help**.` })
      return true
  }
}
