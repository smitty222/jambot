// src/games/craps/craps.single.js
// Craps with blackjack-style windows + first-class bet commands.
// Commands:
//   /craps             -> if idle: opens JOIN; else shows table
//   /craps start       -> opens JOIN (resets round)
//   /craps join        -> join during join window
//   /craps table, /craps help
//   /roll              -> shooter roll (alias works without /craps)
//   /pass <amt>, /dontpass <amt>
//   /come <amt>, /dontcome <amt>            (POINT only)
//   /place <4|5|6|8|9|10> <amt>             (POINT only)
//   /removeplace <4|5|6|8|9|10>
//
// Env (optional): CRAPS_MIN_BET, CRAPS_MAX_BET, CRAPS_JOIN_SECS, CRAPS_BET_SECS

import { postMessage } from '../../libs/cometchat.js'
import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../../database/dbwalletmanager.js'
import { PHASES } from './crapsState.js'
import db from '../../database/db.js'
import { getSenderNickname } from '../../utils/helpers.js'

async function persistRecord(room, rolls, shooterId) {
  const shooterNickname = (await getSenderNickname(shooterId).catch(() => null)) || shooterId
  db.prepare(`
    INSERT INTO craps_records (roomId, maxRolls, shooterId, shooterNickname, achievedAt)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(roomId) DO UPDATE SET
      maxRolls = excluded.maxRolls,
      shooterId = excluded.shooterId,
      shooterNickname = excluded.shooterNickname,
      achievedAt = excluded.achievedAt
  `).run(room, rolls, shooterId, shooterNickname)
}

const ROOM_DEFAULT = (typeof process !== 'undefined' && process.env && process.env.ROOM_UUID) || ''
const mention = (uuid) => `<@uid:${uuid}>`

const MIN_BET   = Number(process.env.CRAPS_MIN_BET ?? 5)
const MAX_BET   = Number(process.env.CRAPS_MAX_BET ?? 10000)
const JOIN_SECS = Number(process.env.CRAPS_JOIN_SECS ?? 30)
const BET_SECS  = Number(process.env.CRAPS_BET_SECS  ?? 30)

const PLACES = [4,5,6,8,9,10]

// ──────────────────────────────────────────────
// Per-room table state
// ──────────────────────────────────────────────
const TABLES = new Map()
function S (room) {
  const key = room || ROOM_DEFAULT
  if (!TABLES.has(key)) TABLES.set(key, freshState())
  return TABLES.get(key)
}
function freshState () {
  return {
    phase: PHASES.IDLE,
    tableUsers: [],
    shooterIdx: 0,
    point: null,
    rollCount: 0,
    record: { rolls: 0, shooter: null },

    // Line bets
    pass: Object.create(null),
    dontPass: Object.create(null),

    // Come/Don't Come
    comeWaiting: Object.create(null),
    dontComeWaiting: Object.create(null),
    comePoint: Object.create(null),      // uuid -> { num, amt }
    dontComePoint: Object.create(null),

    // Place bets: num -> { uuid: amt }
    place: { 4:{}, 5:{}, 6:{}, 8:{}, 9:{}, 10:{} },

    timers: { join: null, bet: null }
  }
}

// NEW helper near other helpers
async function autoSeat(st, uuid, room) {
  if (!uuid) return
  if (!st.tableUsers.includes(uuid)) {
    st.tableUsers.push(uuid)
    await say(room, `🪑 ${mention(uuid)} sits at the table.`)
  }
}

async function say (room, message) { await postMessage({ room, message }) }
const d = () => 1 + Math.floor(Math.random() * 6)
function dice () { const a = d(), b = d(); return [a,b,a+b] }
function shooterUuid (st) { return st.tableUsers[st.shooterIdx] || null }
function isShooter (uuid, st) { return shooterUuid(st) === uuid }
function resetAllBets (st) {
  st.pass = Object.create(null)
  st.dontPass = Object.create(null)
  st.comeWaiting = Object.create(null)
  st.dontComeWaiting = Object.create(null)
  st.comePoint = Object.create(null)
  st.dontComePoint = Object.create(null)
  st.place = { 4:{}, 5:{}, 6:{}, 8:{}, 9:{}, 10:{} }
}
function clearTimers (st) {
  for (const k of ['join','bet']) {
    const t = st.timers[k]
    if (t) { clearTimeout(t); st.timers[k] = null }
  }
}

