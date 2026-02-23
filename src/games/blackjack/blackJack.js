// src/games/blackjack/blackJack.js
import { getUserWallet, debitGameBet, creditGameWin } from '../../database/dbwalletmanager.js'
import { postMessage } from '../../libs/cometchat.js'
import { getUserNickname } from '../../handlers/message.js' // ⚠️ NOTE: circular-dep risk; ideally move to a utils module

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const JOIN_WINDOW_MS = Number(process.env.BJ_JOIN_WINDOW_MS ?? 30_000)
const BETTING_WINDOW_MS = Number(process.env.BJ_BETTING_WINDOW_MS ?? 30_000)
const EARLY_BET_CLOSE = true

const DECKS = Number(process.env.BJ_DECKS ?? 6)
const HIT_SOFT_17 = false // dealer stands on soft 17

const RESHUFFLE_FRAC = Number(process.env.BJ_RESHUFFLE_FRAC ?? 0.25)
const RESHUFFLE_MIN = Number(process.env.BJ_RESHUFFLE_MIN ?? 52)

// House rules
const ALLOW_SPLIT = true
const MAX_SPLITS = Number(process.env.BJ_MAX_SPLITS ?? 1) // 1 split => max 2 hands total
const DEAL_ONE_TO_EACH_ON_SPLIT = true // standard feel

// UX pacing (base)
const SUSPENSE_MS = Number(process.env.BJ_SUSPENSE_MS ?? 700)
const DRAW_PAUSE_MS = Number(process.env.BJ_DRAW_PAUSE_MS ?? 650)

// Cinematic beats (optional overrides)
const BEAT_MIN_MS = Number(process.env.BJ_BEAT_MIN_MS ?? 450)
const BEAT_MAX_MS = Number(process.env.BJ_BEAT_MAX_MS ?? 900)
const BIG_BEAT_MIN_MS = Number(process.env.BJ_BIG_BEAT_MIN_MS ?? 850)
const BIG_BEAT_MAX_MS = Number(process.env.BJ_BIG_BEAT_MAX_MS ?? 1300)

// Turn timers (actual)
const TURN_NUDGE_MS = Number(process.env.BJ_TURN_NUDGE_MS ?? 15_000)
// Actual: 35s, Display: 30s
const TURN_AUTOSTAND_MS = Number(process.env.BJ_TURN_AUTOSTAND_MS ?? 35_000)
const TURN_AUTOSTAND_DISPLAY_S = Number(process.env.BJ_TURN_AUTOSTAND_DISPLAY_S ?? 30)

// Formatting
const NAME_PAD = Number(process.env.BJ_NAME_PAD ?? 14)

// ─────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────
/* @type {Map<string, TableState>} */
const TABLES = new Map()

/*
 * @typedef {Object} HandState
 * @property {Array<{r:string,s:string}>} cards
 * @property {number} bet
 * @property {boolean} done
 * @property {boolean} busted
 * @property {boolean} surrendered
 * @property {boolean} doubled
 * @property {number} actionCount
 * @property {boolean} isSplitHand
 */

/*
 * @typedef {Object} PlayerState
 * @property {string} uuid
 * @property {string} nickname
 * @property {boolean} seated
 * @property {number} bet                 // betting-phase stake (used to seed hands[0].bet)
 * @property {HandState[]} hands
 * @property {number} splitCount
 * @property {number} winStreak
 * @property {number} lossStreak
 * @property {number} bjStreak
 * @property {number} wins
 * @property {number} losses
 * @property {number} pushes
 * @property {number} blackjacks
 * @property {number} biggestProfit
 */

/*
 * @typedef {Object} TableTurn
 * @property {string} uuid
 * @property {number} hand
 */

/*
 * @typedef {Object} TableState
 * @property {string} id
 * @property {'idle'|'join'|'betting'|'dealing'|'acting'|'dealer'|'payout'} phase
 * @property {number} joinDeadline
 * @property {number} betDeadline
 * @property {NodeJS.Timeout|null} joinTimer
 * @property {NodeJS.Timeout|null} betTimer
 * @property {Map<string, PlayerState>} players
 * @property {string[]} order
 * @property {string[]} roundPlayers              // uuids participating in current round (join/betting)
 * @property {TableTurn[]} handOrder              // turn order for acting/payout
 * @property {Array<{r:string,s:string}>} deck
 * @property {Array<{r:string,s:string}>} dealerHand
 * @property {number} turnIndex
 * @property {NodeJS.Timeout|null} turnNudgeTimer
 * @property {NodeJS.Timeout|null} turnExpireTimer
 * @property {string|null} turnFor
 * @property {number} handId
 * @property {number} dealtForHandId
 * @property {boolean} shuffleAnnouncedThisHand
 */

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(res => setTimeout(res, ms))

function randInt (min, max) {
  const a = Math.max(0, Number(min) || 0)
  const b = Math.max(a, Number(max) || 0)
  return Math.floor(a + Math.random() * (b - a + 1))
}

async function beat (min = BEAT_MIN_MS, max = BEAT_MAX_MS) {
  const ms = randInt(min, max)
  if (ms > 0) await sleep(ms)
}

async function bigBeat () {
  await beat(BIG_BEAT_MIN_MS, BIG_BEAT_MAX_MS)
}

