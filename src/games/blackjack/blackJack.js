import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../../database/dbwalletmanager.js'
import { postMessage } from '../../libs/cometchat.js'

/**
 * Blackjack with multi-table support + per-table lock to avoid race conditions.
 * Backward compatible with existing handlers.
 * Changes:
 *  - Adds a 30s LOBBY phase before betting (only /join allowed)
 *  - Betting window is 30s (or starts early if all have bet); non-bettors are removed
 *  - Replaces [BJ ####] with a clean "🃏 Blackjack" prefix
 *  - Stores & displays player names as real tags: <@uid:UUID>
 */

const LOBBY_TIMEOUT_DURATION = 30000
const BETTING_TIMEOUT_DURATION = 30000
const NUDGE_SECONDS_LEFT = 10            // nudge when ~10s remain
const PLAYER_DECISION_TIMEOUT = 30000
const NUM_DECKS = Number(process.env.BJ_NUM_DECKS || 6) // 6-deck shoe by default

// ────────────────────────────────────────────────────────────────
// Multi-table state & locking
// ────────────────────────────────────────────────────────────────
const tables = new Map()       // tableId -> state
const locks = new Map()        // tableId -> Promise chain

function createState () {
  return {
    tableUsers: [],
    active: false, // mirrors phase === 'playing'
    phase: 'idle', // 'idle' | 'lobby' | 'betting' | 'playing' | 'settling'
    playerBets: {},
    playerHands: {},
    dealerHand: [],
    deck: [],
    currentPlayerIndex: 0,
    canJoinTable: true,
    userNicknames: {},       // now stores <@uid:UUID>
    // timers
    lobbyTimeout: null,
    bettingTimeout: null,
    nudgeTimeout: null,
    turnTimeout: null,
    awaitingInput: false,
    stats: {},
    doubledDown: new Set(),
    surrendered: new Set(),
    splitHands: {},
    splitIndex: {},
    naturalBlackjackPaid: new Set()
  }
}

function getCtx (ctx) {
  const tableId = (ctx && ctx.tableId) || 'default'
  const room = (ctx && ctx.room) || process.env.ROOM_UUID
  // Clean prefix: no numeric table tag in chat
  const tag = '🃏 Blackjack'
  return { tableId, room, tag }
}

function getState (ctx) {
  const { tableId } = getCtx(ctx)
  if (!tables.has(tableId)) tables.set(tableId, createState())
  return tables.get(tableId)
}

/** Simple per-table mutex: queues async actions to run one-at-a-time */
async function withLock (ctx, fn) {
  const { tableId } = getCtx(ctx)
  const prev = locks.get(tableId) || Promise.resolve()
  let resolveNext
  const next = new Promise(res => (resolveNext = res))
  locks.set(tableId, prev.then(() => next).catch(() => next))
  try {
    const result = await fn()
    resolveNext()
    return result
  } catch (e) {
    resolveNext()
    throw e
  }
}

// ────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(r => setTimeout(r, ms))
const mention = (uuid) => `<@uid:${uuid}>`

function createDeck (numDecks = NUM_DECKS) {
  const suits = ['♠', '♥', '♦', '♣']
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
  const one = suits.flatMap(suit => values.map(value => ({ value, suit })))
  const out = []
  for (let i = 0; i < numDecks; i++) out.push(...one.map(c => ({ ...c })))
  return out
}

function shuffleDeck (deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
}

function getCardValue (card) {
  if (['J', 'Q', 'K'].includes(card.value)) return 10
  if (card.value === 'A') return 11
  return parseInt(card.value)
}

export function canSplitHand (hand) {
  return hand.length === 2 && getCardValue(hand[0]) === getCardValue(hand[1])
}

function calculateHandValue (hand) {
  let value = 0
  let aceCount = 0
  for (const card of hand) {
    if (['J', 'Q', 'K'].includes(card.value)) value += 10
    else if (card.value === 'A') { value += 11; aceCount++ }
    else value += parseInt(card.value)
  }
  while (value > 21 && aceCount > 0) {
    value -= 10
    aceCount--
  }
  return value
}

function getCardEmoji (card) {
  const suitEmojis = { '♠': '♠️', '♥': '♥️', '♦': '♦️', '♣': '♣️' }
  return `[${card.value}${suitEmojis[card.suit] || card.suit}]`
}