// ──────────────────────────────────────────────
// Views
// ──────────────────────────────────────────────
function lineBetsSummary (st) {
  const show = (book, label) => {
    const items = Object.entries(book).map(([u,a]) => `${mention(u)} $${a}`)
    return items.length ? `${label}: ${items.join(', ')}` : null
  }
  return [show(st.pass,'Pass'), show(st.dontPass,"Don't Pass")].filter(Boolean).join('\n') || 'No line bets.'
}
function sideBetsSummary (st) {
  const lines = []

  const cw = Object.entries(st.comeWaiting).map(([u,a]) => `${mention(u)} $${a}`)
  if (cw.length) lines.push(`Come (waiting): ${cw.join(', ')}`)
  const dcw = Object.entries(st.dontComeWaiting).map(([u,a]) => `${mention(u)} $${a}`)
  if (dcw.length) lines.push(`Don't Come (waiting): ${dcw.join(', ')}`)

  const cp = Object.entries(st.comePoint).map(([u,o]) => `${mention(u)} $${o.amt} on ${o.num}`)
  if (cp.length) lines.push(`Come points: ${cp.join(', ')}`)
  const dcp = Object.entries(st.dontComePoint).map(([u,o]) => `${mention(u)} $${o.amt} against ${o.num}`)
  if (dcp.length) lines.push(`Don't Come points: ${dcp.join(', ')}`)

  const placeLines = []
  for (const n of PLACES) {
    const book = st.place[n]
    const items = Object.entries(book).map(([u,a]) => `${mention(u)} $${a}`)
    if (items.length) placeLines.push(`${n}: ${items.join(', ')}`)
  }
  if (placeLines.length) lines.push(`Place bets:\n${placeLines.join('\n')}`)

  return lines.join('\n') || 'No side bets.'
}
function tableView (room) {
  const st = S(room)
  const shooter = shooterUuid(st)
  const seats = st.tableUsers.map(u => `${u === shooter ? '🎯' : '•'} ${mention(u)}`).join('\n')
  const lines = [
    `Phase: ${st.phase}`,
    st.point ? `Point: ${st.point}` : `Point: —`,
    `Rolls this round: ${st.rollCount}`,
    `Record: ${st.record.rolls} roll(s) ${st.record.shooter ? `by ${mention(st.record.shooter)}` : ''}`,
    ``,
    `Line Bets:`,
    lineBetsSummary(st),
    ``,
    `Other Bets:`,
    sideBetsSummary(st),
    ``,
    `Seats:`,
    seats || 'No one seated.'
  ]
  return lines.join('\n')
}

// ──────────────────────────────────────────────
// Windows: JOIN → BETTING
// ──────────────────────────────────────────────
async function openJoinWindow (room, starterUuid) {
  const st = S(room)
  clearTimers(st)
  st.phase = PHASES.JOIN
  st.point = null
  st.rollCount = 0
  resetAllBets(st)

  // ⬇️ auto-join the user who started the round
  if (starterUuid) await autoSeat(st, starterUuid, room)

  await say(room, `🎲 **Craps** table is open for **${JOIN_SECS}s**!\nType **/craps join** to take a seat.`)

  st.timers.join = setTimeout(async () => {
    st.timers.join = null
    await closeJoinOpenBetting(room)
  }, JOIN_SECS * 1000)
}

async function closeJoinOpenBetting (room) {
  const st = S(room)
  if (st.tableUsers.length === 0) {
    st.phase = PHASES.IDLE
    await say(room, `⏱️ Join closed — nobody seated. Round canceled.`)
    return
  }

  const seats = st.tableUsers.map(u => mention(u)).join(', ')
  await say(room, `⏱️ Join closed. Players this round: ${seats}`)

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
    st.phase = PHASES.IDLE
    await say(room, `No valid bets. Round canceled.`)
    return
  }
  st.phase = PHASES.COME_OUT
  const sh = shooterUuid(st)
  await say(room, `All bets in. **Come-out** time.\nShooter: ${mention(sh)} — **/roll** when ready.`)
}

// ──────────────────────────────────────────────
// Round control
// ──────────────────────────────────────────────
function nextShooter (st) {
  if (st.tableUsers.length === 0) return
  st.shooterIdx = (st.shooterIdx + 1) % st.tableUsers.length
}