function keyOf (ctx) { return String(ctx?.tableId || ctx?.room || 'global') }

function getTable (ctx) {
  const k = keyOf(ctx)
  if (!TABLES.has(k)) {
    TABLES.set(k, {
      id: k,
      phase: 'idle',
      joinDeadline: 0,
      betDeadline: 0,
      joinTimer: null,
      betTimer: null,
      players: new Map(),
      order: [],
      roundPlayers: [],
      handOrder: [],
      deck: [],
      dealerHand: [],
      turnIndex: 0,
      turnNudgeTimer: null,
      turnExpireTimer: null,
      turnFor: null,
      handId: 0,
      dealtForHandId: 0,
      shuffleAnnouncedThisHand: false
    })
  }
  return TABLES.get(k)
}

function clearTimer (t) { if (t) clearTimeout(t) }
function clearTurnTimers (st) {
  clearTimer(st.turnNudgeTimer); st.turnNudgeTimer = null
  clearTimer(st.turnExpireTimer); st.turnExpireTimer = null
  st.turnFor = null
}
function clearAllTimers (st) {
  clearTimer(st.joinTimer); st.joinTimer = null
  clearTimer(st.betTimer); st.betTimer = null
  clearTurnTimers(st)
}

// Wallet helpers: tolerate sync OR async implementations.
async function maybeAwait (v) { return (v && typeof v.then === 'function') ? await v : v }
async function walletGet (uuid) { return await maybeAwait(getUserWallet(uuid)) }
async function walletBet (uuid, amt) { return await maybeAwait(debitGameBet(uuid, amt)) }
async function walletPayout (uuid, amt, nickname = null) { return await maybeAwait(creditGameWin(uuid, amt, nickname)) }

// Mention helper: ALWAYS use the shared getUserNickname() for in-chat pings.
async function mention (userId) {
  return await maybeAwait(getUserNickname(userId))
}

// Whole-dollar money formatting
function fmtMoney (n) {
  const v = Math.round(Number(n) || 0)
  return `$${v.toLocaleString()}`
}

function fmtCard (c) { return `${c.r}${c.s}` }

function pad (s, n) {
  const t = String(s ?? '')
  return t.length >= n ? t.slice(0, n) : t + ' '.repeat(n - t.length)
}
function padNoTrunc (s, n) {
  const t = String(s ?? '')
  // NEVER truncate (important for mention tokens like <@uid:...>)
  return t.length >= n ? t : t + ' '.repeat(n - t.length)
}

// Strip CometChat mention tokens and leading @ for code-block display.
// Examples:
//   "<@uid:210141ad>" -> ""
//   "<@uid:210141ad> Rsmitty" -> "Rsmitty"
//   "@Rsmitty" -> "Rsmitty"
function sanitizeNickname (raw) {
  let s = String(raw ?? '').trim()

  // Remove ALL mention tokens like <@uid:...>
  s = s.replace(/<@uid:[^>]+>/g, '').trim()

  // If it's only leftovers like "<@uid:...something" from truncation, kill it
  if (s.includes('<@uid:')) s = s.replace(/<@uid:.*/g, '').trim()

  // Strip leading @
  s = s.replace(/^@+/, '').trim()

  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()

  return s
}
function isMentionToken (s) {
  const t = String(s ?? '').trim()
  return /^<@uid:[^>]+>$/.test(t) || t.includes('<@uid:')
}

function cleanNicknameForBlock (s) {
  return String(s ?? '').trim().replace(/^@+/, '').trim()
}

// IMPORTANT COMETCHAT RULE:
// code blocks must use nickname-only (never mention tokens)
// If nickname is unknown, fall back to a mention token (kept intact by padNoTrunc).
function nicknameOf (st, id) {
  const p = st.players.get(id)
  const n = cleanNicknameForBlock(p?.nickname || '')
  if (n) return n
  return `<@uid:${id}>`
}

function nameInBlock (st, id) {
  return padNoTrunc(nicknameOf(st, id), NAME_PAD)
}

function formatHand (cards) {
  const { total, soft } = handValue(cards)
  return `${cards.map(fmtCard).join(' ')}  (${total}${soft ? ' soft' : ''})`
}

function newShoe (deckCount = DECKS) {
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
  const suits = ['♠', '♥', '♦', '♣']
  const cards = []
  for (let d = 0; d < deckCount; d++) {
    for (const r of ranks) for (const s of suits) cards.push({ r, s })
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp
  }
  return cards
}

function shoeSize (deckCount = DECKS) { return deckCount * 52 }

function shouldReshuffle (st) {
  const full = shoeSize(DECKS)
  const threshold = Math.max(RESHUFFLE_MIN, Math.floor(full * RESHUFFLE_FRAC))
  return !st.deck || st.deck.length < threshold
}

function handValue (cards) {
  let total = 0
  let acesAs11 = 0
  for (const c of cards) {
    if (c.r === 'A') { acesAs11++; total += 11 } else if (c.r === 'K' || c.r === 'Q' || c.r === 'J' || c.r === '10') total += 10
    else total += Number(c.r)
  }
  while (total > 21 && acesAs11 > 0) { total -= 10; acesAs11-- }
  return { total, soft: acesAs11 > 0 }
}

function isBlackjack (cards) {
  return cards.length === 2 && handValue(cards).total === 21
}

