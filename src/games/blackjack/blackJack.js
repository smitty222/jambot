// src/games/blackjack/blackJack.js
// A clean, self-contained Blackjack engine with:
// • 30s JOIN window (no early close)
// • 30s BETTING window (early close when all seated players have bet)
// • Basic actions: hit, stand, double, surrender (split not yet supported)
// • Multi-player, sequential turns; 6-deck shoe; dealer stands on soft 17
//
// Public API (kept stable for your message.js):
//   openBetting(ctx)
//   openJoin(ctx)
//   joinTable(userUUID, nickname, ctx)
//   leaveTable(userUUID, ctx)
//   handleBlackjackBet(userUUID, amountStr, nickname, ctx)
//   handleHit(userUUID, nickname, ctx)
//   handleStand(userUUID, nickname, ctx)
//   handleDouble(userUUID, nickname, ctx)
//   handleSurrender(userUUID, nickname, ctx)
//   handleSplit(userUUID, nickname, ctx)   // stubbed; replies "not supported"
//   getFullTableView(ctx)
//   getPhase(ctx)
//   isSeated(userUUID, ctx)
//
// External deps expected in your project:
//   addToUserWallet(userUUID, amount)
//   removeFromUserWallet(userUUID, amount) → boolean
//   getUserWallet(userUUID) → number
//   postMessage({ room, message })
import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../../database/dbwalletmanager.js'
import { postMessage } from '../../libs/cometchat.js'

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const JOIN_WINDOW_MS    = Number(process.env.BJ_JOIN_WINDOW_MS    ?? 30_000)
const BETTING_WINDOW_MS = Number(process.env.BJ_BETTING_WINDOW_MS ?? 30_000)
const EARLY_BET_CLOSE   = true
const DECKS             = Number(process.env.BJ_DECKS ?? 6)

// ─────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────
/** @type {Map<string, TableState>} */
const TABLES = new Map()

/**
 * @typedef {Object} PlayerState
 * @property {string} uuid
 * @property {string} nickname
 * @property {boolean} seated
 * @property {number} bet
 * @property {Array<{r:string,s:string}>} hand
 * @property {boolean} done
 * @property {boolean} busted
 * @property {boolean} surrendered
 * @property {boolean} doubled
 * @property {number} actionCount
 */

/**
 * @typedef {Object} TableState
 * @property {string} id
 * @property {'idle'|'join'|'betting'|'dealing'|'acting'|'dealer'|'payout'} phase
 * @property {number} joinDeadline
 * @property {number} betDeadline
 * @property {NodeJS.Timeout|null} joinTimer
 * @property {NodeJS.Timeout|null} betTimer
 * @property {Map<string, PlayerState>} players
 * @property {string[]} order
 * @property {string[]} handOrder
 * @property {Array<{r:string,s:string}>} deck
 * @property {Array<{r:string,s:string}>} dealerHand
 * @property {number} turnIndex
 */

function keyOf (ctx) {
  return String(ctx?.tableId || ctx?.room || 'global')
}

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
      handOrder: [],
      deck: [],
      dealerHand: [],
      turnIndex: 0
    })
  }
  return TABLES.get(k)
}

function clearTimer (t) { if (t) clearTimeout(t) }
function clearAllTimers (st) {
  clearTimer(st.joinTimer); st.joinTimer = null
  clearTimer(st.betTimer);  st.betTimer = null
}

function mention (uuid) { return `<@uid:${uuid}>` }
function fmtCard (c) { return `${c.r}${c.s}` }
function formatHand (cards) {
  const { total, soft } = handValue(cards)
  return `${cards.map(fmtCard).join(' ')}  (${total}${soft ? ' soft' : ''})`
}

function newShoe (deckCount = DECKS) {
  const ranks = ['A','2','3','4','5','6','7','8','9','10','J','Q','K']
  const suits = ['♠','♥','♦','♣']
  const cards = []
  for (let d = 0; d < deckCount; d++) {
    for (const r of ranks) for (const s of suits) cards.push({ r, s })
  }
  // Fisher–Yates
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = cards[i]; cards[i] = cards[j]; cards[j] = tmp
  }
  return cards
}

