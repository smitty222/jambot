import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../database/dbwalletmanager.js'
import { postMessage } from '../libs/cometchat.js'

const BETTING_TIMEOUT_DURATION = 30000
const PLAYER_DECISION_TIMEOUT = 30000

export const gameState = {
  tableUsers: [],
  active: false,
  playerBets: {},
  playerHands: {},
  dealerHand: [],
  deck: [],
  currentPlayerIndex: 0,
  canJoinTable: true,
  userNicknames: {},
  bettingTimeout: null,
  turnTimeout: null,
  awaitingInput: false,
  stats: {},
  doubledDown: new Set(),
  surrendered: new Set(),
  splitHands: {},
  splitIndex: {}
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣']
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
  return suits.flatMap(suit => values.map(value => ({ value, suit })))
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
}

function getCardValue(card) {
  if (['J', 'Q', 'K'].includes(card.value)) return 10
  if (card.value === 'A') return 11
  return parseInt(card.value)
}

export function canSplitHand(hand) {
  return hand.length === 2 && getCardValue(hand[0]) === getCardValue(hand[1])
}

function calculateHandValue(hand) {
  let value = 0
  let aceCount = 0
  for (const card of hand) {
    if (['J', 'Q', 'K'].includes(card.value)) value += 10
    else if (card.value === 'A') {
      value += 11
      aceCount++
    } else {
      value += parseInt(card.value)
    }
  }
  while (value > 21 && aceCount > 0) {
    value -= 10
    aceCount--
  }
  return value
}

function getCardEmoji(card) {
  const suitEmojis = {
    '♠': '♠️',
    '♥': '♥️',
    '♦': '♦️',
    '♣': '♣️'
  }
  return `[${card.value}${suitEmojis[card.suit] || card.suit}]`
}

function formatHand(hand) {
  return hand.map(getCardEmoji).join(' ')
}

function formatHandWithValue(hand) {
  return `${formatHand(hand)} (Total: ${calculateHandValue(hand)})`
}

function getPlayerListMessage() {
  if (gameState.tableUsers.length === 0) return '🪑 No one at the table yet.'
  return `🃏 Blackjack Table:\n` +
    gameState.tableUsers.map((uuid, i) => `${i + 1}. ${gameState.userNicknames[uuid] || uuid}`).join('\n')
}

function getFullTableView() {
  return gameState.tableUsers.map(uuid => {
    const name = gameState.userNicknames[uuid]
    const bet = gameState.playerBets[uuid] || 0
    const hand = gameState.playerHands[uuid]
    const status = hand ? formatHandWithValue(hand) : '(Not dealt)'
    return `🎲 ${name} - Bet: $${bet} - ${status}`
  }).join('\n')
}

function allPlayersHaveBet() {
  return gameState.tableUsers.every(user => gameState.playerBets[user] > 0)
}

async function joinTable(userUUID, nickname) {
  const room = process.env.ROOM_UUID
  if (!gameState.canJoinTable) return postMessage({ room, message: `${nickname}, the game has already started.` })

  if (!gameState.tableUsers.includes(userUUID)) {
    gameState.tableUsers.push(userUUID)
    gameState.playerBets[userUUID] = 0
    gameState.userNicknames[userUUID] = nickname
    await postMessage({ room, message: `${nickname} has joined the blackjack table.` })
    await postMessage({ room, message: getPlayerListMessage() })
  } else {
    await postMessage({ room, message: `${nickname} is already at the table.` })
  }
}

async function leaveTable(userUUID) {
  const room = process.env.ROOM_UUID
  const index = gameState.tableUsers.indexOf(userUUID)
  if (index !== -1) {
    const nickname = gameState.userNicknames[userUUID] || userUUID
    gameState.tableUsers.splice(index, 1)
    delete gameState.playerBets[userUUID]
    delete gameState.playerHands[userUUID]
    delete gameState.userNicknames[userUUID]
    await postMessage({ room, message: `${nickname} has left the blackjack table.` })
  }
}

