import { postMessage } from '../libs/cometchat.js'
import { getCurrentDJUUIDs } from '../libs/bot.js'
import { getTheme } from '../utils/themeManager.js'
import { getCompactEquippedTitleTag } from '../database/dbprestige.js'

// Memory-based point tracking (replace with DB later)
const userPoints = {}
let letterChallengeTimer = null
let currentChallengeLetter = null
let totalRounds = 0
const currentRoundPlays = new Set()

function compactLeaderboardName (uuid, maxLen = 10) {
  const id = String(uuid || '')
  const label = `user-${id.slice(0, 6)}`
  return label.length <= maxLen ? label : label.slice(0, maxLen)
}

// Convert duration formats to milliseconds
export function parseDurationToMs (duration) {
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
function getRandomLetter () {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return letters[Math.floor(Math.random() * letters.length)]
}

// Generate a formatted leaderboard
function getLeaderboard () {
  const sorted = Object.entries(userPoints)
    .sort((a, b) => b[1] - a[1])
    .map(([uid, points], idx) => {
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎵'
      const titleTag = getCompactEquippedTitleTag(uid, 7)
      const name = compactLeaderboardName(uid, titleTag ? 8 : 10)
      return `${medal} ${titleTag ? `${titleTag} ` : ''}${name} ${points}pt`
    })

  return `📊 **Leaderboard**\n${sorted.join('\n')}`
}

// Score a DJ’s track
export async function scoreLetterChallenge (bot) {
  const theme = getTheme(bot.roomUUID)?.toLowerCase()
  if (!theme || !theme.includes('name game')) return

  const songTitle = bot.currentSong?.trackName || ''
  const artistName = bot.currentSong?.artistName || ''
  const playingDJ = getCurrentDJUUIDs(bot.state)[0]

  if (!currentChallengeLetter || !songTitle || !playingDJ) return

  const letter = currentChallengeLetter.toUpperCase()
  const firstLetter = songTitle[0]?.toUpperCase()

  if (firstLetter !== letter) {
    currentRoundPlays.add(playingDJ)

    const allStageDJs = getCurrentDJUUIDs(bot.state)
    const allHavePlayed = allStageDJs.every(dj => currentRoundPlays.has(dj))

    let roundEndMessage = ''
    if (allHavePlayed) {
      totalRounds++
      currentRoundPlays.clear()
      roundEndMessage = `\n\n🏁 **Round ${totalRounds} complete!**\n${getLeaderboard()}`
    }

    await postMessage({
      room: bot.roomUUID,
      message: `❌ <@uid:${playingDJ}> played *${songTitle}* — but it doesn't start with "${letter}". No points this round! 😢${roundEndMessage}`
    })

    currentChallengeLetter = null
    return
  }

  let score = 1
  const breakdown = ['+1 for track title starting with the correct letter']

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

  // 🎧 Popularity Bonus
  const popularity = bot.currentSong?.popularity || 0
  let popularityBonus = 0

  if (popularity >= 90) {
    popularityBonus = 2
    breakdown.push('🌟 +2 bonus for viral popularity!')
  } else if (popularity >= 75) {
    popularityBonus = 1
    breakdown.push('🔥 +1 bonus for popular pick!')
  }

  score += popularityBonus
  userPoints[playingDJ] = (userPoints[playingDJ] || 0) + score

  currentRoundPlays.add(playingDJ)
  const allStageDJs = getCurrentDJUUIDs(bot.state)
  const allHavePlayed = allStageDJs.every(dj => currentRoundPlays.has(dj))

  let roundEndMessage = ''
  if (allHavePlayed) {
    totalRounds++
    currentRoundPlays.clear()
    roundEndMessage = `\n\n🏁 **Round ${totalRounds} complete!**\n${getLeaderboard()}`
  }

  await postMessage({
    room: bot.roomUUID,
    message: `✅ **Scoring time!**\n<@uid:${playingDJ}> earned **${score}** point(s) for *${songTitle}* by *${artistName}* — matching **"${letter}"**! 🔠🎶\n\n${breakdown.map(b => `• ${b}`).join('\n')}\n\n🎯 **Total Points**: ${userPoints[playingDJ]} 🧮${roundEndMessage}`
  })

  currentChallengeLetter = null
}

// Schedule the challenge near end of song
export function scheduleLetterChallenge (bot) {
  if (!bot || !bot.currentSong) return

  const challengeStartMs = bot.currentSong.challengeStartMs
  const theme = getTheme(bot.roomUUID)?.toLowerCase()

  // ✅ ENFORCE NAME GAME ONLY
  if (!theme || !theme.includes('name game')) {
    return
  }

  if (!challengeStartMs || typeof challengeStartMs !== 'number') {
    return
  }

  if (letterChallengeTimer) {
    clearTimeout(letterChallengeTimer)
    letterChallengeTimer = null
  }

  letterChallengeTimer = setTimeout(async () => {
    const letter = getRandomLetter()
    const djUUIDs = getCurrentDJUUIDs(bot.state)

    const nextDJ = djUUIDs[1]

    if (!nextDJ) {
      return
    }

    currentChallengeLetter = letter
    await postMessage({
      room: bot.roomUUID,
      message: `🎯 **Letter Challenge Time!** 🔡\n<@uid:${nextDJ}> — your next track must start with **"${letter}"**!\n🎁 Bonus points for multiple matching words, artist name, or track popularity!`
    })

    letterChallengeTimer = null
  }, challengeStartMs)
}
