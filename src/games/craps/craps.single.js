// src/games/craps/craps.single.js
// Craps with blackjack-style windows + shooter hands.
// Improvements:
//  - Hand ends only on seven-out (shooter rotates then).
//  - After a hand ends, open a JOIN window so others can join.
//  - After betting closes, shooter has a roll timer (default 45s). If they don’t roll, skip them for this round.

import { postMessage } from '../../libs/cometchat.js'
import {
  addToUserWallet,
  removeFromUserWallet,
  getUserWallet,
  addOrUpdateUser
} from '../../database/dbwalletmanager.js'
import { PHASES } from './crapsState.js'
import db from '../../database/db.js'
import { getSenderNickname } from '../../utils/helpers.js'
import { getDisplayName, sanitizeNickname } from '../../utils/names.js'

/* ───────────────────────── Records (DB) ───────────────────────── */

async function persistRecord (room, rolls, shooterId) {
  try {
    const rawMention = await getSenderNickname(shooterId).catch(() => null)
    const clean = sanitizeNickname(rawMention)
    await addOrUpdateUser(shooterId, clean)
    const shooterNickname = clean || getDisplayName(shooterId)

    db.prepare(`
      INSERT INTO craps_records (roomId, maxRolls, shooterId, shooterNickname, achievedAt)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(roomId) DO UPDATE SET
        maxRolls = excluded.maxRolls,
        shooterId = excluded.shooterId,
        shooterNickname = excluded.shooterNickname,
        achievedAt = excluded.achievedAt
    `).run(room, rolls, shooterId, shooterNickname)
  } catch {
    db.prepare(`
      INSERT INTO craps_records (roomId, maxRolls, shooterId, shooterNickname, achievedAt)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(roomId) DO UPDATE SET
        maxRolls = excluded.maxRolls,
        shooterId = excluded.shooterId,
        shooterNickname = excluded.shooterNickname,
        achievedAt = excluded.achievedAt
    `).run(room, rolls, shooterId, shooterId)
  }
}

function loadRoomRecordIntoState (room, st) {
  try {
    const row = db.prepare(`
      SELECT maxRolls, shooterId
      FROM craps_records
      WHERE roomId = ?
    `).get(room)
    if (row && Number(row.maxRolls) > 0) {
      st.record = { rolls: Number(row.maxRolls), shooter: row.shooterId || null }
    }
  } catch {
    // ignore
  }
}

/* ───────────────────────── Constants ───────────────────────── */

const ROOM_DEFAULT = process.env.ROOM_UUID || ''
if (!ROOM_DEFAULT) console.warn('[craps] ROOM_UUID not set — room state may reset unexpectedly.')

const mention = (uuid) => `<@uid:${uuid}>`

const MIN_BET   = Number(process.env.CRAPS_MIN_BET ?? 5)
const MAX_BET   = Number(process.env.CRAPS_MAX_BET ?? 10000)
const JOIN_SECS = Number(process.env.CRAPS_JOIN_SECS ?? 30)
const BET_SECS  = Number(process.env.CRAPS_BET_SECS  ?? 30)
const ROLL_SECS = Number(process.env.CRAPS_ROLL_SECS ?? 45)

const PLACES = [4, 5, 6, 8, 9, 10]

/* ───────────────────────── State ───────────────────────── */

const TABLES = new Map()

function S (room) {
  const key = room || ROOM_DEFAULT
  if (!TABLES.has(key)) {
    const st = freshState()
    TABLES.set(key, st)
    loadRoomRecordIntoState(key, st)
  }
  return TABLES.get(key)
}

function freshState () {
  return {
    phase: PHASES.IDLE,

    tableUsers: [],
    shooterIdx: 0,

    point: null,
    rollCount: 0, // rolls in the current hand (until seven-out)

    record: { rolls: 0, shooter: null },

    roundResults: Object.create(null),

    pass: Object.create(null),
    dontPass: Object.create(null),

    comeWaiting: Object.create(null),
    dontComeWaiting: Object.create(null),
    comePoint: Object.create(null),      // uuid -> { num, amt }
    dontComePoint: Object.create(null),

    place: { 4:{}, 5:{}, 6:{}, 8:{}, 9:{}, 10:{} },

    timers: { join: null, bet: null, roll: null }
  }
}

