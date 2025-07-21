import { postMessage } from '../libs/cometchat.js'
import { getTriviaQuestions, decodeHtml } from '../utils/API.js'

let currentQuestion = null
let userScores = {}
let totalRounds = 0
let currentRound = 0
let questionsPerRound = 5
let currentCategory = null
let currentQuestions = []
let currentQuestionIndex = 0
let isGameActive = false
let usedCategories = new Set()
let pendingAnswers = {}
let answerTimer = null

const categoryPool = [9, 11, 12, 15, 17, 18, 21, 22, 23, 27]

function resetGameState() {
  console.log('🧹 Resetting game state...')
  currentQuestion = null
  userScores = {}
  totalRounds = 0
  currentRound = 0
  currentCategory = null
  currentQuestions = []
  currentQuestionIndex = 0
  isGameActive = false
  usedCategories.clear()
  pendingAnswers = {}
  if (answerTimer) {
    clearTimeout(answerTimer)
    answerTimer = null
  }
}

function getRandomCategory(exclude = []) {
  const available = categoryPool.filter(id => !exclude.includes(id))
  if (available.length === 0) return null
  const chosen = available[Math.floor(Math.random() * available.length)]
  console.log(`🎯 Chose random category: ${chosen}`)
  return chosen
}

function formatQuestionMessage(question) {
  const emojiChoices = ['🇦', '🇧', '🇨', '🇩']
  return `🧠 Trivia Round ${currentRound}/${totalRounds}\nCategory: ${getCategoryName(currentCategory)}\n\n${question.question}\n${question.answers.map((a, i) => `${emojiChoices[i]} ${a.slice(3)}`).join('\n')}\n\n⏳ You have 20 seconds to answer! Use /a /b /c or /d`
}

function getCategoryName(id) {
  const mapping = {
    9: 'General Knowledge', 11: 'Film', 12: 'Music', 15: 'Video Games',
    17: 'Science & Nature', 18: 'Science: Computers', 21: 'Sports',
    22: 'Geography', 23: 'History', 27: 'Animals',
  }
  return mapping[id] || `Category ${id}`
}

async function askNextQuestion(room) {
  if (currentQuestionIndex >= currentQuestions.length) {
    console.log(`🏁 Round ${currentRound} complete.`)
    await postMessage({ room, message: `🏁 End of Round ${currentRound}!` })

    setTimeout(async () => {
      const leaderboard = formatLeaderboard().trim()
      await postMessage({ room, message: `📊 Leaderboard:\n🏆 **Leaderboard:**\n\n${leaderboard}` })

      if (currentRound >= totalRounds) {
        console.log('🎉 Game complete!')
        await postMessage({ room, message: `🎉 Game Over!` })
        await postMessage({ room, message: `🏆 Final Leaderboard:\n🏆 **Leaderboard:**\n\n${leaderboard}` })

        const stats = [
          `🎯 Game Summary:`,
          `Players: ${Object.keys(userScores).length}`,
          `Max Score: ${Math.max(...Object.values(userScores), 0)}`,
          `Questions: ${totalRounds * questionsPerRound}`
        ].join('\n')

        await postMessage({ room, message: stats })
        resetGameState()
        return
      }

      await startNewRound(room)
    }, 2000)

    return
  }

  currentQuestion = currentQuestions[currentQuestionIndex]
  console.log(`🎤 Asking question ${currentQuestionIndex + 1}:`, currentQuestion)
  pendingAnswers = {}

  await postMessage({ room, message: formatQuestionMessage(currentQuestion) })

  answerTimer = setTimeout(() => resolveAnswers(room), 20000)
}

async function resolveAnswers(room) {
  answerTimer = null
  const correctLetter = currentQuestion.correctAnswer.toUpperCase()
  console.log(`✅ Resolving answers — correct: ${correctLetter}`)

  let correctUsers = []
  let incorrectUsers = []

  for (const [userUUID, answer] of Object.entries(pendingAnswers)) {
    if (answer === correctLetter) {
      userScores[userUUID] = (userScores[userUUID] || 0) + 1
      correctUsers.push(userUUID)
    } else {
      incorrectUsers.push({ userUUID, answer })
    }
  }

  let resultMessage = `✅ Correct answer: ${correctLetter}\n`
  if (correctUsers.length) {
    resultMessage += `✔️ Correct: ${correctUsers.map(u => `<@uid:${u}>`).join(', ')}\n`
  } else {
    resultMessage += 'No one answered correctly.\n'
  }
  if (incorrectUsers.length) {
    resultMessage += `❌ Incorrect answers:\n`
    incorrectUsers.forEach(({ userUUID, answer }) => {
      resultMessage += ` - <@uid:${userUUID}> answered ${answer}\n`
    })
  }

  await postMessage({ room, message: resultMessage })

  currentQuestionIndex++

  setTimeout(async () => {
    await postMessage({ room, message: '⏳ Next question coming up...' })
    setTimeout(() => askNextQuestion(room), 2000)
  }, 1000)
}

