// lotteryQuestionParser.js

import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const usersFilePath = path.join(__dirname, '../data/users.json')
const users = JSON.parse(await readFile(usersFilePath, 'utf-8'))


const mentionRegex = /<@uid:([a-f0-9\-]+)>/i;
const nicknameRegex = /([\w\s\-]+)/i; // no need for '@' here since you strip them before matching

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
  ];
  
function normalizeUserMention(text, users) {
  return text.replace(/<@uid:([a-f0-9\-]+)>/gi, (match, userId) => {
    return users[userId]?.nickname || match;
  });
}

function findUserInText(text, users) {
  for (const [userId, user] of Object.entries(users)) {
    if (text.toLowerCase().includes(user.nickname.toLowerCase())) {
      return { userId, nickname: user.nickname };
    }
  }
  return null;
}

export function isLotteryQuestion(text) {
    const normalized = text.replace(/@/g, ''); // strip '@' only for matching
    return lotteryQuestionPatterns.some(pattern => pattern.test(normalized));
  }
  
  

  export function extractUserFromText(text) {
    for (const pattern of lotteryQuestionPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let candidate = match[1].trim();
  
        // First try matching mention by UID format:
        const mentionMatch = candidate.match(mentionRegex);
        if (mentionMatch) {
          const userId = mentionMatch[1];
          if (users[userId]) {
            return { userId, nickname: users[userId].nickname };
          }
          return candidate; // fallback, unknown uid
        }
  
        // If candidate starts with '@', strip it for nickname lookup:
        if (candidate.startsWith('@')) {
          candidate = candidate.slice(1).trim();
        }
  
        // Now try nickname lookup (case-insensitive)
        for (const [userId, user] of Object.entries(users)) {
          if (user.nickname.toLowerCase() === candidate.toLowerCase()) {
            return { userId, nickname: user.nickname };
          }
        }
  
        // If no match, just return nickname fallback:
        return { nickname: candidate };
      }
    }
    return null;
  }
  
  
  

  export function findUserIdAndNickname(candidate) {
    const cleanCandidate = candidate.trim().toLowerCase();
    for (const [userId, user] of Object.entries(users)) {
      if (user.nickname.toLowerCase() === cleanCandidate) {
        return { userId, nickname: user.nickname };
      }
    }
    return null;
  }
  
