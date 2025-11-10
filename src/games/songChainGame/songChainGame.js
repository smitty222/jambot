// src/handlers/songChainGame.js

import { postMessage } from '../../libs/cometchat.js'
import { getCurrentDJUUIDs } from '../../libs/bot.js'
import { getTheme } from '../../utils/themeManager.js'

// ───────────────────────────────────────────────────────────
// In-memory state (swap to DB later if you want persistence)
// ───────────────────────────────────────────────────────────

let lastSong = null // { title, artist, dj }
const userScores = {}
const userStreaks = {}
let totalValidLinks = 0
let totalBrokenChains = 0

// Words to ignore when comparing
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'for',
  'ft', 'feat', 'featuring', 'vs', 'with', 'x', '&'
])

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

function normalizeWord (word) {
  if (!word) return ''
  let w = word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
  if (!w) return ''
  if (STOPWORDS.has(w)) return ''
  return w
}

function tokenize (text) {
  if (!text) return []
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter(Boolean)
}

function getLinkDetails (prev, curr) {
  if (!prev) return { valid: false, matches: [], titleMatch: false }

  const prevTitleWords = new Set(tokenize(prev.title))
  const prevArtistWords = new Set(tokenize(prev.artist))
  const currTitleWords = tokenize(curr.title)
  const currArtistWords = tokenize(curr.artist)

  const matches = new Set()
  let titleMatch = false

  for (const w of currTitleWords) {
    if (prevTitleWords.has(w) || prevArtistWords.has(w)) {
      matches.add(w)
      if (prevTitleWords.has(w)) titleMatch = true
    }
  }
  for (const w of currArtistWords) {
    if (prevTitleWords.has(w) || prevArtistWords.has(w)) {
      matches.add(w)
    }
  }

  const matchList = Array.from(matches)
  return {
    valid: matchList.length > 0,
    matches: matchList,
    titleMatch
  }
}

function formatLeaderboard () {
  const entries = Object.entries(userScores)
  if (!entries.length) {
    return '📊 **Song Chain Leaderboard**\nNo points yet. Be the first to link a track!'
  }

  const sorted = entries
    .sort((a, b) => b[1] - a[1])
    .map(([uid, score], index) => {
      const medal =
        index === 0 ? '🥇'
          : index === 1 ? '🥈'
          : index === 2 ? '🥉'
          : '🎵'
      return `${medal} <@uid:${uid}> — ${score} point(s)`
    })

  return [
    '📊 **Song Chain Leaderboard**',
    ...sorted,
    '',
    `✅ Valid links: ${totalValidLinks} | 🚫 Broken chains: ${totalBrokenChains}`
  ].join('\n')
}

// ───────────────────────────────────────────────────────────
// Core Game Logic
// ───────────────────────────────────────────────────────────

/**
 * Runs when a new song starts.
 * Only active when theme includes "song chain".
 */
export async function handleSongChainPlay (bot) {
  try {
    if (!bot || !bot.roomUUID || !bot.currentSong) return

    // Check theme first — game only runs for "song chain" mode
    const theme = (getTheme(bot.roomUUID) || '').toLowerCase()
    const active = theme.includes('song chain')

    if (!active) {
      // Not in Song Chain theme → clear state & skip
      resetSongChainState()
      return
    }

    const djUUIDs = getCurrentDJUUIDs(bot.state) || []
    const djUUID = Array.isArray(djUUIDs) ? djUUIDs[0] : null
    if (!djUUID) return

    const trackName = bot.currentSong.trackName || ''
    const artistName = bot.currentSong.artistName || ''
    const curr = { title: trackName, artist: artistName, dj: djUUID }

    // First song establishes the chain
    if (!lastSong) {
      lastSong = curr
      await postMessage({
        room: bot.roomUUID,
        message:
          `🧩 **Song Chain started!**\n` +
          `Starting with *${trackName}* by *${artistName}*.\n` +
          `Next DJ: link your song title or artist with at least **one shared word** from this track!`
      })
      return
    }

    // Compare with last song
    const { valid, matches, titleMatch } = getLinkDetails(lastSong, curr)

    if (!valid) {
      totalBrokenChains++
      userStreaks[djUUID] = 0

      await postMessage({
        room: bot.roomUUID,
        message:
          `🚫 **Chain broken!**\n` +
          `<@uid:${djUUID}> played *${trackName}* by *${artistName}* — no shared words with the previous song.\n` +
          `🧱 A new chain starts from here!`
      })

      lastSong = curr
      return
    }

    // Scoring
    let score = 1
    const breakdown = [`+1 for shared word(s): ${matches.join(', ')}`]

    if (matches.length > 1) {
      score += 1
      breakdown.push('+1 for multiple matching words')
    }
    if (titleMatch) {
      score += 1
      breakdown.push('+1 for title-to-title match')
    }

    userStreaks[djUUID] = (userStreaks[djUUID] || 0) + 1
    if (userStreaks[djUUID] > 1) {
      score += 1
      breakdown.push(`+1 streak bonus (${userStreaks[djUUID]} in a row)`)
    }

    userScores[djUUID] = (userScores[djUUID] || 0) + score
    totalValidLinks++

    await postMessage({
      room: bot.roomUUID,
      message:
        `✅ **Song Chain link!**\n` +
        `<@uid:${djUUID}> earned **${score}** point(s) for *${trackName}* by *${artistName}*.\n` +
        `Matched word(s): **${matches.join(', ')}**\n` +
        `${breakdown.map(b => `• ${b}`).join('\n')}\n` +
        `🏅 Total: **${userScores[djUUID]}**`
    })

    lastSong = curr
  } catch (err) {
    console.error('SongChain error:', err)
  }
}

// ───────────────────────────────────────────────────────────
// Public helpers
// ───────────────────────────────────────────────────────────

export async function handleSongChainLeaderboardCommand (roomUUID) {
  const message = formatLeaderboard()
  await postMessage({ room: roomUUID, message })
}

export function resetSongChainState () {
  lastSong = null
  Object.keys(userScores).forEach(k => delete userScores[k])
  Object.keys(userStreaks).forEach(k => delete userStreaks[k])
  totalValidLinks = 0
  totalBrokenChains = 0
}
