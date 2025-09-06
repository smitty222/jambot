// src/database/dblotterymanager.js
import db from './db.js'
import { postMessage } from '../libs/cometchat.js'
// Use the standalone nickname util instead of importing from the
// message handler. Avoids circular dependencies and simplifies testing.
import { getUserNickname } from '../utils/nickname.js'
import { addToUserWallet, getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js'
import { findUserIdAndNickname } from '../database/dblotteryquestionparser.js'
import { storeItems } from '../libs/jamflowStore.js'

const { cost } = storeItems['/lottery']
const MAX_NUMBER = 100
const MIN_NUMBER = 1
const TIMEOUT_DURATION = 30000
const DRAWING_DELAY = 5000
const LOTTERY_WIN_AMOUNT = 100000
const lotteryEntries = {}
let LotteryGameActive = false

// ✅ INIT TABLES
db.exec(`
  CREATE TABLE IF NOT EXISTS lottery_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    nickname TEXT,
    winningNumber INTEGER NOT NULL,
    amountWon INTEGER DEFAULT ${LOTTERY_WIN_AMOUNT},
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lottery_stats (
    number INTEGER PRIMARY KEY,
    count INTEGER DEFAULT 0
  );
`)

function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ✅ Start the lottery game
export async function handleLotteryCommand(payload) {
  LotteryGameActive = true
  const room = process.env.ROOM_UUID

  await postMessage({ room, message: '🎰 LOTTERY BALL TIME!' })
  await postMessage({ room, message: `Send a number 1–100 to play! 💸 Entry: $${cost}` })

  setTimeout(() => {
    postMessage({ room, message: '🎲 Drawing in 15 seconds! Get your pick in!' })
  }, 15000)

  setTimeout(() => {
    LotteryGameActive = false
    postMessage({ room, message: '⛔ Entries closed! Drawing the number...' })
    setTimeout(drawWinningNumber, DRAWING_DELAY)
  }, TIMEOUT_DURATION)
}

// ✅ Player picks a number
export async function handleLotteryNumber(payload) {
  if (!LotteryGameActive) return

  const number = parseInt(payload.message)
  const userId = payload.sender
  const nickname = await getUserNickname(userId)
  const room = process.env.ROOM_UUID

  if (isNaN(number) || number < MIN_NUMBER || number > MAX_NUMBER) return

  if (lotteryEntries[userId]) {
    return await postMessage({ room, message: `${nickname} you already picked ${lotteryEntries[userId]}` })
  }

  const balance = await getUserWallet(userId)
  if (balance < cost) {
    return await postMessage({
      room,
      message: `${nickname} you need $${cost}, but you only have $${balance}.`
    })
  }

  const success = removeFromUserWallet(userId, cost)
  if (!success) {
    return await postMessage({ room, message: `${nickname} error charging wallet.` })
  }

  lotteryEntries[userId] = number
  await postMessage({ room, message: `${nickname} entered with #${number}. Good luck! 💸` })
}

// ✅ Draw and process winning number
async function drawWinningNumber() {
  const room = process.env.ROOM_UUID
  const winningNumber = generateRandomNumber(MIN_NUMBER, MAX_NUMBER)

  // Update stat count
  db.prepare(`
    INSERT INTO lottery_stats (number, count)
    VALUES (?, 1)
    ON CONFLICT(number) DO UPDATE SET count = count + 1
  `).run(winningNumber)

  const winners = Object.entries(lotteryEntries).filter(([_, n]) => n === winningNumber)

  let message = `🎯 The winning number is: **#${winningNumber}**`

  if (winners.length > 0) {
    for (const [userId] of winners) {
      const nickname = await getUserNickname(userId)
      await addToUserWallet(userId, LOTTERY_WIN_AMOUNT)

      db.prepare(`
        INSERT INTO lottery_winners (userId, nickname, winningNumber, amountWon)
        VALUES (?, ?, ?, ?)
      `).run(userId, nickname, winningNumber, LOTTERY_WIN_AMOUNT)

      message += `\n🎉 @${nickname} wins $${LOTTERY_WIN_AMOUNT.toLocaleString()}!`
    }
  } else {
    message += `\n💀 No winners this round. Try again next time!`
  }

  await postMessage({ room, message })

  if (winningNumber === 69) {
    await postMessage({
      room,
      message: '',
      images: ['https://media2.giphy.com/media/3i4Prsb5uTZArI7fI4/giphy.gif']
    })
  }

  // Reset entries
  Object.keys(lotteryEntries).forEach(k => delete lotteryEntries[k])
}

// ✅ Get winners list from DB
// ✅ Get winners list from DB
export function getLotteryWinners(limit = 20) {
  const rows = db.prepare(`
    SELECT userId, nickname, winningNumber, amountWon, timestamp
    FROM lottery_winners
    ORDER BY timestamp DESC
    LIMIT ?
  `).all(limit)

  return rows.map(row => ({
    userId: row.userId,                           // ← keep it!
    nickname: row.nickname || 'Unknown',
    winningNumber: row.winningNumber,
    amountWon: row.amountWon,
    date: new Date(row.timestamp).toLocaleString()
  }))
}


// ✅ Top drawn numbers
export function getLotteryNumberStats(limit = 5) {
  return db.prepare(`
    SELECT * FROM lottery_stats
    ORDER BY count DESC
    LIMIT ?
  `).all(limit)
}

// ✅ Handle "/lotto #69"
export async function handleSingleNumberQuery(room, message) {
  const match = message.match(/\/lotto\s+#?(\d{1,3})/)
  if (!match) return

  const number = parseInt(match[1])
  if (number < 1 || number > 100) {
    return await postMessage({ room, message: 'Please pick a number 1–100' })
  }

  const row = db.prepare(`SELECT count FROM lottery_stats WHERE number = ?`).get(number)
  const count = row?.count || 0

  const response = count > 0
    ? `🎯 #${number} has been drawn ${count} time${count === 1 ? '' : 's'}!`
    : `🤞 #${number} has never been drawn yet.`

  await postMessage({ room, message: response })
}

// ✅ Show top stats
export async function handleTopLotteryStatsCommand(room) {
  const stats = getLotteryNumberStats()
  if (!stats.length) {
    return await postMessage({ room, message: '🎲 No lottery history yet!' })
  }

  const message = stats.map(({ number, count }) => `#${number} → ${count}x`).join('\n')
  await postMessage({ room, message: `🎯 Most drawn numbers:\n${message}` })
}

// ✅ Check if user has won before
export async function handleLotteryCheck(room, userCandidate) {
  const user =
    userCandidate.userId
      ? userCandidate
      : findUserIdAndNickname(userCandidate.nickname)

  if (!user) {
    return await postMessage({ room, message: `I don't know anyone named ${userCandidate.nickname}` })
  }

  const hasWon = db.prepare(`
    SELECT COUNT(*) AS total FROM lottery_winners WHERE userId = ?
  `).get(user.userId).total > 0

  if (hasWon) {
    await postMessage({
      room,
      message: `💥 YES! ${user.nickname} HAS WON THE LOTTERY BEFORE! 💰🔥`
    })
  } else {
    await postMessage({ room, message: `no` })
  }
}

// ✅ Expose game status
export { LotteryGameActive }
