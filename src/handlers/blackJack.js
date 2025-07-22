import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../libs/walletManager.js'
import { postMessage } from '../libs/Cometchat/messageSender.js'

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
  turnTimeout: null
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createDeck() {
  const suits = ['♠', '♥', '♦', '♣']
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
  const deck = []
  for (const suit of suits) {
    for (const value of values) {
      deck.push({ value, suit })
    }
  }
  return deck
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
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
  const list = gameState.tableUsers.map((uuid, i) => {
    const name = gameState.userNicknames[uuid] || uuid
    return `${i + 1}. ${name}`
  }).join('\n')
  return `🃏 Blackjack Table:\n${list}`
}

function allPlayersHaveBet() {
  return gameState.tableUsers.every(user => gameState.playerBets[user] > 0)
}

async function joinTable(userUUID, nickname) {
  const room = process.env.ROOM_UUID

  if (!gameState.canJoinTable) {
    await postMessage({ room, message: `${nickname}, the game has already started.` })
    return
  }

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

  if (balance < betAmount) {
    await postMessage({ room, message: `${nickname}, you don’t have enough money to bet $${betAmount}.` })
    return
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
        if (!gameState.playerBets[user]) {
          await leaveTable(user)
        }
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
  await delay(2000)

  for (const user of gameState.tableUsers) {
    gameState.playerHands[user] = [gameState.deck.pop(), gameState.deck.pop()]
    const nickname = gameState.userNicknames[user] || user
    const value = calculateHandValue(gameState.playerHands[user])

    await postMessage({ room, message: `${nickname}'s hand: ${formatHandWithValue(gameState.playerHands[user])}` })

    if (value === 21) {
      await postMessage({ room, message: `🎉 ${nickname} has a natural blackjack!` })
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
  const hand = gameState.playerHands[user]

  await postMessage({
    room,
    message: `🎯 It's your turn, ${nickname}!\nYour hand: ${formatHandWithValue(hand)}\nType /hit or /stand`
  })

  gameState.turnTimeout = setTimeout(async () => {
    await postMessage({ room, message: `😴 ${nickname} took too long. Auto-standing.` })
    await handleStand(user, nickname)
  }, PLAYER_DECISION_TIMEOUT)
}

async function handleHit(userUUID, nickname) {
  const room = process.env.ROOM_UUID

  if (gameState.tableUsers[gameState.currentPlayerIndex] !== userUUID) {
    await postMessage({ room, message: `It's not your turn, ${nickname}.` })
    return
  }

  if (!gameState.deck.length) {
    await postMessage({ room, message: `Deck is empty! Ending game.` })
    resetGame()
    return
  }

  const newCard = gameState.deck.pop()
  gameState.playerHands[userUUID].push(newCard)
  const value = calculateHandValue(gameState.playerHands[userUUID])

  await postMessage({ room, message: `${nickname} hits: ${getCardEmoji(newCard)}. Total: ${value}` })

  if (value > 21) {
    await postMessage({ room, message: `💥 ${nickname} busted!` })
    clearTimeout(gameState.turnTimeout)
    await handleNextPlayer()
  } else if (value === 21) {
    await postMessage({ room, message: `🎯 ${nickname}, you hit 21! Standing automatically.` })
    clearTimeout(gameState.turnTimeout)
    await handleStand(userUUID, nickname)
  }
}

async function handleStand(userUUID, nickname) {
  const room = process.env.ROOM_UUID

  if (gameState.tableUsers[gameState.currentPlayerIndex] !== userUUID) {
    await postMessage({ room, message: `It's not your turn, ${nickname}.` })
    return
  }

  await postMessage({ room, message: `🛑 ${nickname} stands at ${calculateHandValue(gameState.playerHands[userUUID])}.` })
  clearTimeout(gameState.turnTimeout)
  await handleNextPlayer()
}

async function handleNextPlayer() {
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

  while (calculateHandValue(gameState.dealerHand) < 17) {
    if (!gameState.deck.length) break
    gameState.dealerHand.push(gameState.deck.pop())
    await postMessage({ room, message: `Dealer hits: ${formatHandWithValue(gameState.dealerHand)}` })
  }

  const dealerValue = calculateHandValue(gameState.dealerHand)
  await postMessage({ room, message: `🃏 Dealer's final: ${formatHandWithValue(gameState.dealerHand)}` })

  for (const user of gameState.tableUsers) {
    const nickname = gameState.userNicknames[user] || user
    const playerValue = calculateHandValue(gameState.playerHands[user])
    const bet = gameState.playerBets[user]

    if (playerValue > 21) {
      await postMessage({ room, message: `💀 ${nickname} busted and lost $${bet}.` })
    } else if (dealerValue > 21 || playerValue > dealerValue) {
      const payout = bet * 2
      await addToUserWallet(user, payout)
      await postMessage({ room, message: `🎉 ${nickname} wins with ${playerValue} vs Dealer's ${dealerValue}! (+$${payout})` })
    } else if (playerValue === dealerValue) {
      await addToUserWallet(user, bet)
      await postMessage({ room, message: `🤝 ${nickname} ties with the dealer. Bet returned: $${bet}.` })
    } else {
      await postMessage({ room, message: `❌ ${nickname} loses with ${playerValue} vs Dealer's ${dealerValue}. (-$${bet})` })
    }
  }

  resetGame()
}

function resetGame() {
  gameState.tableUsers = []
  gameState.active = false
  gameState.playerBets = {}
  gameState.playerHands = {}
  gameState.dealerHand = []
  gameState.deck = []
  gameState.currentPlayerIndex = 0
  gameState.canJoinTable = true
  gameState.bettingTimeout = null
  gameState.turnTimeout = null
}

export {
  joinTable,
  leaveTable,
  handleBlackjackBet,
  handleHit,
  handleStand
}