async function endRound (room, reason, { returnUnresolvedSideBets = false } = {}) {
  const st = S(room)
  st.phase = PHASES.ROUND_END
  await say(room, reason ? `Round over — ${reason}` : `Round over.`)

  if (returnUnresolvedSideBets) {
    const lines = []
    for (const [u, amt] of Object.entries(st.comeWaiting)) { await addToUserWallet(u, amt); lines.push(`${mention(u)} come (waiting) returned $${amt}`) }
    st.comeWaiting = Object.create(null)
    for (const [u, amt] of Object.entries(st.dontComeWaiting)) { await addToUserWallet(u, amt); lines.push(`${mention(u)} don't come (waiting) returned $${amt}`) }
    st.dontComeWaiting = Object.create(null)
    for (const [u, o] of Object.entries(st.comePoint)) { await addToUserWallet(u, o.amt); lines.push(`${mention(u)} come on ${o.num} returned $${o.amt}`) }
    st.comePoint = Object.create(null)
    for (const [u, o] of Object.entries(st.dontComePoint)) { await addToUserWallet(u, o.amt); lines.push(`${mention(u)} don't come vs ${o.num} returned $${o.amt}`) }
    st.dontComePoint = Object.create(null)
    for (const n of PLACES) {
      for (const [u, amt] of Object.entries(st.place[n])) { await addToUserWallet(u, amt); lines.push(`${mention(u)} place ${n} returned $${amt}`) }
      st.place[n] = {}
    }
    if (lines.length) await say(room, `Unresolved side bets returned:\n${lines.join('\n')}`)
  }

  if (state.rollCount > state.record.rolls) {
  state.record = { rolls: state.rollCount, shooter: state.tableUsers[state.shooterIdx] || null }
  await announce(room, `🏆 New record: ${state.record.rolls} rolls by ${state.record.shooter ? mention(state.record.shooter) : '—' }`)
  if (state.record.shooter) await persistRecord(room, state.record.rolls, state.record.shooter)
}

  clearTimers(st)
  await say(room, `Type **/craps** to open a new table.`)
}

// ──────────────────────────────────────────────
// Bets
// ──────────────────────────────────────────────
async function placeLineBet (kind, user, amount, room) {
  const st = S(room)
  const amt = Number(amount || 0)
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) { await say(room, `${mention(user)} invalid amount. Min $${MIN_BET}, Max $${MAX_BET}.`); return }
  if (![PHASES.BETTING, PHASES.COME_OUT, PHASES.POINT].includes(st.phase)) { await say(room, `${mention(user)} betting is closed right now.`); return }
  const book = (kind === 'pass') ? st.pass : st.dontPass
  if (book[user]) { await say(room, `${mention(user)} you already have a ${kind} bet of $${book[user]}.`); return }
  const bal = await getUserWallet(user)
  if (Number(bal) < amt) { await say(room, `${mention(user)} insufficient funds. Balance $${bal}.`); return }
  const ok = await removeFromUserWallet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  book[user] = amt
  await say(room, `✅ ${mention(user)} placed ${kind.toUpperCase()} $${amt}.`)
  await say(room, lineBetsSummary(st))
}

async function placeComeBet (kind, user, amount, room) {
  const st = S(room)
  const amt = Number(amount || 0)
  if (st.phase !== PHASES.POINT) { await say(room, `Come/Don't Come only during POINT.`); return }
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) { await say(room, `${mention(user)} invalid amount. Min $${MIN_BET}, Max $${MAX_BET}.`); return }
  const waiting = (kind === 'come') ? st.comeWaiting : st.dontComeWaiting
  if (waiting[user] || (kind === 'come' ? st.comePoint[user] : st.dontComePoint[user])) { await say(room, `${mention(user)} you already have a ${kind.replace('dont','don’t ')} bet working.`); return }
  const bal = await getUserWallet(user)
  if (Number(bal) < amt) { await say(room, `${mention(user)} insufficient funds. Balance $${bal}.`); return }
  const ok = await removeFromUserWallet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  waiting[user] = amt
  await say(room, `✅ ${mention(user)} placed ${kind.toUpperCase()} $${amt} (waiting next roll).`)
}

