import { postMessage } from "../libs/cometchat.js";
import { fetchUserData } from "./API.js";

// Global variables
const MAX_NUMBER = 100;
const MIN_NUMBER = 1;
const TIMEOUT_DURATION = 30000; // 30 seconds timeout
const DRAWING_DELAY = 5000; // 5 seconds delay before drawing
let lotteryEntries = {};
let LotteryGameActive = false;

// Function to generate a random number within a given range
function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function handleLotteryCommand(payload) {
  LotteryGameActive = true; 
  console.log('Lottery Game Active');

  await postMessage({
    room: process.env.ROOM_UUID, 
    message: "LOTTERY BALL TIME!",
  });

  await postMessage({
    room: process.env.ROOM_UUID, 
    message: "Send a number 1-100 in the chat to play!",
  });

  // Set a timeout to remind users after 15 seconds
  setTimeout(() => {
    postMessage({
      room: process.env.ROOM_UUID,
      message: "Lottery Ball Drawing will be in 15 seconds! Get your picks in!",
    });
  }, 15000);

  // Set a timeout to end the lottery game after TIMEOUT_DURATION
  setTimeout(() => {
    LotteryGameActive = false;
    console.log('Lottery Game Inactive');
    postMessage({
      room: process.env.ROOM_UUID,
      message: "Lottery entries are now closed. Drawing numbers...",
    });
    // Set a delay before drawing the winning number
    setTimeout(drawWinningNumber, DRAWING_DELAY);
  }, TIMEOUT_DURATION);
}

async function handleLotteryNumber(payload) {
  if (LotteryGameActive) {
    if (!isNaN(payload.message) && parseInt(payload.message) >= MIN_NUMBER && parseInt(payload.message) <= MAX_NUMBER) {
      const number = parseInt(payload.message);
      lotteryEntries[payload.sender] = number;
    }
  }
}

async function drawWinningNumber() {
  const winningNumber = generateRandomNumber(MIN_NUMBER, MAX_NUMBER);
  let winners = [];
  for (const sender in lotteryEntries) {
    if (lotteryEntries[sender] === winningNumber) {
      winners.push(sender);
    }
  }
  
  let message = `The winning number is: ${winningNumber}.`;

  if (winners.length > 0) {
    try {
      const nicknames = await fetchUserData(winners);
      if (nicknames.length > 0) {
        await postMessage({
          room: process.env.ROOM_UUID,
          message: message,
        });
        await postMessage({
          room: process.env.ROOM_UUID,
          message: `WE HAVE A WINNER!! Congrats @${nicknames.join(", ")}!!`,
        });
      }
    } catch (error) {
      console.error(`Error during user data fetch: ${error.message}`);
      await postMessage({
        room: process.env.ROOM_UUID,
        message: "An error occurred while fetching winner information. Please try again later.",
      });
    }
  } else {
    message += " There are no winners this time.";
    postMessage({
      room: process.env.ROOM_UUID,
      message: message,
    });
  }
}

export { handleLotteryCommand, handleLotteryNumber, LotteryGameActive };
