import { postMessage } from '../libs/cometchat.js'
import { getNewQuestion, resetCurrentQuestion } from './triviaData.js'

let currentQuestion = null
let totalPoints = 0
const usedQuestions = new Set()

// Define a function to handle the trivia start command
async function handleTriviaStart (room) {
  if (currentQuestion) {
    await postMessage({
      room,
      message: 'A trivia question is already active. Wait for it to end.'
    })
  } else {
    currentQuestion = getNewQuestion(usedQuestions)
    const triviaMessage = `Question: ${currentQuestion.question}\nOptions: ${currentQuestion.answers.join(', ')}`
    await postMessage({
      room,
      message: triviaMessage
    })
  }
}

async function handleTriviaSubmit (payload, roomBot, room) {
  const submittedAnswer = payload.message.substring(1).toUpperCase() // Extract the submitted answer from the command

  if (!currentQuestion) {
    await postMessage({
      room,
      message: 'No active trivia question. Please start a new game using /triviastart.'
    })
    return
  }

  // Find the answer based on the letter choice
  const answerIndex = 'ABCD'.indexOf(submittedAnswer)
  const answer = currentQuestion.answers[answerIndex]

  // Check if the submitted answer matches the correct answer
  if (answer && answer.charAt(0).toUpperCase() === currentQuestion.correctAnswer) {
    // Correct answer
    totalPoints++
    await postMessage({
      room,
      message: `Correct! The answer was "${currentQuestion.correctAnswer}". Your total points: ${totalPoints}`
    })
  } else {
    // Incorrect answer
    await postMessage({
      room,
      message: `Incorrect! The correct answer was "${currentQuestion.correctAnswer}". Your total points: ${totalPoints}`
    })
  }

  // Mark the question as used
  usedQuestions.add(currentQuestion.index)

  // Get the next question or end the trivia game if there are no more questions
  currentQuestion = getNewQuestion(usedQuestions) // Get the next question
  if (currentQuestion) {
    // Display the next question
    const triviaMessage = `Next question: ${currentQuestion.question}\nOptions: ${currentQuestion.answers.join(', ')}`
    await postMessage({
      room,
      message: triviaMessage
    })
  } else {
    // No more questions, end the trivia game
    await handleTriviaEnd(resetCurrentQuestion, totalPoints, room)
  }
}

async function handleTriviaEnd (resetTriviaState, totalPoints, room) {
  resetTriviaState()
  currentQuestion = null
  usedQuestions.clear() // Clear the used questions set for a new game
  await postMessage({
    room,
    message: `The trivia game has ended. Total points: ${totalPoints}`
  })
}

async function displayTriviaInfo (room) {
  if (!currentQuestion) {
    await postMessage({
      room,
      message: 'To start a trivia game you can use /triviastart. To submit your answer you can use /a, /b, /c, or /d. The points will tally up and the game will continue on until you use /triviaend.'
    })
  }
}

// Export the handleTriviaStart function
export { handleTriviaStart, handleTriviaEnd, handleTriviaSubmit, displayTriviaInfo, currentQuestion, totalPoints }