function draw (st) {
  if (!st.deck || st.deck.length === 0) st.deck = newShoe()
  return st.deck.pop()
}

function seatedPlayers (st) {
  return st.order.filter(id => st.players.get(id)?.seated)
}

function ensurePlayer (st, userUUID, nickname) {
  const incomingRaw = String(nickname ?? '').trim()
  const incoming = sanitizeNickname(incomingRaw)

  if (!st.players.has(userUUID)) {
    st.players.set(userUUID, {
      uuid: userUUID,
      // If incoming is a mention token / empty, start empty and we’ll fall back later
      nickname: (incoming && !isMentionToken(incomingRaw)) ? incoming : '',
      seated: false,
      bet: 0,
      hands: [],
      splitCount: 0,
      winStreak: 0,
      lossStreak: 0,
      bjStreak: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      blackjacks: 0,
      biggestProfit: 0
    })
    st.order.push(userUUID)
    return
  }

  // Update nickname ONLY if it looks like a real name (not a mention token)
  if (incoming && !isMentionToken(incomingRaw)) {
    st.players.get(userUUID).nickname = incoming
  }
}

function ensurePhase (st, expected) {
  if (st.phase !== expected) throw new Error(`Wrong phase: expected ${expected}, got ${st.phase}`)
}

function canSplit (p, h) {
  if (!ALLOW_SPLIT) return false
  if (!p || !h) return false
  if ((p.splitCount || 0) >= MAX_SPLITS) return false
  if (h.actionCount !== 0) return false
  if (h.cards.length !== 2) return false
  return h.cards[0]?.r === h.cards[1]?.r
}

function eligibleActions (p, h) {
  const actions = ['hit', 'stand']
  if (!p || !h) return actions

  const canDouble = (h.actionCount === 0 && h.cards.length === 2 && !h.doubled && !h.surrendered)
  const canSurrender = (h.actionCount === 0 && h.cards.length === 2 && !h.doubled && !h.surrendered)
  if (canDouble) actions.push('double')
  if (canSurrender) actions.push('surrender')
  if (canSplit(p, h)) actions.push('split')
  return actions
}

async function postSnapshot (ctx, lines) {
  await postMessage({ room: ctx.room, message: `\`\`\`\n${lines.join('\n')}\n\`\`\`` })
}

function currentTurn (st) { return st.handOrder?.[st.turnIndex] || null }
function getTurnHand (st, turn) {
  if (!turn) return { p: null, h: null }
  const p = st.players.get(turn.uuid) || null
  const h = p?.hands?.[turn.hand] || null
  return { p, h }
}

// Turn timers
function scheduleTurnTimers (ctx, uuid) {
  const st = getTable(ctx)
  clearTurnTimers(st)
  st.turnFor = uuid

  const displayAuto = TURN_AUTOSTAND_DISPLAY_S
  const displayNudge = Math.min(displayAuto, Math.max(0, Math.round(TURN_NUDGE_MS / 1000)))
  const displayRemainingAfterNudge = Math.max(0, displayAuto - displayNudge)

  if (TURN_NUDGE_MS > 0) {
    st.turnNudgeTimer = setTimeout(async () => {
      const st2 = getTable(ctx)
      const t = currentTurn(st2)
      if (st2.phase !== 'acting' || !t || t.uuid !== uuid) return
      const extra = displayRemainingAfterNudge > 0 ? ` ${displayRemainingAfterNudge}s until auto-stand.` : ''
      await postMessage({ room: ctx.room, message: `⏳ ${await mention(uuid)} still your turn.${extra}` })
    }, TURN_NUDGE_MS)
  }

  if (TURN_AUTOSTAND_MS > 0) {
    st.turnExpireTimer = setTimeout(async () => {
      const st2 = getTable(ctx)
      const t = currentTurn(st2)
      if (st2.phase !== 'acting' || !t || t.uuid !== uuid) return
      await postMessage({ room: ctx.room, message: `⌛ ${await mention(uuid)} time’s up — auto-stand.` })
      await handleStand(uuid, st2.players.get(uuid)?.nickname || '', ctx)
    }, TURN_AUTOSTAND_MS)
  }
}

async function promptTurn (ctx, uuid, { rePrompt = false, ping = true } = {}) {
  const st = getTable(ctx)
  if (SUSPENSE_MS && rePrompt) await sleep(Math.min(SUSPENSE_MS, 900))

  scheduleTurnTimers(ctx, uuid)

  const t = currentTurn(st)
  const { p, h } = getTurnHand(st, t)
  if (!p || !h) return

  const actions = eligibleActions(p, h)
  const handLabel = (p.hands.length > 1) ? ` (Hand ${t.hand + 1}/${p.hands.length})` : ''

  // CometChat-friendly layout to avoid weird wraps + keep density low
  const snap = []
  snap.push(`👉 TURN: ${nicknameOf(st, uuid)}${handLabel}`)
  snap.push(`Hand: ${formatHand(h.cards)}  |  Bet: ${fmtMoney(h.bet)}`)
  snap.push('')
  snap.push('*/bj hit* | */bj stand*')

  const row = []
  if (actions.includes('double')) row.push('*/bj double*')
  if (actions.includes('surrender')) row.push('*/bj surrender*')
  if (actions.includes('split')) row.push('*/bj split*')
  if (row.length) snap.push(row.join(' | '))

  snap.push('')
  snap.push(`⏱ Auto-stand in ${TURN_AUTOSTAND_DISPLAY_S}s`)
  await postSnapshot(ctx, snap)

  // Optional lightweight ping (useful for first prompt, noisy for re-prompts)
  if (ping) {
    await postMessage({ room: ctx.room, message: `🎯 ${await mention(uuid)} you’re up.` })
    await beat(250, 450)
  } else {
    await beat(150, 300)
  }
}

