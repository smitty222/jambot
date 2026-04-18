// src/utils/aiHelpers.js

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 45_000)

// --- Prompt builders ------------------------------------------------------

export function expandSongQuestion (rawQ, song) {
  if (!song) return rawQ

  const parts = []
  if (song.trackName) parts.push(`Track: ${song.trackName}`)
  if (song.artistName) parts.push(`Artist: ${song.artistName}`)
  if (song.albumName && song.albumName !== 'Unknown') parts.push(`Album: ${song.albumName}`)
  if (song.releaseDate && song.releaseDate !== 'Unknown') parts.push(`Release: ${song.releaseDate}`)
  if (song.isrc) parts.push(`ISRC: ${song.isrc}`)
  if (song.popularity != null) parts.push(`Spotify popularity: ${song.popularity}`)

  const links = song?.links?.spotify?.url || song?.links?.appleMusic?.url || song?.links?.youtube?.url
  const linkLine = links ? `Link: ${links}` : ''
  const songCard = `${parts.join(' | ')}${linkLine ? `\n${linkLine}` : ''}`

  const q = String(rawQ || '')
    .replace(/\b(tell me about|what is|what's|info on|details about)\s+(this song)\b/gi, '$1 THE_SONG')
    .replace(/\b(this song|this track|current song|song that is playing)\b/gi, 'THE_SONG')

  return q.replace(
    /THE_SONG/g,
    `this song:\n${songCard}\n\n` +
    'Write a short, fun blurb with notable facts (samples, origin, chart peaks, vibe). ' +
    'Then give 1 similar-track recommendation (artist – track) and why.'
  )
}

export function expandAlbumQuestion (rawQ, albumName, artistName) {
  if (!albumName && !artistName) return rawQ

  const parts = []
  if (albumName) parts.push(`Album: ${albumName}`)
  if (artistName) parts.push(`Artist: ${artistName}`)
  const albumCard = parts.join(' | ')

  const q = String(rawQ || '')
    .replace(/\u2019/g, "'")
    .replace(/\b(tell me about|what is|what's|info on|details about)\s+(this (album|record|lp|ep))\b/gi, '$1 THE_ALBUM')
    .replace(/\b(this (album|record|lp|ep)|current album|album that is playing|the album)\b/gi, 'THE_ALBUM')

  return q.replace(
    /THE_ALBUM/g,
    `this album:\n${albumCard}\n\n` +
    'Write a short, fun blurb (context/era, standout tracks, reception). ' +
    'Then recommend 1 similar album and why.'
  )
}

// --- Sports intent detection ----------------------------------------------

const MLB_TEAM_NAMES = [
  'mets', 'yankees', 'red sox', 'dodgers', 'astros', 'cubs', 'cardinals',
  'braves', 'phillies', 'giants', 'padres', 'brewers', 'reds', 'pirates',
  'nationals', 'marlins', 'angels', 'rangers', 'athletics', 'mariners',
  'twins', 'white sox', 'tigers', 'royals', 'guardians', 'orioles',
  'blue jays', 'rays', 'rockies', 'diamondbacks'
]
const MLB_ABBRS = [
  'NYY', 'NYM', 'BOS', 'LAD', 'HOU', 'CHC', 'STL', 'ATL', 'PHI', 'SFG',
  'SDP', 'MIL', 'CIN', 'PIT', 'WSH', 'MIA', 'LAA', 'TEX', 'OAK', 'SEA',
  'MIN', 'CWS', 'DET', 'KCR', 'CLE', 'BAL', 'TOR', 'TBR', 'COL', 'ARI'
]

const NBA_TEAM_NAMES = [
  'celtics', 'nets', 'knicks', '76ers', 'sixers', 'raptors',
  'bulls', 'cavaliers', 'cavs', 'pistons', 'pacers', 'bucks',
  'hawks', 'hornets', 'heat', 'magic', 'wizards',
  'nuggets', 'timberwolves', 'wolves', 'thunder', 'trail blazers', 'blazers', 'jazz',
  'warriors', 'clippers', 'lakers', 'suns', 'kings',
  'mavericks', 'mavs', 'rockets', 'grizzlies', 'pelicans', 'spurs'
]
const NBA_ABBRS = [
  'BOS', 'BKN', 'NYK', 'PHI', 'TOR', 'CHI', 'CLE', 'DET', 'IND', 'MIL',
  'ATL', 'CHA', 'MIA', 'ORL', 'WAS', 'DEN', 'MIN', 'OKC', 'POR', 'UTA',
  'GSW', 'LAC', 'LAL', 'PHX', 'SAC', 'DAL', 'HOU', 'MEM', 'NOP', 'SAS'
]

const NHL_TEAM_NAMES = [
  'bruins', 'sabres', 'red wings', 'panthers', 'canadiens', 'habs', 'senators',
  'lightning', 'maple leafs', 'leafs', 'hurricanes', 'blue jackets', 'islanders',
  'rangers', 'flyers', 'penguins', 'pens', 'capitals', 'caps',
  'coyotes', 'blackhawks', 'hawks', 'avalanche', 'avs', 'stars', 'wild',
  'predators', 'preds', 'blues', 'jets', 'ducks', 'flames', 'oilers',
  'kings', 'sharks', 'canucks', 'kraken', 'golden knights', 'knights', 'utah hockey'
]
const NHL_ABBRS = [
  'BOS', 'BUF', 'DET', 'FLA', 'MTL', 'OTT', 'TBL', 'TOR', 'CAR', 'CBJ',
  'NYI', 'NYR', 'PHI', 'PIT', 'WSH', 'ARI', 'CHI', 'COL', 'DAL', 'MIN',
  'NSH', 'STL', 'WPG', 'ANA', 'CGY', 'EDM', 'LAK', 'SJS', 'VAN', 'SEA', 'VGK'
]

function matchesTeamList (q, names, abbrs) {
  const s = String(q || '').toLowerCase()
  if (names.some(name => s.includes(name))) return true
  if (abbrs.some(abbr => new RegExp(`\\b${abbr}\\b`).test(String(q || '')))) return true
  return false
}

export function isMlbSportsQuery (q) {
  const s = String(q || '').toLowerCase()
  if (matchesTeamList(q, MLB_TEAM_NAMES, MLB_ABBRS)) return true
  if (/\b(mlb|baseball|pennant|world series)\b/.test(s)) return true
  return false
}

export function isNbaSportsQuery (q) {
  const s = String(q || '').toLowerCase()
  if (matchesTeamList(q, NBA_TEAM_NAMES, NBA_ABBRS)) return true
  if (/\b(nba|basketball|finals|eastern conference|western conference)\b/.test(s)) return true
  return false
}

export function isNhlSportsQuery (q) {
  const s = String(q || '').toLowerCase()
  if (matchesTeamList(q, NHL_TEAM_NAMES, NHL_ABBRS)) return true
  if (/\b(nhl|hockey|stanley cup|power play|overtime)\b/.test(s)) return true
  return false
}

export function buildSportsPrompt (sportLabel, question, scoresData, standingsData, playoffData) {
  const lines = [
    'You are a friendly sports assistant in a music listening room.',
    `Answer the user's ${sportLabel} question conversationally in 1-2 short sentences using the data below.`,
    'Be direct and casual — no markdown, no bullet points, just plain text.',
    '',
    `User: ${question}`,
    '',
    `--- Current ${sportLabel} Scores ---`,
    scoresData || 'No scores available right now.',
    '',
    `--- ${sportLabel} Standings ---`,
    standingsData || 'No standings available right now.'
  ]
  if (playoffData) {
    lines.push('', `--- ${sportLabel} Playoff Series ---`, playoffData)
  }
  return lines.join('\n')
}

// --- Intent detection -----------------------------------------------------

export function isAlbumQuery (q) {
  const s = String(q || '').toLowerCase().replace(/\u2019/g, "'")
  return (
    /\b(what's|what is|tell me about|info on|details about)\s+this\s+(album|record|lp|ep)\b/.test(s) ||
    /\b(this\s+(album|record|lp|ep)|current album|album that is playing)\b/.test(s)
  )
}

export function isSongQuery (q) {
  const s = String(q || '').toLowerCase().replace(/\u2019/g, "'")
  return (
    s.includes('song is this') ||
    s.includes("what's this song") ||
    s.includes('what’s this song') ||
    s.includes('this song') ||
    s.includes('song is playing')
  )
}

// --- Mention parsing ------------------------------------------------------

export function isMentioned (message, { botUuid, chatName } = {}) {
  if (typeof message !== 'string') return false
  if (botUuid && message.includes(`<@uid:${botUuid}>`)) return true
  if (chatName && message.includes(`@${chatName}`)) return true
  return false
}

export function stripBotMention (message, { botUuid, chatName } = {}) {
  return String(message || '')
    .replace(`<@uid:${botUuid}>`, '')
    .replace(`@${chatName}`, '')
    .trim()
}

export function normalizeQuestion (q) {
  return String(q || '').trim() // keep casing if you want personality; avoid forced lowercasing
}

// --- AI reply extraction + timeout wrapper --------------------------------

export function extractText (reply) {
  if (!reply) return null
  if (typeof reply === 'string') return reply
  if (reply.text) return reply.text
  if (reply.candidates?.[0]?.content?.parts?.[0]?.text) return reply.candidates[0].content.parts[0].text
  return null
}

export async function safeAskQuestion (prompt, askFn, logger, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const result = await Promise.race([
      askFn(prompt),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), timeoutMs))
    ])

    const txt = extractText(result)
    if (!txt) throw new Error('AI_EMPTY_RESPONSE')
    return txt.trim()
  } catch (err) {
    logger?.error?.(`[AI] ${err?.message || err}`, { err })
    return 'My AI brain buffered too long. Try again in a sec. 😅'
  }
}

// --- Optional: simple per-user cooldown -----------------------------------

const _cooldowns = new Map()

export function checkCooldown (userUuid, key, ms) {
  if (!userUuid || !key || !ms) return { ok: true }
  const now = Date.now()
  const k = `${userUuid}:${key}`
  const last = _cooldowns.get(k) || 0
  if (now - last < ms) {
    return { ok: false, remainingMs: ms - (now - last) }
  }
  _cooldowns.set(k, now)
  return { ok: true }
}
