// src/handlers/songChainGame.js

import { postMessage } from '../../libs/cometchat.js'
import { getCurrentDJUUIDs } from '../../libs/bot.js'
import { getTheme } from '../../utils/themeManager.js'
import { getCompactEquippedTitleTag } from '../../database/dbprestige.js'

// ───────────────────────────────────────────────────────────
// In-memory state (swap to DB later if you want persistence)
// ───────────────────────────────────────────────────────────

let lastSong = null // { title, artist, dj }
const userScores = {}
let totalValidLinks = 0
let totalBrokenChains = 0

function compactLeaderboardName (uuid, maxLen = 10) {
  const id = String(uuid || '')
  const label = `user-${id.slice(0, 6)}`
  return label.length <= maxLen ? label : label.slice(0, maxLen)
}

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
  const w = word.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
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

/**
 * Returns:
 * - valid: at least one shared word between prev (title/artist) and curr (title/artist)
 * - matches: unique shared words
 * - titleMatch: true if at least one shared word appears in BOTH titles
 * - titleMatchCounts: { [word]: countInCurrTitle } for shared words that appear in curr title
 */
function getLinkDetails (prev, curr) {
  if (!prev) return { valid: false, matches: [], titleMatch: false, titleMatchCounts: {} }

  const prevTitleWords = new Set(tokenize(prev.title))
  const prevArtistWords = new Set(tokenize(prev.artist))

  const currTitleTokens = tokenize(curr.title)
  const currArtistTokens = tokenize(curr.artist)

  // Count occurrences of each normalized word in CURRENT title
  const currTitleCounts = {}
  for (const w of currTitleTokens) {
    currTitleCounts[w] = (currTitleCounts[w] || 0) + 1
  }

  const matches = new Set()
  let titleMatch = false
  const titleMatchCounts = {}

  // Title words: if they match prev title OR prev artist, they're a valid link
  for (const w of currTitleTokens) {
    if (prevTitleWords.has(w) || prevArtistWords.has(w)) {
      matches.add(w)
      // Title-to-title?
      if (prevTitleWords.has(w)) titleMatch = true
    }
  }

  // Artist words can also link
  for (const w of currArtistTokens) {
    if (prevTitleWords.has(w) || prevArtistWords.has(w)) {
      matches.add(w)
    }
  }

  // For shared words, record how many times they appeared in CURRENT title
  for (const w of matches) {
    if (currTitleCounts[w]) titleMatchCounts[w] = currTitleCounts[w]
  }

  const matchList = Array.from(matches)
  return {
    valid: matchList.length > 0,
    matches: matchList,
    titleMatch,
    titleMatchCounts
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
        index === 0
          ? '🥇'
          : index === 1
            ? '🥈'
            : index === 2
              ? '🥉'
              : '🎵'
      const titleTag = getCompactEquippedTitleTag(uid, 7)
      const name = compactLeaderboardName(uid, titleTag ? 8 : 10)
      return `${medal} ${titleTag ? `${titleTag} ` : ''}${name} ${score}pt`
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
          '🧩 **Song Chain started!**\n' +
          `Starting with *${trackName}* by *${artistName}*.\n` +
          'Next DJ: link your song title or artist with at least **one shared word** from this track!'
      })
      return
    }

    // Compare with last song
    const { valid, matches, titleMatch, titleMatchCounts } = getLinkDetails(lastSong, curr)

    if (!valid) {
      totalBrokenChains++

      await postMessage({
        room: bot.roomUUID,
        message:
          '🚫 **Chain broken!**\n' +
          `<@uid:${djUUID}> played *${trackName}* by *${artistName}* — no shared words with the previous song.\n` +
          '🧱 A new chain starts from here!'
      })

      lastSong = curr
      return
    }

    // ───────────────────────────────────────────────────────
    // Scoring (NO streak points)
    //
    // 1) +1 per occurrence of any linked word in CURRENT SONG TITLE
    //    e.g. "happy days happy plays" = happy appears twice => +2 for happy
    // 2) +1 bonus if there are 2+ UNIQUE linked words
    // 3) +1 bonus if at least one linked word is title-to-title
    // ───────────────────────────────────────────────────────

    let score = 0
    const breakdown = []

    // +1 per occurrence in title
    const perWordLines = []
    for (const w of matches) {
      const countInTitle = titleMatchCounts[w] || 0
      if (countInTitle > 0) {
        score += countInTitle
        perWordLines.push(`${w} ×${countInTitle}`)
      }
    }

    // If link came only via artist words (no linked word appears in title),
    // still give at least +1 so links via artist aren't "0 points".
    if (score === 0) {
      score = 1
      breakdown.push(`+1 for linked word(s) via artist/title match: ${matches.join(', ')}`)
    } else {
      breakdown.push(`+${score} for repeated linked word(s) in title: ${perWordLines.join(', ')}`)
    }

    if (matches.length > 1) {
      score += 1
      breakdown.push('+1 for multiple UNIQUE matching words')
    }

    if (titleMatch) {
      score += 1
      breakdown.push('+1 for title-to-title match')
    }

    userScores[djUUID] = (userScores[djUUID] || 0) + score
    totalValidLinks++

    await postMessage({
      room: bot.roomUUID,
      message:
        '✅ **Song Chain link!**\n' +
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
  totalValidLinks = 0
  totalBrokenChains = 0
}
