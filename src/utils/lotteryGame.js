import { postMessage } from '../libs/cometchat.js'
import { getUserNickname } from '../handlers/roulette.js'
import { addToUserWallet } from '../libs/walletManager.js' // Import the wallet management function

// Global variables
const MAX_NUMBER = 100
const MIN_NUMBER = 1
const TIMEOUT_DURATION = 30000 // 30 seconds timeout
const DRAWING_DELAY = 5000 // 5 seconds delay before drawing
const lotteryEntries = {}
let LotteryGameActive = false
const LOTTERY_WIN_AMOUNT = 100000 // Amount to add to the winner's wallet

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

async function drawWinningNumber() {
  const winningNumber = generateRandomNumber(MIN_NUMBER, MAX_NUMBER);
  const winners = [];
  for (const sender in lotteryEntries) {
      if (lotteryEntries[sender] === winningNumber) {
          winners.push(sender);
      }
  }

  let message = `The winning number is: ${winningNumber}.`;

  if (winners.length > 0) {
      try {
          // Use getUserNickname to fetch the winner's nickname
          const nicknamesPromises = winners.map(getUserNickname); // Create an array of promises
          const nicknames = await Promise.all(nicknamesPromises); // Wait for all promises to resolve
          
          // Filter out null nicknames if any
          const validNicknames = nicknames.filter(nickname => nickname !== null);

          await postMessage({
              room: process.env.ROOM_UUID,
              message
          });
          
          if (validNicknames.length > 0) {
              await postMessage({
                  room: process.env.ROOM_UUID,
                  message: `WE HAVE A WINNER!! Congrats @${validNicknames.join(', ')}!! You won $100,000!`
              });
          } else {
              await postMessage({
                  room: process.env.ROOM_UUID,
                  message: 'There was an issue fetching nicknames for the winners.'
              });
          }

          // Add $100,000 to each winner's wallet
          for (const winner of winners) {
              try {
                  await addToUserWallet(winner, LOTTERY_WIN_AMOUNT); // Add the winnings to the wallet
                  console.log(`Added $${LOTTERY_WIN_AMOUNT} to the wallet of ${winner}`);
              } catch (error) {
                  console.error(`Error adding winnings to wallet for ${winner}: ${error.message}`);
                  await postMessage({
                      room: process.env.ROOM_UUID,
                      message: `Error adding winnings to @${validNicknames[winners.indexOf(winner)]}'s wallet. Please contact support.`
                  });
              }
          }
      } catch (error) {
          console.error(`Error during user data fetch: ${error.message}`);
          await postMessage({
              room: process.env.ROOM_UUID,
              message: 'An error occurred while fetching winner information. Please try again later.'
          });
      }
  } else {
      message += ' There are no winners this time.';
      await postMessage({
          room: process.env.ROOM_UUID,
          message
      });
  }
}



export { handleLotteryCommand, handleLotteryNumber, LotteryGameActive }
