import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../libs/walletManager.js' // Adjust the path as needed
import { postMessage } from '../libs/cometchat.js'

let tableUsers = []
let blackjackGameActive = false // Track if the blackjack game is active
let playerBets = {} // Track bets for each player
let playerHands = {} // Track player hands
let dealerHand = [] // Track dealer hand
let deck = []
let currentPlayerIndex = 0 // Track current player's turn
const userNicknames = {} // Object to map UUIDs to nicknames
let canJoinTable = true // Flag to track if users can join
let bettingTimeout // To track the betting timeout
const BETTING_TIMEOUT_DURATION = 30000 // 30 seconds

function preventFurtherJoins () {
  canJoinTable = false // Set the flag to false to prevent further joins
}
function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getBlackjackGameActive () {
  return blackjackGameActive
}

// Set the value of blackjackGameActive
function setBlackjackGameActive (value) {
  blackjackGameActive = value
}

// Function to create a standard deck of cards
function createDeck () {
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

// Function to shuffle the deck
function shuffleDeck (deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]]
  }
}

// Function to calculate the value of a hand
function calculateHandValue (hand) {
  let value = 0
  let aceCount = 0
  for (const card of hand) {
    if (['J', 'Q', 'K'].includes(card.value)) {
      value += 10
    } else if (card.value === 'A') {
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

// Function to add a user to the blackjack table
async function joinTable (userUUID, nickname) {
  const room = process.env.ROOM_UUID

  if (!canJoinTable) {
    await postMessage({ room, message: `${nickname}, the game has already started. Please wait until the round ends` })
    return // Prevent joining if the game has started
  }

  // Store the nickname in userNicknames
  userNicknames[userUUID] = nickname // Map UUID to the nickname

  if (!tableUsers.includes(userUUID)) {
    tableUsers.push(userUUID)
    playerBets[userUUID] = 0 // Initialize player's bet
    console.log(`User ${userUUID} (${nickname}) has joined the table.`)
    await postMessage({ room, message: `${nickname} has joined the blackjack table.` })
  } else {
    await postMessage({ room, message: `${nickname} is already at the table.` })
  }
}

// Function to remove a user from the blackjack table
async function leaveTable (userUUID) {
  const room = process.env.ROOM_UUID
  const index = tableUsers.indexOf(userUUID)
  if (index !== -1) {
    tableUsers.splice(index, 1)
    delete playerBets[userUUID]
    delete playerHands[userUUID]
    console.log(`User ${userUUID} has left the table.`)
    await postMessage({ room, message: `User ${userUUID} has left the blackjack table.` })
  } else {
    await postMessage({ room, message: `User ${userUUID} is not at the table.` })
  }
}

// Function to handle placing bets
async function handleBlackjackBet (userUUID, betAmount, nickname) {
  const room = process.env.ROOM_UUID

  // Get the user's current wallet balance
  const userWallet = await getUserWallet(userUUID)
  const userBalance = userWallet ? userWallet.balance : 0

  console.log(`User ${nickname} balance before bet: $${userBalance}`)

  // Store the bet for the player (already validated in /bet)
  playerBets[userUUID] = betAmount
  console.log(`User ${nickname} placed a bet of $${betAmount}.`)

  // Notify the room of the user's bet
  await postMessage({ room, message: `${nickname} placed a bet of $${betAmount}.` })

  // Check if all players have placed their bets
  if (allPlayersHaveBet()) {
    clearTimeout(bettingTimeout) // Cancel the timeout if all bets are in
    await startGame()
  } else {
    // Notify that we are waiting for other players
    await postMessage({
      room,
      message: 'Waiting for other players to place their bets...'
    })

    // Start a betting timeout if not already started
    if (!bettingTimeout) {
      bettingTimeout = setTimeout(async () => {
        // Remove players who haven't placed bets
        for (const user of tableUsers) {
          if (!playerBets[user]) {
            console.log(`User ${user} did not place a bet and will be removed.`)
            await leaveTable(user)
          }
        }

        // Start the game with remaining players
        await postMessage({ room, message: 'Time\'s up! Starting the game with current bets.' })
        await startGame()
      }, BETTING_TIMEOUT_DURATION)
    }
  }
}

function allPlayersHaveBet () {
  return tableUsers.every(user => playerBets[user] > 0)
}

async function startGame () {
  const room = process.env.ROOM_UUID
  deck = createDeck()
  shuffleDeck(deck)

  dealerHand = [deck.pop(), deck.pop()]
  console.log(`Dealer's hand: ${dealerHand[0].value}${dealerHand[0].suit} ?`)

  await postMessage({
    room,
    message: 'Dealing Cards...'
  })
  await delay(2000)

  for (const user of tableUsers) {
    playerHands[user] = [deck.pop(), deck.pop()]

    // Get the user's nickname
    const nickname = userNicknames[user] || user

    await postMessage({
      room,
      message: `Player's hand for ${nickname}: ${playerHands[user].map(card => `${card.value}${card.suit}`).join(' ')} (Value: ${calculateHandValue(playerHands[user])})`
    })
  }

  blackjackGameActive = true
  await postMessage({ room, message: `Dealer's hand: ${dealerHand[0].value}${dealerHand[0].suit} ?` })

  // Start with the first player
  currentPlayerIndex = 0
  await promptPlayerTurn()
}

// Prompt the current player to take their turn
async function promptPlayerTurn () {
  const room = process.env.ROOM_UUID
  const currentPlayer = tableUsers[currentPlayerIndex]

  const currentPlayerNickname = userNicknames[currentPlayer] || currentPlayer

  await postMessage({ room, message: `It's ${currentPlayerNickname}'s turn. Choose /hit or /stand.` })
}

// Handle the hit action
async function handleHit (userUUID, nickname) {
  const room = process.env.ROOM_UUID

  // Check if it's the player's turn
  if (tableUsers[currentPlayerIndex] !== userUUID) {
    await postMessage({ room, message: `It's not your turn, ${nickname}.` })
    return
  }

  // Deal a new card to the player
  const newCard = deck.pop()
  playerHands[userUUID].push(newCard)
  const playerValue = calculateHandValue(playerHands[userUUID])
  console.log(`Player ${nickname} hits: ${newCard.value}${newCard.suit}, Total: ${playerValue}`)

  await postMessage({ room, message: `${nickname} hits: ${newCard.value}${newCard.suit}. Total value: ${playerValue}` })

  // Check if the player's hand value is greater than 21 (bust)
  if (playerValue > 21) {
    await postMessage({ room, message: `${nickname} busted!` })
    await handleNextPlayer() // Move to the next player
  }
  // Check if the player's hand value is exactly 21
  else if (playerValue === 21) {
    await postMessage({ room, message: `${nickname}, your hand value is 21! You stand automatically.` })
    await handleStand(userUUID, nickname)
  } else {
    await postMessage({ room, message: `${nickname}, your hand value is ${playerValue}. Do you want to /hit or /stand?` })
  }
}

async function handleStand (userUUID, nickname) {
  const room = process.env.ROOM_UUID

  // Check if it's the player's turn
  if (tableUsers[currentPlayerIndex] !== userUUID) {
    await postMessage({ room, message: `It's not your turn, ${nickname}.` })
    return
  }

  await postMessage({ room, message: `${nickname} stands with value ${calculateHandValue(playerHands[userUUID])}.` })
  await handleNextPlayer() // Proceed to the next player
}

async function handleNextPlayer () {
  currentPlayerIndex++
  if (currentPlayerIndex < tableUsers.length) {
    await promptPlayerTurn()
  } else {
    await playDealerTurn()
  }
}

async function playDealerTurn () {
  const room = process.env.ROOM_UUID
  await postMessage({ room, message: 'Dealer\'s turn.' })

  // Dealer hits until reaching 17 or higher
  while (calculateHandValue(dealerHand) < 17) {
    dealerHand.push(deck.pop())
    await postMessage({
      room,
      message: `Dealer hits: ${dealerHand.map(card => `${card.value}${card.suit}`).join(' ')} (Value: ${calculateHandValue(dealerHand)})`
    })
  }

  const dealerValue = calculateHandValue(dealerHand)
  await postMessage({
    room,
    message: `Dealer's final hand: ${dealerHand.map(card => `${card.value}${card.suit}`).join(' ')} (Value: ${dealerValue})`
  })

  // Determine results for each player
  for (const user of tableUsers) {
    const playerValue = calculateHandValue(playerHands[user])
    const nickname = userNicknames[user] || user

    if (playerValue > 21) {
      // Player busts
      await postMessage({ room, message: `${nickname} busted and loses their bet of $${playerBets[user]}.` })
    } else if (dealerValue > 21 || playerValue > dealerValue) {
      // Dealer busts or player has a higher hand
      const payout = playerBets[user] * 2 // Win 2x bet
      await addToUserWallet(user, payout)
      await postMessage({ room, message: `${nickname} wins! Payout: $${payout}.` })
    } else if (playerValue === dealerValue) {
      // Tie
      await addToUserWallet(user, playerBets[user]) // Return the bet
      await postMessage({ room, message: `${nickname} ties with the dealer and gets their bet back.` })
    } else {
      // Dealer wins
      await postMessage({ room, message: `${nickname} loses their bet of $${playerBets[user]}.` })
    }
  }

  // Reset game state
  resetGame()
}

function resetGame () {
  tableUsers = []
  playerBets = {}
  playerHands = {}
  dealerHand = []
  deck = []
  currentPlayerIndex = 0
  blackjackGameActive = false
  canJoinTable = true
  bettingTimeout = null
}

export { joinTable, leaveTable, handleBlackjackBet, handleHit, handleStand, getBlackjackGameActive, setBlackjackGameActive, tableUsers, preventFurtherJoins }