function formatHand (hand) { return hand.map(getCardEmoji).join(' ') }
function formatHandWithValue (hand) { return `${formatHand(hand)} (Total: ${calculateHandValue(hand)})` }

function getPlayerListMessage (state) {
  if (state.tableUsers.length === 0) return '🪑 No one at the table yet.'
  return `🃏 Blackjack Table:\n` +
    state.tableUsers.map((uuid, i) => `${i + 1}. ${state.userNicknames[uuid] || mention(uuid)}`).join('\n')
}

function getFullTableViewInternal (state) {
  return state.tableUsers.map(uuid => {
    const name = state.userNicknames[uuid] || mention(uuid)
    const bet = state.playerBets[uuid] || 0
    const hand = state.playerHands[uuid]
    const status = hand ? formatHandWithValue(hand) : '(Not dealt)'
    return `🎲 ${name} - Bet: $${bet} - ${status}`
  }).join('\n')
}

function allPlayersHaveBet (state) {
  return state.tableUsers.length > 0 &&
         state.tableUsers.every(user => (state.playerBets[user] ?? 0) > 0)
}

// ────────────────────────────────────────────────────────────────
// New: Lobby (join) → Betting (bets) → Playing
// ────────────────────────────────────────────────────────────────
async function openLobby (ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    if (state.phase !== 'idle') return

    clearTimeout(state.lobbyTimeout); state.lobbyTimeout = null
    clearTimeout(state.bettingTimeout); state.bettingTimeout = null
    clearTimeout(state.nudgeTimeout); state.nudgeTimeout = null

    state.phase = 'lobby'
    state.canJoinTable = true

    await postMessage({
      room,
      message: `${tag}\nLobby open for ${LOBBY_TIMEOUT_DURATION / 1000}s — type /join to sit.\n\n• Bets are NOT accepted yet. Betting opens after lobby closes.`
    })

    state.lobbyTimeout = setTimeout(async () => {
      await withLock(ctx, async () => {
        const st = getState(ctx)
        if (st.phase !== 'lobby') return
        if (st.tableUsers.length === 0) {
          await postMessage({ room, message: `${tag} No players joined. Lobby closed.` })
          return resetGame(ctx)
        }
        await openBettingWindow(ctx)
      })
    }, LOBBY_TIMEOUT_DURATION)
  })
}

/** Back-compat: old callers of openBetting() now kick off the LOBBY first */
async function openBetting (ctx) {
  return openLobby(ctx)
}

async function openBettingWindow (ctx) {
  const { room, tag } = getCtx(ctx)
  const state = getState(ctx)

  clearTimeout(state.lobbyTimeout); state.lobbyTimeout = null
  clearTimeout(state.bettingTimeout); state.bettingTimeout = null
  clearTimeout(state.nudgeTimeout); state.nudgeTimeout = null

  state.phase = 'betting'
  state.canJoinTable = false // joining is now closed

  await postMessage({
    room,
    message: `${tag}\nBetting window open for ${BETTING_TIMEOUT_DURATION / 1000}s — seated players: use /bet <amount>.\n\n${getPlayerListMessage(state)}`
  })

  // Nudge near the end if still waiting on people
  const nudgeDelay = Math.max(0, BETTING_TIMEOUT_DURATION - NUDGE_SECONDS_LEFT * 1000)
  state.nudgeTimeout = setTimeout(async () => {
    await withLock(ctx, async () => {
      const st = getState(ctx)
      if (st.phase !== 'betting') return
      const waiting = st.tableUsers.filter(u => (st.playerBets[u] ?? 0) <= 0)
      if (waiting.length) {
        await postMessage({ room, message: `${tag} ⏳ ${NUDGE_SECONDS_LEFT}s left — still waiting on: ${waiting.map(mention).join(', ')}` })
      }
    })
  }, nudgeDelay)

  // Auto-close betting after timeout
  state.bettingTimeout = setTimeout(async () => {
    await withLock(ctx, async () => {
      const st = getState(ctx)
      if (st.phase !== 'betting') return

      // Remove anyone who never bet (silent cleanup, then one summary line)
      const removed = []
      for (const user of [...st.tableUsers]) {
        if (!st.playerBets[user]) {
          removed.push(user)
          // Silent remove (no "has left" spam)
          const idx = st.tableUsers.indexOf(user)
          if (idx !== -1) st.tableUsers.splice(idx, 1)
          delete st.playerBets[user]
          delete st.playerHands[user]
          delete st.userNicknames[user]
          delete st.splitHands[user]
          delete st.splitIndex[user]
          st.doubledDown.delete(user)
          st.surrendered.delete(user)
          st.naturalBlackjackPaid.delete(user)
        }
      }
      if (removed.length) {
        await postMessage({ room, message: `${tag} 🧹 Removed for no bet: ${removed.map(mention).join(', ')}` })
      }

      if (st.tableUsers.length === 0) {
        await postMessage({ room, message: `${tag} No active bettors. Round cancelled.` })
        return resetGame(ctx)
      }

      await postMessage({ room, message: `${tag} ⏰ Betting closed. Dealing...` })
      await startGame(ctx)
    })
  }, BETTING_TIMEOUT_DURATION)
}