/* ───────────────────────── Helpers ───────────────────────── */

async function say (room, message) {
  await postMessage({ room, message })
}

const d = () => 1 + Math.floor(Math.random() * 6)
function dice () {
  const a = d(), b = d()
  return [a, b, a + b]
}

function shooterUuid (st) {
  return st.tableUsers[st.shooterIdx] || null
}

function isShooter (uuid, st) {
  return shooterUuid(st) === uuid
}

function clearTimers (st) {
  for (const k of ['join','bet','roll']) {
    const t = st.timers[k]
    if (t) { clearTimeout(t); st.timers[k] = null }
  }
}

function resetAllBets (st) {
  st.pass = Object.create(null)
  st.dontPass = Object.create(null)
  st.comeWaiting = Object.create(null)
  st.dontComeWaiting = Object.create(null)
  st.comePoint = Object.create(null)
  st.dontComePoint = Object.create(null)
  st.place = { 4:{}, 5:{}, 6:{}, 8:{}, 9:{}, 10:{} }
}

function fmtMoney (n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '$0'
  const abs = Math.abs(num)
  const v = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2)
  return `$${v}`
}

function addRoundResult (st, uuid, amt) {
  if (!uuid || !Number.isFinite(amt) || amt === 0) return
  st.roundResults[uuid] = (st.roundResults[uuid] || 0) + amt
}

function lineBetsSummary (st) {
  const show = (book, label) => {
    const items = Object.entries(book).map(([u,a]) => `${mention(u)} ${fmtMoney(a)}`)
    return items.length ? `${label}: ${items.join(', ')}` : null
  }
  return [show(st.pass,'Pass'), show(st.dontPass,"Don't Pass")].filter(Boolean).join('\n') || 'No line bets.'
}

/* ───────────────────────── Join / Betting / Roll timer ───────────────────────── */

async function autoSeat (st, uuid, room) {
  if (!uuid) return
  if (!st.tableUsers.includes(uuid)) {
    st.tableUsers.push(uuid)
    await say(room, `🪑 ${mention(uuid)} sits at the table.`)
  }
}

// Full reset table (new session)
async function openJoinWindow (room, starterUuid) {
  const st = S(room)
  clearTimers(st)

  st.phase = PHASES.JOIN
  st.point = null
  st.rollCount = 0
  st.roundResults = Object.create(null)
  resetAllBets(st)

  // (Re)seat the starter automatically
  if (starterUuid) await autoSeat(st, starterUuid, room)

  await say(
    room,
    `🎲 **Craps** table is open for **${JOIN_SECS}s**!\n` +
    `Type **/craps join** to take a seat. Then place **/pass <amt>** or **/dontpass <amt>** during betting.`
  )

  st.timers.join = setTimeout(async () => {
    st.timers.join = null
    await closeJoinOpenBetting(room)
  }, JOIN_SECS * 1000)
}

// Inter-hand join (keep seated players, allow others to join)
async function openInterHandJoin (room) {
  const st = S(room)
  clearTimers(st)

  st.phase = PHASES.JOIN
  st.point = null
  st.rollCount = 0
  st.roundResults = Object.create(null)
  resetAllBets(st)

  const shooter = shooterUuid(st)
  const seated = st.tableUsers.length ? st.tableUsers.map(mention).join(', ') : '—'

  await say(
    room,
    `🧾 Hand over. Next shooter will be ${shooter ? mention(shooter) : '—'}.\n` +
    `🪑 **Join window open** for **${JOIN_SECS}s** (current seats: ${seated}).\n` +
    `Type **/craps join** to sit. Betting opens when join closes.`
  )

  st.timers.join = setTimeout(async () => {
    st.timers.join = null
    await closeJoinOpenBetting(room)
  }, JOIN_SECS * 1000)
}