async function placePlaceBet (num, user, amount, room) {
  const st = S(room)
  const n = Number(num)
  const amt = Number(amount || 0)
  if (st.phase !== PHASES.POINT) { await say(room, `Place bets only during POINT.`); return }
  if (!PLACES.includes(n)) { await say(room, `Valid place numbers: ${PLACES.join(', ')}.`); return }
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) { await say(room, `${mention(user)} invalid amount. Min $${MIN_BET}, Max $${MAX_BET}.`); return }
  if (st.place[n][user]) { await say(room, `${mention(user)} you already have a place bet on ${n} ($${st.place[n][user]}).`); return }
  const bal = await getUserWallet(user)
  if (Number(bal) < amt) { await say(room, `${mention(user)} insufficient funds. Balance $${bal}.`); return }
  const ok = await removeFromUserWallet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  st.place[n][user] = amt
  await say(room, `✅ ${mention(user)} placed $${amt} on **${n}**.`)
}

async function removePlaceBet (num, user, room) {
  const st = S(room)
  const n = Number(num)
  if (!PLACES.includes(n)) { await say(room, `Valid place numbers: ${PLACES.join(', ')}.`); return }
  const amt = st.place[n][user]
  if (!amt) { await say(room, `${mention(user)} you have no place bet on ${n}.`); return }
  delete st.place[n][user]
  await addToUserWallet(user, amt)
  await say(room, `↩️ ${mention(user)} removed place ${n}, returned $${amt}.`)
}

// ──────────────────────────────────────────────
// Payout helpers
// ──────────────────────────────────────────────
function placeProfit (num, amt) {
  if (num === 4 || num === 10) return amt * (9/5)   // 1.8x profit
  if (num === 5 || num === 9)  return amt * (7/5)   // 1.4x
  if (num === 6 || num === 8)  return amt * (7/6)   // 1.1666…
  return 0
}

// ──────────────────────────────────────────────
// Rolling + resolution
// ──────────────────────────────────────────────
async function shooterRoll (user, room) {
  const st = S(room)
  if (!isShooter(user, st)) { await say(room, `${mention(user)} only the shooter may roll.`); return }
  if (![PHASES.COME_OUT, PHASES.POINT].includes(st.phase)) { await say(room, `Not a rolling phase.`); return }

  const [d1, d2, total] = dice()
  st.rollCount++
  await say(room, `🎲 Roll: **${d1} + ${d2} = ${total}**${st.point ? `  (point is ${st.point})` : ''}`)

  if (st.phase === PHASES.COME_OUT) {
    if (total === 7 || total === 11) {
      await settlePass(st, room, 'win')
      await settleDontPass(st, room, 'lose')
      await endRound(room, `come-out ${total} (natural).`)
      nextShooter(st)
      return
    }
    if ([2,3,12].includes(total)) {
      await settlePass(st, room, 'lose')
      if (total === 12) await settleDontPass(st, room, 'push')
      else await settleDontPass(st, room, 'win')
      await endRound(room, `come-out craps ${total}.`)
      nextShooter(st)
      return
    }
    st.point = total
    st.phase = PHASES.POINT
    await say(room, `🟢 Point established: **${st.point}**.\nYou may add **/come <amt>**, **/dontcome <amt>**, or **/place <num> <amt>**.`)
    return
  }

  // POINT phase:
  await resolveComeWaiting(total, st, room)
  await resolveComePoints(total, st, room)
  await resolvePlace(total, st, room)

  if (total === st.point) {
    await settlePass(st, room, 'win')
    await settleDontPass(st, room, 'lose')
    await endRound(room, `point **${st.point}** made!`, { returnUnresolvedSideBets: true })
    nextShooter(st)
    return
  }
  if (total === 7) {
    await settlePass(st, room, 'lose')
    await settleDontPass(st, room, 'win')
    await endRound(room, `seven-out.`)
    nextShooter(st)
    return
  }
}

