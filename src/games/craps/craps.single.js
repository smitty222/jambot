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
import { env } from '../../config.js'
import { logger } from '../../utils/logging.js'
import { syncCrapsPrestige, formatPrestigeUnlockLines } from '../../database/dbprestige.js'

/* ───────────────────────── Records (DB) ───────────────────────── */

async function persistRecord (room, rolls, shooterId) {
  let shooterNickname = shooterId
  try {
    shooterNickname = await getUserNicknameByUuid(shooterId)
  } catch (err) {
    logger.debug('[craps] nickname lookup failed while persisting record', {
      err: err?.message || err,
      shooterId
    })
  }
  const cleanNick = sanitizeNickname(shooterNickname || shooterId) || shooterId

  try {
    await addOrUpdateUser(shooterId, cleanNick)
  } catch (err) {
    logger.debug('[craps] addOrUpdateUser failed while persisting record', {
      err: err?.message || err,
      shooterId
    })
  }

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
  } catch (err) {
    logger.debug('[craps] persistRecord primary insert failed; retrying fallback nickname', {
      err: err?.message || err,
      room,
      shooterId
    })
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
  } catch (err) {
    logger.debug('[craps] loadRoomRecordIntoState failed', { err: err?.message || err, room })
  }
}

/* ───────────────────────── Constants ───────────────────────── */

const ROOM_DEFAULT = env.roomUuid || ''
if (!ROOM_DEFAULT) logger.warn('[craps] ROOM_UUID not set; room state may reset unexpectedly.')

const mention = (uuid) => `<@uid:${uuid}>`

const MIN_BET = env.crapsMinBet
const MAX_BET = env.crapsMaxBet
const JOIN_SECS = env.crapsJoinSecs
const BET_SECS = env.crapsBetSecs
const ROLL_SECS = env.crapsRollSecs
const POINT_BET_SECS = env.crapsPointBetSecs

const PLACES = [4, 5, 6, 8, 9, 10]

const POS = '🟢'
const NEG = '🔴'
const PUSH = '⚪'

function winLine (name, amt) {
  return `${POS} ${name.padEnd(18)} +${fmtMoney(amt)}`
}

function loseLine (name, amt) {
  return `${NEG} ${name.padEnd(18)} -${fmtMoney(amt)}`
}

function pushLine (name, amt) {
  return `${PUSH} ${name.padEnd(18)} push ${fmtMoney(amt)}`
}

/* ───────────────────────── State ───────────────────────── */

const TABLES = new Map()
const ROOM_LOCKS = new Map()

function S (room) {
  const key = room || ROOM_DEFAULT
  if (!TABLES.has(key)) {
    const st = freshState()
    TABLES.set(key, st)
    loadRoomRecordIntoState(key, st)
  }
  return TABLES.get(key)
}

export async function withCrapsRoomLock (room, fn) {
  const key = room || ROOM_DEFAULT
  const prior = ROOM_LOCKS.get(key) || Promise.resolve()
  let release
  const current = new Promise(resolve => { release = resolve })
  ROOM_LOCKS.set(key, current)

  await prior.catch(() => {})

  try {
    return await fn()
  } finally {
    release()
    if (ROOM_LOCKS.get(key) === current) ROOM_LOCKS.delete(key)
  }
}

function roundMoney (amount) {
  return Math.round((Number(amount) + Number.EPSILON) * 100) / 100
}

function rollRulesLine (mode, point) {
  const m = String(mode || '').toUpperCase()

  if (m.includes('COME')) {
    return '🎯 Rules: 7/11 = WIN • 2/3/12 = LOSE • 4/5/6/8/9/10 = set POINT'
  }

  if (m.includes('POINT')) {
    const p = point ? `(${point})` : ''
    return `🎯 Rules: hit POINT ${p} = WIN • 7 = SEVEN-OUT • others = keep rolling`
  }

  return '🎯 Rules: roll to continue'
}

