// src/games/craps/craps.single.js
// Craps with blackjack-style windows + first-class bet commands.
// Commands:
//   /craps             -> if idle: opens JOIN; else shows table
//   /craps start       -> opens JOIN (resets table + hand)
//   /craps join        -> join during join window
//   /craps table, /craps help, /craps bets
//   /roll              -> shooter roll (alias works without /craps)
//   /pass <amt>, /dontpass <amt>
//   /come <amt>, /dontcome <amt>            (POINT only)
//   /place <4|5|6|8|9|10> <amt>             (POINT only)
//   /removeplace <4|5|6|8|9|10>
//   /bets              -> shows ONLY your bets (alias of /craps bets)
//
// Env (optional): CRAPS_MIN_BET, CRAPS_MAX_BET, CRAPS_JOIN_SECS, CRAPS_BET_SECS

import { postMessage } from '../../libs/cometchat.js'
import { addToUserWallet, removeFromUserWallet, getUserWallet, addOrUpdateUser } from '../../database/dbwalletmanager.js'
import { PHASES } from './crapsState.js'
import db from '../../database/db.js'
import { getSenderNickname } from '../../utils/helpers.js'
import { getDisplayName, sanitizeNickname } from '../../utils/names.js'

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

    // "Hand" roll count: resets when a new shooter hand begins,
    // ends only on seven-out (or table cancellation).
    rollCount: 0,

    record: { rolls: 0, shooter: null },

    // Per-hand net results (reset each new hand, summarized on seven-out)
    roundResults: Object.create(null),

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

async function autoSeat (st, uuid, room) {
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

function fmtMoney (n) {
  const num = Number(n)
  if (!Number.isFinite(num)) return '$0'
  const abs = Math.abs(num)
  const v = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2)
  return `$${v}`
}

// Accumulate a player's net result for the current hand.
function addRoundResult (st, uuid, amount) {
  if (!uuid || !Number.isFinite(amount) || amount === 0) return
  const prev = st.roundResults[uuid] || 0
  st.roundResults[uuid] = prev + amount
}

// ──────────────────────────────────────────────
// Views
// ──────────────────────────────────────────────
function lineBetsSummary (st) {
  const show = (book, label) => {
    const items = Object.entries(book).map(([u,a]) => `${mention(u)} ${fmtMoney(a)}`)
    return items.length ? `${label}: ${items.join(', ')}` : null
  }
  return [show(st.pass,'Pass'), show(st.dontPass,"Don't Pass")].filter(Boolean).join('\n') || 'No line bets.'
}