// ────────────────────────────────────────────────────────────────
// Join/Leave/Bet
// ────────────────────────────────────────────────────────────────
async function joinTable (userUUID, _nickname, ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)

    // If totally idle, automatically open the lobby so handler needn't call it
    if (state.phase === 'idle') await openLobby(ctx)

    if (!state.canJoinTable || state.phase !== 'lobby') {
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, the round already started. Please wait for the next one.` })
    }

    if (!state.tableUsers.includes(userUUID)) {
      state.tableUsers.push(userUUID)
      state.playerBets[userUUID] = 0
      state.userNicknames[userUUID] = mention(userUUID)
      await postMessage({ room, message: `${tag} 🪑 ${mention(userUUID)} joined the blackjack table.` })
      await postMessage({ room, message: `${tag} ${getPlayerListMessage(state)}` })
    } else {
      await postMessage({ room, message: `${tag} ${mention(userUUID)} is already at the table.` })
    }
  })
}

async function leaveTable (userUUID, ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    const index = state.tableUsers.indexOf(userUUID)
    if (index !== -1) {
      state.tableUsers.splice(index, 1)
      delete state.playerBets[userUUID]
      delete state.playerHands[userUUID]
      delete state.userNicknames[userUUID]
      delete state.splitHands[userUUID]
      delete state.splitIndex[userUUID]
      state.doubledDown.delete(userUUID)
      state.surrendered.delete(userUUID)
      state.naturalBlackjackPaid.delete(userUUID)
      await postMessage({ room, message: `${tag} 🧭 ${mention(userUUID)} left the table.` })

      // If lobby becomes empty, auto-close
      if (state.phase === 'lobby' && state.tableUsers.length === 0) {
        await postMessage({ room, message: `${tag} No players remain. Lobby closed.` })
        return resetGame(ctx)
      }

      // If in betting and everyone remaining already bet → start early
      if (state.phase === 'betting' && state.tableUsers.length > 0 && allPlayersHaveBet(state)) {
        clearTimeout(state.bettingTimeout); state.bettingTimeout = null
        clearTimeout(state.nudgeTimeout); state.nudgeTimeout = null
        await postMessage({ room, message: `${tag} All bets in. Dealing now!` })
        await startGame(ctx)
      }
    }
  })
}

async function handleBlackjackBet (userUUID, betAmount, _nickname, ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)

    if (state.phase === 'idle') {
      await openLobby(ctx)
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, betting is not open yet. Please wait for betting to start.` })
    }
    if (state.phase !== 'betting') {
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, betting is closed for this round.` })
    }
    if (!state.tableUsers.includes(userUUID)) {
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, only seated players can bet (join during the lobby).` })
    }

    const balance = await getUserWallet(userUUID)
    if ((state.playerBets[userUUID] ?? 0) > 0) {
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, you've already placed a bet.` })
    }
    if (!Number.isFinite(betAmount) || betAmount <= 0) {
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, please enter a valid bet amount.` })
    }
    if (balance < betAmount) {
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, not enough funds to bet $${betAmount}.` })
    }

    await removeFromUserWallet(userUUID, betAmount)
    state.playerBets[userUUID] = betAmount
    state.userNicknames[userUUID] = mention(userUUID)

    await postMessage({ room, message: `${tag} 💵 ${mention(userUUID)} placed a bet of $${betAmount}.` })

    // Early start if everybody has bet
    if (allPlayersHaveBet(state)) {
      clearTimeout(state.bettingTimeout); state.bettingTimeout = null
      clearTimeout(state.nudgeTimeout); state.nudgeTimeout = null
      await postMessage({ room, message: `${tag} All bets in. Dealing now!` })
      await startGame(ctx)
    }
  })
}