async function settlePass (st, room, outcome) {
  const lines = []
  for (const [u, amt] of Object.entries(st.pass)) {
    if (outcome === 'win')      { await addToUserWallet(u, amt * 2); lines.push(`${mention(u)} +$${amt}`) }
    else if (outcome === 'push'){ await addToUserWallet(u, amt);     lines.push(`${mention(u)} push ($${amt})`) }
    else                        { lines.push(`${mention(u)} -$${amt}`) }
  }
  st.pass = Object.create(null)
  if (lines.length) await say(room, `Pass line results:\n${lines.join('\n')}`)
}
async function settleDontPass (st, room, outcome) {
  const lines = []
  for (const [u, amt] of Object.entries(st.dontPass)) {
    if (outcome === 'win')      { await addToUserWallet(u, amt * 2); lines.push(`${mention(u)} +$${amt}`) }
    else if (outcome === 'push'){ await addToUserWallet(u, amt);     lines.push(`${mention(u)} push ($${amt})`) }
    else                        { lines.push(`${mention(u)} -$${amt}`) }
  }
  st.dontPass = Object.create(null)
  if (lines.length) await say(room, `Don't Pass results:\n${lines.join('\n')}`)
}

async function resolveComeWaiting (total, st, room) {
  const comeLines = []
  const dontLines = []
  for (const [u, amt] of Object.entries(st.comeWaiting)) {
    if (total === 7 || total === 11) {
      await addToUserWallet(u, amt * 2); comeLines.push(`${mention(u)} COMe +$${amt}`)
    } else if ([2,3,12].includes(total)) {
      if (total === 12) { await addToUserWallet(u, amt); comeLines.push(`${mention(u)} COMe push ($${amt})`) }
      else { comeLines.push(`${mention(u)} COMe -$${amt}`) }
    } else {
      st.comePoint[u] = { num: total, amt }
      comeLines.push(`${mention(u)} COMe moves to **${total}** ($${amt})`)
    }
    delete st.comeWaiting[u]
  }
  for (const [u, amt] of Object.entries(st.dontComeWaiting)) {
    if ([2,3].includes(total)) {
      await addToUserWallet(u, amt * 2); dontLines.push(`${mention(u)} Don’t COMe +$${amt}`)
    } else if (total === 12) {
      await addToUserWallet(u, amt); dontLines.push(`${mention(u)} Don’t COMe push ($${amt})`)
    } else if (total === 7 || total === 11) {
      dontLines.push(`${mention(u)} Don’t COMe -$${amt}`)
    } else {
      st.dontComePoint[u] = { num: total, amt }
      dontLines.push(`${mention(u)} Don’t COMe set **against ${total}** ($${amt})`)
    }
    delete st.dontComeWaiting[u]
  }
  if (comeLines.length) await say(room, comeLines.join('\n'))
  if (dontLines.length) await say(room, dontLines.join('\n'))
}

async function resolveComePoints (total, st, room) {
  const winLines = []
  const loseLines = []

  for (const [u, o] of Object.entries(st.comePoint)) {
    if (total === o.num) { await addToUserWallet(u, o.amt * 2); winLines.push(`${mention(u)} COMe on ${o.num} +$${o.amt}`); delete st.comePoint[u] }
    else if (total === 7) { loseLines.push(`${mention(u)} COMe on ${o.num} -$${o.amt}`); delete st.comePoint[u] }
  }
  for (const [u, o] of Object.entries(st.dontComePoint)) {
    if (total === 7) { await addToUserWallet(u, o.amt * 2); winLines.push(`${mention(u)} Don’t COMe vs ${o.num} +$${o.amt}`); delete st.dontComePoint[u] }
    else if (total === o.num) { loseLines.push(`${mention(u)} Don’t COMe vs ${o.num} -$${o.amt}`); delete st.dontComePoint[u] }
  }
  if (winLines.length)  await say(room, winLines.join('\n'))
  if (loseLines.length) await say(room, loseLines.join('\n'))
}

async function resolvePlace (total, st, room) {
  if (total === 7) {
    const lines = []
    for (const n of PLACES) {
      for (const [u, amt] of Object.entries(st.place[n])) lines.push(`${mention(u)} place ${n} -$${amt}`)
      st.place[n] = {}
    }
    if (lines.length) await say(room, lines.join('\n'))
    return
  }
  if (PLACES.includes(total)) {
    const book = st.place[total]
    const lines = []
    for (const [u, amt] of Object.entries(book)) {
      const profit = placeProfit(total, amt)
      if (profit > 0) { await addToUserWallet(u, profit); lines.push(`${mention(u)} place ${total} win → +$${profit.toFixed(2)}`) }
    }
    if (lines.length) await say(room, lines.join('\n'))
  }
}

