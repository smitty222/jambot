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
    `Write a short, fun blurb with notable facts (samples, origin, chart peaks, vibe). ` +
    `Then give 1 similar-track recommendation (artist – track) and why.`
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
    `Write a short, fun blurb (context/era, standout tracks, reception). ` +
    `Then recommend 1 similar album and why.`
  )
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
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), timeoutMs))
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