async function handleBlackjackBet(userUUID, betAmount, nickname) {
  const room = process.env.ROOM_UUID
  const balance = await getUserWallet(userUUID)
  if (gameState.playerBets[userUUID] > 0) {
    return postMessage({ room, message: `${nickname}, you've already placed a bet.` })
  }
  if (balance < betAmount) {
    return postMessage({ room, message: `${nickname}, not enough funds to bet $${betAmount}.` })
  }

  await removeFromUserWallet(userUUID, betAmount)
  gameState.playerBets[userUUID] = betAmount
  gameState.userNicknames[userUUID] = nickname

  await postMessage({ room, message: `${nickname} placed a bet of $${betAmount}.` })

  if (allPlayersHaveBet()) {
    clearTimeout(gameState.bettingTimeout)
    await startGame()
  } else if (!gameState.bettingTimeout) {
    gameState.bettingTimeout = setTimeout(async () => {
      for (const user of [...gameState.tableUsers]) {
        if (!gameState.playerBets[user]) await leaveTable(user)
      }
      await postMessage({ room, message: `Time's up! Starting with remaining players.` })
      await startGame()
    }, BETTING_TIMEOUT_DURATION)
  }
}

async function startGame() {
  const room = process.env.ROOM_UUID
  gameState.deck = createDeck()
  shuffleDeck(gameState.deck)
  gameState.dealerHand = [gameState.deck.pop(), gameState.deck.pop()]

  await postMessage({ room, message: `🃏 Dealing cards...` })
  await delay(1500)

  for (const user of gameState.tableUsers) {
    const hand = [gameState.deck.pop(), gameState.deck.pop()]
    const nickname = gameState.userNicknames[user]
    gameState.playerHands[user] = hand

    await postMessage({ room, message: `${nickname}'s hand: ${formatHandWithValue(hand)}` })

    if (calculateHandValue(hand) === 21) {
      const payout = Math.floor(gameState.playerBets[user] * 2.5)
      await addToUserWallet(user, payout)
      await postMessage({ room, message: `🎉 ${nickname} has a natural blackjack! (+$${payout})` })
      gameState.surrendered.add(user)
    }
  }

  gameState.active = true
  gameState.currentPlayerIndex = 0
  await postMessage({ room, message: `Dealer's visible card: ${getCardEmoji(gameState.dealerHand[0])}` })
  await promptPlayerTurn()
}

async function promptPlayerTurn() {
  const room = process.env.ROOM_UUID
  const user = gameState.tableUsers[gameState.currentPlayerIndex]
  const nickname = gameState.userNicknames[user] || user

  if (gameState.surrendered.has(user)) return handleNextPlayer()

  const hand = gameState.playerHands[user]
  gameState.awaitingInput = true

  await postMessage({
    room,
    message: `🎯 It's your turn, ${nickname}!\n${formatHandWithValue(hand)}\n\nType /hit, /stand, /double, /surrender, or /split`
  })

  gameState.turnTimeout = setTimeout(async () => {
    await postMessage({ room, message: `😴 ${nickname} took too long. Auto-standing.` })
    await handleStand(user, nickname)
  }, PLAYER_DECISION_TIMEOUT)
}

async function handleHit(userUUID, nickname) {
  if (!validateTurn(userUUID, nickname)) return
  if (!gameState.deck.length) return endGameDueToDeck()

  const newCard = gameState.deck.pop()
  gameState.playerHands[userUUID].push(newCard)
  const value = calculateHandValue(gameState.playerHands[userUUID])

  await postMessage({ room: process.env.ROOM_UUID, message: `${nickname} hits: ${getCardEmoji(newCard)}. Total: ${value}` })

  if (value > 21) {
    await postMessage({ room: process.env.ROOM_UUID, message: `💥 ${nickname} busted!` })
    clearTimeout(gameState.turnTimeout)
    await handleStand(userUUID, nickname)
  } else if (value === 21) {
    await postMessage({ room: process.env.ROOM_UUID, message: `🎯 ${nickname}, you hit 21! Auto-standing.` })
    clearTimeout(gameState.turnTimeout)
    await handleStand(userUUID, nickname)
  }
}

async function handleStand(userUUID, nickname) {
  if (!validateTurn(userUUID, nickname)) return

  await postMessage({
    room: process.env.ROOM_UUID,
    message: `🛑 ${nickname} stands at ${calculateHandValue(gameState.playerHands[userUUID])}.`
  })

  clearTimeout(gameState.turnTimeout)

  if (gameState.splitHands[userUUID]) {
    const currentIndex = gameState.splitIndex[userUUID] || 0
    if (currentIndex === 0) {
      gameState.splitIndex[userUUID] = 1
      gameState.playerHands[userUUID] = gameState.splitHands[userUUID][1]
      await postMessage({ room: process.env.ROOM_UUID, message: `${nickname}, now playing your second hand:` })
      await postMessage({ room: process.env.ROOM_UUID, message: formatHandWithValue(gameState.playerHands[userUUID]) })
      return promptPlayerTurn()
    }
  }

  await handleNextPlayer()
}

