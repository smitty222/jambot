import path from 'path'
import { fileURLToPath } from 'url'
import { loadUsersFromDb } from './dbusermanager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let users = {}

try {
  users = loadUsersFromDb()
} catch (err) {
  console.error('❌ Failed to load users from DB:', err)
}

const mentionRegex = /<@uid:([a-f0-9\-]+)>/i
const nicknameRegex = /([\w\s\-]+)/i

const lotteryQuestionPatterns = [
  /has\s+(.+?)\s+ever\s+won\s+(the\s+)?(lottery|lotto)(\s+before)?\??/i,
  /did\s+(.+?)\s+(ever\s+)?win\s+(the\s+)?(lottery|lotto)(\s+before)?\??/i,
  /has\s+(.+?)\s+won\s+(the\s+)?(lottery|lotto)(\s+before)?\??/i,
  /has\s+(.+?)\s+gotten\s+(a\s+)?(lottery|lotto)\s+win\??/i,
  /has\s+(.+?)\s+been\s+(a\s+)?(lottery|lotto)\s+winner\??/i,
  /did\s+(.+?)\s+hit\s+(the\s+)?(lottery|lotto)\??/i,
  /did\s+(.+?)\s+get\s+lucky\s+with\s+(the\s+)?(lottery|lotto)\??/i,
  /has\s+(.+?)\s+won\s+any\s+(lottery|lotto)\??/i,
  /has\s+(.+?)\s+ever\s+hit\s+(the\s+)?(lottery|lotto)\??/i,
  /has\s+(.+?)\s+ever\s+scored\s+in\s+(the\s+)?(lottery|lotto)\??/i,
  /has\s+(.+?)\s+ever\s+been\s+lucky\s+in\s+(the\s+)?(lottery|lotto)\??/i,
  /did\s+(.+?)\s+manage\s+to\s+win\s+(the\s+)?(lottery|lotto)\??/i,
  /has\s+(.+?)\s+ever\s+gotten\s+it\??/i,
  /has\s+(.+?)\s+gotten\s+it\??/i,
  /has\s+(.+?)\s+ever\s+won\s+it\??/i,
  /has\s+(.+?)\s+won\s+it\??/i,
  /has\s+(.+?)\s+ever\s+won(\s+before)?\??/i,
  /has\s+(.+?)\s+won(\s+before)?\??/i
]

export function normalizeUserMention (text) {
  return text.replace(/<@uid:([a-f0-9\-]+)>/gi, (match, userId) => {
    return users[userId]?.nickname || match
  })
}

export function findUserInText (text) {
  for (const [userId, user] of Object.entries(users)) {
    if (text.toLowerCase().includes(user.nickname.toLowerCase())) {
      return { userId, nickname: user.nickname }
    }
  }
  return null
}

export function isLotteryQuestion (text) {
  const normalized = text.replace(/@/g, '')
  return lotteryQuestionPatterns.some(pattern => pattern.test(normalized))
}

export function extractUserFromText (text) {
  for (const pattern of lotteryQuestionPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      let candidate = match[1].trim()

      const mentionMatch = candidate.match(mentionRegex)
      if (mentionMatch) {
        const userId = mentionMatch[1]
        if (users[userId]) {
          return { userId, nickname: users[userId].nickname }
        }
        return { nickname: candidate }
      }

      if (candidate.startsWith('@')) {
        candidate = candidate.slice(1).trim()
      }

      for (const [userId, user] of Object.entries(users)) {
        if (user.nickname.toLowerCase() === candidate.toLowerCase()) {
          return { userId, nickname: user.nickname }
        }
      }

      return { nickname: candidate }
    }
  }
  return null
}

export function findUserIdAndNickname (candidate) {
  const cleanCandidate = candidate.trim().toLowerCase()
  for (const [userId, user] of Object.entries(users)) {
    if (user.nickname.toLowerCase() === cleanCandidate) {
      return { userId, nickname: user.nickname }
    }
  }
  return null
}