// ─────────────────────────────────────────────────────────────
// Deal lock
// ─────────────────────────────────────────────────────────────
async function dealOnce (ctx, { announce = false } = {}) {
  const st = getTable(ctx)
  if (st.phase !== 'betting' && st.phase !== 'dealing') return
  if (st.dealtForHandId === st.handId) return
  st.dealtForHandId = st.handId

  st.phase = 'dealing'
  clearTimer(st.betTimer); st.betTimer = null

  if (announce) await postMessage({ room: ctx.room, message: '✅ All bets in. Dealing…' })
  if (SUSPENSE_MS) await sleep(Math.min(1200, SUSPENSE_MS))
  await beat(350, 650)

  await dealInitial(ctx)
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────
export async function openBetting (ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'idle') {
    await postMessage({ room: ctx.room, message: `♠ Blackjack round already in progress (phase: ${st.phase}). Type */bj table* for status.` })
    return
  }
  await openJoin(ctx)
}

export async function openJoin (ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'idle') {
    await postMessage({ room: ctx.room, message: `A round is already in progress. Current phase: ${st.phase}.` })
    return
  }

  clearAllTimers(st)
  st.phase = 'join'
  st.joinDeadline = Date.now() + JOIN_WINDOW_MS

  st.roundPlayers = []
  st.handOrder = []
  for (const id of st.order) {
    const p = st.players.get(id)
    if (p) {
      p.bet = 0
      p.hands = []
      p.splitCount = 0
    }
  }
  st.dealerHand = []
  st.turnIndex = 0
  st.shuffleAnnouncedThisHand = false

  // Manual line breaks to avoid CometChat mid-line wraps
  await postMessage({
    room: ctx.room,
    message: [
      '🃏 **BLACKJACK** 🃏',
      '🪑 Type */bj join* to take a seat',
      `⏱ Join window open for *${Math.round(JOIN_WINDOW_MS / 1000)}s*`
    ].join('\n')
  })

  st.joinTimer = setTimeout(() => concludeJoin(ctx), JOIN_WINDOW_MS)
}

export async function joinTable (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'join') {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} there isn’t an active blackjack *join* window right now.` })
    return
  }
  ensurePlayer(st, userUUID, nickname)
  const p = st.players.get(userUUID)
  if (p.seated) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you’re already seated.` })
    return
  }
  p.seated = true
  await postMessage({ room: ctx.room, message: `🪑 ${await mention(userUUID)} sits at the table.` })
}

export async function leaveTable (userUUID, ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'join' && st.phase !== 'betting') {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} please wait until the round is over to leave.` })
    return
  }
  const p = st.players.get(userUUID)
  if (!p?.seated) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you’re not seated at the blackjack table.` })
    return
  }

  if (st.phase === 'betting' && p.bet > 0) {
    const refund = p.bet
    p.bet = 0
    await walletPayout(userUUID, refund)
    st.roundPlayers = st.roundPlayers.filter(id => id !== userUUID)
    await postMessage({ room: ctx.room, message: `↩️ ${await mention(userUUID)} left during betting — refunded ${fmtMoney(refund)}.` })
  }

  p.seated = false
  await postMessage({ room: ctx.room, message: `👋 ${await mention(userUUID)} left their seat.` })
}

async function concludeJoin (ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'join') return

  st.roundPlayers = seatedPlayers(st)
  if (st.roundPlayers.length === 0) {
    st.phase = 'idle'
    await postMessage({ room: ctx.room, message: 'No players joined. Start again with */bj* when ready.' })
    return
  }

  await beat(350, 650)
  await startBetting(ctx)
}

async function startBetting (ctx) {
  const st = getTable(ctx)

  st.handId += 1
  st.dealtForHandId = 0
  st.shuffleAnnouncedThisHand = false

  st.phase = 'betting'
  st.betDeadline = Date.now() + BETTING_WINDOW_MS

  for (const id of st.roundPlayers) {
    const p = st.players.get(id)
    if (p) p.bet = 0
  }

  const playerMentions = await Promise.all(st.roundPlayers.map(id => mention(id)))
  const betS = Math.round(BETTING_WINDOW_MS / 1000)

  await postMessage({
    room: ctx.room,
    message: [
      '💰 **BETTING OPEN**',
      `⏱ ${betS}s to place your bet`,
      '',
      'Players:',
      ...playerMentions.map(p => `• ${p}`),
      '',
      'Place your bet with:',
      '*/bj bet <amount>*'
    ].join('\n')
  })

  clearTimer(st.betTimer)
  st.betTimer = setTimeout(() => concludeBetting(ctx), BETTING_WINDOW_MS)
}