async function closeJoinOpenBetting (room) {
  const st = S(room)
  if (!st.tableUsers.length) {
    st.phase = PHASES.IDLE
    await say(room, `⏱️ Join closed — nobody seated. Table closed.`)
    return
  }

  const seats = st.tableUsers.map(mention).join(', ')
  await say(room, `⏱️ Join closed. Players seated: ${seats}`)

  st.phase = PHASES.BETTING
  await say(room, `💰 **Betting open** for **${BET_SECS}s**.\nPlace **/pass <amt>** or **/dontpass <amt>**.`)

  st.timers.bet = setTimeout(async () => {
    st.timers.bet = null
    await closeBettingBeginComeOut(room)
  }, BET_SECS * 1000)
}

async function closeBettingBeginComeOut (room) {
  const st = S(room)

  const anyLine = Object.keys(st.pass).length || Object.keys(st.dontPass).length
  if (!anyLine) {
    // Keep it simple: if nobody bet the line, cancel this attempt and reopen join quickly
    st.phase = PHASES.IDLE
    await say(room, `No valid line bets. Table closed.`)
    return
  }

  await say(room, `📋 **Line bets locked:**\n${lineBetsSummary(st)}`)

  st.phase = PHASES.COME_OUT
  st.point = null

  const sh = shooterUuid(st)
  await say(
    room,
    `🎯 Shooter: ${mention(sh)} — you have **${ROLL_SECS}s** to **/roll**.`
  )

  startRollTimer(room)
}

function startRollTimer (room) {
  const st = S(room)
  if (st.timers.roll) clearTimeout(st.timers.roll)
  st.timers.roll = setTimeout(async () => {
    st.timers.roll = null
    await handleShooterNoRollTimeout(room)
  }, ROLL_SECS * 1000)
}

function stopRollTimer (room) {
  const st = S(room)
  if (st.timers.roll) {
    clearTimeout(st.timers.roll)
    st.timers.roll = null
  }
}

async function handleShooterNoRollTimeout (room) {
  const st = S(room)
  // Only enforce if we're still waiting for first roll of this round
  if (st.phase !== PHASES.COME_OUT) return
  if (st.rollCount > 0) return

  const sh = shooterUuid(st)
  if (!sh) {
    st.phase = PHASES.IDLE
    await say(room, `Shooter missing — table closed.`)
    return
  }

  // “Assume the original shooter is not playing this round”
  // We remove them from seats; they can rejoin next join window.
  const idx = st.tableUsers.indexOf(sh)
  if (idx !== -1) st.tableUsers.splice(idx, 1)

  // Fix shooterIdx after removal
  if (st.shooterIdx >= st.tableUsers.length) st.shooterIdx = 0

  await say(
    room,
    `⏱️ ${mention(sh)} didn’t roll in time — skipping them for this round.\n` +
    `They can rejoin later with **/craps join**.`
  )

  // If table empty now, close it. Otherwise open an inter-hand join for next shooter.
  if (!st.tableUsers.length) {
    st.phase = PHASES.IDLE
    resetAllBets(st)
    await say(room, `No players seated. Type **/craps** to open a new table.`)
    return
  }

  // Next shooter is whoever is now at shooterIdx (already adjusted)
  await openInterHandJoin(room)
}

/* ───────────────────────── Bets ───────────────────────── */

async function placeLineBet (kind, user, amount, room) {
  const st = S(room)
  const amt = Number(amount || 0)

  if (!st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you must join the table to bet.`)
    return
  }
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) {
    await say(room, `${mention(user)} invalid amount. Min ${fmtMoney(MIN_BET)}, Max ${fmtMoney(MAX_BET)}.`)
    return
  }

  if (st.phase !== PHASES.BETTING) {
    await say(room, `${mention(user)} Pass/Don't Pass bets are only during the betting window.`)
    return
  }

  const book = (kind === 'pass') ? st.pass : st.dontPass
  if (book[user]) {
    await say(room, `${mention(user)} you already have a ${kind === 'pass' ? 'Pass' : "Don't Pass"} bet of ${fmtMoney(book[user])}.`)
    return
  }

  const bal = await getUserWallet(user)
  if (Number(bal) < amt) {
    await say(room, `${mention(user)} insufficient funds. Balance ${fmtMoney(bal)}.`)
    return
  }

  const ok = await removeFromUserWallet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  book[user] = amt
  await say(room, `✅ ${mention(user)} placed **${kind === 'pass' ? 'PASS' : "DON'T PASS"}** ${fmtMoney(amt)}.`)
}

