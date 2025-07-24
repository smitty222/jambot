import { postMessage } from '../libs/cometchat.js'
import { getUserNickname } from '../handlers/roulette.js'
import { addToUserWallet, loadUsers, getUserWallet, removeFromUserWallet } from '../libs/walletManager.js'
import { findUserIdAndNickname } from './regex.js'
import { storeItems } from '../libs/jamflowStore.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

// 🔧 Required for ESM paths
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ✅ Read the JSON manually with fs instead of import()
const lotteryWinnersPath = path.join(__dirname, '../data/lotteryWinners.json')
const lotteryWinnersRaw = await fs.readFile(lotteryWinnersPath, 'utf-8')
const lotteryWinners = JSON.parse(lotteryWinnersRaw)

const numberStatsPath = path.join(process.cwd(), 'src/data/lottoBalls.json')
const room = process.env.ROOM_UUID

const { cost } = storeItems['/lottery']


// Global variables
const MAX_NUMBER = 100
const MIN_NUMBER = 1
const TIMEOUT_DURATION = 30000 // 30 seconds timeout
const DRAWING_DELAY = 5000 // 5 seconds delay before drawing
const lotteryEntries = {}
let LotteryGameActive = false
const LOTTERY_WIN_AMOUNT = 100000 // Amount to add to the winner's wallet



// Path to the lottery winners file
const winnersFilePath = path.join(process.cwd(), 'src/data/lotteryWinners.json')

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
    message: `Send a number 1–100 in the chat to play! 💸 Entry cost: $${cost}`
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

async function handleLotteryNumber(payload) {
  if (!LotteryGameActive) return

  const number = parseInt(payload.message)
  const userId = payload.sender
  const nickname = await getUserNickname(userId)

  if (isNaN(number) || number < MIN_NUMBER || number > MAX_NUMBER) return

  // Check if user already entered
  if (lotteryEntries[userId]) {
    await postMessage({
      room,
      message: `@${nickname} you've already entered the lottery with number ${lotteryEntries[userId]}.`
    })
    return
  }

  // Check balance
  const balance = await getUserWallet(userId)
  if (balance < cost) {
    await postMessage({
      room,
      message: `@${nickname} You need $${cost} for a lottery ticket, but you only have $${balance}. Check your balance with /balance & play some songs to get some cash.`
    })
    return
  }

  // Deduct cost
  const deducted = await removeFromUserWallet(userId, cost)
  if (!deducted) {
    await postMessage({
      room,
      message: `@${nickname} There was an error charging you. Please try again later.`
    })
    return
  }

  // Save entry and confirm
  lotteryEntries[userId] = number

  await postMessage({
    room,
    message: `@${nickname} You entered the lottery with number ${number}. Good luck! 💸 (Cost: $${cost})`
  })
}


async function drawWinningNumber () {
  const winningNumber = generateRandomNumber(MIN_NUMBER, MAX_NUMBER)

  
  // Track number win frequency
  let numberStats = {}
  try {
    const statsData = await fs.readFile(numberStatsPath, 'utf8')
    numberStats = JSON.parse(statsData)
  } catch {
    numberStats = {}
  }
  numberStats[String(winningNumber)] = (numberStats[String(winningNumber)] || 0) + 1
  await fs.writeFile(numberStatsPath, JSON.stringify(numberStats, null, 2))

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
          amountWon: LOTTERY_WIN_AMOUNT,
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
  // 🎉 Easter egg: Respond with a GIF if the winning number is 69
  if (winningNumber === 69) {
    const GifUrl = 'https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExZTk1cWU1bDh3eDB6cWd2ajI0Z3c3dHRqdGZqcDBsM2x4NGxwZWlxNyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3i4Prsb5uTZArI7fI4/giphy.gif'
    await postMessage({
      room: process.env.ROOM_UUID,
      receiverType: 'group',
      message: '',
      images: [GifUrl]
   })
  }

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

async function getLotteryNumberStats () {
  try {
    const data = await fs.readFile(numberStatsPath, 'utf8')
    const stats = JSON.parse(data)
    return stats
  } catch (error) {
    console.error('Error reading lotteryNumberStats.json:', error)
    return {}
  }
}

async function handleTopLotteryStatsCommand(room) {
  const stats = await getLotteryNumberStats()

  const sorted = Object.entries(stats)
    .sort((a, b) => b[1] - a[1]) // Sort by frequency
    .slice(0, 5)

  if (sorted.length === 0) {
    return postMessage({ room, message: 'No lottery data yet! 🎲 Be the first to win!' })
  }

  const message = sorted
    .map(([num, count]) => `#${num} → ${count}x`)
    .join('\n')

  await postMessage({
    room,
    message: `🎯 Most drawn numbers so far:\n${message}`
  })
}
async function handleSingleNumberQuery(room, message) {
  const stats = await getLotteryNumberStats()
  console.log('Loaded stats:', stats)

  const match = message.match(/\/lotto\s+#?(\d{1,3})/)
  console.log('Regex match:', match)

  if (!match) return

  const number = parseInt(match[1])
  console.log('Parsed number:', number)

  if (number < 1 || number > 100) {
    await postMessage({ room, message: 'Please pick a number between 1 and 100! 🔢' })
    return
  }

  const count = stats[String(number)] || 0
  console.log(`Count for #${number}:`, count)

  const response = count > 0
    ? `🎯 #${number} has been drawn ${count} time${count === 1 ? '' : 's'}!`
    : `🤞 #${number} has never been drawn yet. Maybe you're the lucky one?`

  await postMessage({ room, message: response })
}

async function handleLotteryCheck(room, userCandidate) {
  // If userCandidate has userId, we can use it directly
  if (userCandidate.userId) {
    const hasWon = lotteryWinners.some(winner => winner.userId === userCandidate.userId);

    if (hasWon) {
      await postMessage({
        room,
        message: `💥 HELL YEAH! ${userCandidate.nickname} HAS WON THE LOTTERY BEFORE! Number: ${winner.number} — ${new Date(winner.timestamp).toLocaleString()} 🔥💰`
      });
    } else {
      await postMessage({ room, message: `no` });
    }
    return;
  }

  // Else, try to find user by nickname:
  const user = findUserIdAndNickname(userCandidate.nickname);
  if (!user) {
    await postMessage({ room, message: `I don't know anyone named ${userCandidate.nickname}.` });
    return;
  }

  const hasWon = lotteryWinners.some(winner => winner.userId === user.userId);

  if (hasWon) {
    await postMessage({
      room,
      message: `🎉🔥 OMG YES! ${user.nickname} HAS WON THE LOTTERY! 💰💥 LET'S CELEBRATE! 🎉🎉🎉`
    });
  } else {
    await postMessage({ room, message: `no` });
  }
}




export { handleLotteryCommand, handleLotteryNumber, handleLotteryCheck, handleSingleNumberQuery, handleTopLotteryStatsCommand, getLotteryNumberStats, LotteryGameActive, getLotteryWinners }
