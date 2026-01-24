// src/games/craps/craps.single.js
// Craps with blackjack-style windows + shooter hands.
// UX upgrades for CometChat:
//  - Phase banners in code blocks
//  - Shooter turn prompt (mention + banner + status)
//  - Table status board at key transitions

import { postMessage } from '../../libs/cometchat.js'
import {
  getUserWallet,
  addOrUpdateUser,
  debitGameBet,
  creditGameWin
} from '../../database/dbwalletmanager.js'
import { PHASES } from './crapsState.js'
import db from '../../database/db.js'
import { sanitizeNickname } from '../../utils/names.js'
import { getUserNicknameByUuid } from '../../utils/API.js'

/* ───────────────────────── Records (DB) ───────────────────────── */

async function persistRecord (room, rolls, shooterId) {
  let shooterNickname = shooterId
  try {
    shooterNickname = await getUserNicknameByUuid(shooterId)
  } catch {}
  const cleanNick = sanitizeNickname(shooterNickname || shooterId) || shooterId

  try { await addOrUpdateUser(shooterId, cleanNick) } catch {}

  try {
    db.prepare(`
      INSERT INTO craps_records (roomId, maxRolls, shooterId, shooterNickname, achievedAt)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(roomId) DO UPDATE SET
        maxRolls = excluded.maxRolls,
        shooterId = excluded.shooterId,
        shooterNickname = excluded.shooterNickname,
        achievedAt = excluded.achievedAt
    `).run(room, rolls, shooterId, shooterNickname || shooterId)
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
  } catch {}
}

/* ───────────────────────── Constants ───────────────────────── */

const ROOM_DEFAULT = process.env.ROOM_UUID || ''
if (!ROOM_DEFAULT) console.warn('[craps] ROOM_UUID not set — room state may reset unexpectedly.')

const mention = (uuid) => `<@uid:${uuid}>`

const MIN_BET = Number(process.env.CRAPS_MIN_BET ?? 5)
const MAX_BET = Number(process.env.CRAPS_MAX_BET ?? 10000)
const JOIN_SECS = Number(process.env.CRAPS_JOIN_SECS ?? 30)
const BET_SECS = Number(process.env.CRAPS_BET_SECS ?? 30)
const ROLL_SECS = Number(process.env.CRAPS_ROLL_SECS ?? 45)
const POINT_BET_SECS = Number(process.env.CRAPS_POINT_BET_SECS ?? 20)

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

    pendingNextShooter: null, // uuid who would be next shooter from last hand

    point: null,
    rollCount: 0, // rolls in the current hand (until seven-out)

    record: { rolls: 0, shooter: null },

    roundResults: Object.create(null),

    pass: Object.create(null),
    dontPass: Object.create(null),

    comeWaiting: Object.create(null),
    dontComeWaiting: Object.create(null),
    comePoint: Object.create(null), // uuid -> { num, amt }
    dontComePoint: Object.create(null),

    place: { 4: {}, 5: {}, 6: {}, 8: {}, 9: {}, 10: {} },

    nameCache: Object.create(null),

    timers: { join: null, bet: null, pointBet: null, roll: null },
    rollTimerCtx: { phase: null }
  }
}

/* ───────────────────────── Helpers ───────────────────────── */

async function say (room, message) {
  await postMessage({ room, message })
}

async function sayCode (room, title, body) {
  const t = title ? `${title}\n` : ''
  await say(room, `${t}\`\`\`\n${body}\n\`\`\``)
}

const BANNER = '━━━━━━━━━━━━━━━━━━━━━'

async function phaseBanner (room, title, lines = []) {
  const body = [
    BANNER,
    title,
    ...(lines || []),
    BANNER
  ].join('\n')
  await sayCode(room, '', body)
}