async function concludeBetting (ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'betting') return

  st.roundPlayers = st.roundPlayers.filter(id => {
    const p = st.players.get(id)
    return p && p.bet > 0 && p.seated
  })

  if (st.roundPlayers.length === 0) {
    st.phase = 'idle'
    await postMessage({ room: ctx.room, message: 'No valid bets. Round canceled.' })
    clearTimer(st.betTimer); st.betTimer = null
    return
  }

  // Build acting order (one hand per player to start)
  st.handOrder = st.roundPlayers.map(uuid => ({ uuid, hand: 0 }))
  st.turnIndex = 0

  await dealOnce(ctx, { announce: false })
}

export async function handleBlackjackBet (userUUID, amountStr, nickname, ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'betting') {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} betting is not open.` })
    return
  }
  if (!st.roundPlayers.includes(userUUID)) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you’re not in this round.` })
    return
  }

  ensurePlayer(st, userUUID, nickname)

  // Whole-dollar bets only (strip non-digits)
  const amount = Math.floor(Number(String(amountStr ?? '').replace(/[^\d]/g, '')))
  if (!Number.isFinite(amount) || amount <= 0) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} enter a valid whole-dollar bet amount greater than 0.` })
    return
  }

  const bal = await walletGet(userUUID)
  if (bal < amount) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you have ${fmtMoney(bal)} — not enough for a ${fmtMoney(amount)} bet.` })
    return
  }

  const ok = await walletBet(userUUID, amount)
  if (!ok) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} unable to place bet (insufficient funds).` })
    return
  }

  const p = st.players.get(userUUID)
  p.bet = amount

  await postMessage({ room: ctx.room, message: `✅ ${await mention(userUUID)} bet ${fmtMoney(p.bet)} 💰` })

  if (EARLY_BET_CLOSE && st.roundPlayers.every(id => (st.players.get(id)?.bet || 0) > 0)) {
    await dealOnce(ctx, { announce: true })
  }
}

// ─────────────────────────────────────────────────────────────
// Core hand flow
// ─────────────────────────────────────────────────────────────
async function dealInitial (ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'dealing') return

  clearTimer(st.betTimer); st.betTimer = null

  if (shouldReshuffle(st)) {
    st.deck = newShoe()
    if (!st.shuffleAnnouncedThisHand) {
      st.shuffleAnnouncedThisHand = true
      await postMessage({ room: ctx.room, message: '🔄 Shuffling the shoe…' })
      await beat(450, 850)
    }
  }

  await postMessage({ room: ctx.room, message: '🃏 Dealing…' })
  await beat(450, 850)

  st.dealerHand = []
  st.turnIndex = 0

  // Initialize hands for this round
  for (const { uuid } of st.handOrder) {
    const p = st.players.get(uuid)
    if (!p) continue
    p.splitCount = 0
    p.hands = [{
      cards: [],
      bet: p.bet,
      done: false,
      busted: false,
      surrendered: false,
      doubled: false,
      actionCount: 0,
      isSplitHand: false
    }]
  }

  // Deal 2 cards to each player's first hand + dealer
  for (let i = 0; i < 2; i++) {
    for (const { uuid } of st.handOrder) {
      const p = st.players.get(uuid)
      if (!p) continue
      p.hands[0].cards.push(draw(st))
    }
    st.dealerHand.push(draw(st))
  }

  // Initial deal snapshot
  const up = fmtCard(st.dealerHand[0])
  const snap = []
  snap.push('🃏 BLACKJACK — Initial Deal')
  snap.push(`Dealer: ${up}  ??`)
  snap.push('----------------------------------------')
  for (const { uuid } of st.handOrder) {
    const p = st.players.get(uuid)
    const h = p?.hands?.[0]
    if (!p || !h) continue
    const nm = nameInBlock(st, uuid)
    const cards = pad(h.cards.map(fmtCard).join(' '), 11)
    const hv = String(handValue(h.cards).total).padStart(2, ' ')
    snap.push(`${nm}  ${cards} (${hv})  bet ${fmtMoney(h.bet)}`)
  }
  await postSnapshot(ctx, snap)

  // Auto-mark natural blackjack (only for non-split hands)
  const bjWinners = []
  for (const { uuid } of st.handOrder) {
    const p = st.players.get(uuid)
    const h = p?.hands?.[0]
    if (h && !h.isSplitHand && isBlackjack(h.cards)) {
      h.done = true
      bjWinners.push(uuid)
    }
  }

  if (bjWinners.length > 0) {
    for (const uuid of bjWinners) {
      await postMessage({ room: ctx.room, message: `🂡 ${await mention(uuid)} has *BLACKJACK*! 🂡` })
      await beat(350, 650)
    }
  }

  // Peek micro-drama
  const upRank = st.dealerHand[0]?.r
  const peekEligible = (upRank === 'A' || upRank === '10' || upRank === 'J' || upRank === 'Q' || upRank === 'K')
  if (peekEligible) {
    await postMessage({ room: ctx.room, message: '🕵️ Dealer checks…' })
    await beat(550, 950)
    if (isBlackjack(st.dealerHand)) {
      await postMessage({ room: ctx.room, message: '🂠 Dealer has *BLACKJACK*.' })
      await bigBeat()
      return settleRound(ctx)
    } else {
      await postMessage({ room: ctx.room, message: '✅ No dealer blackjack.' })
      await beat(350, 700)
    }
  }

  const allBJ = st.handOrder.every(({ uuid }) => {
    const p = st.players.get(uuid)
    const h = p?.hands?.[0]
    return h && !h.isSplitHand && isBlackjack(h.cards)
  })
  if (allBJ) return dealerPlay(ctx)

  // UX pause: give players time to read
  await bigBeat()
  await beat(700, 1200)

  st.phase = 'acting'
  await advanceIfDoneAndPrompt(ctx)
}

async function advanceIfDoneAndPrompt (ctx) {
  const st = getTable(ctx)

  while (st.turnIndex < st.handOrder.length) {
    const turn = currentTurn(st)
    const { p, h } = getTurnHand(st, turn)
    if (!turn || !p || !h) { st.turnIndex++; continue }

    const hv = handValue(h.cards).total
    if (h.surrendered || h.busted || hv >= 21) { h.done = true; st.turnIndex++; continue }
    if (h.done) { st.turnIndex++; continue }

    return promptTurn(ctx, turn.uuid)
  }

  clearTurnTimers(st)
  await dealerPlay(ctx)
}

export async function handleHit (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')

  const turn = currentTurn(st)
  if (!turn || turn.uuid !== userUUID) return

  clearTurnTimers(st)

  const { p, h } = getTurnHand(st, turn)
  if (!p || !h) return

  h.actionCount++

  await postMessage({ room: ctx.room, message: `🫳 ${await mention(userUUID)} hits…` })
  await beat(450, 850)

  h.cards.push(draw(st))

  const v = handValue(h.cards).total
  if (v > 21) { h.busted = true; h.done = true }

  await postMessage({
    room: ctx.room,
    message: `🃏 ${await mention(userUUID)} → ${formatHand(h.cards)}${h.busted ? ' — *BUST*' : ''}`
  })

  // UX pause
  await beat(700, 1200)

  if (h.busted) {
    st.turnIndex++
    const next = currentTurn(st)
    if (next) {
      await beat(350, 650)
      await postMessage({ room: ctx.room, message: `➡️ Next up: ${await mention(next.uuid)}` })
      await beat(250, 450)
    }
    return advanceIfDoneAndPrompt(ctx)
  }

  // If exactly 21, finish this hand
  if (v === 21) {
    h.done = true
    st.turnIndex++
    const next = currentTurn(st)
    if (next) {
      await beat(350, 650)
      await postMessage({ room: ctx.room, message: `➡️ Next up: ${await mention(next.uuid)}` })
      await beat(250, 450)
    }
    return advanceIfDoneAndPrompt(ctx)
  }

  // Re-prompt same hand
  await beat(300, 600)
  return promptTurn(ctx, userUUID, { rePrompt: true, ping: false })
}

export async function handleStand (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')

  const turn = currentTurn(st)
  if (!turn || turn.uuid !== userUUID) return

  clearTurnTimers(st)

  const { h } = getTurnHand(st, turn)
  if (!h) return

  h.done = true

  await postMessage({ room: ctx.room, message: `✋ ${await mention(userUUID)} stands.` })
  await beat(300, 600)

  st.turnIndex++
  const next = currentTurn(st)
  if (next) {
    await postMessage({ room: ctx.room, message: `➡️ Next up: ${await mention(next.uuid)}` })
    await beat(250, 450)
  }
  await advanceIfDoneAndPrompt(ctx)
}

// HOUSE RULE DOUBLE (as requested):
// /bj double doubles your bet but you continue playing normally (no auto card, no auto-stand).
export async function handleDouble (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')

  const turn = currentTurn(st)
  if (!turn || turn.uuid !== userUUID) return

  clearTurnTimers(st)

  const { p, h } = getTurnHand(st, turn)
  if (!p || !h) return

  if (h.actionCount > 0 || h.cards.length !== 2 || h.doubled || h.surrendered) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you can only *double* as your first action on two cards.` })
    return promptTurn(ctx, userUUID, { rePrompt: true })
  }

  const bal = await walletGet(userUUID)
  if (bal < h.bet) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you don’t have enough to double (need another ${fmtMoney(h.bet)}).` })
    return promptTurn(ctx, userUUID, { rePrompt: true })
  }

  const ok = await walletBet(userUUID, h.bet)
  if (!ok) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} unable to double at this time.` })
    return promptTurn(ctx, userUUID, { rePrompt: true })
  }

  h.doubled = true
  h.bet = h.bet * 2
  h.actionCount++

  await postMessage({ room: ctx.room, message: `✌️ ${await mention(userUUID)} doubles to ${fmtMoney(h.bet)} — keep playing (hit or stand).` })
  await beat(300, 600)

  return promptTurn(ctx, userUUID, { rePrompt: true, ping: false })
}

