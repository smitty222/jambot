// src/games/blackjack/blackJack.js
// Blackjack engine with:
// • 30s JOIN window
// • 30s BETTING window (early close when all seated players have bet)
// • Actions: hit, stand, double, surrender (split not yet supported)
// • Multi-player; 6-deck shoe; dealer stands on soft 17

import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../../database/dbwalletmanager.js'
import { postMessage } from '../../libs/cometchat.js'

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const JOIN_WINDOW_MS    = Number(process.env.BJ_JOIN_WINDOW_MS ?? 30_000)
const BETTING_WINDOW_MS = Number(process.env.BJ_BETTING_WINDOW_MS ?? 30_000)
const EARLY_BET_CLOSE   = true
const DECKS             = Number(process.env.BJ_DECKS ?? 6)
const HIT_SOFT_17       = false

const SUSPENSE_MS       = Number(process.env.BJ_SUSPENSE_MS ?? 700)
const DRAW_PAUSE_MS     = Number(process.env.BJ_DRAW_PAUSE_MS ?? 650)

const TURN_NUDGE_MS     = Number(process.env.BJ_TURN_NUDGE_MS ?? 15_000)
const TURN_AUTOSTAND_MS = Number(process.env.BJ_TURN_AUTOSTAND_MS ?? 25_000)

// ─────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────
const TABLES = new Map()

const sleep = (ms) => new Promise(res => setTimeout(res, ms))
const keyOf = (ctx) => String(ctx?.tableId || ctx?.room || 'global')

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
      turnIndex: 0,
      turnNudgeTimer: null,
      turnExpireTimer: null,
      turnFor: null
    })
  }
  return TABLES.get(k)
}

const clearTimer = (t) => { if (t) clearTimeout(t) }
const clearTurnTimers = (st) => {
  clearTimer(st.turnNudgeTimer);  st.turnNudgeTimer = null
  clearTimer(st.turnExpireTimer); st.turnExpireTimer = null
  st.turnFor = null
}
const clearAllTimers = (st) => {
  clearTimer(st.joinTimer); st.joinTimer = null
  clearTimer(st.betTimer);  st.betTimer  = null
  clearTurnTimers(st)
}

const mention = (uuid) => `<@uid:${uuid}>`

// ─────────────────────────────────────────────────────────────
// Betting
// ─────────────────────────────────────────────────────────────
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

  const amount = Number(String(amountStr ?? '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} enter a valid bet amount.` })
    return
  }

  const bal = await getUserWallet(userUUID)
  if (bal < amount) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} insufficient funds.` })
    return
  }

  if (!removeFromUserWallet(userUUID, amount)) {
    await postMessage({ room: ctx.room, message: `${mention(userUUID)} unable to place bet.` })
    return
  }

  const p = st.players.get(userUUID)
  p.bet = Number(amount.toFixed(1))

  await postMessage({ room: ctx.room, message: `✅ ${mention(userUUID)} bet **$${p.bet.toFixed(1)}**.` })

  // 🔒 EARLY CLOSE — LOCK FIRST
  if (
    EARLY_BET_CLOSE &&
    st.phase === 'betting' &&
    st.handOrder.every(id => (st.players.get(id)?.bet || 0) > 0)
  ) {
    st.phase = 'dealing'
    clearTimer(st.betTimer); st.betTimer = null

    await postMessage({ room: ctx.room, message: `All bets in. Dealing…` })
    if (SUSPENSE_MS) await sleep(SUSPENSE_MS)
    await dealInitial(ctx)
  }
}

// ─────────────────────────────────────────────────────────────
// Dealing (GUARDED)
// ─────────────────────────────────────────────────────────────
async function dealInitial (ctx) {
  const st = getTable(ctx)

  // 🛑 HARD GUARD — prevents double deal
  if (st.phase !== 'dealing') return

  st.deck = newShoe()
  st.dealerHand = []

  for (const id of st.handOrder) {
    const p = st.players.get(id)
    p.hand = []
    p.done = p.busted = p.surrendered = p.doubled = false
    p.actionCount = 0
  }

  for (let i = 0; i < 2; i++) {
    for (const id of st.handOrder) st.players.get(id).hand.push(draw(st))
    st.dealerHand.push(draw(st))
  }

  const lines = [`🃏 **Initial deal**`]
  for (const id of st.handOrder) {
    const p = st.players.get(id)
    lines.push(`• ${mention(id)} — ${formatHand(p.hand)}  |  bet $${p.bet.toFixed(1)}`)
  }
  lines.push(`• Dealer — ${fmtCard(st.dealerHand[0])} ??`)
  await postMessage({ room: ctx.room, message: lines.join('\n') })

  st.phase = 'acting'
  st.turnIndex = 0
  await advanceIfDoneAndPrompt(ctx)
}
