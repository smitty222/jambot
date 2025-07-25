import { postMessage } from '../libs/cometchat.js'
import { getCurrentDJUUIDs } from '../libs/bot.js'
import { getTheme } from '../utils/themeManager.js'

// Memory-based point tracking (replace with DB later)
const userPoints = {}
let letterChallengeTimer = null
let currentChallengeLetter = null
let currentDJ = null

// Convert duration formats to milliseconds
export function parseDurationToMs(duration) {
  if (typeof duration === 'number') return duration * 1000

  const parts = duration.split(':').map(Number)
  if (parts.length === 2) {
    const [minutes, seconds] = parts
    return (minutes * 60 + seconds) * 1000
  } else if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    return ((hours * 3600) + (minutes * 60) + seconds) * 1000
  }

  return 0
}

// Pick a random letter A–Z
function getRandomLetter() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return letters[Math.floor(Math.random() * letters.length)]
}

// Score a DJ’s track
export async function scoreLetterChallenge(bot) {
  const songTitle = bot.currentSong?.trackName || ''
  const artistName = bot.currentSong?.artistName || ''
  const playingDJ = getCurrentDJUUIDs(bot.state)[0]

  if (!currentChallengeLetter || !songTitle || !playingDJ) return

  const letter = currentChallengeLetter.toUpperCase()
  const firstLetter = songTitle[0]?.toUpperCase()

  if (firstLetter !== letter) {
    await postMessage({
      room: bot.roomUUID,
      message: `❌ <@uid:${playingDJ}> played *${songTitle}* — but it doesn't start with "${letter}". No points this round!`
    })
    currentChallengeLetter = null
    currentDJ = null
    return
  }

  let score = 1 // Base point for first word match
  let breakdown = ['+1 for track title starting with the correct letter']

  const words = songTitle.trim().split(/\s+/)
  for (let i = 1; i < words.length; i++) {
    if (words[i][0]?.toUpperCase() === letter) {
      score++
      breakdown.push(`+1 for word "${words[i]}" in title`)
    }
  }

  if (artistName[0]?.toUpperCase() === letter) {
    score++
    breakdown.push(`+1 for artist name starting with "${letter}"`)
  }

  userPoints[playingDJ] = (userPoints[playingDJ] || 0) + score

  await postMessage({
    room: bot.roomUUID,
    message: `✅ <@uid:${playingDJ}> earned ${score} point(s) for playing *${songTitle}* by *${artistName}* — matching letter "${letter}"!\n${breakdown.join('\n')}\n🎯 Total: ${userPoints[playingDJ]} point(s)`
  })

  currentChallengeLetter = null
  currentDJ = null
}

// Schedule the challenge near end of song
export function scheduleLetterChallenge(bot) {
  if (!bot || !bot.currentSong) return

  const challengeStartMs = bot.currentSong.challengeStartMs
  const theme = getTheme(bot.roomUUID)?.toLowerCase()

  if (!theme || !theme.includes('name game')) {
    return
  }

  if (!challengeStartMs || typeof challengeStartMs !== 'number') {
    console.log('[🎵 NameGame] Invalid challengeStartMs')
    return
  }

  if (letterChallengeTimer) {
    clearTimeout(letterChallengeTimer)
    letterChallengeTimer = null
  }

  letterChallengeTimer = setTimeout(async () => {
    const letter = getRandomLetter()
    currentChallengeLetter = letter
    currentDJ = getCurrentDJUUIDs(bot.state)[0]

    await postMessage({
      room: bot.roomUUID,
      message: `🎯 Letter Challenge!\n<@uid:${currentDJ}>, your next song should start with *${letter}* to score points!\n🎁 Bonus for multiple words or matching artist!`
    })

    letterChallengeTimer = null
  }, challengeStartMs)
}