// ────────────────────────────────────────────────────────────────
// Game engine: deal, actions, dealer, settle
// ────────────────────────────────────────────────────────────────
async function startGame (ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    if (state.phase !== 'betting') return
    clearTimeout(state.bettingTimeout); state.bettingTimeout = null
    clearTimeout(state.nudgeTimeout); state.nudgeTimeout = null

    state.phase = 'playing'
    state.active = true
    state.canJoinTable = false

    state.deck = createDeck()
    shuffleDeck(state.deck)
    state.dealerHand = [state.deck.pop(), state.deck.pop()]

    await postMessage({ room, message: `${tag} 🃏 Dealing cards...` })
    await delay(800)

    // Deal to players
    for (const user of state.tableUsers) {
      const hand = [state.deck.pop(), state.deck.pop()]
      state.playerHands[user] = hand

      await postMessage({ room, message: `${tag} ${mention(user)}'s hand: ${formatHandWithValue(hand)}` })

      if (calculateHandValue(hand) === 21) {
        const payout = Math.floor(state.playerBets[user] * 2.5) // blackjack 3:2 (returns total 2.5x)
        await addToUserWallet(user, payout)
        await postMessage({ room, message: `${tag} 🎉 ${mention(user)} has a natural blackjack! (+$${payout})` })
        state.naturalBlackjackPaid.add(user)
      }
    }

    state.currentPlayerIndex = 0
    await postMessage({ room, message: `${tag} Dealer's visible card: ${getCardEmoji(state.dealerHand[0])}` })
    await promptPlayerTurn(ctx)
  })
}

async function promptPlayerTurn (ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    if (state.phase !== 'playing') return

    // Skip paid/empty hands
    while (
      state.currentPlayerIndex < state.tableUsers.length &&
      (state.naturalBlackjackPaid.has(state.tableUsers[state.currentPlayerIndex]) ||
       !state.playerHands[state.tableUsers[state.currentPlayerIndex]])
    ) {
      state.currentPlayerIndex++
    }

    if (state.currentPlayerIndex >= state.tableUsers.length) {
      return playDealerTurn(ctx)
    }

    const user = state.tableUsers[state.currentPlayerIndex]
    const hand = state.playerHands[user]
    state.awaitingInput = true

    await postMessage({
      room,
      message: `${tag} 🎯 It's your turn, ${mention(user)}!\n${formatHandWithValue(hand)}\n\nType /hit, /stand, /double, /surrender, or /split`
    })

    clearTimeout(state.turnTimeout)
    state.turnTimeout = setTimeout(async () => {
      await withLock(ctx, async () => {
        const st = getState(ctx)
        if (st.tableUsers[st.currentPlayerIndex] !== user) return
        await postMessage({ room, message: `${tag} 😴 ${mention(user)} took too long. Auto-standing.` })
        await handleStand(user, mention(user), ctx)
      })
    }, PLAYER_DECISION_TIMEOUT)
  })
}

function validateTurn (state, userUUID, _nickname, room, tag) {
  if (state.phase !== 'playing') {
    postMessage({ room, message: `${tag} ${mention(userUUID)}, no active turn right now.` })
    return false
  }
  if (state.tableUsers[state.currentPlayerIndex] !== userUUID) {
    postMessage({ room, message: `${tag} ⛔ It's not your turn, ${mention(userUUID)}.` })
    return false
  }
  return true
}

async function handleHit (userUUID, nickname, ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    if (!validateTurn(state, userUUID, nickname, room, tag)) return
    if (!state.deck.length) return endGameDueToDeck(ctx)

    const newCard = state.deck.pop()
    state.playerHands[userUUID].push(newCard)
    const value = calculateHandValue(state.playerHands[userUUID])

    await postMessage({ room, message: `${tag} ${mention(userUUID)} hits: ${getCardEmoji(newCard)}. Total: ${value}` })

    if (value > 21) {
      await postMessage({ room, message: `${tag} 💥 ${mention(userUUID)} busted!` })
      clearTimeout(state.turnTimeout)
      await handleStand(userUUID, nickname, ctx)
    } else if (value === 21) {
      await postMessage({ room, message: `${tag} 🎯 ${mention(userUUID)}, you hit 21! Auto-standing.` })
      clearTimeout(state.turnTimeout)
      await handleStand(userUUID, nickname, ctx)
    }
  })
}

