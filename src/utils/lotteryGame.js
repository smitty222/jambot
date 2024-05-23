import { postMessage } from "../libs/cometchat.js";

let winningNumber = null;
let gameInProgress = false;

function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function handleLotteryCommand(payload, room) {
  try {
    const { message, senderName } = payload;

    if (message.startsWith('/lottery')) {
      if (gameInProgress) {
        await postMessage({
          room,
          message: "A lottery game is already active. Wait for it to end."
        });
      } else {
        winningNumber = getRandomNumber(1, 2);
        gameInProgress = true;

        await postMessage({
          room,
          message: "🎉 The lottery game has started! Guess a number between 1 and 2 by typing the number in the chat."
        });

        setTimeout(async () => {
          // Check if the winning number has been guessed
          if (winningNumber !== null) {
            // No winner, announce the winning number
            await postMessage({
              room,
              message: `⏰ Time's up! The winning number is: ${winningNumber}.`
            });

            // Reset the game state
            winningNumber = null;
            gameInProgress = false;
          }
        }, 10000);
      }
    }

    // Check if the message contains a guess
    if (gameInProgress && payload.message === winningNumber) {
      await postMessage({
        room,
        message: `🎉 Congratulations, ${senderName}! You guessed the correct number and won the lottery!`
      });

      // Reset the game state
      winningNumber = null;
      gameInProgress = false;
    }
  } catch (error) {
    console.error('Error handling lottery command:', error.message);
    // Handle errors appropriately
  }
}