function handValue (cards) {
  let total = 0
  let aces = 0
  for (const c of cards) {
    if (c.r === 'A') { aces++; total += 11 }
    else if (['K','Q','J'].includes(c.r)) total += 10
    else total += Number(c.r)
  }
  // Soften Aces
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  const soft = cards.some(c => c.r === 'A') && total <= 21
  return { total, soft }
}

function isBlackjack (cards) {
  return cards.length === 2 && handValue(cards).total === 21
}

function draw (st) {
  if (st.deck.length === 0) st.deck = newShoe()
  return st.deck.pop()
}

function seatedPlayers (st) {
  return st.order.filter(id => st.players.get(id)?.seated)
}

function ensurePlayer (st, userUUID, nickname) {
  if (!st.players.has(userUUID)) {
    TABLES.get(st.id) // noop to keep lint quiet
    st.players.set(userUUID, {
      uuid: userUUID, nickname: nickname || '', seated: false, bet: 0,
      hand: [], done: false, busted: false, surrendered: false, doubled: false, actionCount: 0
    })
    st.order.push(userUUID)
  } else if (nickname) {
    st.players.get(userUUID).nickname = nickname
  }
}

function ensurePhase (st, expected) {
  if (st.phase !== expected) throw new Error(`Wrong phase: expected ${expected}, got ${st.phase}`)
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────
export async function openBetting (ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'idle') {
    await postMessage({ room: ctx.room, message: `♠ Blackjack round already in progress (phase: ${st.phase}). Type **/table** for status.` })
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
  st.phase = 'join'
  st.joinDeadline = Date.now() + JOIN_WINDOW_MS
  clearAllTimers(st)
  st.handOrder = []
  for (const id of st.order) { const p = st.players.get(id); if (p) { p.bet = 0; p.hand = []; p.done = p.busted = p.surrendered = p.doubled = false; p.actionCount = 0 } }
  st.dealerHand = []
  st.turnIndex = 0

  await postMessage({ room: ctx.room, message: [
    `🃏 **Blackjack** table is open for **${Math.round(JOIN_WINDOW_MS/1000)}s**!`,
    `Type **/join** to take a seat.`,
    `After the join window: you’ll have ${Math.round(BETTING_WINDOW_MS/1000)}s to place bets with **/bet <amount>**`
  ].join('\n') })

  st.joinTimer = setTimeout(() => concludeJoin(ctx), JOIN_WINDOW_MS)
}

export async function joinTable (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'join') {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} there isn’t an active blackjack **join** window right now.` })
    return
  }
  ensurePlayer(st, userUUID, nickname)
  const p = st.players.get(userUUID)
  if (p.seated) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} you’re already seated.` })
    return
  }
  p.seated = true
  await postMessage({ room: ctx.room, message: `🪑 ${mention(userUUID)} sits at the table.` })
}

export async function leaveTable (userUUID, ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'join' && st.phase !== 'betting') {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} please wait until the round is over to leave.` })
    return
  }
  const p = st.players.get(userUUID)
  if (!p?.seated) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} you’re not seated at the blackjack table.` })
    return
  }
  p.seated = false
  await postMessage({ room: ctx.room, message: `👋 ${mention(userUUID)} left their seat.` })
}

async function concludeJoin (ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'join') return
  st.handOrder = seatedPlayers(st)
  if (st.handOrder.length === 0) {
    st.phase = 'idle'
    await postMessage({ room: ctx.room, message: `No players joined. Start again with **/blackjack** when ready.` })
    return
  }
  await postMessage({ room: ctx.room, message: `⏱️ Join closed. Players this hand: ${st.handOrder.map(mention).join(', ')}` })
  await startBetting(ctx)
}