async function getDisplayName (st, uuid) {
  if (!uuid) return 'unknown'
  if (st.nameCache?.[uuid]) return st.nameCache[uuid]

  let name = uuid
  try {
    const nick = await getUserNicknameByUuid(uuid)
    const clean = sanitizeNickname(nick || uuid)
    name = clean || uuid
  } catch {
    name = uuid
  }

  if (name.length > 18) name = name.slice(0, 18)
  st.nameCache[uuid] = name
  return name
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

const d = () => 1 + Math.floor(Math.random() * 6)
function dice () {
  const a = d(); const b = d()
  return [a, b, a + b]
}

function shooterUuid (st) {
  return st.tableUsers[st.shooterIdx] || null
}

function isShooter (uuid, st) {
  return shooterUuid(st) === uuid
}

function clearTimers (st) {
  for (const k of ['join', 'bet', 'pointBet', 'roll']) {
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
  st.place = { 4: {}, 5: {}, 6: {}, 8: {}, 9: {}, 10: {} }
}

function hasAnyBets (st) {
  const hasObj = (o) => o && Object.keys(o).length > 0
  const hasPlace = PLACES.some(n => hasObj(st.place?.[n]))
  return (
    hasObj(st.pass) ||
    hasObj(st.dontPass) ||
    hasObj(st.comeWaiting) ||
    hasObj(st.dontComeWaiting) ||
    hasObj(st.comePoint) ||
    hasObj(st.dontComePoint) ||
    hasPlace
  )
}

async function refundAllBets (st) {
  for (const [u, amt] of Object.entries(st.pass)) await creditGameWin(u, amt)
  for (const [u, amt] of Object.entries(st.dontPass)) await creditGameWin(u, amt)

  for (const [u, amt] of Object.entries(st.comeWaiting)) await creditGameWin(u, amt)
  for (const [u, amt] of Object.entries(st.dontComeWaiting)) await creditGameWin(u, amt)

  for (const [u, o] of Object.entries(st.comePoint)) if (o?.amt) await creditGameWin(u, o.amt)
  for (const [u, o] of Object.entries(st.dontComePoint)) if (o?.amt) await creditGameWin(u, o.amt)

  for (const n of PLACES) {
    for (const [u, amt] of Object.entries(st.place[n] || {})) await creditGameWin(u, amt)
  }

  resetAllBets(st)
}

function phaseLabel (st) {
  if (st.phase === PHASES.JOIN) return 'JOIN'
  if (st.phase === PHASES.BETTING && !st.point) return 'LINE BETTING'
  if (st.phase === PHASES.COME_OUT) return 'COME-OUT'
  if (st.phase === PHASES.POINT) return 'POINT (ROLLING)'
  if (st.phase === PHASES.IDLE) return 'IDLE'
  return String(st.phase || '—')
}

async function tableStatusBoard (room, st, next = '') {
  const sh = shooterUuid(st)
  const shooterName = sh ? await getDisplayName(st, sh) : '—'
  const lines = [
    'TABLE STATUS',
    '-----------------------',
    `Phase:     ${phaseLabel(st)}`,
    `Shooter:   ${shooterName}`,
    `Point:     ${st.point ?? '—'}`,
    `Rolls:     ${st.rollCount}`,
    `Players:   ${st.tableUsers.length}`
  ]
  if (next) {
    lines.push('-----------------------')
    lines.push(`Next:      ${next}`)
  }
  await sayCode(room, '', lines.join('\n'))
}

async function shooterTurnPrompt (room, st, mode = '') {
  const sh = shooterUuid(st)
  await say(room, `🎲 **SHOOTER TURN** → ${sh ? mention(sh) : '—'} type **/roll** (⏱️ ${ROLL_SECS}s)`)

  await phaseBanner(room, '🎲 PHASE: SHOOTER TURN', [
    mode ? `Mode: ${mode}` : '',
    `Time: ${ROLL_SECS}s`,
    'Available now: /roll'
  ].filter(Boolean))

  await tableStatusBoard(room, st, 'Shooter rolls (/roll)')
}

/* ───────────────────────── Point betting window ───────────────────────── */

async function openPointBetting (room, reasonLine = '') {
  const st = S(room)

  stopRollTimer(room)
  if (st.timers.pointBet) { clearTimeout(st.timers.pointBet); st.timers.pointBet = null }

  // NOTE: we stay in POINT phase; this is just a timed "side bets" window
  st.phase = PHASES.POINT

  await phaseBanner(room, `🟦 SIDE BETS OPEN (${POINT_BET_SECS}s)`, [
    'Available now: /come /dontcome /place /removeplace',
    'Rolling resumes when this closes.'
  ])

  if (reasonLine) await say(room, reasonLine)
  await tableStatusBoard(room, st, `Side bets open (${POINT_BET_SECS}s)`)

  st.timers.pointBet = setTimeout(async () => {
    st.timers.pointBet = null
    await closePointBettingStartRoll(room)
  }, POINT_BET_SECS * 1000)
}

async function closePointBettingStartRoll (room) {
  const st = S(room)

  // If point vanished, treat like come-out
  if (!st.point) {
    st.phase = PHASES.COME_OUT
    await shooterTurnPrompt(room, st, 'COME-OUT')
    startRollTimer(room, PHASES.COME_OUT)
    return
  }

  st.phase = PHASES.POINT
  await shooterTurnPrompt(room, st, `POINT (${st.point})`)
  startRollTimer(room, PHASES.POINT)
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
  st.nameCache = Object.create(null)
  resetAllBets(st)

  // Starter auto-seated
  if (starterUuid) await autoSeat(st, starterUuid, room)

  await phaseBanner(room, `🎲 PHASE: JOIN (${JOIN_SECS}s)`, [
    'Type: /craps join',
    'Starter is seated automatically.',
    `Min: ${fmtMoney(MIN_BET)} | Max: ${fmtMoney(MAX_BET)}`
  ])

  await tableStatusBoard(room, st, `Join open (${JOIN_SECS}s)`)

  st.timers.join = setTimeout(async () => {
    st.timers.join = null
    await closeJoinOpenBetting(room)
  }, JOIN_SECS * 1000)
}

async function closeJoinOpenBetting (room) {
  const st = S(room)
  if (!st.tableUsers.length) {
    st.phase = PHASES.IDLE
    await phaseBanner(room, '🛑 PHASE: IDLE', ['Join closed — nobody seated.'])
    await say(room, 'Type **/craps** to open a new join window.')
    return
  }

  // Pick shooter: honor pendingNextShooter if they re-joined
  if (st.pendingNextShooter) {
    const idx = st.tableUsers.indexOf(st.pendingNextShooter)
    st.shooterIdx = (idx !== -1) ? idx : 0
    st.pendingNextShooter = null
  } else {
    st.shooterIdx = 0
  }

  st.phase = PHASES.BETTING

  await phaseBanner(room, `💰 PHASE: LINE BETTING (${BET_SECS}s)`, [
    'Available now: /pass <amt>  /dontpass <amt>'
  ])

  await tableStatusBoard(room, st, `Line betting open (${BET_SECS}s)`)

  st.timers.bet = setTimeout(async () => {
    st.timers.bet = null
    await closeBettingBeginComeOut(room)
  }, BET_SECS * 1000)
}

// Come-out betting window again (same shooter; does NOT reset other bets)
async function openComeOutBetting (room, reasonLine = '') {
  const st = S(room)

  if (st.timers.bet) { clearTimeout(st.timers.bet); st.timers.bet = null }
  if (st.timers.roll) { clearTimeout(st.timers.roll); st.timers.roll = null }
  if (st.timers.pointBet) { clearTimeout(st.timers.pointBet); st.timers.pointBet = null }

  st.phase = PHASES.BETTING
  st.point = null

  await phaseBanner(room, `💰 PHASE: COME-OUT BETTING (${BET_SECS}s)`, [
    'Available now: /pass <amt>  /dontpass <amt>',
    '(Other bets stay working.)'
  ])

  if (reasonLine) await say(room, reasonLine)
  await tableStatusBoard(room, st, `Come-out betting open (${BET_SECS}s)`)

  st.timers.bet = setTimeout(async () => {
    st.timers.bet = null
    await closeBettingBeginComeOut(room)
  }, BET_SECS * 1000)
}

function startRollTimer (room, phase) {
  const st = S(room)
  if (st.timers.roll) clearTimeout(st.timers.roll)

  st.rollTimerCtx = { phase }

  st.timers.roll = setTimeout(async () => {
    st.timers.roll = null
    await handleShooterRollTimeout(room)
  }, ROLL_SECS * 1000)
}

function stopRollTimer (room) {
  const st = S(room)
  if (st.timers.roll) {
    clearTimeout(st.timers.roll)
    st.timers.roll = null
  }
}

// IMPORTANT: fires in COME_OUT or POINT
async function handleShooterRollTimeout (room) {
  const st = S(room)

  if (![PHASES.COME_OUT, PHASES.POINT].includes(st.phase)) return

  const sh = shooterUuid(st)
  if (!sh) {
    st.phase = PHASES.IDLE
    await say(room, 'Shooter missing — table closed.')
    return
  }

  // Solo + no roll yet: refund and close
  if (st.tableUsers.length === 1 && st.rollCount === 0) {
    await say(
      room,
      `⏱️ ${mention(sh)} didn’t roll in time.\n` +
      'Since you’re the only player seated and no roll happened, the round is cancelled and **all bets are refunded**.'
    )
    await refundAllBets(st)
    stopRollTimer(room)
    clearTimers(st)
    st.phase = PHASES.IDLE
    st.point = null
    st.rollCount = 0
    st.roundResults = Object.create(null)
    await phaseBanner(room, '🛑 PHASE: IDLE', ['Round cancelled. Bets refunded.'])
    await say(room, 'Type **/craps** to start again.')
    return
  }

  // Pass dice to next shooter, keep hand live
  const priorShooter = sh
  nextShooter(st)
  const next = shooterUuid(st)

  const label = (st.phase === PHASES.POINT && st.point) ? `POINT (${st.point})` : 'COME-OUT'

  await say(
    room,
    `⏱️ ${mention(priorShooter)} didn’t roll in time — **passing the dice**.\n` +
    `✅ Hand stays live (${label}). All bets stay working.\n` +
    `🎯 Next shooter: ${next ? mention(next) : '—'}`
  )

  await shooterTurnPrompt(room, st, label)
  startRollTimer(room, st.phase)
}

async function closeBettingBeginComeOut (room) {
  const st = S(room)

  if (!hasAnyBets(st)) {
    st.phase = PHASES.IDLE
    await phaseBanner(room, '🛑 PHASE: IDLE', ['No active bets. Table closed.'])
    await say(room, 'Type **/craps** to open a new join window.')
    return
  }

  // Line bets board
  const passLines = []
  const dpLines = []

  for (const [u, a] of Object.entries(st.pass)) {
    const name = await getDisplayName(st, u)
    passLines.push(`${name.padEnd(18)} ${fmtMoney(a)}`)
  }
  for (const [u, a] of Object.entries(st.dontPass)) {
    const name = await getDisplayName(st, u)
    dpLines.push(`${name.padEnd(18)} ${fmtMoney(a)}`)
  }

  const body = []
  body.push('LINE BETS LOCKED')
  body.push('-----------------------')
  if (!passLines.length && !dpLines.length) {
    body.push('(none this come-out)')
  } else {
    if (passLines.length) {
      body.push('PASS')
      body.push(...passLines)
      body.push('')
    }
    if (dpLines.length) {
      body.push("DON'T PASS")
      body.push(...dpLines)
    }
  }

  await sayCode(room, '📋', body.join('\n'))

  st.phase = PHASES.COME_OUT
  st.point = null

  await shooterTurnPrompt(room, st, 'COME-OUT')
  startRollTimer(room, PHASES.COME_OUT)
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

  const ok = await debitGameBet(user, amt)
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
  await say(room, 'Come/Don\'t Come only during the point phase.')
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

  const ok = await debitGameBet(user, amt)
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
  await say(room, 'Place bets only during the point phase.')
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
  const ok = await debitGameBet(user, amt)
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
  await creditGameWin(user, amt)
  await say(room, `↩️ ${mention(user)} removed place ${n}, returned ${fmtMoney(amt)}.`)
}

/* ───────────────────────── Payout helpers ───────────────────────── */

function placeProfit (num, amt) {
  if (num === 4 || num === 10) return amt * (9 / 5)
  if (num === 5 || num === 9) return amt * (7 / 5)
  if (num === 6 || num === 8) return amt * (7 / 6)
  return 0
}

/* ───────────────────────── Rolling + recap board ───────────────────────── */

async function buildResolutionsBoard (st, sections) {
  const rows = []
  for (const sec of sections) {
    if (!sec?.lines?.length) continue
    rows.push(sec.title)
    rows.push(...sec.lines)
    rows.push('')
  }
  if (!rows.length) return null
  while (rows.length && rows[rows.length - 1] === '') rows.pop()
  return rows.join('\n')
}

async function shooterRoll (user, room) {
  const st = S(room)

  if (!isShooter(user, st)) { await say(room, `${mention(user)} only the shooter may roll.`); return }

  if (![PHASES.COME_OUT, PHASES.POINT].includes(st.phase)) {
  await say(room, 'Not a rolling phase.')
  return
}


  stopRollTimer(room)

  const [d1, d2, total] = dice()
  st.rollCount++

  await say(room, `🎲 Roll: **${d1} + ${d2} = ${total}**` + (st.point ? `  _(point ${st.point})_` : ''))

  // COME-OUT phase
  if (st.phase === PHASES.COME_OUT) {
    const comePointLines = await resolveComePoints(total, st)
    const placeLines = await resolvePlace(total, st)

    const otherBoard = await buildResolutionsBoard(st, [
      { title: 'OTHER BETS', lines: [...comePointLines, ...placeLines] }
    ])
    if (otherBoard) await sayCode(room, '', otherBoard)

    if (total === 7 || total === 11) {
      const passLines = await settlePass(st, 'win')
      const dpLines = await settleDontPass(st, 'lose')

      const board = await buildResolutionsBoard(st, [
        { title: 'RESOLUTIONS', lines: [
          ...(passLines.length ? ['PASS', ...passLines, ''] : []),
          ...(dpLines.length ? ["DON'T PASS", ...dpLines] : [])
        ].filter(Boolean) }
      ])
      if (board) await sayCode(room, '', board)

      st.point = null
      await openComeOutBetting(room, `✅ Come-out **${total}** (natural). Same shooter — new come-out.`)
      return
    }

    if ([2, 3, 12].includes(total)) {
      const passLines = await settlePass(st, 'lose')
      const dpLines = await settleDontPass(st, total === 12 ? 'push' : 'win')

      const board = await buildResolutionsBoard(st, [
        { title: 'RESOLUTIONS', lines: [
          ...(passLines.length ? ['PASS', ...passLines, ''] : []),
          ...(dpLines.length ? ["DON'T PASS", ...dpLines] : [])
        ].filter(Boolean) }
      ])
      if (board) await sayCode(room, '', board)

      st.point = null
      await openComeOutBetting(room, `💥 Come-out craps **${total}**. Same shooter — new come-out.`)
      return
    }

    // Point established
    st.point = total
await say(room, `🟢 Point established: **${st.point}**`)
await openPointBetting(room) // one-time side bets window
return
  }

  // POINT phase
  const movedLines = await resolveComeWaiting(total, st)
  const comePointLines = await resolveComePoints(total, st)
  const placeLines = await resolvePlace(total, st)

  const board = await buildResolutionsBoard(st, [
    { title: 'RESOLUTIONS', lines: [...movedLines, ...comePointLines, ...placeLines] }
  ])
  if (board) await sayCode(room, '', board)

  if (total === st.point) {
    const passLines = await settlePass(st, 'win')
    const dpLines = await settleDontPass(st, 'lose')

    const lineBoard = await buildResolutionsBoard(st, [
      { title: 'POINT HIT — LINE BETS', lines: [
        ...(passLines.length ? ['PASS', ...passLines, ''] : []),
        ...(dpLines.length ? ["DON'T PASS", ...dpLines] : [])
      ].filter(Boolean) }
    ])
    if (lineBoard) await sayCode(room, '', lineBoard)

    st.point = null
    await openComeOutBetting(room, '✅ Point made! **Same shooter** — come-out is next.')
    return
  }

  if (total === 7) {
    const passLines = await settlePass(st, 'lose')
    const dpLines = await settleDontPass(st, 'win')

    const lineBoard = await buildResolutionsBoard(st, [
      { title: 'SEVEN-OUT — LINE BETS', lines: [
        ...(passLines.length ? ['PASS', ...passLines, ''] : []),
        ...(dpLines.length ? ["DON'T PASS", ...dpLines] : [])
      ].filter(Boolean) }
    ])
    if (lineBoard) await sayCode(room, '', lineBoard)

    await endHand(room, 'seven-out.')
    return
  }

  await say(room, `⏭️ Point stays **${st.point}**.`)
await shooterTurnPrompt(room, st, `POINT (${st.point})`)
startRollTimer(room, PHASES.POINT)
return

}

/* ───────────────────────── Settlements / Resolutions ───────────────────────── */

async function settlePass (st, outcome) {
  const lines = []
  for (const [u, amt] of Object.entries(st.pass)) {
    const name = await getDisplayName(st, u)
    if (outcome === 'win') {
      await creditGameWin(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(`${name.padEnd(18)} +${fmtMoney(amt)}`)
    } else if (outcome === 'push') {
      await creditGameWin(u, amt)
      lines.push(`${name.padEnd(18)} push ${fmtMoney(amt)}`)
    } else {
      addRoundResult(st, u, -amt)
      lines.push(`${name.padEnd(18)} -${fmtMoney(amt)}`)
    }
  }
  st.pass = Object.create(null)
  return lines
}

async function settleDontPass (st, outcome) {
  const lines = []
  for (const [u, amt] of Object.entries(st.dontPass)) {
    const name = await getDisplayName(st, u)
    if (outcome === 'win') {
      await creditGameWin(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(`${name.padEnd(18)} +${fmtMoney(amt)}`)
    } else if (outcome === 'push') {
      await creditGameWin(u, amt)
      lines.push(`${name.padEnd(18)} push ${fmtMoney(amt)}`)
    } else {
      addRoundResult(st, u, -amt)
      lines.push(`${name.padEnd(18)} -${fmtMoney(amt)}`)
    }
  }
  st.dontPass = Object.create(null)
  return lines
}

async function resolveComeWaiting (total, st) {
  const lines = []

  for (const [u, amt] of Object.entries(st.comeWaiting)) {
    const name = await getDisplayName(st, u)
    if (total === 7 || total === 11) {
      await creditGameWin(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(`${name.padEnd(18)} COME +${fmtMoney(amt)}`)
    } else if ([2, 3, 12].includes(total)) {
      if (total === 12) {
        await creditGameWin(u, amt)
        lines.push(`${name.padEnd(18)} COME push ${fmtMoney(amt)}`)
      } else {
        addRoundResult(st, u, -amt)
        lines.push(`${name.padEnd(18)} COME -${fmtMoney(amt)}`)
      }
    } else {
      st.comePoint[u] = { num: total, amt }
      lines.push(`${name.padEnd(18)} COME -> ${total} (${fmtMoney(amt)})`)
    }
    delete st.comeWaiting[u]
  }

  for (const [u, amt] of Object.entries(st.dontComeWaiting)) {
    const name = await getDisplayName(st, u)
    if ([2, 3].includes(total)) {
      await creditGameWin(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(`${name.padEnd(18)} DONT-COME +${fmtMoney(amt)}`)
    } else if (total === 12) {
      await creditGameWin(u, amt)
      lines.push(`${name.padEnd(18)} DONT-COME push ${fmtMoney(amt)}`)
    } else if (total === 7 || total === 11) {
      addRoundResult(st, u, -amt)
      lines.push(`${name.padEnd(18)} DONT-COME -${fmtMoney(amt)}`)
    } else {
      st.dontComePoint[u] = { num: total, amt }
      lines.push(`${name.padEnd(18)} DONT-COME vs ${total} (${fmtMoney(amt)})`)
    }
    delete st.dontComeWaiting[u]
  }

  return lines
}

async function resolveComePoints (total, st) {
  const lines = []

  for (const [u, o] of Object.entries(st.comePoint)) {
    const name = await getDisplayName(st, u)
    if (total === o.num) {
      await creditGameWin(u, o.amt * 2)
      addRoundResult(st, u, o.amt)
      lines.push(`${name.padEnd(18)} COME(${o.num}) +${fmtMoney(o.amt)}`)
      delete st.comePoint[u]
    } else if (total === 7) {
      addRoundResult(st, u, -o.amt)
      lines.push(`${name.padEnd(18)} COME(${o.num}) -${fmtMoney(o.amt)}`)
      delete st.comePoint[u]
    }
  }

  for (const [u, o] of Object.entries(st.dontComePoint)) {
    const name = await getDisplayName(st, u)
    if (total === 7) {
      await creditGameWin(u, o.amt * 2)
      addRoundResult(st, u, o.amt)
      lines.push(`${name.padEnd(18)} DONT(${o.num}) +${fmtMoney(o.amt)}`)
      delete st.dontComePoint[u]
    } else if (total === o.num) {
      addRoundResult(st, u, -o.amt)
      lines.push(`${name.padEnd(18)} DONT(${o.num}) -${fmtMoney(o.amt)}`)
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
        const name = await getDisplayName(st, u)
        addRoundResult(st, u, -amt)
        lines.push(`${name.padEnd(18)} PLACE(${n}) -${fmtMoney(amt)}`)
      }
      st.place[n] = {}
    }
    return lines
  }

  if (PLACES.includes(total)) {
    const book = st.place[total]
    for (const [u, amt] of Object.entries(book)) {
      const name = await getDisplayName(st, u)
      const rawProfit = placeProfit(total, amt)
      const profit = Math.ceil(rawProfit) // round UP
      if (profit > 0) {
        await creditGameWin(u, profit)
        addRoundResult(st, u, profit)
        lines.push(`${name.padEnd(18)} PLACE(${total}) +$${profit}`)
      }
    }
  }

  return lines
}

/* ───────────────────────── Hand End ───────────────────────── */

function nextShooter (st) {
  if (!st.tableUsers.length) return
  st.shooterIdx = (st.shooterIdx + 1) % st.tableUsers.length
}

async function endHand (room, reason) {
  const st = S(room)
  const shooter = shooterUuid(st)

  // Determine who WOULD have been next shooter (before we clear seats)
  const curLen = st.tableUsers.length
  if (curLen > 1) {
    const nextIdx = (st.shooterIdx + 1) % curLen
    st.pendingNextShooter = st.tableUsers[nextIdx] || null
  } else {
    st.pendingNextShooter = null
  }

  await say(room, reason ? `🧾 Hand over — ${reason}` : '🧾 Hand over.')

  // Hand totals board
  const rrKeys = Object.keys(st.roundResults || {})
  if (rrKeys.length) {
    const lines = []
    for (const u of rrKeys) {
      const name = await getDisplayName(st, u)
      const amt = st.roundResults[u]
      const sign = amt >= 0 ? '+' : '-'
      lines.push(`${name.padEnd(18)} ${sign}${fmtMoney(Math.abs(amt))}`)
    }
    await sayCode(room, 'HAND TOTALS', lines.join('\n'))
  }

  // Record check
  if (st.rollCount > st.record.rolls) {
    st.record = { rolls: st.rollCount, shooter: shooter || null }
    await say(room, `🏆 New record: ${st.record.rolls} roll(s) by ${shooter ? mention(shooter) : '—'}`)
    if (shooter) await persistRecord(room, st.record.rolls, shooter)
  }

  // Reset hand state
  st.point = null
  st.rollCount = 0
  st.roundResults = Object.create(null)
  resetAllBets(st)

  // Stop timers
  clearTimers(st)

  // Clear seats so it does NOT auto-start another hand.
  st.tableUsers = []
  st.shooterIdx = 0

  st.phase = PHASES.IDLE

  await phaseBanner(room, '🛑 PHASE: IDLE', [
    st.pendingNextShooter ? `Next shooter in line (if they re-join): ${st.pendingNextShooter}` : 'Next shooter in line: —',
    'Type: /craps to open a new join window'
  ])

  // Also ping as mention outside code so people see it
  const nextHint = st.pendingNextShooter ? ` Next shooter in line (if they re-join): ${mention(st.pendingNextShooter)}.` : ''
  await say(room, `🛑 Table is idle.${nextHint}\nType **/craps** to open a new join window.`)
}

/* ───────────────────────── Table mgmt / Bets view ───────────────────────── */

async function joinTable (user, room) {
  const st = S(room)
  if (!st.tableUsers.includes(user)) {
    st.tableUsers.push(user)
    await say(room, `🪑 ${mention(user)} sits at the table.`)
  }

  // If this user was next in line last hand, make them the shooter now.
  if (st.pendingNextShooter && st.pendingNextShooter === user) {
    st.shooterIdx = st.tableUsers.indexOf(user)
  }
}

async function userBetsView (room, uuid) {
  const st = S(room)
  const name = await getDisplayName(st, uuid)
  const lines = []

  if (st.pass[uuid]) lines.push(`PASS            ${fmtMoney(st.pass[uuid])}`)
  if (st.dontPass[uuid]) lines.push(`DON'T PASS      ${fmtMoney(st.dontPass[uuid])}`)
  if (st.comeWaiting[uuid]) lines.push(`COME(wait)      ${fmtMoney(st.comeWaiting[uuid])}`)
  if (st.dontComeWaiting[uuid]) lines.push(`DONT-COME(wait) ${fmtMoney(st.dontComeWaiting[uuid])}`)
  if (st.comePoint[uuid]) lines.push(`COME(${st.comePoint[uuid].num})       ${fmtMoney(st.comePoint[uuid].amt)}`)
  if (st.dontComePoint[uuid]) lines.push(`DONT(${st.dontComePoint[uuid].num})       ${fmtMoney(st.dontComePoint[uuid].amt)}`)

  const places = []
  for (const n of PLACES) {
    const amt = st.place[n]?.[uuid]
    if (amt) places.push(`${n}:${fmtMoney(amt)}`)
  }
  if (places.length) lines.push(`PLACE           ${places.join('  ')}`)

  if (!lines.length) return `No active bets for ${mention(uuid)}.`
  return `\`\`\`\nYOUR BETS: ${name}\n-----------------------\n${lines.join('\n')}\n\`\`\``
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
    await postMessage({ room, message: await userBetsView(room, uuid) })
    return true
  }

  // Allow "/join craps|cr" during JOIN window
  if (/^\/join\s+(craps|cr)\b/i.test(low)) {
    if (S(room).phase !== PHASES.JOIN) { await postMessage({ room, message: 'You can only join during the join window.' }); return true }
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
      case 'pass': await placeLineBet('pass', uuid, parts[0], room); return true
      case 'dontpass': await placeLineBet('dont', uuid, parts[0], room); return true
      case 'come': await placeComeBet('come', uuid, parts[0], room); return true
      case 'dontcome': await placeComeBet('dontcome', uuid, parts[0], room); return true
      case 'place': {
        const [num, amt] = parts
        if (!num || !amt) { await postMessage({ room, message: 'Usage: /place <4|5|6|8|9|10> <amount>' }); return true }
        await placePlaceBet(Number(num), uuid, amt, room)
        return true
      }
      case 'removeplace': {
        const [num] = parts
        if (!num) { await postMessage({ room, message: 'Usage: /removeplace <4|5|6|8|9|10>' }); return true }
        await removePlaceBet(Number(num), uuid, room)
        return true
      }
      case 'roll': await shooterRoll(uuid, room); return true
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
        await postMessage({ room, message: 'Craps is running. Use **/craps join** during join windows, or **/bets** to see your bets.' })
      }
      return true
    }

    case 'start':
      await openJoinWindow(room, uuid)
      return true

    case 'join':
      if (S(room).phase !== PHASES.JOIN) { await postMessage({ room, message: 'You can only join during the join window.' }); return true }
      await joinTable(uuid, room)
      return true

    case 'bets':
      await postMessage({ room, message: await userBetsView(room, uuid) })
      return true

    case 'help':
    case 'h':
      await postMessage({
        room,
        message:
`\`\`\`
CRAPS — QUICK HELP
-----------------------
FLOW
join → line betting → come-out → (point betting → roll) → ...
- Point betting opens before each POINT roll.
- Point made: same shooter, new come-out betting window.
- Seven-out: hand ends, table goes IDLE (no auto-restart).

COMMANDS
/craps             start if idle (starter auto-seated)
/craps start       reset & open join
/craps join        sit during join window
/pass <amt>        PASS (line betting)
/dontpass <amt>    DON'T PASS (line betting)
/roll              shooter rolls (timed)
/come <amt>        POINT betting/rolling
/dontcome <amt>    POINT betting/rolling
/place <num> <amt> POINT betting/rolling (4/5/6/8/9/10)
/removeplace <num> POINT betting/rolling
/bets              show your bets

TIMEOUTS
- If shooter fails to roll:
  • With 2+ seated players: dice passes to next shooter; hand & bets stay live.
  • With 1 seated player AND no roll yet: round cancels; all bets refunded.
\`\`\``
      })
      return true

    default:
      await postMessage({ room, message: 'Unknown craps subcommand. Try **/craps help**.' })
      return true
  }
}