export async function handleSurrender (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')

  const turn = currentTurn(st)
  if (!turn || turn.uuid !== userUUID) return

  clearTurnTimers(st)

  const { h } = getTurnHand(st, turn)
  if (!h) return

  if (h.actionCount > 0 || h.cards.length !== 2 || h.doubled || h.surrendered) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you can only *surrender* as your first action on two cards.` })
    return promptTurn(ctx, userUUID, { rePrompt: true })
  }

  h.surrendered = true
  h.done = true

  const refund = Math.floor(h.bet / 2)
  await walletPayout(userUUID, refund)

  await postMessage({ room: ctx.room, message: `🏳️ ${await mention(userUUID)} surrenders → refund ${fmtMoney(refund)}.` })
  await beat(350, 650)

  st.turnIndex++
  const next = currentTurn(st)
  if (next) {
    await postMessage({ room: ctx.room, message: `➡️ Next up: ${await mention(next.uuid)}` })
    await beat(250, 450)
  }
  await advanceIfDoneAndPrompt(ctx)
}

export async function handleSplit (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')

  const turn = currentTurn(st)
  if (!turn || turn.uuid !== userUUID) return

  clearTurnTimers(st)

  const { p, h } = getTurnHand(st, turn)
  if (!p || !h) return

  const actions = eligibleActions(p, h)
  if (!actions.includes('split')) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you can’t split right now.` })
    return promptTurn(ctx, userUUID, { rePrompt: true })
  }

  // Must be able to match bet for new hand
  const bal = await walletGet(userUUID)
  if (bal < h.bet) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} you need another ${fmtMoney(h.bet)} to split.` })
    return promptTurn(ctx, userUUID, { rePrompt: true })
  }

  const ok = await walletBet(userUUID, h.bet)
  if (!ok) {
    await postMessage({ room: ctx.room, message: `${await mention(userUUID)} unable to split at this time.` })
    return promptTurn(ctx, userUUID, { rePrompt: true })
  }

  // Split
  const c1 = h.cards[0]
  const c2 = h.cards[1]
  h.cards = [c1]
  h.actionCount++ // splitting counts as an action
  h.isSplitHand = true

  const newHandIndex = p.hands.length
  /** @type {HandState} */
  const h2 = {
    cards: [c2],
    bet: h.bet,
    done: false,
    busted: false,
    surrendered: false,
    doubled: false,
    actionCount: 0,
    isSplitHand: true
  }

  p.hands.push(h2)
  p.splitCount = (p.splitCount || 0) + 1

  await postMessage({ room: ctx.room, message: `🪓 ${await mention(userUUID)} splits! Two hands now (bet ${fmtMoney(h.bet)} each).` })
  await beat(400, 750)

  if (DEAL_ONE_TO_EACH_ON_SPLIT) {
    h.cards.push(draw(st))
    h2.cards.push(draw(st))
    await postMessage({
      room: ctx.room,
      message: `🃏 ${await mention(userUUID)} Hand 1: ${formatHand(h.cards)}\n🃏 ${await mention(userUUID)} Hand 2: ${formatHand(h2.cards)}`
    })
    await beat(450, 850)
  }

  // Insert turn for new hand immediately after current, so player plays Hand 1 then Hand 2.
  st.handOrder.splice(st.turnIndex + 1, 0, { uuid: userUUID, hand: newHandIndex })

  // Continue current hand (Hand 1)
  return promptTurn(ctx, userUUID, { rePrompt: true, ping: false })
}

// ─────────────────────────────────────────────────────────────
// Dealer + settlement
// ─────────────────────────────────────────────────────────────
async function dealerPlay (ctx) {
  const st = getTable(ctx)
  st.phase = 'dealer'
  clearTurnTimers(st)

  await postMessage({ room: ctx.room, message: '🂠 Dealer flips the hole card…' })
  await bigBeat()
  await postMessage({ room: ctx.room, message: `🂠 Dealer: ${formatHand(st.dealerHand)}` })
  await beat(450, 850)

  let { total, soft } = handValue(st.dealerHand)
  let drew = 0

  while (total < 17 || (total === 17 && soft === true && HIT_SOFT_17)) {
    await postMessage({ room: ctx.room, message: '🎲 Dealer hits...' })
    await beat(550, 950)

    st.dealerHand.push(draw(st))
    drew++

    const hv = handValue(st.dealerHand)
    total = hv.total
    soft = hv.soft

    await postMessage({ room: ctx.room, message: `→ Dealer: ${formatHand(st.dealerHand)}` })

    if (total === 16 || total === 17) await beat(450, 900)
    else await beat(300, 650)
  }

  if (drew > 0) await beat(250, 500)

  await settleRound(ctx)
}

async function settleRound (ctx) {
  const st = getTable(ctx)
  let biggestThisHand = { uuid: null, profit: 0 }

  st.phase = 'payout'
  clearTurnTimers(st)

  await postMessage({ room: ctx.room, message: '📊 Settling bets…' })
  await bigBeat()

  const dealerVal = handValue(st.dealerHand).total
  const dealerBJ = isBlackjack(st.dealerHand)

  const snap = []
  snap.push('📊 RESULTS')
  snap.push(`Dealer: ${formatHand(st.dealerHand)}${dealerBJ ? '  (BJ)' : ''}`)
  snap.push('----------------------------------------')

  for (const turn of st.handOrder) {
    const p = st.players.get(turn.uuid)
    const h = p?.hands?.[turn.hand]
    if (!p || !h || h.bet <= 0) continue

    const pv = handValue(h.cards).total
    const isNaturalBJ = (!h.isSplitHand && isBlackjack(h.cards)) // house: only original unsplit hand counts as blackjack payout

    let outcome = 'PUSH'
    let returned = 0
    let profit = 0

    if (h.surrendered) {
      outcome = 'SURRENDER'
      returned = Math.floor(h.bet / 2) // already paid at surrender time, shown for clarity
      profit = -Math.floor(h.bet / 2)
      p.lossStreak++; p.winStreak = 0; p.bjStreak = 0; p.losses++
    } else if (h.busted) {
      outcome = 'BUST'
      returned = 0
      profit = -h.bet
      p.lossStreak++; p.winStreak = 0; p.bjStreak = 0; p.losses++
    } else if (isNaturalBJ && !dealerBJ) {
      outcome = 'BLACKJACK'
      returned = Math.round(h.bet * 2.5)
      profit = returned - h.bet
      p.winStreak++; p.lossStreak = 0; p.bjStreak++; p.wins++; p.blackjacks++
    } else if (dealerBJ && isNaturalBJ) {
      outcome = 'PUSH'
      returned = h.bet
      profit = 0
      p.pushes++; p.bjStreak++
    } else if (dealerVal > 21 || pv > dealerVal) {
      outcome = 'WIN'
      returned = h.bet * 2
      profit = h.bet
      p.winStreak++; p.lossStreak = 0; p.bjStreak = 0; p.wins++
    } else if (pv < dealerVal) {
      outcome = 'LOSE'
      returned = 0
      profit = -h.bet
      p.lossStreak++; p.winStreak = 0; p.bjStreak = 0; p.losses++
    } else {
      outcome = 'PUSH'
      returned = h.bet
      profit = 0
      p.pushes++; p.bjStreak = 0
    }

    if (profit > biggestThisHand.profit) {
      biggestThisHand = { uuid: turn.uuid, profit }
    }

    // Paybacks:
    // - surrender refund already paid in handleSurrender (skip actual payout here)
    // - otherwise pay "returned" (push/win/blackjack)
    if (!h.surrendered && returned > 0) {
      await walletPayout(turn.uuid, Math.round(returned))
    }

    const nm = nameInBlock(st, turn.uuid)
    const handTag = (p.hands.length > 1) ? `H${turn.hand + 1}` : '  '
    const pvStr = String(pv).padStart(2, ' ')
    const profStr =
      profit > 0
        ? `+${fmtMoney(profit)}`
        : profit < 0
          ? `-${fmtMoney(Math.abs(profit))}`
          : `+${fmtMoney(0)}`
    const retStr = fmtMoney(returned)

    snap.push(`${nm}  ${pad(handTag, 2)}  ${pad(outcome, 10)}  hand ${pvStr}  profit ${pad(profStr, 12)}  return ${pad(retStr, 10)}`)
  }

  await postSnapshot(ctx, snap)
  await beat(450, 850)

  if (st.handOrder.length > 1 && biggestThisHand.uuid && biggestThisHand.profit > 0) {
    await postMessage({
      room: ctx.room,
      message: `💎 Biggest profit this hand: ${await mention(biggestThisHand.uuid)} (+${fmtMoney(biggestThisHand.profit)})`
    })
    await beat(350, 650)
  }

  // Unseat all players so the next /bj starts clean
  for (const id of st.order) {
    const p = st.players.get(id)
    if (p) p.seated = false
  }

  st.phase = 'idle'
  st.roundPlayers = []
  st.handOrder = []
  st.dealerHand = []
  st.turnIndex = 0
  clearAllTimers(st)

  await postMessage({ room: ctx.room, message: 'Type */bj* to open a new table.' })
}

// ─────────────────────────────────────────────────────────────
// Introspection helpers
// ─────────────────────────────────────────────────────────────
export function getFullTableView (ctx) {
  const st = getTable(ctx)
  const out = []
  out.push(`🃏 BLACKJACK — table ${st.id}`)
  out.push(`Phase: ${st.phase}`)
  if (st.phase === 'join') out.push(`Join closes in: ${Math.max(0, Math.ceil((st.joinDeadline - Date.now()) / 1000))}s`)
  if (st.phase === 'betting') out.push(`Betting closes in: ${Math.max(0, Math.ceil((st.betDeadline - Date.now()) / 1000))}s`)
  out.push(`Shoe: ${st.deck?.length ?? 0} cards remaining`)
  out.push('----------------------------------------')

  if (st.order.length === 0) out.push('(no one has ever sat down at this table yet)')

  for (const id of st.order) {
    const p = st.players.get(id)
    const seat = p?.seated ? '🪑' : '— '
    const nm = nameInBlock(st, id)

    // If hands exist, show them; otherwise show betting-phase bet
    if (p?.hands?.length) {
      const pieces = []
      for (let i = 0; i < p.hands.length; i++) {
        const h = p.hands[i]
        const hv = h?.cards?.length ? handValue(h.cards).total : '-'
        const hand = h?.cards?.length ? h.cards.map(fmtCard).join(' ') : '—'
        pieces.push(`H${i + 1}:${hv} ${hand}`)
      }
      out.push(`${seat} ${nm}  ${pieces.join(' | ')}`)
    } else {
      const bet = fmtMoney(p?.bet || 0)
      out.push(`${seat} ${nm}  bet ${pad(bet, 10)}`)
    }
  }

  return `\`\`\`\n${out.join('\n')}\n\`\`\``
}

export function getPhase (ctx) {
  return getTable(ctx).phase
}

export function isSeated (userUUID, ctx) {
  const p = getTable(ctx).players.get(userUUID)
  return !!(p && p.seated)
}