async function handleStand (userUUID, nickname, ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    if (!validateTurn(state, userUUID, nickname, room, tag)) return

    await postMessage({
      room,
      message: `${tag} 🛑 ${mention(userUUID)} stands at ${calculateHandValue(state.playerHands[userUUID])}.`
    })

    clearTimeout(state.turnTimeout)

    if (state.splitHands[userUUID]) {
      const currentIndex = state.splitIndex[userUUID] || 0
      if (currentIndex === 0) {
        state.splitIndex[userUUID] = 1
        state.playerHands[userUUID] = state.splitHands[userUUID][1]
        await postMessage({ room, message: `${tag} ${mention(userUUID)}, now playing your second hand:` })
        await postMessage({ room, message: `${tag} ${formatHandWithValue(state.playerHands[userUUID])}` })
        return promptPlayerTurn(ctx)
      }
    }

    await handleNextPlayer(ctx)
  })
}

async function handleSurrender (userUUID, nickname, ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    if (!validateTurn(state, userUUID, nickname, room, tag)) return

    const refund = Math.floor(state.playerBets[userUUID] / 2)
    await addToUserWallet(userUUID, refund)
    state.surrendered.add(userUUID)

    await postMessage({ room, message: `${tag} 🏳️ ${mention(userUUID)} surrendered and got $${refund} back.` })
    clearTimeout(state.turnTimeout)
    await handleNextPlayer(ctx)
  })
}

async function handleDouble (userUUID, nickname, ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    if (!validateTurn(state, userUUID, nickname, room, tag)) return
    if (state.playerHands[userUUID].length !== 2) {
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, you can only double on your first turn.` })
    }

    const extraBet = state.playerBets[userUUID]
    const balance = await getUserWallet(userUUID)
    if (balance < extraBet) {
      return postMessage({ room, message: `${tag} ${mention(userUUID)}, not enough balance to double.` })
    }

    await removeFromUserWallet(userUUID, extraBet)
    state.playerBets[userUUID] *= 2
    state.doubledDown.add(userUUID)

    await postMessage({ room, message: `${tag} ${mention(userUUID)} doubled down!` })
    await handleHit(userUUID, nickname, ctx)
    clearTimeout(state.turnTimeout)
    await handleStand(userUUID, nickname, ctx)
  })
}

async function handleNextPlayer (ctx) {
  return withLock(ctx, async () => {
    const state = getState(ctx)
    state.awaitingInput = false
    state.currentPlayerIndex++
    if (state.currentPlayerIndex < state.tableUsers.length) {
      await promptPlayerTurn(ctx)
    } else {
      await playDealerTurn(ctx)
    }
  })
}

async function playDealerTurn (ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)
    state.phase = 'settling'
    await postMessage({ room, message: `${tag} 🃍 Dealer's turn.` })

    while (calculateHandValue(state.dealerHand) < 17 && state.deck.length) {
      state.dealerHand.push(state.deck.pop())
      await postMessage({ room, message: `${tag} Dealer hits: ${formatHandWithValue(state.dealerHand)}` })
    }

    await postMessage({ room, message: `${tag} 🃏 Dealer stands: ${formatHandWithValue(state.dealerHand)}` })

    const dealerValue = calculateHandValue(state.dealerHand)

    for (const user of state.tableUsers) {
      const bet = state.playerBets[user]

      if (state.naturalBlackjackPaid.has(user)) continue // already settled
      if (state.surrendered.has(user)) continue          // refunded half

      const hands = state.splitHands[user] || [state.playerHands[user]]

      for (let i = 0; i < hands.length; i++) {
        const hand = hands[i]
        const playerValue = calculateHandValue(hand)
        const handLabel = hands.length > 1 ? ` (Hand ${i + 1})` : ''

        if (playerValue > 21) {
          await postMessage({ room, message: `${tag} 💀 ${mention(user)}${handLabel} busted and lost $${bet}.` })
        } else if (dealerValue > 21 || playerValue > dealerValue) {
          const payout = bet * 2
          await addToUserWallet(user, payout)
          await postMessage({ room, message: `${tag} 🎉 ${mention(user)}${handLabel} wins! (+$${payout})` })
        } else if (playerValue === dealerValue) {
          await addToUserWallet(user, bet)
          await postMessage({ room, message: `${tag} 🤝 ${mention(user)}${handLabel} ties. Bet returned: $${bet}.` })
        } else {
          await postMessage({ room, message: `${tag} ❌ ${mention(user)}${handLabel} lost to dealer. (-$${bet})` })
        }
      }
    }

    resetGame(ctx)
  })
}