function sideBetsSummary (st) {
  const lines = []

  const cw = Object.entries(st.comeWaiting).map(([u,a]) => `${mention(u)} ${fmtMoney(a)}`)
  if (cw.length) lines.push(`Come (waiting): ${cw.join(', ')}`)

  const dcw = Object.entries(st.dontComeWaiting).map(([u,a]) => `${mention(u)} ${fmtMoney(a)}`)
  if (dcw.length) lines.push(`Don't Come (waiting): ${dcw.join(', ')}`)

  const cp = Object.entries(st.comePoint).map(([u,o]) => `${mention(u)} ${fmtMoney(o.amt)} on ${o.num}`)
  if (cp.length) lines.push(`Come points: ${cp.join(', ')}`)

  const dcp = Object.entries(st.dontComePoint).map(([u,o]) => `${mention(u)} ${fmtMoney(o.amt)} against ${o.num}`)
  if (dcp.length) lines.push(`Don't Come points: ${dcp.join(', ')}`)

  const placeLines = []
  for (const n of PLACES) {
    const book = st.place[n]
    const items = Object.entries(book).map(([u,a]) => `${mention(u)} ${fmtMoney(a)}`)
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
    `Rolls this hand: ${st.rollCount}`,
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

function userBetsView (room, uuid) {
  const st = S(room)
  const lines = []
  const p = st.pass[uuid]
  const dp = st.dontPass[uuid]
  if (p) lines.push(`Pass: ${fmtMoney(p)}`)
  if (dp) lines.push(`Don't Pass: ${fmtMoney(dp)}`)

  const cw = st.comeWaiting[uuid]
  const dcw = st.dontComeWaiting[uuid]
  if (cw) lines.push(`Come (waiting): ${fmtMoney(cw)}`)
  if (dcw) lines.push(`Don't Come (waiting): ${fmtMoney(dcw)}`)

  const cp = st.comePoint[uuid]
  const dcp = st.dontComePoint[uuid]
  if (cp) lines.push(`Come on ${cp.num}: ${fmtMoney(cp.amt)}`)
  if (dcp) lines.push(`Don't Come vs ${dcp.num}: ${fmtMoney(dcp.amt)}`)

  const places = []
  for (const n of PLACES) {
    const amt = st.place[n]?.[uuid]
    if (amt) places.push(`${n}: ${fmtMoney(amt)}`)
  }
  if (places.length) lines.push(`Place: ${places.join(', ')}`)

  const net = st.roundResults?.[uuid]
  if (Number.isFinite(net) && net !== 0) {
    const sign = net > 0 ? '+' : '-'
    lines.push(`Net this hand: ${sign}${fmtMoney(Math.abs(net))}`)
  } else if (net === 0) {
    lines.push(`Net this hand: $0`)
  }

  if (!lines.length) return `No active bets for ${mention(uuid)}.`
  return `**Your bets (${mention(uuid)})**\n` + lines.map(l => `• ${l}`).join('\n')
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

  // Reset per-hand tracking including net results
  st.roundResults = Object.create(null)

  if (starterUuid) await autoSeat(st, starterUuid, room)

  await say(
    room,
    `🎲 **Craps** table is open for **${JOIN_SECS}s**!\n` +
    `Type **/craps join** to take a seat. After joining, you’ll have a window to place ` +
    `**/pass <amount>** or **/dontpass <amount>** before the come-out roll.`
  )

  st.timers.join = setTimeout(async () => {
    st.timers.join = null
    await closeJoinOpenBetting(room)
  }, JOIN_SECS * 1000)
}

async function closeJoinOpenBetting (room) {
  const st = S(room)
  if (st.tableUsers.length === 0) {
    st.phase = PHASES.IDLE
    await say(room, `⏱️ Join closed — nobody seated. Table closed.`)
    return
  }

  const seats = st.tableUsers.map(u => mention(u)).join(', ')
  await say(room, `⏱️ Join closed. Players seated: ${seats}`)

  await openBettingWindow(room, { requireLineBets: true })
}

async function openBettingWindow (room, { requireLineBets = true } = {}) {
  const st = S(room)
  clearTimers(st)
  st.phase = PHASES.BETTING

  await say(room, `💰 **Betting open** for **${BET_SECS}s**.\nPlace **/pass <amt>** or **/dontpass <amt>**.`)

  st.timers.bet = setTimeout(async () => {
    st.timers.bet = null
    await closeBettingBeginComeOut(room, { requireLineBets })
  }, BET_SECS * 1000)
}

async function closeBettingBeginComeOut (room, { requireLineBets = true } = {}) {
  const st = S(room)
  const anyLine = Object.keys(st.pass).length || Object.keys(st.dontPass).length

  if (requireLineBets && !anyLine) {
    st.phase = PHASES.IDLE
    await say(room, `No valid bets. Table closed.`)
    return
  }

  // Announce all line bets ONCE (clean)
  if (anyLine) {
    await say(room, `📋 **Line bets locked:**\n${lineBetsSummary(st)}`)
  } else {
    await say(room, `📋 No line bets placed — shooter can still roll.`)
  }

  st.phase = PHASES.COME_OUT
  st.point = null

  const sh = shooterUuid(st)
  await say(room, `🎯 Shooter: ${mention(sh)} — **/roll** when ready.`)
}

// ──────────────────────────────────────────────
// Hand control
// ──────────────────────────────────────────────
function nextShooter (st) {
  if (st.tableUsers.length === 0) return
  st.shooterIdx = (st.shooterIdx + 1) % st.tableUsers.length
}

async function endHand (room, reason) {
  const st = S(room)
  st.phase = PHASES.ROUND_END

  const shooter = shooterUuid(st)
  await say(room, reason ? `🧾 Hand over — ${reason}` : `🧾 Hand over.`)

  // Summarise net results for the hand
  const rrKeys = Object.keys(st.roundResults || {})
  if (rrKeys.length) {
    const totals = []
    for (const u of rrKeys) {
      const amt = st.roundResults[u]
      const sign = amt >= 0 ? '+' : '-'
      totals.push(`${mention(u)} ${sign}${fmtMoney(Math.abs(amt))}`)
    }
    await say(room, `Hand totals:\n${totals.join('\n')}`)
  }

  // Record check (longest hand = most rolls before seven-out)
  if (st.rollCount > st.record.rolls) {
    st.record = { rolls: st.rollCount, shooter: shooter || null }
    await say(
      room,
      `🏆 New record: ${st.record.rolls} roll(s) by ${st.record.shooter ? mention(st.record.shooter) : '—'}`
    )
    if (st.record.shooter) {
      await persistRecord(room, st.record.rolls, st.record.shooter)
    }
  }

  // Prep next hand: rotate shooter, reset per-hand tracking, keep seats
  if (st.tableUsers.length === 0) {
    st.phase = PHASES.IDLE
    st.point = null
    st.rollCount = 0
    resetAllBets(st)
    st.roundResults = Object.create(null)
    clearTimers(st)
    await say(room, `No players seated. Type **/craps** to open a new table.`)
    return
  }

  nextShooter(st)
  st.point = null
  st.rollCount = 0
  st.roundResults = Object.create(null)

  // Clear ALL bets for next hand (simple + clean). Players re-bet each hand.
  resetAllBets(st)

  clearTimers(st)
  await say(room, `🔄 Next shooter: ${mention(shooterUuid(st))}`)
  await openBettingWindow(room, { requireLineBets: false })
}

// ──────────────────────────────────────────────
// Bets
// ──────────────────────────────────────────────
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

  // Allow line bets during the betting window OR during COME_OUT (before roll).
  if (![PHASES.BETTING, PHASES.COME_OUT].includes(st.phase)) {
    await say(room, `${mention(user)} you may place Pass/Don't Pass only before the point is established.`)
    return
  }
  if (st.phase === PHASES.COME_OUT && st.point) {
    await say(room, `${mention(user)} point is already set — line bets are locked until the next come-out.`)
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

// ──────────────────────────────────────────────
// Payout helpers
// ──────────────────────────────────────────────
function placeProfit (num, amt) {
  if (num === 4 || num === 10) return amt * (9/5)
  if (num === 5 || num === 9)  return amt * (7/5)
  if (num === 6 || num === 8)  return amt * (7/6)
  return 0
}

// ──────────────────────────────────────────────
// Rolling + resolution (single recap block)
// ──────────────────────────────────────────────
async function shooterRoll (user, room) {
  const st = S(room)
  if (!isShooter(user, st)) { await say(room, `${mention(user)} only the shooter may roll.`); return }
  if (![PHASES.COME_OUT, PHASES.POINT].includes(st.phase)) { await say(room, `Not a rolling phase.`); return }

  const [d1, d2, total] = dice()
  st.rollCount++

  const recap = []
  recap.push(`🎲 **Roll:** **${d1} + ${d2} = ${total}**${st.point ? `  _(point is ${st.point})_` : ''}`)

  if (st.phase === PHASES.COME_OUT) {
    // Come-out decisions resolve line bets, but do NOT end the hand.
    if (total === 7 || total === 11) {
      const passLines = await settlePass(st, 'win')
      const dpLines = await settleDontPass(st, 'lose')

      const res = []
      if (passLines.length) res.push(`**Pass:**\n${passLines.join('\n')}`)
      if (dpLines.length) res.push(`**Don't Pass:**\n${dpLines.join('\n')}`)
      if (res.length) recap.push(`📌 **Resolutions:**\n${res.join('\n')}`)

      recap.push(`✅ Come-out **${total}** (natural). New come-out — place **/pass** or **/dontpass**, then shooter **/roll**.`)
      st.point = null
      st.phase = PHASES.COME_OUT
      await say(room, recap.join('\n'))
      return
    }

    if ([2,3,12].includes(total)) {
      const passLines = await settlePass(st, 'lose')
      const dpLines = await settleDontPass(st, total === 12 ? 'push' : 'win')

      const res = []
      if (passLines.length) res.push(`**Pass:**\n${passLines.join('\n')}`)
      if (dpLines.length) res.push(`**Don't Pass:**\n${dpLines.join('\n')}`)
      if (res.length) recap.push(`📌 **Resolutions:**\n${res.join('\n')}`)

      recap.push(`💥 Come-out craps **${total}**. New come-out — place **/pass** or **/dontpass**, then shooter **/roll**.`)
      st.point = null
      st.phase = PHASES.COME_OUT
      await say(room, recap.join('\n'))
      return
    }

    // Point established
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

    // SHOOTER HAND CONTINUES: back to come-out, same shooter
    st.point = null
    st.phase = PHASES.COME_OUT
    recap.push(`✅ Point made! **Same shooter** — new come-out. Place **/pass** or **/dontpass**, then **/roll**.`)
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

  // Otherwise: point stays on
  recap.push(`⏭️ Point stays **${st.point}**. Shooter **/roll** when ready.`)
  await say(room, recap.join('\n'))
}

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
    } else if ([2,3,12].includes(total)) {
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
    if ([2,3].includes(total)) {
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

  // Top-level: /bets
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
    parts.shift() // drop /cmd
    switch (cmd) {
      case 'pass':       await placeLineBet('pass', uuid, parts[0], room); return true
      case 'dontpass':   await placeLineBet('dont', uuid, parts[0], room); return true
      case 'come':       await placeComeBet('come', uuid, parts[0], room); return true
      case 'dontcome':   await placeComeBet('dontcome', uuid, parts[0], room); return true
      case 'place': {
        const [num, amt] = parts
        if (!num || !amt) {
          await postMessage({ room, message: `Usage: /place <4|5|6|8|9|10> <amount>` })
          return true
        }
        await placePlaceBet(Number(num), uuid, amt, room)
        return true
      }
      case 'removeplace': {
        const [num] = parts
        if (!num) {
          await postMessage({ room, message: `Usage: /removeplace <4|5|6|8|9|10>` })
          return true
        }
        await removePlaceBet(Number(num), uuid, room)
        return true
      }
      case 'roll':       await shooterRoll(uuid, room); return true
    }
  }

  // If it's not /craps, we’re done
  if (!/^\/craps\b/i.test(raw)) return false

  const parts = raw.split(/\s+/); parts.shift()
  const sub = (parts.shift() || '').toLowerCase()

  switch (sub) {
    case '': { // bare /craps
      if (S(room).phase === PHASES.IDLE) {
        await openJoinWindow(room, uuid)
      } else {
        await postMessage({ room, message: tableView(room) + `\n\nUse **/craps start** to reset/open a new table when idle.` })
      }
      return true
    }

    case 'start':
      await openJoinWindow(room, uuid)
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

    case 'bets':
      await postMessage({ room, message: userBetsView(room, uuid) })
      return true

    case 'help':
    case 'h':
      await postMessage({
        room,
        message: `**Craps Instructions**

Craps is played with a rotating shooter. You join the table, place bets, then the shooter rolls.

**Line bets (before a point is established):**
• **/pass <amount>** — win on **7 or 11** on come-out; lose on **2, 3, 12**; otherwise a **point** is set and you win if the point repeats before a 7.
• **/dontpass <amount>** — win on **2 or 3**; push on **12**; lose on **7 or 11**; after point, you win if a **7** comes before the point.

**After a point is set (POINT phase):**
• **/come <amount>** — wins on **7/11**, loses on **2/3/12**, otherwise moves to the rolled number (your personal point) and wins if it repeats before a 7.
• **/dontcome <amount>** — wins on **2/3**, pushes on **12**, loses on **7/11**, otherwise sets “against” a number and wins if 7 comes before that number.
• **/place <4|5|6|8|9|10> <amount>** — win if that number hits before a 7 (standard place odds).
• **/removeplace <number>** — remove an active place bet and get your stake back.

**Commands:**
/craps — start a new game (if idle) or show the current table
/craps start — reset and open a new join window
/craps join — join during the join window
/craps bets — show only your bets (or use **/bets**)
/roll — shooter rolls the dice

Flow: join → betting → come-out → point → (point made returns to come-out; seven-out ends the hand and rotates shooter).`
      })
      return true

    default:
      await postMessage({ room, message: `Unknown craps subcommand. Try **/craps help**.` })
      return true
  }
}