async function startBetting (ctx) {
  const st = getTable(ctx)
  st.phase = 'betting'
  st.betDeadline = Date.now() + BETTING_WINDOW_MS
  for (const id of st.handOrder) {
    const p = st.players.get(id); if (p) { p.bet = 0 }
  }
  await postMessage({ room: ctx.room, message: [
    `💰 **Betting open** for ${Math.round(BETTING_WINDOW_MS/1000)}s.`,
    `Players: ${st.handOrder.map(mention).join(', ')}`,
    `Place your bet with **/bet <amount>**`
  ].join('\n') })

  st.betTimer = setTimeout(() => concludeBetting(ctx), BETTING_WINDOW_MS)
}

async function concludeBetting (ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'betting') return

  // Filter out anyone who didn't bet — they simply skip this round
  st.handOrder = st.handOrder.filter(id => {
    const p = st.players.get(id)
    return p && p.bet > 0 && p.seated
  })

  if (st.handOrder.length === 0) {
    st.phase = 'idle'
    await postMessage({ room: ctx.room, message: `No valid bets. Round canceled.` })
    return
  }

  await dealInitial(ctx)
}

export async function handleBlackjackBet (userUUID, amountStr, nickname, ctx) {
  const st = getTable(ctx)
  if (st.phase !== 'betting') {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} betting is not open.` })
    return
  }
  if (!st.handOrder.includes(userUUID)) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} you’re not in this round.` })
    return
  }
  const amount = Number(String(amountStr).replace(/[^\d.]/g,''))
  if (!Number.isFinite(amount) || amount <= 0) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} enter a valid bet amount greater than 0.` })
    return
  }
  const bal = getUserWallet(userUUID)
  if (bal < amount) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} you have $${bal.toFixed(1)} — not enough for a $${amount.toFixed(1)} bet.` })
    return
  }
  const ok = removeFromUserWallet(userUUID, amount)
  if (!ok) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} unable to place bet (insufficient funds).` })
    return
  }
  const p = st.players.get(userUUID)
  p.bet = amount

  await postMessage({ room: ctx.room, message: `✅ ${mention(userUUID)} bet **$${amount.toFixed(1)}**.` })

  if (EARLY_BET_CLOSE && st.handOrder.every(id => st.players.get(id)?.bet > 0)) {
    clearTimer(st.betTimer); st.betTimer = null
    await postMessage({ room: ctx.room, message: `All bets in. Dealing…` })
    await dealInitial(ctx)
  }
}

async function dealInitial (ctx) {
  const st = getTable(ctx)
  st.phase = 'dealing'
  st.deck = newShoe()
  st.dealerHand = []
  for (const id of st.handOrder) {
    const p = st.players.get(id)
    p.hand = []; p.done = p.busted = p.surrendered = p.doubled = false; p.actionCount = 0
  }

  // Deal two to each player (P, dealer, P, dealer)
  for (let i = 0; i < 2; i++) {
    for (const id of st.handOrder) st.players.get(id).hand.push(draw(st))
    st.dealerHand.push(draw(st))
  }

  // Announce initial hands
  const lines = [`🃏 **Initial deal**`]
  for (const id of st.handOrder) {
    const p = st.players.get(id)
    lines.push(`• ${mention(id)} — ${formatHand(p.hand)}  |  bet $${p.bet.toFixed(1)}`)
  }
  lines.push(`• Dealer — ${fmtCard(st.dealerHand[0])} ??`)
  await postMessage({ room: ctx.room, message: lines.join('\n') })

  // If everyone has natural blackjack, skip to dealer/settle
  const allBJ = st.handOrder.every(id => isBlackjack(st.players.get(id).hand))
  st.turnIndex = 0
  if (allBJ) return dealerPlay(ctx)

  // Otherwise, advance to first player who is not auto-done
  st.phase = 'acting'
  await advanceIfDoneAndPrompt(ctx)
}

async function advanceIfDoneAndPrompt (ctx) {
  const st = getTable(ctx)
  // Move turnIndex until we find a player who can act
  while (st.turnIndex < st.handOrder.length) {
    const id = st.handOrder[st.turnIndex]
    const p = st.players.get(id)
    if (!p) { st.turnIndex++; continue }
    const hv = handValue(p.hand).total
    if (p.surrendered || p.busted || hv >= 21) { p.done = true; st.turnIndex++; continue }
    // Found an active player
    await postMessage({ room: ctx.room, message: `👉 ${mention(id)} it’s your turn. (**/hit**, **/stand**, **/double**, **/surrender**)` })
    return
  }
  // No more players → dealer
  await dealerPlay(ctx)
}

export async function handleHit (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')
  const id = st.handOrder[st.turnIndex]
  if (id !== userUUID) return // silently ignore out-of-turn

  const p = st.players.get(userUUID)
  p.actionCount++
  p.hand.push(draw(st))

  const v = handValue(p.hand).total
  if (v > 21) { p.busted = true; p.done = true }

  await postMessage({ room: ctx.room, message: `🫳 ${mention(userUUID)} hits: ${formatHand(p.hand)}${p.busted ? ' — **BUST**' : ''}` })
  if (p.busted) { st.turnIndex++; return advanceIfDoneAndPrompt(ctx) }
  // still same player's turn
}

export async function handleStand (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')
  if (st.handOrder[st.turnIndex] !== userUUID) return
  const p = st.players.get(userUUID)
  p.done = true
  await postMessage({ room: ctx.room, message: `✋ ${mention(userUUID)} stands on ${handValue(p.hand).total}.` })
  st.turnIndex++
  await advanceIfDoneAndPrompt(ctx)
}

export async function handleDouble (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')
  if (st.handOrder[st.turnIndex] !== userUUID) return
  const p = st.players.get(userUUID)
  if (p.actionCount > 0 || p.hand.length !== 2) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} you can only **double** as your first action on two cards.` })
    return
  }
  const bal = getUserWallet(userUUID)
  if (bal < p.bet) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} you don’t have enough to double (need another $${p.bet.toFixed(1)}).` })
    return
  }
  const ok = removeFromUserWallet(userUUID, p.bet)
  if (!ok) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} unable to double at this time.` })
    return
  }
  p.doubled = true
  p.bet = Number((p.bet * 2).toFixed(1))
  p.actionCount++
  p.hand.push(draw(st)) // one card only
  const v = handValue(p.hand).total
  if (v > 21) p.busted = true
  p.done = true

  await postMessage({ room: ctx.room, message: `✌️ ${mention(userUUID)} doubles to **$${p.bet.toFixed(1)}** → ${formatHand(p.hand)}${p.busted ? ' — **BUST**' : ''}` })
  st.turnIndex++
  await advanceIfDoneAndPrompt(ctx)
}