function endGameDueToDeck (ctx) {
  const { room, tag } = getCtx(ctx)
  postMessage({ room, message: `${tag} 🛑 Deck exhausted. Ending game.` })
  resetGame(ctx)
}

function resetGame (ctx) {
  const state = getState(ctx)
  clearTimeout(state.lobbyTimeout); state.lobbyTimeout = null
  clearTimeout(state.bettingTimeout); state.bettingTimeout = null
  clearTimeout(state.nudgeTimeout); state.nudgeTimeout = null
  clearTimeout(state.turnTimeout); state.turnTimeout = null

  Object.assign(state, createState())
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────
function getFullTableView (ctx) {
  const { tag } = getCtx(ctx)
  const state = getState(ctx)
  return `${tag} ${getFullTableViewInternal(state)}`
}

// --- helpers to READ/QUERY state without exposing internals ---
export function getPhase(ctx) {
  return getState(ctx).phase;
}
export function getPlayerHand(userUUID, ctx) {
  return getState(ctx).playerHands[userUUID] || null;
}
export function hasOpenBetting(ctx) {
  return getState(ctx).phase === 'betting';
}
export function isPlayersTurn(userUUID, ctx) {
  const st = getState(ctx);
  return st.phase === 'playing' && st.tableUsers[st.currentPlayerIndex] === userUUID;
}
export function isSeated(userUUID, ctx) {
  return getState(ctx).tableUsers.includes(userUUID);
}

export async function handleSplit (userUUID, _nickname, ctx) {
  return withLock(ctx, async () => {
    const { room, tag } = getCtx(ctx)
    const state = getState(ctx)

    if (state.phase !== 'playing' && state.phase !== 'betting') {
      await postMessage({ room, message: `${tag} ${mention(userUUID)}, no active round to split.` })
      return
    }
    if (!state.tableUsers.includes(userUUID)) {
      await postMessage({ room, message: `${tag} You must join the blackjack table first using /join.` })
      return
    }
    const hand = state.playerHands[userUUID]
    if (!hand || !canSplitHand(hand)) {
      await postMessage({ room, message: `${tag} ${mention(userUUID)}, you can only split if you have two cards of the same value.` })
      return
    }

    const extraBet = state.playerBets[userUUID]
    const balance = await getUserWallet(userUUID)
    if (balance < extraBet) {
      await postMessage({ room, message: `${tag} ${mention(userUUID)}, you don't have enough money to split (requires another $${extraBet}).` })
      return
    }

    await removeFromUserWallet(userUUID, extraBet)

    const card1 = hand[0]
    const card2 = hand[1]

    if (state.deck.length < 2) {
      await postMessage({ room, message: `${tag} Not enough cards left in the deck to complete a split.` })
      return
    }

    const newHand1 = [card1, state.deck.pop()]
    const newHand2 = [card2, state.deck.pop()]

    state.splitHands[userUUID] = [newHand1, newHand2]
    state.splitIndex[userUUID] = 0

    state.playerHands[userUUID] = newHand1

    await postMessage({ room, message: `${tag} ✂️ ${mention(userUUID)} splits their hand!` })
    await postMessage({ room, message: `${tag} First hand: ${formatHandWithValue(newHand1)}` })
    await postMessage({ room, message: `${tag} Second hand (queued): ${formatHandWithValue(newHand2)}` })

    // Force it to be this player's turn if not already
    const i = state.tableUsers.indexOf(userUUID)
    if (i >= 0) state.currentPlayerIndex = i
  })
}

export {
  // flows
  openBetting,      // back-compat: triggers lobby
  // core actions/queries
  joinTable,
  leaveTable,
  handleBlackjackBet,
  handleHit,
  handleStand,
  handleSurrender,
  handleDouble,
  getFullTableView,
}