function freshState () {
  return {
    phase: PHASES.IDLE,

    tableUsers: [],
    shooterIdx: 0,

    pendingNextShooter: null, // uuid who would be next shooter from last hand

    point: null,
    rollCount: 0, // rolls in the current hand (until seven-out)
    pointsMade: 0,

    record: { rolls: 0, shooter: null },

    roundResults: Object.create(null),

    pass: Object.create(null),
    dontPass: Object.create(null),
    passOdds: Object.create(null),
    dontPassOdds: Object.create(null),

    comeWaiting: [],
    dontComeWaiting: [],
    comePoint: [],
    dontComePoint: [],

    place: { 4: {}, 5: {}, 6: {}, 8: {}, 9: {}, 10: {} },
    field: Object.create(null),
    workingOnComeOut: Object.create(null),
    rules: {
      autoRestart: true,
      latePlaceBets: true,
      strictPlaceUnits: false
    },
    hotShooterBonusTier: 0,
    nextBetId: 1,
    sessionTotals: Object.create(null),
    sessionHandCount: 0,

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
function bold (s) { return `**${s}**` }

function shooterWho (st) {
  const sh = shooterUuid(st)
  return sh ? mention(sh) : '—'
}

function fmtSecs (secs) {
  return `${secs}s`
}

// Clean, non-code "phase" lines to replace the noisy ``` banners
async function phaseLine (room, title, lines = []) {
  const msg = [
    `🟦 ${bold(title)}`,
    ...(lines || [])
  ].filter(Boolean).join('\n')
  await say(room, msg)
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
  st.passOdds = Object.create(null)
  st.dontPassOdds = Object.create(null)
  st.comeWaiting = []
  st.dontComeWaiting = []
  st.comePoint = []
  st.dontComePoint = []
  st.place = { 4: {}, 5: {}, 6: {}, 8: {}, 9: {}, 10: {} }
  st.field = Object.create(null)
}

function hasAnyBets (st) {
  const hasObj = (o) => o && Object.keys(o).length > 0
  const hasPlace = PLACES.some(n => hasObj(st.place?.[n]))
  return (
    hasObj(st.pass) ||
    hasObj(st.dontPass) ||
    hasObj(st.passOdds) ||
    hasObj(st.dontPassOdds) ||
    st.comeWaiting.length > 0 ||
    st.dontComeWaiting.length > 0 ||
    st.comePoint.length > 0 ||
    st.dontComePoint.length > 0 ||
    hasPlace ||
    hasObj(st.field)
  )
}

async function refundAllBets (st) {
  for (const [u, amt] of Object.entries(st.pass)) await creditGameWin(u, amt)
  for (const [u, amt] of Object.entries(st.dontPass)) await creditGameWin(u, amt)
  for (const [u, amt] of Object.entries(st.passOdds)) await creditGameWin(u, amt)
  for (const [u, amt] of Object.entries(st.dontPassOdds)) await creditGameWin(u, amt)

  for (const bet of st.comeWaiting) await creditGameWin(bet.user, bet.amt)
  for (const bet of st.dontComeWaiting) await creditGameWin(bet.user, bet.amt)

  for (const bet of st.comePoint) {
    if (bet?.amt) await creditGameWin(bet.user, bet.amt)
    if (bet?.odds) await creditGameWin(bet.user, bet.odds)
  }
  for (const bet of st.dontComePoint) {
    if (bet?.amt) await creditGameWin(bet.user, bet.amt)
    if (bet?.odds) await creditGameWin(bet.user, bet.odds)
  }

  for (const n of PLACES) {
    for (const [u, amt] of Object.entries(st.place[n] || {})) await creditGameWin(u, amt)
  }

  for (const [u, amt] of Object.entries(st.field || {})) await creditGameWin(u, amt)

  resetAllBets(st)
}

async function refundUserBets (st, user) {
  if (st.pass[user]) { await creditGameWin(user, st.pass[user]); delete st.pass[user] }
  if (st.dontPass[user]) { await creditGameWin(user, st.dontPass[user]); delete st.dontPass[user] }
  if (st.passOdds[user]) { await creditGameWin(user, st.passOdds[user]); delete st.passOdds[user] }
  if (st.dontPassOdds[user]) { await creditGameWin(user, st.dontPassOdds[user]); delete st.dontPassOdds[user] }

  const nextComeWaiting = []
  for (const bet of st.comeWaiting) {
    if (bet.user !== user) nextComeWaiting.push(bet)
    else await creditGameWin(user, bet.amt)
  }
  st.comeWaiting = nextComeWaiting

  const nextDontComeWaiting = []
  for (const bet of st.dontComeWaiting) {
    if (bet.user !== user) nextDontComeWaiting.push(bet)
    else await creditGameWin(user, bet.amt)
  }
  st.dontComeWaiting = nextDontComeWaiting

  const refundPointCollection = async (bets) => {
    const kept = []
    for (const bet of bets) {
      if (bet.user !== user) {
        kept.push(bet)
        continue
      }
      if (bet.amt) await creditGameWin(user, bet.amt)
      if (bet.odds) await creditGameWin(user, bet.odds)
    }
    return kept
  }

  st.comePoint = await refundPointCollection(st.comePoint)
  st.dontComePoint = await refundPointCollection(st.dontComePoint)

  for (const n of PLACES) {
    const amt = st.place[n]?.[user]
    if (amt) {
      await creditGameWin(user, amt)
      delete st.place[n][user]
    }
  }

  if (st.field[user]) {
    await creditGameWin(user, st.field[user])
    delete st.field[user]
  }
}

function nextBetId (st) {
  const id = st.nextBetId
  st.nextBetId += 1
  return id
}

function getWorkingFlag (st, user) {
  return st.workingOnComeOut[user] === true
}

function placeWindowOpen (st) {
  return st.phase === PHASES.POINT && (st.timers.pointBet || st.rules.latePlaceBets)
}

function strictPlaceMultiple (num) {
  if (num === 6 || num === 8) return 6
  return 5
}

function validatePlaceAmount (st, num, amt) {
  if (!st.rules.strictPlaceUnits) return true
  const mult = strictPlaceMultiple(num)
  return Number.isInteger(amt / mult)
}

function oddsProfit (kind, num, amt) {
  if (!num || !amt) return 0
  if (kind === 'pass' || kind === 'come') {
    if (num === 4 || num === 10) return roundMoney(amt * 2)
    if (num === 5 || num === 9) return roundMoney(amt * 1.5)
    if (num === 6 || num === 8) return roundMoney(amt * 1.2)
  }
  if (kind === 'dont' || kind === 'dontcome') {
    if (num === 4 || num === 10) return roundMoney(amt * 0.5)
    if (num === 5 || num === 9) return roundMoney(amt * (2 / 3))
    if (num === 6 || num === 8) return roundMoney(amt * (5 / 6))
  }
  return 0
}

function canPlaceOddsOnLine (kind, user, st) {
  if (!st.point || st.phase !== PHASES.POINT) return false
  if (kind === 'pass') return Number(st.pass[user] || 0) > 0
  if (kind === 'dont') return Number(st.dontPass[user] || 0) > 0
  return false
}

function findComePointBet (collection, user, num) {
  return collection.find(bet => bet.user === user && Number(bet.num) === Number(num)) || null
}
function outcomeLabel ({ phase, total, point }) {
  // COME-OUT results
  if (phase === PHASES.COME_OUT) {
    if (total === 7 || total === 11) return 'NATURAL (PASS wins)'
    if (total === 2 || total === 3) return 'CRAPS (PASS loses)'
    if (total === 12) return 'BOXCARS (PASS loses, DP pushes)'
    return `POINT SET: ${total}`
  }

  // POINT phase results
  if (phase === PHASES.POINT) {
    if (total === 7) return 'SEVEN-OUT 💥'
    if (point && total === point) return `POINT HIT ✅ (${point})`
    return 'NO DECISION'
  }

  return '—'
}

const DIE = { 1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣', 6: '6️⃣' }

function formatDiceCard ({ rollCount, d1, d2, total, point }) {
  const pointStr = point ? `POINT ${point}` : 'COME-OUT'
  return [
    `🎲 ROLL #${rollCount}  •  ${pointStr}`,
    '━━━━━━━━━━━━━━━━━━━━━━',
    `   ${DIE[d1] || d1}  +  ${DIE[d2] || d2}  =  ${total}`,
    '━━━━━━━━━━━━━━━━━━━━━━'
  ].join('\n')
}

function dramaticOutcome ({ phase, total, point }) {
  if (phase === PHASES.COME_OUT) {
    if (total === 7)  return { msg: `🍀 **SEVEN! Natural** — Pass wins!`, delay: 750 }
    if (total === 11) return { msg: `🍀 **YO-LEVEN! Natural** — Pass wins!`, delay: 750 }
    if (total === 2)  return { msg: `💀 **SNAKE EYES!** Craps — Pass loses.`, delay: 750 }
    if (total === 3)  return { msg: `💀 **CRAPS THREE!** Pass loses.`, delay: 700 }
    if (total === 12) return { msg: `🎰 **BOXCARS!** Pass loses, Don't Pass pushes.`, delay: 750 }
    return { msg: `📍 **Point is ${total}** — hit it again!`, delay: 500 }
  }
  if (phase === PHASES.POINT) {
    if (total === 7)        return { msg: `💥 **SEVEN OUT!!** The hand is over.`, delay: 950 }
    if (total === point)    return { msg: `🎯 **${total} — POINT MADE!!** Shooter stays hot!`, delay: 900 }
  }
  return { msg: `— **${total}** — no decision`, delay: 400 }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function shooterTurnPrompt (room, st, mode = '', { minimal = false } = {}) {
  const sh = shooterUuid(st)
  const who = sh ? mention(sh) : '—'
  const rules = rollRulesLine(mode, st.point)

  if (minimal) {
    await say(room, `🎲 ${who} — **/roll** (⏱️ ${ROLL_SECS}s) • ${rules}`)
    return
  }

  // One clean shooter prompt (no code block)
  await sleep(80)
  await say(
    room,
    `🎲 **SHOOTER TURN** → ${who}\n` +
    `Mode: **${mode || '—'}** • (⏱️ ${ROLL_SECS}s)\n` +
    `${rules}\n` +
    '👉 Type **/roll**'
  )
}

/* ───────────────────────── Point betting window ───────────────────────── */

async function openPointBetting (room, reasonLine = '') {
  const st = S(room)

  // Pause rolling timer while side bets are open
  stopRollTimer(room)
  if (st.timers.pointBet) {
    clearTimeout(st.timers.pointBet)
    st.timers.pointBet = null
  }

  // Stay in POINT phase; this is just a timed side-bets window
  st.phase = PHASES.POINT

  // ✅ Minimal, non-spammy message (no banner, no status board)
  await say(
    room,
    `🟦 **Side bets open** (${POINT_BET_SECS}s) — ` +
    '**/come <amt> /dontcome <amt> /place <num> <amt> /press <num> <amt> /take <num> <amt> /odds ...**'
  )

  if (reasonLine) await say(room, reasonLine)

  st.timers.pointBet = setTimeout(async () => {
    await withCrapsRoomLock(room, async () => {
      st.timers.pointBet = null
      await closePointBettingStartRoll(room)
    })
  }, POINT_BET_SECS * 1000)
}

async function closePointBettingStartRoll (room) {
  const st = S(room)

  // If point vanished, treat like come-out
  if (!st.point) {
    st.phase = PHASES.COME_OUT

    // ✅ minimal roll prompt (no banner/board)
    const sh = shooterUuid(st)
    await say(
      room,
      `🎲 **Roll #${st.rollCount + 1}** — ${sh ? mention(sh) : 'Shooter'} type **/roll** (⏱️ ${ROLL_SECS}s)`
    )

    startRollTimer(room, PHASES.COME_OUT)
    return
  }

  st.phase = PHASES.POINT

  // ✅ minimal roll prompt (focus on the roll; keep point visible)
  const sh = shooterUuid(st)
  await say(
    room,
    `🎲 **Roll #${st.rollCount + 1}** (point **${st.point}**) — ${sh ? mention(sh) : 'Shooter'} type **/roll** (⏱️ ${ROLL_SECS}s)`
  )

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
  st.sessionTotals = Object.create(null)
  st.sessionHandCount = 0
  resetAllBets(st)

  // Starter auto-seated
  if (starterUuid) await autoSeat(st, starterUuid, room)

  await say(
    room,
  `🎲 **Craps table OPEN** (${JOIN_SECS}s)\n` +
  'Type **/craps join** to sit at the table.'
  )

  st.timers.join = setTimeout(async () => {
    await withCrapsRoomLock(room, async () => {
      st.timers.join = null
      await closeJoinOpenBetting(room)
    })
  }, JOIN_SECS * 1000)
}

async function closeJoinOpenBetting (room) {
  const st = S(room)

  if (!st.tableUsers.length) {
    st.phase = PHASES.IDLE
    await phaseLine(room, 'PHASE: IDLE', [
      'Join closed — nobody seated.',
      'Type ' + bold('/craps') + ' to open a new join window.'
    ])
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

  await phaseLine(room, `PHASE: LINE BETTING (${fmtSecs(BET_SECS)})`, [
    `Shooter: ${shooterWho(st)}`,
    `Commands: ${bold('/pass <amt>')}  ${bold('/dontpass <amt>')}`
  ])

  // Optional: a bottom CTA so it always “ends” the phase message
  await sleep(80)
  await say(room, `✅ Line betting open — place bets now (⏱️ ${BET_SECS}s)`)

  st.timers.bet = setTimeout(async () => {
    await withCrapsRoomLock(room, async () => {
      st.timers.bet = null
      await closeBettingBeginComeOut(room)
    })
  }, BET_SECS * 1000)
}

// Come-out betting window again (same shooter; does NOT reset other bets)
async function openComeOutBetting (room, reasonLine = '') {
  const st = S(room)

  // Clear any existing timers that could compete with this window
  if (st.timers.bet) { clearTimeout(st.timers.bet); st.timers.bet = null }
  if (st.timers.roll) { clearTimeout(st.timers.roll); st.timers.roll = null }
  if (st.timers.pointBet) { clearTimeout(st.timers.pointBet); st.timers.pointBet = null }

  st.phase = PHASES.BETTING
  st.point = null

  // Reason first (e.g. "Point made!" / "Come-out craps 3!")
  if (reasonLine) await say(room, reasonLine)

  await phaseLine(room, `PHASE: COME-OUT BETTING (${fmtSecs(BET_SECS)})`, [
    `Shooter: ${shooterWho(st)}`,
    `Commands: ${bold('/pass <amt>')}  ${bold('/dontpass <amt>')}`,
    'Other bets stay working.'
  ])

  // Ensure CTA lands at the bottom
  await sleep(80)
  await say(room, `✅ Betting open — type ${bold('/pass <amt>')} or ${bold('/dontpass <amt>')} (⏱️ ${BET_SECS}s) • New players: **/craps join**`)

  st.timers.bet = setTimeout(async () => {
    await withCrapsRoomLock(room, async () => {
      st.timers.bet = null
      await closeBettingBeginComeOut(room)
    })
  }, BET_SECS * 1000)
}

function startRollTimer (room, phase) {
  const st = S(room)
  if (st.timers.roll) clearTimeout(st.timers.roll)

  st.rollTimerCtx = { phase }

  st.timers.roll = setTimeout(async () => {
    await withCrapsRoomLock(room, async () => {
      st.timers.roll = null
      await handleShooterRollTimeout(room)
    })
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
    await phaseLine(room, 'PHASE: IDLE', [
      'Round cancelled. Bets refunded.',
  `Type ${bold('/craps')} to start again.`
    ])
    return
  }

  // Pass dice to next shooter, keep hand live
  const priorShooter = sh
  nextShooter(st)
  st.pointsMade = 0
  st.hotShooterBonusTier = 0
  const next = shooterUuid(st)

  const label = (st.phase === PHASES.POINT && st.point) ? `POINT (${st.point})` : 'COME-OUT'

  await say(
    room,
    `⏱️ ${mention(priorShooter)} didn’t roll in time — **passing the dice**.\n` +
    `✅ Hand stays live (${label}). All bets stay working.\n` +
    `🎯 Next shooter: ${next ? mention(next) : '—'}`
  )

  await sleep(50)
  await shooterTurnPrompt(room, st, label)
  startRollTimer(room, st.phase)
}

async function closeBettingBeginComeOut (room) {
  const st = S(room)

  if (!hasAnyBets(st)) {
    st.phase = PHASES.IDLE
    await phaseLine(room, 'PHASE: IDLE', [
      'No active bets.',
      st.tableUsers.length
        ? `Players remain seated. Type ${bold('/craps start')} to open betting again or ${bold('/craps leave')} to stand up.`
        : `Type ${bold('/craps')} to open a new join window.`
    ])
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

  await sleep(50)
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

  const bal = await getUserWallet(user)
  if (Number(bal) < amt) { await say(room, `${mention(user)} insufficient funds. Balance ${fmtMoney(bal)}.`); return }

  const ok = await debitGameBet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  const waiting = (kind === 'come') ? st.comeWaiting : st.dontComeWaiting
  waiting.push({ id: nextBetId(st), user, amt, odds: 0 })
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
  if (!placeWindowOpen(st)) {
    await say(room, 'Place bets are only open during the point phase.')
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
  if (!validatePlaceAmount(st, n, amt)) {
    await say(room, `${mention(user)} ${n} must be in ${fmtMoney(strictPlaceMultiple(n))} increments with strict units on.`)
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

async function adjustPlaceBet (mode, num, user, amount, room) {
  const st = S(room)
  const n = Number(num)
  const delta = Number(amount || 0)

  if (!st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you must join the table to manage a bet.`)
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
  if (mode === 'remove') {
    delete st.place[n][user]
    await creditGameWin(user, amt)
    await say(room, `↩️ ${mention(user)} removed place ${n}, returned ${fmtMoney(amt)}.`)
    return
  }
  if (!placeWindowOpen(st)) {
    await say(room, 'Place bet changes are only open during the point phase.')
    return
  }
  if (!Number.isFinite(delta) || delta < MIN_BET || delta > MAX_BET) {
    await say(room, `${mention(user)} invalid amount. Min ${fmtMoney(MIN_BET)}, Max ${fmtMoney(MAX_BET)}.`)
    return
  }

  if (mode === 'press') {
    const bal = await getUserWallet(user)
    if (Number(bal) < delta) {
      await say(room, `${mention(user)} insufficient funds. Balance ${fmtMoney(bal)}.`)
      return
    }
    const next = roundMoney(amt + delta)
    if (!validatePlaceAmount(st, n, next)) {
      await say(room, `${mention(user)} ${n} must be in ${fmtMoney(strictPlaceMultiple(n))} increments with strict units on.`)
      return
    }
    const ok = await debitGameBet(user, delta)
    if (!ok) { await say(room, `${mention(user)} wallet error. Bet not changed.`); return }
    st.place[n][user] = next
    await say(room, `📈 ${mention(user)} pressed ${n} to ${fmtMoney(next)}.`)
    return
  }

  if (delta >= amt) {
    delete st.place[n][user]
    await creditGameWin(user, amt)
    await say(room, `📉 ${mention(user)} took down ${n} for ${fmtMoney(amt)}.`)
    return
  }

  const next = roundMoney(amt - delta)
  if (!validatePlaceAmount(st, n, next)) {
    await say(room, `${mention(user)} ${n} must be in ${fmtMoney(strictPlaceMultiple(n))} increments with strict units on.`)
    return
  }
  st.place[n][user] = next
  await creditGameWin(user, delta)
  await say(room, `📉 ${mention(user)} reduced ${n} to ${fmtMoney(next)}.`)
}

async function placeOddsBet (kind, target, amount, user, room) {
  const st = S(room)
  const amt = Number(amount || 0)
  const num = Number(target)

  if (!st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you must join the table to bet.`)
    return
  }
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) {
    await say(room, `${mention(user)} invalid amount. Min ${fmtMoney(MIN_BET)}, Max ${fmtMoney(MAX_BET)}.`)
    return
  }

  let book = null
  let label = ''
  if (kind === 'pass' || kind === 'dont') {
    if (!canPlaceOddsOnLine(kind, user, st)) {
      await say(room, `${mention(user)} you need a live ${kind === 'pass' ? 'Pass' : "Don't Pass"} bet and point first.`)
      return
    }
    book = kind === 'pass' ? st.passOdds : st.dontPassOdds
    label = kind === 'pass' ? 'PASS ODDS' : "DON'T PASS ODDS"
  } else if (kind === 'come' || kind === 'dontcome') {
    const bet = findComePointBet(kind === 'come' ? st.comePoint : st.dontComePoint, user, num)
    if (!bet) {
      await say(room, `${mention(user)} no ${kind === 'come' ? 'Come' : "Don't Come"} point on ${num}.`)
      return
    }
    const bal = await getUserWallet(user)
    if (Number(bal) < amt) { await say(room, `${mention(user)} insufficient funds. Balance ${fmtMoney(bal)}.`); return }
    const ok = await debitGameBet(user, amt)
    if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }
    bet.odds = roundMoney((bet.odds || 0) + amt)
    await say(room, `🎯 ${mention(user)} added ${fmtMoney(amt)} odds behind **${kind === 'come' ? 'COME' : "DON'T COME"} ${num}**.`)
    return
  } else {
    await say(room, 'Usage: /odds pass <amt> | /odds dontpass <amt> | /odds come <num> <amt> | /odds dontcome <num> <amt>')
    return
  }

  const bal = await getUserWallet(user)
  if (Number(bal) < amt) { await say(room, `${mention(user)} insufficient funds. Balance ${fmtMoney(bal)}.`); return }
  const ok = await debitGameBet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  book[user] = roundMoney((book[user] || 0) + amt)
  await say(room, `🎯 ${mention(user)} added ${fmtMoney(amt)} to **${label}**.`)
}

async function setWorkingFlag (user, value, room) {
  const st = S(room)
  st.workingOnComeOut[user] = value
  await say(room, `⚙️ ${mention(user)} set place/odds on the come-out to **${value ? 'WORKING' : 'OFF'}**.`)
}

async function placeFieldBet (user, amount, room) {
  const st = S(room)
  const amt = Number(amount || 0)

  if (!st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you must join the table to bet.`)
    return
  }
  if (![PHASES.BETTING, PHASES.COME_OUT, PHASES.POINT].includes(st.phase)) {
    await say(room, `${mention(user)} field bets can only be placed while a hand is active.`)
    return
  }
  if (!Number.isFinite(amt) || amt < MIN_BET || amt > MAX_BET) {
    await say(room, `${mention(user)} invalid amount. Min ${fmtMoney(MIN_BET)}, Max ${fmtMoney(MAX_BET)}.`)
    return
  }
  if (st.field[user]) {
    await say(room, `${mention(user)} you already have a field bet of ${fmtMoney(st.field[user])}. Use /removefield first.`)
    return
  }

  const bal = await getUserWallet(user)
  if (Number(bal) < amt) {
    await say(room, `${mention(user)} insufficient funds. Balance ${fmtMoney(bal)}.`)
    return
  }

  const ok = await debitGameBet(user, amt)
  if (!ok) { await say(room, `${mention(user)} wallet error. Bet not placed.`); return }

  st.field[user] = amt
  await say(room, `✅ ${mention(user)} placed **FIELD** ${fmtMoney(amt)} (wins on 2,3,4,9,10,11,12 — 2:1 on 2, 3:1 on 12).`)
}

async function removeFieldBet (user, room) {
  const st = S(room)

  if (!st.field[user]) {
    await say(room, `${mention(user)} you have no field bet.`)
    return
  }

  const amt = st.field[user]
  delete st.field[user]
  await creditGameWin(user, amt)
  await say(room, `↩️ ${mention(user)} removed field bet, returned ${fmtMoney(amt)}.`)
}

async function removeUserFromTable (user, room) {
  const st = S(room)
  if (!st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you are not seated.`)
    return
  }
  const removedIdx = st.tableUsers.indexOf(user)
  const wasShooter = removedIdx === st.shooterIdx
  await refundUserBets(st, user)
  st.tableUsers = st.tableUsers.filter(u => u !== user)
  if (!st.tableUsers.length) st.shooterIdx = 0
  else if (wasShooter) st.shooterIdx = removedIdx % st.tableUsers.length
  else if (removedIdx < st.shooterIdx) st.shooterIdx -= 1
  else if (st.shooterIdx >= st.tableUsers.length) st.shooterIdx = 0
  if (st.pendingNextShooter === user) st.pendingNextShooter = null
  await say(room, `🚪 ${mention(user)} left the table.`)
  if (!st.tableUsers.length) {
    clearTimers(st)
    resetAllBets(st)
    st.phase = PHASES.IDLE
    st.point = null
    st.rollCount = 0
    st.pointsMade = 0
    await phaseLine(room, 'PHASE: IDLE', ['Table empty.', `Type ${bold('/craps')} to open a new table.`])
  }
}

/* ───────────────────────── Payout helpers ───────────────────────── */

function placeProfit (num, amt) {
  if (num === 4 || num === 10) return roundMoney(amt * (9 / 5))
  if (num === 5 || num === 9) return roundMoney(amt * (7 / 5))
  if (num === 6 || num === 8) return roundMoney(amt * (7 / 6))
  return 0
}

const FIELD_WINNERS = new Set([2, 3, 4, 9, 10, 11, 12])

function fieldProfit (total, amt) {
  if (total === 2) return roundMoney(amt * 1)    // 2:1 pays 1x profit
  if (total === 12) return roundMoney(amt * 2)   // 3:1 pays 2x profit
  return roundMoney(amt * 1)                      // 1:1 all others
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

async function buildWorkingBoard (st) {
  const rows = []

  for (const [u, amt] of Object.entries(st.pass)) {
    const name = await getDisplayName(st, u)
    const odds = st.passOdds[u] ? ` + odds ${fmtMoney(st.passOdds[u])}` : ''
    rows.push(`${name.padEnd(18)} PASS ${fmtMoney(amt)}${odds}`)
  }
  for (const [u, amt] of Object.entries(st.dontPass)) {
    const name = await getDisplayName(st, u)
    const odds = st.dontPassOdds[u] ? ` + odds ${fmtMoney(st.dontPassOdds[u])}` : ''
    rows.push(`${name.padEnd(18)} DONT ${fmtMoney(amt)}${odds}`)
  }
  for (const bet of st.comePoint) {
    const name = await getDisplayName(st, bet.user)
    const odds = bet.odds ? ` + odds ${fmtMoney(bet.odds)}` : ''
    rows.push(`${name.padEnd(18)} COME ${bet.num} ${fmtMoney(bet.amt)}${odds}`)
  }
  for (const bet of st.dontComePoint) {
    const name = await getDisplayName(st, bet.user)
    const odds = bet.odds ? ` + odds ${fmtMoney(bet.odds)}` : ''
    rows.push(`${name.padEnd(18)} DONT ${bet.num} ${fmtMoney(bet.amt)}${odds}`)
  }
  for (const bet of st.comeWaiting) {
    const name = await getDisplayName(st, bet.user)
    rows.push(`${name.padEnd(18)} COME(wait) ${fmtMoney(bet.amt)}`)
  }
  for (const bet of st.dontComeWaiting) {
    const name = await getDisplayName(st, bet.user)
    rows.push(`${name.padEnd(18)} DONT(wait) ${fmtMoney(bet.amt)}`)
  }
  for (const n of PLACES) {
    for (const [u, amt] of Object.entries(st.place[n] || {})) {
      const name = await getDisplayName(st, u)
      const work = getWorkingFlag(st, u) ? ' work' : ''
      rows.push(`${name.padEnd(18)} PLACE ${n} ${fmtMoney(amt)}${work}`)
    }
  }
  for (const [u, amt] of Object.entries(st.field || {})) {
    const name = await getDisplayName(st, u)
    rows.push(`${name.padEnd(18)} FIELD ${fmtMoney(amt)}`)
  }

  if (!rows.length) return null
  return rows.join('\n')
}

function hotShooterMilestone (pointsMade) {
  if (pointsMade >= 7) return { tier: 3, bonus: 150, label: 'Inferno shooter' }
  if (pointsMade >= 5) return { tier: 2, bonus: 75, label: 'Fire shooter' }
  if (pointsMade >= 3) return { tier: 1, bonus: 25, label: 'Hot shooter' }
  return null
}

function nextHotShooterGoal (pointsMade) {
  if (pointsMade < 3) return { needed: 3 - pointsMade, label: 'Hot Shooter 🔥', bonus: 25 }
  if (pointsMade < 5) return { needed: 5 - pointsMade, label: 'Fire Shooter 🔥🔥', bonus: 75 }
  if (pointsMade < 7) return { needed: 7 - pointsMade, label: 'Inferno Shooter 🔥🔥🔥', bonus: 150 }
  return null
}

async function maybeAwardHotShooterBonus (room, st) {
  const shooter = shooterUuid(st)
  if (!shooter) return
  const milestone = hotShooterMilestone(st.pointsMade)
  if (!milestone || milestone.tier <= st.hotShooterBonusTier) return
  st.hotShooterBonusTier = milestone.tier
  await creditGameWin(shooter, milestone.bonus)
  addRoundResult(st, shooter, milestone.bonus)
  await say(room, `🔥 ${milestone.label}: ${mention(shooter)} has made ${st.pointsMade} point(s) and wins ${fmtMoney(milestone.bonus)}.`)
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

  // Build suspense — dice reveal, then outcome
  await say(room, `🎲 *Dice in the air...*`)
  await sleep(650)

  await sayCode(room, '', formatDiceCard({
    rollCount: st.rollCount,
    d1,
    d2,
    total,
    point: st.point
  }))

  const { msg: outcomeMsg, delay: outcomeDelay } = dramaticOutcome({ phase: st.phase, total, point: st.point })
  await sleep(outcomeDelay)
  await say(room, outcomeMsg)

  // COME-OUT phase
  if (st.phase === PHASES.COME_OUT) {
    const comePointLines = await resolveComePoints(total, st, { onComeOut: true })
    const placeLines = await resolvePlace(total, st, { onComeOut: true })
    const fieldLines = await resolveField(total, st)

    const otherBoard = await buildResolutionsBoard(st, [
      { title: 'OTHER BETS', lines: [...comePointLines, ...placeLines, ...fieldLines] }
    ])
    if (otherBoard) await sayCode(room, '', otherBoard)

    if (total === 7 || total === 11) {
      const passLines = await settlePass(st, 'win')
      const dpLines = await settleDontPass(st, 'lose')
      const oddsLines = await settleLineOdds(st, total, 'push')

      const board = await buildResolutionsBoard(st, [
        {
          title: 'RESOLUTIONS',
          lines: [
            ...(passLines.length ? ['PASS', ...passLines, ''] : []),
            ...(dpLines.length ? ["DON'T PASS", ...dpLines, ''] : []),
            ...(oddsLines.length ? ['ODDS', ...oddsLines] : [])
          ].filter(Boolean)
        }
      ])
      if (board) await sayCode(room, '', board)

      st.point = null

      const shooterUid = shooterUuid(st)
      if (shooterUid) {
        const naturalPrestige = syncCrapsPrestige({ userUUID: shooterUid, isNatural: true })
        const naturalLines = formatPrestigeUnlockLines(naturalPrestige)
        if (naturalLines.length) await say(room, `<@uid:${shooterUid}>\n${naturalLines.join('\n')}`)
      }

      await openComeOutBetting(room, `✅ Come-out **${total}** (natural). Same shooter — new come-out.`)
      return
    }

    if ([2, 3, 12].includes(total)) {
      const passLines = await settlePass(st, 'lose')
      const dpLines = await settleDontPass(st, total === 12 ? 'push' : 'win')
      const oddsLines = await settleLineOdds(st, total, 'push')

      const board = await buildResolutionsBoard(st, [
        {
          title: 'RESOLUTIONS',
          lines: [
            ...(passLines.length ? ['PASS', ...passLines, ''] : []),
            ...(dpLines.length ? ["DON'T PASS", ...dpLines, ''] : []),
            ...(oddsLines.length ? ['ODDS', ...oddsLines] : [])
          ].filter(Boolean)
        }
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
  const fieldLines = await resolveField(total, st)

  const board = await buildResolutionsBoard(st, [
    { title: 'RESOLUTIONS', lines: [...movedLines, ...comePointLines, ...placeLines, ...fieldLines] }
  ])
  if (board) await sayCode(room, '', board)

  if (total === st.point) {
    st.pointsMade += 1
    const passLines = await settlePass(st, 'win')
    const dpLines = await settleDontPass(st, 'lose')
    const oddsLines = await settleLineOdds(st, total, 'pass')

    const lineBoard = await buildResolutionsBoard(st, [
      {
        title: 'POINT HIT — LINE BETS',
        lines: [
          ...(passLines.length ? ['PASS', ...passLines, ''] : []),
          ...(dpLines.length ? ["DON'T PASS", ...dpLines, ''] : []),
          ...(oddsLines.length ? ['ODDS', ...oddsLines] : [])
        ].filter(Boolean)
      }
    ])
    if (lineBoard) await sayCode(room, '', lineBoard)
    await maybeAwardHotShooterBonus(room, st)

    const nextGoal = nextHotShooterGoal(st.pointsMade)
    if (nextGoal) {
      await say(room, `🎯 Shooter: **${st.pointsMade}** point(s) made — ${nextGoal.needed} more for ${nextGoal.label} (+${fmtMoney(nextGoal.bonus)})`)
    }

    st.point = null

    const shooterUid = shooterUuid(st)
    if (shooterUid) {
      const pointPrestige = syncCrapsPrestige({ userUUID: shooterUid, isPointMade: true })
      const pointLines = formatPrestigeUnlockLines(pointPrestige)
      if (pointLines.length) await say(room, `<@uid:${shooterUid}>\n${pointLines.join('\n')}`)
    }

    await openComeOutBetting(room, '✅ Point made! **Same shooter** — come-out is next.')
    return
  }

  if (total === 7) {
    const passLines = await settlePass(st, 'lose')
    const dpLines = await settleDontPass(st, 'win')
    const oddsLines = await settleLineOdds(st, st.point, 'dont')

    const lineBoard = await buildResolutionsBoard(st, [
      {
        title: 'SEVEN-OUT — LINE BETS',
        lines: [
          ...(passLines.length ? ['PASS', ...passLines, ''] : []),
          ...(dpLines.length ? ["DON'T PASS", ...dpLines, ''] : []),
          ...(oddsLines.length ? ['ODDS', ...oddsLines] : [])
        ].filter(Boolean)
      }
    ])
    if (lineBoard) await sayCode(room, '', lineBoard)

    await endHand(room, 'seven-out.')
    return
  }

  await shooterTurnPrompt(room, st, `POINT (${st.point})`, { minimal: true })
  startRollTimer(room, PHASES.POINT)
}

/* ───────────────────────── Settlements / Resolutions ───────────────────────── */

async function settlePass (st, outcome) {
  const lines = []

  for (const [u, amt] of Object.entries(st.pass)) {
    const name = await getDisplayName(st, u)

    if (outcome === 'win') {
      await creditGameWin(u, amt * 2)
      addRoundResult(st, u, amt)
      lines.push(winLine(name, amt))
    } else if (outcome === 'push') {
      await creditGameWin(u, amt)
      lines.push(pushLine(name, amt))
    } else {
      addRoundResult(st, u, -amt)
      lines.push(loseLine(name, amt))
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
      lines.push(winLine(name, amt))
    } else if (outcome === 'push') {
      await creditGameWin(u, amt)
      lines.push(pushLine(name, amt))
    } else {
      addRoundResult(st, u, -amt)
      lines.push(loseLine(name, amt))
    }
  }

  st.dontPass = Object.create(null)
  return lines
}

async function settleLineOdds (st, total, winner) {
  const lines = []

  const lineBooks = [
    { book: st.passOdds, kind: 'pass', label: 'PASS ODDS' },
    { book: st.dontPassOdds, kind: 'dont', label: "DON'T PASS ODDS" }
  ]

  for (const { book, kind, label } of lineBooks) {
    for (const [u, amt] of Object.entries(book)) {
      const name = await getDisplayName(st, u)
      if (winner === 'push') {
        await creditGameWin(u, amt)
        lines.push(`${PUSH} ${name.padEnd(18)} ${label} push ${fmtMoney(amt)}`)
        continue
      }
      const won = (kind === 'pass' && winner === 'pass') || (kind === 'dont' && winner === 'dont')
      if (won) {
        const profit = oddsProfit(kind, total, amt)
        await creditGameWin(u, roundMoney(amt + profit))
        addRoundResult(st, u, profit)
        lines.push(`${POS} ${name.padEnd(18)} ${label} +${fmtMoney(profit)}`)
      } else {
        addRoundResult(st, u, -amt)
        lines.push(`${NEG} ${name.padEnd(18)} ${label} -${fmtMoney(amt)}`)
      }
    }
  }

  st.passOdds = Object.create(null)
  st.dontPassOdds = Object.create(null)
  return lines
}

async function resolveComeWaiting (total, st) {
  const lines = []
  const nextComeWaiting = []
  const nextDontComeWaiting = []

  for (const bet of st.comeWaiting) {
    const name = await getDisplayName(st, bet.user)

    if (total === 7 || total === 11) {
      await creditGameWin(bet.user, bet.amt * 2)
      addRoundResult(st, bet.user, bet.amt)
      lines.push(`${POS} ${name.padEnd(18)} COME +${fmtMoney(bet.amt)}`)
    } else if ([2, 3, 12].includes(total)) {
      if (total === 12) {
        await creditGameWin(bet.user, bet.amt)
        lines.push(`${PUSH} ${name.padEnd(18)} COME push ${fmtMoney(bet.amt)}`)
      } else {
        addRoundResult(st, bet.user, -bet.amt)
        lines.push(`${NEG} ${name.padEnd(18)} COME -${fmtMoney(bet.amt)}`)
      }
    } else {
      st.comePoint.push({ ...bet, num: total, odds: 0 })
      lines.push(`${name.padEnd(18)} COME -> ${total} (${fmtMoney(bet.amt)})`)
    }
  }

  for (const bet of st.dontComeWaiting) {
    const name = await getDisplayName(st, bet.user)

    if ([2, 3].includes(total)) {
      await creditGameWin(bet.user, bet.amt * 2)
      addRoundResult(st, bet.user, bet.amt)
      lines.push(`${POS} ${name.padEnd(18)} DONT-COME +${fmtMoney(bet.amt)}`)
    } else if (total === 12) {
      await creditGameWin(bet.user, bet.amt)
      lines.push(`${PUSH} ${name.padEnd(18)} DONT-COME push ${fmtMoney(bet.amt)}`)
    } else if (total === 7 || total === 11) {
      addRoundResult(st, bet.user, -bet.amt)
      lines.push(`${NEG} ${name.padEnd(18)} DONT-COME -${fmtMoney(bet.amt)}`)
    } else {
      st.dontComePoint.push({ ...bet, num: total, odds: 0 })
      lines.push(`${name.padEnd(18)} DONT-COME vs ${total} (${fmtMoney(bet.amt)})`)
    }
  }

  st.comeWaiting = nextComeWaiting
  st.dontComeWaiting = nextDontComeWaiting
  return lines
}

async function resolveComePoints (total, st, { onComeOut = false } = {}) {
  const lines = []
  const nextComePoints = []
  const nextDontComePoints = []

  for (const bet of st.comePoint) {
    const name = await getDisplayName(st, bet.user)
    const oddsWorking = !onComeOut || getWorkingFlag(st, bet.user)

    if (total === bet.num) {
      await creditGameWin(bet.user, bet.amt * 2)
      addRoundResult(st, bet.user, bet.amt)
      lines.push(`${POS} ${name.padEnd(18)} COME(${bet.num}) +${fmtMoney(bet.amt)}`)
      if (bet.odds > 0) {
        if (oddsWorking) {
          const profit = oddsProfit('come', bet.num, bet.odds)
          await creditGameWin(bet.user, roundMoney(bet.odds + profit))
          addRoundResult(st, bet.user, profit)
          lines.push(`${POS} ${name.padEnd(18)} COME ODDS(${bet.num}) +${fmtMoney(profit)}`)
        } else {
          await creditGameWin(bet.user, bet.odds)
          lines.push(`${PUSH} ${name.padEnd(18)} COME ODDS(${bet.num}) off ${fmtMoney(bet.odds)}`)
        }
      }
    } else if (total === 7) {
      addRoundResult(st, bet.user, -bet.amt)
      lines.push(`${NEG} ${name.padEnd(18)} COME(${bet.num}) -${fmtMoney(bet.amt)}`)
      if (bet.odds > 0) {
        if (oddsWorking) {
          addRoundResult(st, bet.user, -bet.odds)
          lines.push(`${NEG} ${name.padEnd(18)} COME ODDS(${bet.num}) -${fmtMoney(bet.odds)}`)
        } else {
          await creditGameWin(bet.user, bet.odds)
          lines.push(`${PUSH} ${name.padEnd(18)} COME ODDS(${bet.num}) off ${fmtMoney(bet.odds)}`)
        }
      }
    } else {
      nextComePoints.push(bet)
    }
  }

  for (const bet of st.dontComePoint) {
    const name = await getDisplayName(st, bet.user)
    const oddsWorking = !onComeOut || getWorkingFlag(st, bet.user)

    if (total === 7) {
      await creditGameWin(bet.user, bet.amt * 2)
      addRoundResult(st, bet.user, bet.amt)
      lines.push(`${POS} ${name.padEnd(18)} DONT(${bet.num}) +${fmtMoney(bet.amt)}`)
      if (bet.odds > 0) {
        if (oddsWorking) {
          const profit = oddsProfit('dontcome', bet.num, bet.odds)
          await creditGameWin(bet.user, roundMoney(bet.odds + profit))
          addRoundResult(st, bet.user, profit)
          lines.push(`${POS} ${name.padEnd(18)} DONT ODDS(${bet.num}) +${fmtMoney(profit)}`)
        } else {
          await creditGameWin(bet.user, bet.odds)
          lines.push(`${PUSH} ${name.padEnd(18)} DONT ODDS(${bet.num}) off ${fmtMoney(bet.odds)}`)
        }
      }
    } else if (total === bet.num) {
      addRoundResult(st, bet.user, -bet.amt)
      lines.push(`${NEG} ${name.padEnd(18)} DONT(${bet.num}) -${fmtMoney(bet.amt)}`)
      if (bet.odds > 0) {
        if (oddsWorking) {
          addRoundResult(st, bet.user, -bet.odds)
          lines.push(`${NEG} ${name.padEnd(18)} DONT ODDS(${bet.num}) -${fmtMoney(bet.odds)}`)
        } else {
          await creditGameWin(bet.user, bet.odds)
          lines.push(`${PUSH} ${name.padEnd(18)} DONT ODDS(${bet.num}) off ${fmtMoney(bet.odds)}`)
        }
      }
    } else {
      nextDontComePoints.push(bet)
    }
  }

  st.comePoint = nextComePoints
  st.dontComePoint = nextDontComePoints
  return lines
}

async function resolvePlace (total, st, { onComeOut = false } = {}) {
  const lines = []

  // Seven-out: all place bets lose
  if (total === 7) {
    for (const n of PLACES) {
      const kept = {}
      for (const [u, amt] of Object.entries(st.place[n] || {})) {
        if (onComeOut && !getWorkingFlag(st, u)) {
          kept[u] = amt
          continue
        }
        const name = await getDisplayName(st, u)
        addRoundResult(st, u, -amt)
        lines.push(`${NEG} ${name.padEnd(18)} PLACE(${n}) -${fmtMoney(amt)}`)
      }
      st.place[n] = kept
    }
    return lines
  }

  // Place number hit: pay profit only (your bankroll model)
  if (PLACES.includes(total)) {
    const book = st.place[total] || {}

    for (const [u, amt] of Object.entries(book)) {
      const name = await getDisplayName(st, u)
      if (onComeOut && !getWorkingFlag(st, u)) continue

      const profit = placeProfit(total, amt)

      if (profit > 0) {
        await creditGameWin(u, profit)
        addRoundResult(st, u, profit)
        lines.push(`${POS} ${name.padEnd(18)} PLACE(${total}) +${fmtMoney(profit)}`)
      }
    }
  }

  return lines
}

async function resolveField (total, st) {
  const lines = []
  const entries = Object.entries(st.field || {})

  for (const [u, amt] of entries) {
    const name = await getDisplayName(st, u)
    if (FIELD_WINNERS.has(total)) {
      const profit = fieldProfit(total, amt)
      await creditGameWin(u, profit)
      addRoundResult(st, u, profit)
      const multiplier = total === 2 ? '2:1' : total === 12 ? '3:1' : '1:1'
      lines.push(`${POS} ${name.padEnd(18)} FIELD(${total}) +${fmtMoney(profit)} (${multiplier})`)
      // bet stays on table after a win
    } else {
      addRoundResult(st, u, -amt)
      lines.push(`${NEG} ${name.padEnd(18)} FIELD -${fmtMoney(amt)}`)
      delete st.field[u]
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
  // Hand totals board (🟢 up / 🔴 down / ⚪ even)
  const rrKeys = Object.keys(st.roundResults || {})
  if (rrKeys.length) {
    const lines = []

    // Optional: sort biggest winners first
    rrKeys.sort((a, b) => Number(st.roundResults[b] || 0) - Number(st.roundResults[a] || 0))

    for (const u of rrKeys) {
      const name = await getDisplayName(st, u)
      const amt = Number(st.roundResults[u] || 0)

      const chip = amt > 0 ? '🟢' : (amt < 0 ? '🔴' : '⚪')
      const sign = amt > 0 ? '+' : (amt < 0 ? '-' : '±')

      lines.push(`${chip} ${name.padEnd(18)} ${sign}${fmtMoney(Math.abs(amt))}`)
    }

    await sayCode(room, 'HAND TOTALS', lines.join('\n'))
  }

  // Record check
  if (st.rollCount > st.record.rolls) {
    st.record = { rolls: st.rollCount, shooter: shooter || null }
    await say(room, `🏆 New record: ${st.record.rolls} roll(s) by ${shooter ? mention(shooter) : '—'}`)
    if (shooter) await persistRecord(room, st.record.rolls, shooter)
  }

  // Accumulate session totals before resetting round results
  st.sessionHandCount = (st.sessionHandCount || 0) + 1
  for (const [u, amt] of Object.entries(st.roundResults || {})) {
    if (Number.isFinite(amt) && amt !== 0) {
      st.sessionTotals[u] = (st.sessionTotals[u] || 0) + amt
    }
  }
  if (st.sessionHandCount >= 2) {
    const sessKeys = Object.keys(st.sessionTotals || {})
    if (sessKeys.length) {
      sessKeys.sort((a, b) => Number(st.sessionTotals[b] || 0) - Number(st.sessionTotals[a] || 0))
      const sessLines = []
      for (const u of sessKeys) {
        const name = await getDisplayName(st, u)
        const amt = Number(st.sessionTotals[u] || 0)
        const chip = amt > 0 ? '🟢' : (amt < 0 ? '🔴' : '⚪')
        const sign = amt > 0 ? '+' : (amt < 0 ? '-' : '±')
        sessLines.push(`${chip} ${name.padEnd(18)} ${sign}${fmtMoney(Math.abs(amt))}`)
      }
      await sayCode(room, `SESSION TOTALS (hand ${st.sessionHandCount})`, sessLines.join('\n'))
    }
  }

  // Reset hand state
  st.point = null
  st.rollCount = 0
  st.pointsMade = 0
  st.hotShooterBonusTier = 0
  st.roundResults = Object.create(null)
  resetAllBets(st)

  // Stop timers
  clearTimers(st)

  if (!st.tableUsers.length) {
    st.phase = PHASES.IDLE
    await phaseLine(room, 'PHASE: IDLE', [
      'Table empty.',
      `Type ${bold('/craps')} to open a new join window.`
    ])
    return
  }

  if (st.pendingNextShooter) {
    const idx = st.tableUsers.indexOf(st.pendingNextShooter)
    st.shooterIdx = idx !== -1 ? idx : 0
  } else {
    nextShooter(st)
  }

  if (st.rules.autoRestart) {
    await phaseLine(room, 'NEXT HAND', [
      `Shooter rotates to: ${shooterWho(st)}`,
      `Type ${bold('/craps leave')} anytime between hands if you want to step away.`
    ])
    await openComeOutBetting(room, '♻️ New hand starting with the same table.')
    return
  }

  st.phase = PHASES.IDLE
  await phaseLine(room, 'PHASE: IDLE', [
    `Seated players stay at the table. Next shooter: ${shooterWho(st)}`,
    `Type ${bold('/craps start')} to begin the next hand or ${bold('/craps leave')} to stand up.`
  ])
}

/* ───────────────────────── Table mgmt / Bets view ───────────────────────── */

async function joinTable (user, room) {
  const st = S(room)
  if (st.tableUsers.includes(user)) {
    await say(room, `${mention(user)} you're already at the table.`)
    return
  }

  st.tableUsers.push(user)

  // If this user was next in line last hand, make them the shooter now.
  if (st.pendingNextShooter && st.pendingNextShooter === user) {
    st.shooterIdx = st.tableUsers.indexOf(user)
  }

  let hint = ''
  if (st.phase === PHASES.BETTING) {
    hint = ' — betting is open, place your **/pass** or **/dontpass** now!'
  } else if (st.phase === PHASES.COME_OUT) {
    hint = ' — come-out in progress, you\'re in for the next betting window.'
  } else if (st.phase === PHASES.POINT) {
    hint = ` — point is **${st.point}**, you can **/come**, **/place**, or **/field** right now.`
  }

  await say(room, `🪑 ${mention(user)} joined the table.${hint}`)
}

async function userBetsView (room, uuid) {
  const st = S(room)
  const name = await getDisplayName(st, uuid)
  const lines = []

  if (st.pass[uuid]) lines.push(`PASS            ${fmtMoney(st.pass[uuid])}`)
  if (st.dontPass[uuid]) lines.push(`DON'T PASS      ${fmtMoney(st.dontPass[uuid])}`)
  if (st.passOdds[uuid]) lines.push(`PASS ODDS       ${fmtMoney(st.passOdds[uuid])}`)
  if (st.dontPassOdds[uuid]) lines.push(`DONT ODDS       ${fmtMoney(st.dontPassOdds[uuid])}`)
  for (const bet of st.comeWaiting.filter(bet => bet.user === uuid)) lines.push(`COME(wait)      ${fmtMoney(bet.amt)}`)
  for (const bet of st.dontComeWaiting.filter(bet => bet.user === uuid)) lines.push(`DONT-COME(wait) ${fmtMoney(bet.amt)}`)
  for (const bet of st.comePoint.filter(bet => bet.user === uuid)) {
    lines.push(`COME(${bet.num})       ${fmtMoney(bet.amt)}${bet.odds ? ` + odds ${fmtMoney(bet.odds)}` : ''}`)
  }
  for (const bet of st.dontComePoint.filter(bet => bet.user === uuid)) {
    lines.push(`DONT(${bet.num})       ${fmtMoney(bet.amt)}${bet.odds ? ` + odds ${fmtMoney(bet.odds)}` : ''}`)
  }

  const places = []
  for (const n of PLACES) {
    const amt = st.place[n]?.[uuid]
    if (amt) places.push(`${n}:${fmtMoney(amt)}`)
  }
  if (places.length) lines.push(`PLACE           ${places.join('  ')}`)
  if (st.field[uuid]) lines.push(`FIELD           ${fmtMoney(st.field[uuid])}`)

  if (!lines.length) return `No active bets for ${mention(uuid)}. Come-out working is **${getWorkingFlag(st, uuid) ? 'ON' : 'OFF'}**.`
  lines.push(`WORK COME-OUT   ${getWorkingFlag(st, uuid) ? 'ON' : 'OFF'}`)
  return `\`\`\`\nYOUR BETS: ${name}\n-----------------------\n${lines.join('\n')}\n\`\`\``
}

async function tableView (room) {
  const st = S(room)

  if (st.phase === PHASES.IDLE) return 'No game running.'

  const rows = []
  const phaseLabel = st.phase === PHASES.BETTING ? 'BETTING'
    : st.phase === PHASES.COME_OUT ? 'COME-OUT'
    : st.phase === PHASES.POINT ? `POINT ${st.point}`
    : st.phase.toUpperCase()

  rows.push(`Phase: ${phaseLabel}  •  Shooter: ${shooterUuid(st) ? (st.nameCache[shooterUuid(st)] || shooterUuid(st)) : '—'}`)
  rows.push('─────────────────────────────')

  let anyBets = false

  for (const [u, amt] of Object.entries(st.pass)) {
    const name = await getDisplayName(st, u)
    const odds = st.passOdds[u] ? ` + odds ${fmtMoney(st.passOdds[u])}` : ''
    rows.push(`${name.padEnd(16)} PASS        ${fmtMoney(amt)}${odds}`)
    anyBets = true
  }
  for (const [u, amt] of Object.entries(st.dontPass)) {
    const name = await getDisplayName(st, u)
    const odds = st.dontPassOdds[u] ? ` + odds ${fmtMoney(st.dontPassOdds[u])}` : ''
    rows.push(`${name.padEnd(16)} DON'T PASS  ${fmtMoney(amt)}${odds}`)
    anyBets = true
  }
  for (const bet of st.comeWaiting) {
    const name = await getDisplayName(st, bet.user)
    rows.push(`${name.padEnd(16)} COME(wait)  ${fmtMoney(bet.amt)}`)
    anyBets = true
  }
  for (const bet of st.dontComeWaiting) {
    const name = await getDisplayName(st, bet.user)
    rows.push(`${name.padEnd(16)} DC(wait)    ${fmtMoney(bet.amt)}`)
    anyBets = true
  }
  for (const bet of st.comePoint) {
    const name = await getDisplayName(st, bet.user)
    const odds = bet.odds ? ` + odds ${fmtMoney(bet.odds)}` : ''
    rows.push(`${name.padEnd(16)} COME(${bet.num})    ${fmtMoney(bet.amt)}${odds}`)
    anyBets = true
  }
  for (const bet of st.dontComePoint) {
    const name = await getDisplayName(st, bet.user)
    const odds = bet.odds ? ` + odds ${fmtMoney(bet.odds)}` : ''
    rows.push(`${name.padEnd(16)} DONT(${bet.num})    ${fmtMoney(bet.amt)}${odds}`)
    anyBets = true
  }
  for (const n of PLACES) {
    for (const [u, amt] of Object.entries(st.place[n] || {})) {
      const name = await getDisplayName(st, u)
      rows.push(`${name.padEnd(16)} PLACE ${n}     ${fmtMoney(amt)}`)
      anyBets = true
    }
  }
  for (const [u, amt] of Object.entries(st.field || {})) {
    const name = await getDisplayName(st, u)
    rows.push(`${name.padEnd(16)} FIELD       ${fmtMoney(amt)}`)
    anyBets = true
  }

  if (!anyBets) rows.push('(no bets on the table)')

  return `\`\`\`\nTABLE BETS\n${rows.join('\n')}\n\`\`\``
}

function payoutsView () {
  return `\`\`\`
CRAPS BET GUIDE
══════════════════════════════════════════

LINE BETS  — place during the betting window before come-out
─────────────────────────────────────────
PASS        Bet the shooter makes their point.
            Come-out: win on 7 or 11, lose on 2/3/12.
            Point phase: win if point hits again before a 7.
            Pays 1:1.  Command: /pass <amt>

DON'T PASS  Opposite of Pass. The "dark side."
            Come-out: win on 2/3, push on 12, lose on 7/11.
            Point phase: win if 7 comes before the point.
            Pays 1:1.  Command: /dontpass <amt>

──────────────────────────────────────────
ODDS  — add behind a live Pass/Don't Pass once a point is set
        True odds bets — zero house edge
─────────────────────────────────────────
PASS ODDS   Backs your Pass. Pays true odds on the point.
            4 or 10 → 2:1   5 or 9 → 3:2   6 or 8 → 6:5
            Command: /odds pass <amt>

DON'T ODDS  Backs your Don't Pass. You lay true odds.
            4 or 10 → 1:2   5 or 9 → 2:3   6 or 8 → 5:6
            Command: /odds dontpass <amt>

──────────────────────────────────────────
COME / DON'T COME  — point phase only; works like a mini Pass/DP
─────────────────────────────────────────
COME        Like Pass but starts fresh from the current roll.
            Win on 7/11, lose on 2/3 (push 12), then tracks
            its own point number.  Pays 1:1.
            Command: /come <amt>

DON'T COME  Like Don't Pass mid-hand.
            Win on 2/3, push on 12, lose on 7/11, then wins
            if 7 appears before its point.  Pays 1:1.
            Command: /dontcome <amt>

COME ODDS   Add odds behind a live Come point.
            Command: /odds come <point-num> <amt>

DONT ODDS   Add lay odds behind a Don't Come point.
            Command: /odds dontcome <point-num> <amt>

──────────────────────────────────────────
PLACE BETS  — point phase; bet a number hits before 7
─────────────────────────────────────────
Numbers: 4, 5, 6, 8, 9, 10
Your stake stays on the table; only profit is paid each hit.
  4 or 10 → 9:5   5 or 9 → 7:5   6 or 8 → 7:6
Commands:
  /place <num> <amt>        place the bet
  /press <num> <amt>        add more to an existing bet
  /take <num> <amt>         pull back part of a bet
  /removeplace <num>        pull the whole bet down

──────────────────────────────────────────
FIELD BET  — any active phase; resolves on every single roll
─────────────────────────────────────────
Stays on the table after a win; removed automatically on a loss.
  WINS:  3, 4, 9, 10, 11 → 1:1
         2 → 2:1 (double)
         12 → 3:1 (triple)
  LOSES: 5, 6, 7, 8
Commands: /field <amt>   /removefield

──────────────────────────────────────────
WORKING FLAG  — controls come-out behavior
─────────────────────────────────────────
Default: OFF
Place bets and odds are asleep on come-out rolls (so a
lucky 7 doesn't wipe them out). Come bets still resolve normally.
Toggle: /working on   or   /working off
\`\`\``
}

function rulesView (st) {
  return `\`\`\`
CRAPS ROOM RULES
-----------------------
autoRestart       ${st.rules.autoRestart ? 'on' : 'off'}
latePlaceBets     ${st.rules.latePlaceBets ? 'on' : 'off'}
strictPlaceUnits  ${st.rules.strictPlaceUnits ? 'on' : 'off'}
\`\`\``
}

/* ───────────────────────── Router ───────────────────────── */

async function routeCrapsMessageUnlocked (payload) {
  const raw = (payload.message || '').trim()
  const room = payload.room || ROOM_DEFAULT
  const sender = payload.sender
  const uuid = sender?.uuid || sender?.uid || sender?.id || sender
  const low = raw.toLowerCase()

  // Top-level /bets and /mybets — show caller's own bets
  if (/^\/(bets|mybets)\b/i.test(low)) {
    await postMessage({ room, message: await userBetsView(room, uuid) })
    return true
  }
  // Top-level /table — show all bets on the table
  if (/^\/table\b/i.test(low)) {
    await postMessage({ room, message: await tableView(room) })
    return true
  }
  if (/^\/payouts\b/i.test(low)) {
    await postMessage({ room, message: payoutsView() })
    return true
  }

  // Allow "/join craps|cr" anytime the game is active
  if (/^\/join\s+(craps|cr)\b/i.test(low)) {
    if (S(room).phase === PHASES.IDLE) { await postMessage({ room, message: 'No game running. Type **/craps** to start one.' }); return true }
    await joinTable(uuid, room)
    return true
  }

  // Top-level bet/roll aliases
  const alias = low.match(/^\/(pass|dontpass|come|dontcome|place|removeplace|field|removefield|roll|odds|layodds|working|press|take)\b/)
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
        await adjustPlaceBet('remove', Number(num), uuid, null, room)
        return true
      }
      case 'press': {
        const [num, amt] = parts
        if (!num || !amt) { await postMessage({ room, message: 'Usage: /press <4|5|6|8|9|10> <amount>' }); return true }
        await adjustPlaceBet('press', Number(num), uuid, amt, room)
        return true
      }
      case 'take': {
        const [num, amt] = parts
        if (!num || !amt) { await postMessage({ room, message: 'Usage: /take <4|5|6|8|9|10> <amount>' }); return true }
        await adjustPlaceBet('take', Number(num), uuid, amt, room)
        return true
      }
      case 'odds':
      case 'layodds': {
        const [target, maybeNum, maybeAmt] = parts
        if (['pass'].includes(String(target).toLowerCase())) {
          await placeOddsBet('pass', null, maybeNum, uuid, room)
          return true
        }
        if (['dontpass', 'dont', 'dp'].includes(String(target).toLowerCase())) {
          await placeOddsBet('dont', null, maybeNum, uuid, room)
          return true
        }
        if (['come', 'dontcome'].includes(String(target).toLowerCase())) {
          await placeOddsBet(String(target).toLowerCase(), maybeNum, maybeAmt, uuid, room)
          return true
        }
        await postMessage({ room, message: 'Usage: /odds pass <amt> | /odds dontpass <amt> | /odds come <num> <amt> | /odds dontcome <num> <amt>' })
        return true
      }
      case 'working': {
        const flag = String(parts[0] || '').toLowerCase()
        if (!['on', 'off'].includes(flag)) { await postMessage({ room, message: 'Usage: /working on|off' }); return true }
        await setWorkingFlag(uuid, flag === 'on', room)
        return true
      }
      case 'field': {
        if (!parts[0]) { await postMessage({ room, message: 'Usage: /field <amount>' }); return true }
        await placeFieldBet(uuid, parts[0], room)
        return true
      }
      case 'removefield': await removeFieldBet(uuid, room); return true
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
        await postMessage({ room, message: 'Craps is running — type **/craps join** to sit down anytime, or **/bets** to check your bets.' })
      }
      return true
    }

    case 'start':
      await openJoinWindow(room, uuid)
      return true

    case 'join':
      if (S(room).phase === PHASES.IDLE) { await postMessage({ room, message: 'No game running. Type **/craps** to start one.' }); return true }
      await joinTable(uuid, room)
      return true

    case 'bets':
    case 'mybets':
      await postMessage({ room, message: await userBetsView(room, uuid) })
      return true

    case 'table':
      await postMessage({ room, message: await tableView(room) })
      return true

    case 'leave':
      await removeUserFromTable(uuid, room)
      return true

    case 'payouts':
    case 'guide':
    case 'betguide':
      await postMessage({ room, message: payoutsView() })
      return true

    case 'rules':
      await postMessage({ room, message: rulesView(S(room)) })
      return true

    case 'rule': {
      const name = String(parts.shift() || '').toLowerCase()
      const value = String(parts.shift() || '').toLowerCase()
      const st = S(room)
      const key = {
        autorestart: 'autoRestart',
        lateplacebets: 'latePlaceBets',
        strictplaceunits: 'strictPlaceUnits'
      }[name]
      if (!key || !['on', 'off'].includes(value)) {
        await postMessage({ room, message: 'Usage: /craps rule <autoRestart|latePlaceBets|strictPlaceUnits> <on|off>' })
        return true
      }
      if (st.phase === PHASES.COME_OUT || st.phase === PHASES.POINT) {
        await postMessage({ room, message: 'Change room rules between rolls, not during a live hand.' })
        return true
      }
      st.rules[key] = value === 'on'
      await postMessage({ room, message: `⚙️ Set **${key}** to **${value}**.\n${rulesView(st)}` })
      return true
    }

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
- Table stays seated between hands by default.
- Point made: same shooter, new come-out betting window.
- Seven-out: shooter rotates and a new hand can auto-start.

COMMANDS
/craps             start if idle (starter auto-seated)
/craps start       reset & open join
/craps join        sit at the table anytime (mid-game ok)
/craps leave       stand up and refund your live bets
/craps rules       show room toggles
/craps rule ...    update room toggles
/pass <amt>        PASS (line betting)
/dontpass <amt>    DON'T PASS (line betting)
/roll              shooter rolls (timed)
/come <amt>        add a COME bet
/dontcome <amt>    add a DON'T COME bet
/place <num> <amt> place number bet
/press <num> <amt> add to a place bet
/take <num> <amt>  reduce a place bet
/removeplace <num> remove a place bet
/odds ...          add odds to line / come bets
/field <amt>       FIELD bet (wins 2,3,4,9,10,11,12)
/removefield       remove your field bet
/working on|off    place+odds working on come-out
/bets              show your own bets
/mybets            same as /bets
/table             show all bets on the table (everyone)
/payouts           full bet guide (what each bet does + payouts)
/craps guide       same as /payouts

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

export async function routeCrapsMessage (payload) {
  const room = payload?.room || ROOM_DEFAULT
  return withCrapsRoomLock(room, async () => routeCrapsMessageUnlocked(payload))
}

export const crapsTestables = {
  freshState,
  placeProfit,
  oddsProfit,
  roundMoney,
  validatePlaceAmount,
  withCrapsRoomLock,
  resetForTests () {
    for (const st of TABLES.values()) clearTimers(st)
    TABLES.clear()
    ROOM_LOCKS.clear()
  }
}
