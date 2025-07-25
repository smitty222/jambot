// src/commands/magic8ball.js
import { removeFromUserWallet, getUserWallet } from '../database/dbwalletmanager.js'
import { getUserNickname } from './message.js'

// Classic Magic 8-Ball responses
const magic8BallResponses = [
  "It is certain.",
  "Without a doubt.",
  "You may rely on it.",
  "Yes, definitely.",
  "It is decidedly so.",
  "As I see it, yes.",
  "Most likely.",
  "Outlook good.",
  "Yes.",
  "Signs point to yes.",
  "Reply hazy, try again.",
  "Ask again later.",
  "Better not tell you now.",
  "Cannot predict now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My reply is no.",
  "My sources say no.",
  "Outlook not so good.",
  "Very doubtful."
]

const COST_TO_ASK = 5 // cost in fake money to ask the 8-ball

/**
 * Handle the magic 8-ball game command.
 * @param {string} userUUID - The UUID of the user asking the question.
 * @param {string} question - The yes/no question asked by the user.
 * @returns {Promise<string>} - The bot's response string.
 */
export async function askMagic8Ball(userUUID, question) {
  if (!question || question.trim().length === 0) {
    return "You need to ask a yes/no question for the Magic 8-Ball."
  }

  // Check user balance
  const balance = await getUserWallet(userUUID)
  if (balance < COST_TO_ASK) {
    return `You need $${COST_TO_ASK} to ask the Magic 8-Ball. Your balance is $${balance}.`
  }

  // Pick a random response
  const randomIndex = Math.floor(Math.random() * magic8BallResponses.length)
  const answer = magic8BallResponses[randomIndex]

  const nickname = await getUserNickname(userUUID) || "You"

  return answer;
}