async function startNewRound(room) {
  currentRound++
  currentQuestionIndex = 0
  currentCategory = getRandomCategory([...usedCategories])
  if (!currentCategory) {
    console.log('🚫 No more unused categories left.')
    await postMessage({ room, message: 'No more categories available. Trivia game over!' })
    resetGameState()
    return
  }

  usedCategories.add(currentCategory)
  await postMessage({ room, message: `🎯 Starting Round ${currentRound}!\nCategory: ${getCategoryName(currentCategory)}` })

  currentQuestions = []
  let attempts = 0
  const questionsNeeded = questionsPerRound

  while (currentQuestions.length < questionsNeeded && attempts < 5) {
    attempts++

    const questionsBatch = await getTriviaQuestions(currentCategory, questionsNeeded)
    if (!questionsBatch || questionsBatch.length === 0) {
      console.log(`❌ No questions returned on attempt ${attempts} for category ${currentCategory}`)
      continue
    }

    for (const q of questionsBatch) {
      const decodedQuestion = decodeHtml(q.question || '')
      if (!decodedQuestion.trim()) {
        console.log(`⚠️ Skipped empty question on attempt ${attempts}`)
        continue
      }
      const duplicate = currentQuestions.find(existing => decodeHtml(existing.question) === decodedQuestion)
      if (!duplicate) {
        currentQuestions.push(q)
        console.log(`✅ Added question ${currentQuestions.length} on attempt ${attempts}:`, decodedQuestion)
        if (currentQuestions.length >= questionsNeeded) break
      } else {
        console.log(`⚠️ Duplicate question skipped on attempt ${attempts}:`, decodedQuestion)
      }
    }
  }

  if (currentQuestions.length < questionsNeeded) {
    await postMessage({ room, message: '❌ Not enough questions to start the round. Ending game.' })
    resetGameState()
    return
  }

  await askNextQuestion(room)
}

async function handleTriviaStart(room, rounds = 1) {
  if (isGameActive) {
    await postMessage({ room, message: 'A trivia game is already active.' })
    return
  }

  console.log(`🎮 Trivia game starting with ${rounds} rounds`)
  resetGameState()
  isGameActive = true
  totalRounds = parseInt(rounds) || 1
  currentRound = 0
  await postMessage({ room, message: `🎉 Starting a trivia game with ${totalRounds} rounds! Each round has 5 questions.` })
  await startNewRound(room)
}

async function handleTriviaSubmit(payload, room, userUUID) {
  if (!currentQuestion || !isGameActive || !answerTimer) {
    await postMessage({ room, message: 'No active trivia question to answer right now.' })
    return
  }

  const answer = payload.message.trim().toUpperCase()
  if (!['/A', '/B', '/C', '/D'].includes(answer)) {
    await postMessage({ room, message: 'Please answer with /a, /b, /c, or /d only.' })
    return
  }

  if (pendingAnswers[userUUID]) {
    await postMessage({ room, message: 'You already answered this question.' })
    return
  }

  console.log(`📝 ${userUUID} answered ${answer}`)
  pendingAnswers[userUUID] = answer.slice(1)
  await postMessage({ room, message: `<@uid:${userUUID}> answered.` })
}

async function handleTriviaEnd(room) {
  if (!isGameActive) {
    await postMessage({ room, message: 'There is no active trivia game.' })
    return
  }
  if (answerTimer) {
    clearTimeout(answerTimer)
    answerTimer = null
  }

  console.log('🛑 Game ended manually.')
  const leaderboard = formatLeaderboard().trim()
  await postMessage({ room, message: `🛑 Trivia game ended early.\n\n🏆 Final Leaderboard:\n🏆 **Leaderboard:**\n\n${leaderboard}` })
  resetGameState()
}

function formatLeaderboard() {
  const sorted = Object.entries(userScores).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return 'No scores yet.'

  return sorted.map(([uuid, score], i) => {
    const medals = ['🥇', '🥈', '🥉']
    const prefix = medals[i] || `${i + 1}.`
    return `${prefix} <@uid:${uuid}> — ${score} point${score !== 1 ? 's' : ''}`
  }).join('\n')
}

async function displayTriviaInfo(room) {
  await postMessage({
    room,
    message: '🎮 Trivia Game Help:\n- Start a game: /triviastart [rounds]\n- Submit answers: /a /b /c /d\n- End game: /triviaend'
  })
}

export {
  handleTriviaStart,
  handleTriviaSubmit,
  handleTriviaEnd,
  displayTriviaInfo
}