async function handleSurrender(userUUID, nickname) {
  if (!validateTurn(userUUID, nickname)) return

  const refund = Math.floor(gameState.playerBets[userUUID] / 2)
  await addToUserWallet(userUUID, refund)
  gameState.surrendered.add(userUUID)

  await postMessage({ room: process.env.ROOM_UUID, message: `🏳️ ${nickname} surrendered and got $${refund} back.` })
  clearTimeout(gameState.turnTimeout)
  await handleNextPlayer()
}

async function handleDouble(userUUID, nickname) {
  if (!validateTurn(userUUID, nickname)) return
  if (gameState.playerHands[userUUID].length !== 2) return postMessage({ room: process.env.ROOM_UUID, message: `${nickname}, you can only double on your first turn.` })

  const extraBet = gameState.playerBets[userUUID]
  const balance = await getUserWallet(userUUID)
  if (balance < extraBet) return postMessage({ room: process.env.ROOM_UUID, message: `${nickname}, not enough balance to double.` })

  await removeFromUserWallet(userUUID, extraBet)
  gameState.playerBets[userUUID] *= 2
  gameState.doubledDown.add(userUUID)

  await postMessage({ room: process.env.ROOM_UUID, message: `${nickname} doubled down!` })
  await handleHit(userUUID, nickname)
  clearTimeout(gameState.turnTimeout)
  await handleStand(userUUID, nickname)
}

function validateTurn(userUUID, nickname) {
  if (gameState.tableUsers[gameState.currentPlayerIndex] !== userUUID) {
    postMessage({ room: process.env.ROOM_UUID, message: `⛔ It's not your turn, ${nickname}.` })
    return false
  }
  return true
}

async function handleNextPlayer() {
  gameState.awaitingInput = false
  gameState.currentPlayerIndex++
  if (gameState.currentPlayerIndex < gameState.tableUsers.length) {
    await promptPlayerTurn()
  } else {
    await playDealerTurn()
  }
}

async function playDealerTurn() {
  const room = process.env.ROOM_UUID
  await postMessage({ room, message: `🃍 Dealer's turn.` })

  while (calculateHandValue(gameState.dealerHand) < 17 && gameState.deck.length) {
    gameState.dealerHand.push(gameState.deck.pop())
    await postMessage({ room, message: `Dealer hits: ${formatHandWithValue(gameState.dealerHand)}` })
  }

  const dealerValue = calculateHandValue(gameState.dealerHand)
  await postMessage({ room, message: `🃏 Dealer stands: ${formatHandWithValue(gameState.dealerHand)}` })

  for (const user of gameState.tableUsers) {
    const nickname = gameState.userNicknames[user]
    const bet = gameState.playerBets[user]

    if (gameState.surrendered.has(user)) continue

    const hands = gameState.splitHands[user] || [gameState.playerHands[user]]

    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i]
      const playerValue = calculateHandValue(hand)
      const handLabel = hands.length > 1 ? ` (Hand ${i + 1})` : ''

      if (playerValue > 21) {
        await postMessage({ room, message: `💀 ${nickname}${handLabel} busted and lost $${bet}.` })
      } else if (dealerValue > 21 || playerValue > dealerValue) {
        const payout = bet * 2
        await addToUserWallet(user, payout)
        await postMessage({ room, message: `🎉 ${nickname}${handLabel} wins! (+$${payout})` })
      } else if (playerValue === dealerValue) {
        await addToUserWallet(user, bet)
        await postMessage({ room, message: `🤝 ${nickname}${handLabel} ties. Bet returned: $${bet}.` })
      } else {
        await postMessage({ room, message: `❌ ${nickname}${handLabel} lost to dealer. (-$${bet})` })
      }
    }
  }

  resetGame()
}

function endGameDueToDeck() {
  postMessage({ room: process.env.ROOM_UUID, message: '🛑 Deck exhausted. Ending game.' })
  resetGame()
}

function resetGame() {
  Object.assign(gameState, {
    tableUsers: [],
    active: false,
    playerBets: {},
    playerHands: {},
    dealerHand: [],
    deck: [],
    currentPlayerIndex: 0,
    canJoinTable: true,
    bettingTimeout: null,
    turnTimeout: null,
    awaitingInput: false,
    doubledDown: new Set(),
    surrendered: new Set(),
    splitHands: {},
    splitIndex: {}
  })
}

export {
  joinTable,
  leaveTable,
  handleBlackjackBet,
  handleHit,
  handleStand,
  handleSurrender,
  handleDouble,
  getFullTableView
}
