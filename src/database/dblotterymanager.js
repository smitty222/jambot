// src/database/dblotterymanager.js
import db from './db.js'
import { postMessage } from '../libs/cometchat.js'
// Use the standalone nickname util instead of importing from the
// message handler. Avoids circular dependencies and simplifies testing.
import { getUserNickname } from '../utils/nickname.js'
// Helpers to work with mentions and display names
import { sanitizeNickname, formatMention, getDisplayName } from '../utils/names.js'
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

function generateRandomNumber (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ✅ Start the lottery game
export async function handleLotteryCommand (payload) {
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
export async function handleLotteryNumber (payload) {
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
async function drawWinningNumber () {
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
      // Fetch a raw mention string and sanitise it. We store the
      // sanitised nickname (if available) in the users table via
      // addToUserWallet() so that future lookups return a human name.
      const rawNick = await getUserNickname(userId)
      // Sanitise the nickname: if it’s a mention token the result
      // will be an empty string, triggering a fallback to the UUID.
      const cleanNick = sanitizeNickname(rawNick)
      // Credit the user’s wallet and update their nickname in the
      // users table (handled by addToUserWallet when a nickname is passed)
      await addToUserWallet(userId, LOTTERY_WIN_AMOUNT, cleanNick)
      // Determine the winner name for recording: prefer the stored
      // nickname in users table; fall back to cleanNick or UUID
      // Prefer a cleaned nickname for the winner. If none is available
      // (e.g. they only have a mention or no stored nickname), fall back
      // to getDisplayName() which itself falls back to the UUID. This
      // avoids persisting raw mention tokens into the lottery_winners table.
      const winnerName = cleanNick || getDisplayName(userId)
      db.prepare(`
        INSERT INTO lottery_winners (userId, nickname, winningNumber, amountWon)
        VALUES (?, ?, ?, ?)
      `).run(userId, winnerName, winningNumber, LOTTERY_WIN_AMOUNT)
      // Compose a message using the mention syntax for the chat
      message += `\n🎉 ${formatMention(userId)} wins $${LOTTERY_WIN_AMOUNT.toLocaleString()}!`
    }
  } else {
    message += '\n💀 No winners this round. Try again next time!'
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
export function getLotteryWinners (limit = 20) {
  // Fetch winners joined with users to prefer the stored nickname
  const rows = db.prepare(`
    SELECT lw.userId,
           -- Prefer a non-empty nickname from lottery_winners,
           -- otherwise fall back to the users table; if both are
           -- empty, use the UUID for display purposes.
           COALESCE(NULLIF(lw.nickname, ''), u.nickname, lw.userId) AS displayName,
           lw.winningNumber,
           lw.amountWon,
           lw.timestamp
    FROM lottery_winners lw
    LEFT JOIN users u ON u.uuid = lw.userId
    ORDER BY datetime(lw.timestamp) ASC
    LIMIT ?
  `).all(limit)
  return rows.map(row => ({
    userId: row.userId,
    nickname: row.displayName || row.userId,
    winningNumber: row.winningNumber,
    amountWon: row.amountWon,
    date: new Date(row.timestamp).toLocaleString()
  }))
}

// ✅ Top drawn numbers
export function getLotteryNumberStats (limit = 5) {
  return db.prepare(`
    SELECT * FROM lottery_stats
    ORDER BY count DESC
    LIMIT ?
  `).all(limit)
}

// ✅ Handle "/lotto #69"
export async function handleSingleNumberQuery (room, message) {
  const match = message.match(/\/lotto\s+#?(\d{1,3})/)
  if (!match) return

  const number = parseInt(match[1])
  if (number < 1 || number > 100) {
    return await postMessage({ room, message: 'Please pick a number 1–100' })
  }

  const row = db.prepare('SELECT count FROM lottery_stats WHERE number = ?').get(number)
  const count = row?.count || 0

  const response = count > 0
    ? `🎯 #${number} has been drawn ${count} time${count === 1 ? '' : 's'}!`
    : `🤞 #${number} has never been drawn yet.`

  await postMessage({ room, message: response })
}

// ✅ Show top stats
export async function handleTopLotteryStatsCommand (room) {
  const stats = getLotteryNumberStats()
  if (!stats.length) {
    return await postMessage({ room, message: '🎲 No lottery history yet!' })
  }

  const message = stats.map(({ number, count }) => `#${number} → ${count}x`).join('\n')
  await postMessage({ room, message: `🎯 Most drawn numbers:\n${message}` })
}

// ✅ Check if user has won before
export async function handleLotteryCheck (room, userCandidate) {
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
    await postMessage({ room, message: 'no' })
  }
}

// ✅ Expose game status
export { LotteryGameActive }