async function placeComeBet (kind, user, amount, room) {
  const st = S(room)
  const amt = Number(amount || 0)

  if (!st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you must join the table to bet.`)
    return
  }
  if (st.phase !== PHASES.POINT) {
    await say(room, `Come/Don't Come only during POINT.`)
    return
  }
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) {
    await say(room, `${mention(user)} invalid amount. Min ${fmtMoney(MIN_BET)}, Max ${fmtMoney(MAX_BET)}.`)
    return
  }

  const waiting = (kind === 'come') ? st.comeWaiting : st.dontComeWaiting
  if (waiting[user] || (kind === 'come' ? st.comePoint[user] : st.dontComePoint[user])) {
    await say(room, `${mention(user)} you already have a ${kind === 'come' ? 'Come' : "Don't Come"} bet working.`)
    return
  }

  const bal = await getUserWallet(user)
  if (Number(bal) < amt) { await say(room, `${mention(user)} insufficient funds. Balance ${fmtMoney(bal)}.`); return }

  const ok = await removeFromUserWallet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  waiting[user] = amt
  await say(room, `✅ ${mention(user)} placed **${kind === 'come' ? 'COME' : "DON'T COME"}** ${fmtMoney(amt)} (waiting next roll).`)
}

async function placePlaceBet (num, user, amount, room) {
  const st = S(room)
  const n = Number(num)
  const amt = Number(amount || 0)

  if (!st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you must join the table to bet.`)
    return
  }
  if (st.phase !== PHASES.POINT) {
    await say(room, `Place bets only during POINT.`)
    return
  }
  if (!PLACES.includes(n)) {
    await say(room, `Valid place numbers: ${PLACES.join(', ')}.`)
    return
  }
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) {
    await say(room, `${mention(user)} invalid amount. Min ${fmtMoney(MIN_BET)}, Max ${fmtMoney(MAX_BET)}.`)
    return
  }
  if (st.place[n][user]) {
    await say(room, `${mention(user)} you already have a place bet on ${n} (${fmtMoney(st.place[n][user])}).`)
    return
  }

  const bal = await getUserWallet(user)
  if (Number(bal) < amt) {
    await say(room, `${mention(user)} insufficient funds. Balance ${fmtMoney(bal)}.`)
    return
  }
  const ok = await removeFromUserWallet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  st.place[n][user] = amt
  await say(room, `✅ ${mention(user)} placed ${fmtMoney(amt)} on **${n}**.`)
}

async function removePlaceBet (num, user, room) {
  const st = S(room)
  const n = Number(num)

  if (!st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you must join the table to remove a bet.`)
    return
  }
  if (!PLACES.includes(n)) {
    await say(room, `Valid place numbers: ${PLACES.join(', ')}.`)
    return
  }
  const amt = st.place[n][user]
  if (!amt) {
    await say(room, `${mention(user)} you have no place bet on ${n}.`)
    return
  }
  delete st.place[n][user]
  await addToUserWallet(user, amt)
  await say(room, `↩️ ${mention(user)} removed place ${n}, returned ${fmtMoney(amt)}.`)
}

/* ───────────────────────── Payout helpers ───────────────────────── */

function placeProfit (num, amt) {
  if (num === 4 || num === 10) return amt * (9 / 5)
  if (num === 5 || num === 9) return amt * (7 / 5)
  if (num === 6 || num === 8) return amt * (7 / 6)
  return 0
}

/* ───────────────────────── Rolling + recap block ───────────────────────── */