// ──────────────────────────────────────────────
// Table mgmt
// ──────────────────────────────────────────────
async function joinTable (user, room) {
  const st = S(room)
  if (!st.tableUsers.includes(user)) {
    st.tableUsers.push(user)
    await say(room, `🪑 ${mention(user)} sits at the table.`)
  }
}
async function leaveTable (user, room) {
  const st = S(room)
  const i = st.tableUsers.indexOf(user)
  if (i !== -1) {
    st.tableUsers.splice(i, 1)
    if (st.shooterIdx >= st.tableUsers.length) st.shooterIdx = 0
    await say(room, `👋 ${mention(user)} left the table.`)
  }
}

// ──────────────────────────────────────────────
// Router (supports both /craps … and top-level bet aliases)
// ─────────────────────────────────────────────-
export async function routeCrapsMessage (payload) {
  const raw = (payload.message || '').trim()
  const room = payload.room || ROOM_DEFAULT
  const sender = payload.sender
  const uuid = sender?.uuid || sender?.uid || sender?.id || sender
  const low = raw.toLowerCase()

  // Allow "/join craps|cr" during JOIN window
  if (/^\/join\s+(craps|cr)\b/i.test(low)) {
    if (S(room).phase !== PHASES.JOIN) { await postMessage({ room, message: `You can only join during the join window.` }); return true }
    await joinTable(uuid, room); return true
  }

  // Top-level bet/roll aliases
  const alias = low.match(/^\/(pass|dontpass|come|dontcome|place|removeplace|roll)\b/)
  if (alias) {
    const cmd = alias[1]
    const parts = raw.split(/\s+/)
    parts.shift() // drop /cmd
    switch (cmd) {
      case 'pass':       await placeLineBet('pass', uuid, parts[0], room); return true
      case 'dontpass':   await placeLineBet('dont', uuid, parts[0], room); return true
      case 'come':       await placeComeBet('come', uuid, parts[0], room); return true
      case 'dontcome':   await placeComeBet('dontcome', uuid, parts[0], room); return true
      case 'place': {
        const [num, amt] = parts
        if (!num || !amt) { await postMessage({ room, message: `Usage: /place <4|5|6|8|9|10> <amount>` }); return true }
        await placePlaceBet(Number(num), uuid, amt, room); return true
      }
      case 'removeplace': {
        const [num] = parts
        if (!num) { await postMessage({ room, message: `Usage: /removeplace <4|5|6|8|9|10>` }); return true }
        await removePlaceBet(Number(num), uuid, room); return true
      }
      case 'roll':       await shooterRoll(uuid, room); return true
    }
  }

  // If it's not /craps, we’re done
  if (!/^\/craps\b/i.test(raw)) return false

  const parts = raw.split(/\s+/); parts.shift()
  const sub = (parts.shift() || '').toLowerCase()

  switch (sub) {
    case '': // bare /craps
    if (S(room).phase === PHASES.IDLE) {
      await openJoinWindow(room, uuid) // ⬅️ pass starter
    } else {
     await postMessage({ room, message: tableView(room) + `\n\nUse **/craps start** to reset/open a new table when idle.` })
    }
    return true

  case 'start':
    await openJoinWindow(room, uuid) // ⬅️ pass starter
    return true


    case 'join':
      if (S(room).phase !== PHASES.JOIN) {
        await postMessage({ room, message: `You can only join during the join window.` })
        return true
      }
      await joinTable(uuid, room)
      return true

    case 'table':
      await postMessage({ room, message: tableView(room) })
      return true

    case 'help':
    case 'h':
      await postMessage({ room, message:
`**Craps Commands**
/craps                — start (if idle) or show table
/craps start          — open join window
/craps join           — sit during join
/roll                 — shooter rolls

Betting:
/pass <amt>           — Pass line
/dontpass <amt>       — Don't Pass line
/come <amt>           — (POINT only; next roll)
/dontcome <amt>       — (POINT only; next roll)
/place <4|5|6|8|9|10> <amt>   — (POINT only)
/removeplace <num>    — remove your place bet

Flow: start → 30s join → 30s pass/don’t → come-out → point (add come/don’t come/place) → resolve.`
      })
      return true

    default:
      await postMessage({ room, message: `Unknown craps subcommand. Try **/craps help**.` })
      return true
  }
}