export async function handleSurrender (userUUID, nickname, ctx) {
  const st = getTable(ctx)
  ensurePhase(st, 'acting')
  if (st.handOrder[st.turnIndex] !== userUUID) return
  const p = st.players.get(userUUID)
  if (p.actionCount > 0 || p.hand.length !== 2) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} you can only **surrender** as your first action on two cards.` })
    return
  }
  p.surrendered = true
  p.done = true
  const refund = Number((p.bet / 2).toFixed(1))
  await addToUserWallet(userUUID, refund)
  await postMessage({ room: ctx.room, message: `🏳️ ${mention(userUUID)} surrenders and gets **$${refund.toFixed(1)}** back.` })
  st.turnIndex++
  await advanceIfDoneAndPrompt(ctx)
}

export async function handleSplit (userUUID, nickname, ctx) {
  await postMessage({ room: ctx.room, message: `${mention(userUUID)} **split** is not supported yet.` })
}

// ─────────────────────────────────────────────────────────────
// Dealer + settlement
// ─────────────────────────────────────────────────────────────
async function dealerPlay (ctx) {
  const st = getTable(ctx)
  st.phase = 'dealer'
  // Reveal dealer hole card
  await postMessage({ room: ctx.room, message: `🂠 Dealer reveals: ${formatHand(st.dealerHand)}` })

  // If any player has natural blackjack and dealer also has blackjack, they push.
  // Dealer draws to 17 (stand on soft 17).
  let { total, soft } = handValue(st.dealerHand)
  while (total < 17 || (total === 17 && soft === true && false /* hitSoft17 = false */)) {
    st.dealerHand.push(draw(st))
    const hv = handValue(st.dealerHand); total = hv.total; soft = hv.soft
    await postMessage({ room: ctx.room, message: `Dealer draws → ${formatHand(st.dealerHand)}` })
  }

  await settleRound(ctx)
}

async function settleRound (ctx) {
  const st = getTable(ctx)
  st.phase = 'payout'
  const dealerVal = handValue(st.dealerHand).total
  const dealerBJ = isBlackjack(st.dealerHand)
  const dealerBust = dealerVal > 21

  const lines = ['📊 **Results**']
  for (const id of st.handOrder) {
    const p = st.players.get(id)
    if (!p || p.bet <= 0) continue
    const pv = handValue(p.hand).total
    const bj = isBlackjack(p.hand)
    if (p.surrendered) {
      lines.push(`• ${mention(id)} — surrendered (refund $${(p.bet/2).toFixed(1)})`)
      continue
    }
    if (p.busted) {
      lines.push(`• ${mention(id)} — busted (${pv}). Lose $${p.bet.toFixed(1)}`)
      continue
    }
    let outcome = 'push'
    let payout = 0
    if (bj && !dealerBJ) {
      outcome = 'blackjack'
      payout = p.bet * 2.5 // return (2.5x) since stake already removed
    } else if (dealerBJ && bj) {
      outcome = 'push'
      payout = p.bet // return stake
    } else if (dealerBust || pv > dealerVal) {
      outcome = 'win'
      payout = p.bet * 2 // return stake + win
    } else if (pv < dealerVal) {
      outcome = 'lose'
      payout = 0
    } else {
      outcome = 'push'
      payout = p.bet
    }

    if (payout > 0) await addToUserWallet(id, payout)
    lines.push(`• ${mention(id)} — ${outcome} (${pv} vs dealer ${dealerVal}) ${payout>0?`→ +$${payout.toFixed(1)}`:''}`)
  }

  await postMessage({ room: ctx.room, message: lines.join('\n') })

  // Reset to idle for next round
  st.phase = 'idle'
  st.handOrder = []
  st.dealerHand = []
  st.turnIndex = 0
  clearAllTimers(st)
  await postMessage({ room: ctx.room, message: `Type **/blackjack** to open a new table.` })
}

// ─────────────────────────────────────────────────────────────
// Introspection helpers
// ─────────────────────────────────────────────────────────────
export function getFullTableView (ctx) {
  const st = getTable(ctx)
  const out = []
  out.push(`🃏 Blackjack — table ${st.id}`)
  out.push(`Phase: ${st.phase}`)
  if (st.phase === 'join') {
    out.push(`Join closes in: ${Math.max(0, Math.ceil((st.joinDeadline - Date.now())/1000))}s`)
  }
  if (st.phase === 'betting') {
    out.push(`Betting closes in: ${Math.max(0, Math.ceil((st.betDeadline - Date.now())/1000))}s`)
  }
  if (st.order.length === 0) out.push(`(no one has ever sat down at this table yet)`)
  for (const id of st.order) {
    const p = st.players.get(id)
    const seat = p?.seated ? '🪑' : '—'
    out.push(`${seat} ${mention(id)} bet:$${(p?.bet||0).toFixed(1)} hand:${p?.hand?.length?formatHand(p.hand):'—'}`)
  }
  return out.join('\n')
}

export function getPhase (ctx) {
  return getTable(ctx).phase
}

export function isSeated (userUUID, ctx) {
  const p = getTable(ctx).players.get(userUUID)
  return !!(p && p.seated)
}