async function shooterRoll (user, room) {
  const st = S(room)

  if (!isShooter(user, st)) { await say(room, `${mention(user)} only the shooter may roll.`); return }
  if (![PHASES.COME_OUT, PHASES.POINT].includes(st.phase)) { await say(room, `Not a rolling phase.`); return }

  // Shooter rolled — stop the “must roll” timer (only applies before first roll)
  stopRollTimer(room)

  const [d1, d2, total] = dice()
  st.rollCount++

  const recap = []
  recap.push(`🎲 **Roll:** **${d1} + ${d2} = ${total}**${st.point ? `  _(point is ${st.point})_` : ''}`)

  if (st.phase === PHASES.COME_OUT) {
    if (total === 7 || total === 11) {
      const passLines = await settlePass(st, 'win')
      const dpLines = await settleDontPass(st, 'lose')

      const res = []
      if (passLines.length) res.push(`**Pass:**\n${passLines.join('\n')}`)
      if (dpLines.length) res.push(`**Don't Pass:**\n${dpLines.join('\n')}`)
      if (res.length) recap.push(`📌 **Resolutions:**\n${res.join('\n')}`)

      recap.push(`✅ Come-out **${total}** (natural). New come-out — join next hand only on seven-out.`)
      st.point = null
      st.phase = PHASES.COME_OUT
      await say(room, recap.join('\n'))
      return
    }

    if ([2, 3, 12].includes(total)) {
      const passLines = await settlePass(st, 'lose')
      const dpLines = await settleDontPass(st, total === 12 ? 'push' : 'win')

      const res = []
      if (passLines.length) res.push(`**Pass:**\n${passLines.join('\n')}`)
      if (dpLines.length) res.push(`**Don't Pass:**\n${dpLines.join('\n')}`)
      if (res.length) recap.push(`📌 **Resolutions:**\n${res.join('\n')}`)

      recap.push(`💥 Come-out craps **${total}**. New come-out — join next hand only on seven-out.`)
      st.point = null
      st.phase = PHASES.COME_OUT
      await say(room, recap.join('\n'))
      return
    }

    st.point = total
    st.phase = PHASES.POINT
    recap.push(`🟢 **Point established:** **${st.point}**`)
    recap.push(`You may add **/come <amt>**, **/dontcome <amt>**, **/place <num> <amt>**, or **/removeplace <num>**.`)
    await say(room, recap.join('\n'))
    return
  }

  // POINT phase:
  const movedLines = await resolveComeWaiting(total, st)
  const comePointLines = await resolveComePoints(total, st)
  const placeLines = await resolvePlace(total, st)

  const res = []
  if (movedLines.length) res.push(movedLines.join('\n'))
  if (comePointLines.length) res.push(comePointLines.join('\n'))
  if (placeLines.length) res.push(placeLines.join('\n'))
  if (res.length) recap.push(`📌 **Resolutions:**\n${res.join('\n')}`)

  if (total === st.point) {
    const passLines = await settlePass(st, 'win')
    const dpLines = await settleDontPass(st, 'lose')

    const lineRes = []
    if (passLines.length) lineRes.push(`**Pass:**\n${passLines.join('\n')}`)
    if (dpLines.length) lineRes.push(`**Don't Pass:**\n${dpLines.join('\n')}`)
    if (lineRes.length) recap.push(`🎯 **Point hit:**\n${lineRes.join('\n')}`)

    st.point = null
    st.phase = PHASES.COME_OUT
    recap.push(`✅ Point made! **Same shooter** — new come-out.`)
    await say(room, recap.join('\n'))
    return
  }

  if (total === 7) {
    const passLines = await settlePass(st, 'lose')
    const dpLines = await settleDontPass(st, 'win')

    const lineRes = []
    if (passLines.length) lineRes.push(`**Pass:**\n${passLines.join('\n')}`)
    if (dpLines.length) lineRes.push(`**Don't Pass:**\n${dpLines.join('\n')}`)
    if (lineRes.length) recap.push(`💀 **Seven-out:**\n${lineRes.join('\n')}`)

    await say(room, recap.join('\n'))
    await endHand(room, `seven-out.`)
    return
  }

  recap.push(`⏭️ Point stays **${st.point}**. Shooter **/roll** when ready.`)
  await say(room, recap.join('\n'))
}

