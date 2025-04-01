import { postMessage } from '../libs/cometchat.js'
import { getUserNickname } from '../handlers/roulette.js'
import { addToUserWallet, loadUsers } from '../libs/walletManager.js' // Import the wallet management function
import fs from 'fs/promises' // Use the fs/promises module for async operations
import path from 'path' // For handling file paths

// Global variables
const MAX_NUMBER = 100
const MIN_NUMBER = 1
const TIMEOUT_DURATION = 30000 // 30 seconds timeout
const DRAWING_DELAY = 5000 // 5 seconds delay before drawing
const lotteryEntries = {}
let LotteryGameActive = false
const LOTTERY_WIN_AMOUNT = 100000 // Amount to add to the winner's wallet

// Path to the lottery winners file
const winnersFilePath = path.join(process.cwd(), 'src/libs/lotteryWinners.json')

// Function to generate a random number within a given range
function generateRandomNumber (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function handleLotteryCommand (payload) {
  LotteryGameActive = true
  console.log('Lottery Game Active')

  await postMessage({
    room: process.env.ROOM_UUID,
    message: 'LOTTERY BALL TIME!'
  })

  await postMessage({
    room: process.env.ROOM_UUID,
    message: 'Send a number 1-100 in the chat to play!'
  })

  // Set a timeout to remind users after 15 seconds
  setTimeout(() => {
    postMessage({
      room: process.env.ROOM_UUID,
      message: 'Lottery Ball Drawing will be in 15 seconds! Get your picks in!'
    })
  }, 15000)

  // Set a timeout to end the lottery game after TIMEOUT_DURATION
  setTimeout(() => {
    LotteryGameActive = false
    console.log('Lottery Game Inactive')
    postMessage({
      room: process.env.ROOM_UUID,
      message: 'Lottery entries are now closed. Drawing numbers...'
    })
    // Set a delay before drawing the winning number
    setTimeout(drawWinningNumber, DRAWING_DELAY)
  }, TIMEOUT_DURATION)
}

async function handleLotteryNumber (payload) {
  if (LotteryGameActive) {
    if (!isNaN(payload.message) && parseInt(payload.message) >= MIN_NUMBER && parseInt(payload.message) <= MAX_NUMBER) {
      const number = parseInt(payload.message)
      lotteryEntries[payload.sender] = number
    }
  }
}

async function drawWinningNumber () {
  const winningNumber = generateRandomNumber(MIN_NUMBER, MAX_NUMBER)
  const winners = []
  for (const sender in lotteryEntries) {
    if (lotteryEntries[sender] === winningNumber) {
      winners.push(sender)
    }
  }

  let message = `The winning number is: ${winningNumber}.`

  if (winners.length > 0) {
    try {
      // Iterate over the winners, add to their wallet, and log the win
      for (const winner of winners) {
        await addToUserWallet(winner, LOTTERY_WIN_AMOUNT)
        const nickname = await getUserNickname(winner)

        // Prepare the winner data to write to the JSON file
        const winnerData = {
          userId: winner,
          nickname,
          winningNumber,
          timestamp: new Date().toISOString()
        }

        // Load existing winners from the JSON file or create a new array
        let existingWinners = []
        try {
          const data = await fs.readFile(winnersFilePath, 'utf8')
          existingWinners = JSON.parse(data)
        } catch (error) {
          console.error('Error reading winners file, initializing new list:', error)
        }

        // Add the new winner to the array
        existingWinners.push(winnerData)

        // Write the updated winners array back to the file
        try {
          await fs.writeFile(winnersFilePath, JSON.stringify(existingWinners, null, 2))
          console.log(`Added winner ${nickname} to lotteryWinners.json`)
        } catch (error) {
          console.error('Error writing to lotteryWinners.json:', error)
        }
      }

      message += '\n🎉Congratulations to the winners! 🎉 you\'ve won $100,000'
    } catch (error) {
      console.error('Error handling winners:', error)
      message += '\nAn error occurred while processing the winners.'
    }
  } else {
    message += '\nNo winners this time. Better luck next round!'
  }

  // Post the result message
  await postMessage({
    room: process.env.ROOM_UUID,
    message
  })

  // Clear the lottery entries for the next game
  for (const key in lotteryEntries) {
    delete lotteryEntries[key]
  }
}

async function getLotteryWinners () {
  try {
    // Read the content of the lotteryWinners.json file
    const data = await fs.readFile(winnersFilePath, 'utf8')
    const winners = JSON.parse(data)
    const users = await loadUsers() // Load user data for nicknames

    // Debug: Check what users and winners look like
    console.log('Users:', users)
    console.log('Winners:', winners)

    return winners.map(winner => {
      const nickname = users[winner.userId] ? users[winner.userId].nickname : 'Unknown' // Use `userId` instead of `uuid`
      console.log(`Mapping winner ${winner.userId} to nickname: ${nickname}`) // Debugging the nickname mapping

      return {
        nickname,
        winningNumber: winner.winningNumber || 'N/A', // Default to 'N/A' if not provided
        amountWon: winner.amountWon || 100000, // Default to $100,000 if not provided
        date: winner.timestamp ? new Date(winner.timestamp).toLocaleString() : 'No date available' // Format the date
      }
    })
  } catch (error) {
    console.error('Error reading or parsing the lotteryWinners.json file:', error)
    return [] // Return an empty array if there is an error
  }
}

export { handleLotteryCommand, handleLotteryNumber, LotteryGameActive, getLotteryWinners }
