import { addToUserWallet, getUserWallet, removeFromUserWallet } from '../libs/walletManager.js'
import fs from 'fs'
import path from 'path'

const jackpotFile = path.join(process.cwd(), 'src/libs/jackpot.json')

// Slot machine symbols and payouts
const symbols = ['🍒', '🍋', '🍊', '🍉', '🔔', '⭐', '💎'] // Slot symbols
const payouts = {
  '🍒🍒🍒': 5, // 5x the bet for 3 cherries
  '🍋🍋🍋': 4, // 4x for 3 lemons
  '🍊🍊🍊': 3, // 3x for 3 oranges
  '🍉🍉🍉': 6, // 6x for 3 watermelons
  '🔔🔔🔔': 8, // 8x for 3 bells
  '⭐⭐⭐': 10, // 10x for 3 stars
  '💎💎💎': 20 // 20x for 3 diamonds
}

// Payouts for two matching symbols
const twoMatchPayouts = {
  '🍒🍒': 2, // 2x for 2 cherries
  '🍋🍋': 1.5, // 1.5x for 2 lemons
  '🍊🍊': 1.2, // 1.2x for 2 oranges
  '🍉🍉': 2.5, // 2.5x for 2 watermelons
  '🔔🔔': 3, // 3x for 2 bells
  '⭐⭐': 4, // 4x for 2 stars
  '💎💎': 5 // 5x for 2 diamonds
}

// Function to simulate a slot spin, randomly picking 3 symbols
function spinSlots () {
  const result = []
  for (let i = 0; i < 3; i++) {
    result.push(symbols[Math.floor(Math.random() * symbols.length)])
  }
  return result
}

function getJackpotValue () {
  if (fs.existsSync(jackpotFile)) {
    const data = fs.readFileSync(jackpotFile, 'utf8')
    const json = JSON.parse(data)
    return json.progressiveJackpot || 100 // Default to 100 if not set
  } else {
    return 100 // Default to 100 if the file doesn't exist
  }
}

// Update the jackpot value in the JSON file
function updateJackpotValue (newValue) {
  console.log(`Updating jackpot value to: ${newValue}`)
  const data = { progressiveJackpot: newValue }
  try {
    fs.writeFileSync(jackpotFile, JSON.stringify(data), 'utf8')
    console.log('Jackpot file updated successfully.')
  } catch (error) {
    console.error('Failed to update jackpot file:', error)
  }
}

// Function to calculate the multiplier for wins
function calculateMultiplier (result) {
  const resultString = result.join('')

  // Check for 3-symbol match
  if (payouts.hasOwnProperty(resultString)) {
    if (resultString === '💎💎💎') {
      return 'jackpot' // Special case for the jackpot
    }
    return payouts[resultString]
  }

  // Check for two-symbol match
  const firstTwoSymbols = result[0] + result[1]
  const middleTwoSymbols = result[1] + result[2]
  const firstAndLast = result[0] + result[2]

  if (twoMatchPayouts.hasOwnProperty(firstTwoSymbols)) {
    return twoMatchPayouts[firstTwoSymbols]
  }
  if (twoMatchPayouts.hasOwnProperty(middleTwoSymbols)) {
    return twoMatchPayouts[middleTwoSymbols]
  }
  if (twoMatchPayouts.hasOwnProperty(firstAndLast)) {
    return twoMatchPayouts[firstAndLast]
  }

  return 0 // No win
}

// Function to calculate payout with an RTP adjustment mechanism
function calculateRTP (winMultiplier, betAmount, rtp = 0.96) {
  // Expected payout based on RTP
  const expectedPayout = betAmount * winMultiplier * rtp
  return expectedPayout
}

async function playSlots (userUUID, betSize = 1, paylines = 1) {
  const maxBetSize = 10000 // Set a maximum bet size if desired
  const minBetSize = 1 // Set a mrsinimum bet size

  if (betSize < minBetSize || betSize > maxBetSize) {
    return `Bet amount must be between $${minBetSize} and $${maxBetSize}.`
  }

  try {
    let currentBalance = await getUserWallet(userUUID)

    const totalBet = betSize * paylines
    if (betSize <= 0 || totalBet > currentBalance) {
      return `Invalid bet amount. Your current balance is $${currentBalance}.`
    }

    // Deduct the bet from the user's wallet
    await removeFromUserWallet(userUUID, totalBet)

    // Increment the progressive jackpot by 5% of the total bet
    let currentJackpot = getJackpotValue()
    const jackpotIncrement = totalBet * 0.05 // 5% of the total bet
    currentJackpot += jackpotIncrement
    updateJackpotValue(currentJackpot)

    const results = []
    let winnings = 0

    for (let line = 0; line < paylines; line++) {
      const slotsResult = spinSlots()
      results.push(slotsResult)

      const multiplier = calculateMultiplier(slotsResult)

      if (multiplier === 'jackpot') {
        // Jackpot hit with 3 diamonds
        winnings += currentJackpot
        currentJackpot = 100 // Reset jackpot
        updateJackpotValue(currentJackpot) // Save the new jackpot value
        console.log(`User ${userUUID} hit the jackpot!`)
      } else if (multiplier > 0) {
        winnings += calculateRTP(multiplier, betSize)
      }
    }

    if (winnings > 0) {
      await addToUserWallet(userUUID, winnings)
      currentBalance = await getUserWallet(userUUID)
      return `____SPIN____\n\n${results.map(r => r.join(' | ')).join('\n')}\n_____________\n\n You Win $${winnings.toFixed(2)}!\nCurrent Balance: $${currentBalance}.`
    } else {
      currentBalance = await getUserWallet(userUUID)
      return `____SPIN____\n\n${results.map(r => r.join(' | ')).join('\n')}\n_____________\n\n You Lose $${totalBet}.\nCurrent Balance: $${currentBalance}.`
    }
  } catch (error) {
    console.error('Error while playing slots:', error)
    return 'An error occurred while playing the slots. Please try again later.'
  }
}

// Simulate progressive jackpot hit with low probability
function isJackpotHit () {
  return Math.random() < 0.001 // 0.1% chance to hit jackpot
}

// Simplified command handler that accepts a bet amount
async function handleSlotsCommand (userUUID, betSize) {
  // Validate betSize
  if (betSize <= 0) {
    return 'Please enter a valid bet amount greater than 0.'
  }

  const message = await playSlots(userUUID, betSize)
  return message // Return the message to display to the user
}

export { playSlots, handleSlotsCommand, getJackpotValue }