/* ───────────────────────── Settlements / Resolutions (return lines) ───────────────────────── */

async function settlePass (st, outcome) {
  const lines = []
  for (const [u, amt] of Object.entries(st.pass)) {
    if (outcome === 'win') {
      await addToUserWallet(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(`${mention(u)} **+${fmtMoney(amt)}**`)
    } else if (outcome === 'push') {
      await addToUserWallet(u, amt)
      lines.push(`${mention(u)} push (${fmtMoney(amt)})`)
    } else {
      addRoundResult(st, u, -amt)
      lines.push(`${mention(u)} **-${fmtMoney(amt)}**`)
    }
  }
  st.pass = Object.create(null)
  return lines
}

async function settleDontPass (st, outcome) {
  const lines = []
  for (const [u, amt] of Object.entries(st.dontPass)) {
    if (outcome === 'win') {
      await addToUserWallet(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(`${mention(u)} **+${fmtMoney(amt)}**`)
    } else if (outcome === 'push') {
      await addToUserWallet(u, amt)
      lines.push(`${mention(u)} push (${fmtMoney(amt)})`)
    } else {
      addRoundResult(st, u, -amt)
      lines.push(`${mention(u)} **-${fmtMoney(amt)}**`)
    }
  }
  st.dontPass = Object.create(null)
  return lines
}

async function resolveComeWaiting (total, st) {
  const lines = []

  for (const [u, amt] of Object.entries(st.comeWaiting)) {
    if (total === 7 || total === 11) {
      await addToUserWallet(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(`${mention(u)} COME **+${fmtMoney(amt)}**`)
    } else if ([2, 3, 12].includes(total)) {
      if (total === 12) {
        await addToUserWallet(u, amt)
        lines.push(`${mention(u)} COME push (${fmtMoney(amt)})`)
      } else {
        addRoundResult(st, u, -amt)
        lines.push(`${mention(u)} COME **-${fmtMoney(amt)}**`)
      }
    } else {
      st.comePoint[u] = { num: total, amt }
      lines.push(`${mention(u)} COME moves to **${total}** (${fmtMoney(amt)})`)
    }
    delete st.comeWaiting[u]
  }

  for (const [u, amt] of Object.entries(st.dontComeWaiting)) {
    if ([2, 3].includes(total)) {
      await addToUserWallet(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(`${mention(u)} DON'T COME **+${fmtMoney(amt)}**`)
    } else if (total === 12) {
      await addToUserWallet(u, amt)
      lines.push(`${mention(u)} DON'T COME push (${fmtMoney(amt)})`)
    } else if (total === 7 || total === 11) {
      addRoundResult(st, u, -amt)
      lines.push(`${mention(u)} DON'T COME **-${fmtMoney(amt)}**`)
    } else {
      st.dontComePoint[u] = { num: total, amt }
      lines.push(`${mention(u)} DON'T COME set **against ${total}** (${fmtMoney(amt)})`)
    }
    delete st.dontComeWaiting[u]
  }

  return lines
}

async function resolveComePoints (total, st) {
  const lines = []

  for (const [u, o] of Object.entries(st.comePoint)) {
    if (total === o.num) {
      await addToUserWallet(u, o.amt * 2)
      addRoundResult(st, u, o.amt)
      lines.push(`${mention(u)} COME on ${o.num} **+${fmtMoney(o.amt)}**`)
      delete st.comePoint[u]
    } else if (total === 7) {
      addRoundResult(st, u, -o.amt)
      lines.push(`${mention(u)} COME on ${o.num} **-${fmtMoney(o.amt)}**`)
      delete st.comePoint[u]
    }
  }

  for (const [u, o] of Object.entries(st.dontComePoint)) {
    if (total === 7) {
      await addToUserWallet(u, o.amt * 2)
      addRoundResult(st, u, o.amt)
      lines.push(`${mention(u)} DON'T COME vs ${o.num} **+${fmtMoney(o.amt)}**`)
      delete st.dontComePoint[u]
    } else if (total === o.num) {
      addRoundResult(st, u, -o.amt)
      lines.push(`${mention(u)} DON'T COME vs ${o.num} **-${fmtMoney(o.amt)}**`)
      delete st.dontComePoint[u]
    }
  }

  return lines
}

async function resolvePlace (total, st) {
  const lines = []

  if (total === 7) {
    for (const n of PLACES) {
      for (const [u, amt] of Object.entries(st.place[n])) {
        addRoundResult(st, u, -amt)
        lines.push(`${mention(u)} place ${n} **-${fmtMoney(amt)}**`)
      }
      st.place[n] = {}
    }
    return lines
  }

  if (PLACES.includes(total)) {
    const book = st.place[total]
    for (const [u, amt] of Object.entries(book)) {
      const profit = placeProfit(total, amt)
      if (profit > 0) {
        await addToUserWallet(u, profit)
        addRoundResult(st, u, profit)
        const p = Number.isInteger(profit) ? profit.toString() : profit.toFixed(2)
        lines.push(`${mention(u)} place ${total} win → **+$${p}**`)
      }
    }
  }

  return lines
}

/* ───────────────────────── Hand End (seven-out only) ───────────────────────── */

function nextShooter (st) {
  if (!st.tableUsers.length) return
  st.shooterIdx = (st.shooterIdx + 1) % st.tableUsers.length
}

async function endHand (room, reason) {
  const st = S(room)
  const shooter = shooterUuid(st)

  await say(room, reason ? `🧾 Hand over — ${reason}` : `🧾 Hand over.`)

  // Totals for the hand
  const rrKeys = Object.keys(st.roundResults || {})
  if (rrKeys.length) {
    const totals = rrKeys.map(u => {
      const amt = st.roundResults[u]
      const sign = amt >= 0 ? '+' : '-'
      return `${mention(u)} ${sign}${fmtMoney(Math.abs(amt))}`
    })
    await say(room, `Hand totals:\n${totals.join('\n')}`)
  }

  // Record check
  if (st.rollCount > st.record.rolls) {
    st.record = { rolls: st.rollCount, shooter: shooter || null }
    await say(room, `🏆 New record: ${st.record.rolls} roll(s) by ${shooter ? mention(shooter) : '—'}`)
    if (shooter) await persistRecord(room, st.record.rolls, shooter)
  }

  // Rotate shooter for next hand
  nextShooter(st)

  // Reset hand state, keep seats
  st.point = null
  st.rollCount = 0
  st.roundResults = Object.create(null)
  resetAllBets(st)
  stopRollTimer(room)

  // Open a JOIN window so others can join before next betting
  await openInterHandJoin(room)
}

/* ───────────────────────── Table mgmt / Bets view ───────────────────────── */

async function joinTable (user, room) {
  const st = S(room)
  if (!st.tableUsers.includes(user)) {
    st.tableUsers.push(user)
    await say(room, `🪑 ${mention(user)} sits at the table.`)
  }
}

function userBetsView (room, uuid) {
  const st = S(room)
  const lines = []

  if (st.pass[uuid]) lines.push(`Pass: ${fmtMoney(st.pass[uuid])}`)
  if (st.dontPass[uuid]) lines.push(`Don't Pass: ${fmtMoney(st.dontPass[uuid])}`)
  if (st.comeWaiting[uuid]) lines.push(`Come (waiting): ${fmtMoney(st.comeWaiting[uuid])}`)
  if (st.dontComeWaiting[uuid]) lines.push(`Don't Come (waiting): ${fmtMoney(st.dontComeWaiting[uuid])}`)
  if (st.comePoint[uuid]) lines.push(`Come on ${st.comePoint[uuid].num}: ${fmtMoney(st.comePoint[uuid].amt)}`)
  if (st.dontComePoint[uuid]) lines.push(`Don't Come vs ${st.dontComePoint[uuid].num}: ${fmtMoney(st.dontComePoint[uuid].amt)}`)

  const places = []
  for (const n of PLACES) {
    const amt = st.place[n]?.[uuid]
    if (amt) places.push(`${n}: ${fmtMoney(amt)}`)
  }
  if (places.length) lines.push(`Place: ${places.join(', ')}`)

  if (!lines.length) return `No active bets for ${mention(uuid)}.`
  return `**Your bets (${mention(uuid)})**\n` + lines.map(l => `• ${l}`).join('\n')
}

/* ───────────────────────── Router ───────────────────────── */

export async function routeCrapsMessage (payload) {
  const raw = (payload.message || '').trim()
  const room = payload.room || ROOM_DEFAULT
  const sender = payload.sender
  const uuid = sender?.uuid || sender?.uid || sender?.id || sender
  const low = raw.toLowerCase()

  // Top-level /bets
  if (/^\/bets\b/i.test(low)) {
    await postMessage({ room, message: userBetsView(room, uuid) })
    return true
  }

  // Allow "/join craps|cr" during JOIN window
  if (/^\/join\s+(craps|cr)\b/i.test(low)) {
    if (S(room).phase !== PHASES.JOIN) { await postMessage({ room, message: `You can only join during the join window.` }); return true }
    await joinTable(uuid, room)
    return true
  }

  // Top-level bet/roll aliases
  const alias = low.match(/^\/(pass|dontpass|come|dontcome|place|removeplace|roll)\b/)
  if (alias) {
    const cmd = alias[1]
    const parts = raw.split(/\s+/)
    parts.shift()
    switch (cmd) {
      case 'pass':       await placeLineBet('pass', uuid, parts[0], room); return true
      case 'dontpass':   await placeLineBet('dont', uuid, parts[0], room); return true
      case 'come':       await placeComeBet('come', uuid, parts[0], room); return true
      case 'dontcome':   await placeComeBet('dontcome', uuid, parts[0], room); return true
      case 'place': {
        const [num, amt] = parts
        if (!num || !amt) { await postMessage({ room, message: `Usage: /place <4|5|6|8|9|10> <amount>` }); return true }
        await placePlaceBet(Number(num), uuid, amt, room)
        return true
      }
      case 'removeplace': {
        const [num] = parts
        if (!num) { await postMessage({ room, message: `Usage: /removeplace <4|5|6|8|9|10>` }); return true }
        await removePlaceBet(Number(num), uuid, room)
        return true
      }
      case 'roll':       await shooterRoll(uuid, room); return true
    }
  }

  if (!/^\/craps\b/i.test(raw)) return false

  const parts = raw.split(/\s+/); parts.shift()
  const sub = (parts.shift() || '').toLowerCase()

  switch (sub) {
    case '': {
      if (S(room).phase === PHASES.IDLE) {
        await openJoinWindow(room, uuid)
      } else {
        await postMessage({ room, message: `Craps is running. Use **/craps join** during join windows, or **/craps bets** to see your bets.` })
      }
      return true
    }

    case 'start':
      await openJoinWindow(room, uuid)
      return true

    case 'join':
      if (S(room).phase !== PHASES.JOIN) { await postMessage({ room, message: `You can only join during the join window.` }); return true }
      await joinTable(uuid, room)
      return true

    case 'bets':
      await postMessage({ room, message: userBetsView(room, uuid) })
      return true

    case 'help':
    case 'h':
      await postMessage({
        room,
        message: `**Craps Instructions**
Join during join windows, bet Pass/Don't Pass during betting, then the shooter rolls.

**Commands**
/craps — start if idle
/craps start — reset & open join
/craps join — sit during join
/pass <amt>, /dontpass <amt> — line bets (betting window)
/roll — shooter rolls (must roll within ${ROLL_SECS}s after betting closes)
/come <amt>, /dontcome <amt> — point phase
/place <num> <amt>, /removeplace <num> — point phase
/bets or /craps bets — show only your bets

**Flow**
join → betting → come-out → point
Point made returns to come-out (same shooter). Seven-out ends the hand, rotates shooter, and opens a new join window.`
      })
      return true

    default:
      await postMessage({ room, message: `Unknown craps subcommand. Try **/craps help**.` })
      return true
  }
}
