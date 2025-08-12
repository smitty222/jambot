import { formatDistanceToNow } from 'date-fns'
import { getAverageRating } from './voteCounts.js'
import { postMessage } from '../libs/cometchat.js'
import { roomThemes } from '../handlers/message.js'
import db from '../database/db.js'
import { roomBot } from '../index.js'
import { askQuestion } from '../libs/ai.js'

// ───────────────────────────────────────────────────────────
// Settings persistence (SQLite via db)
// ───────────────────────────────────────────────────────────
const KEY_INFOBLURB_ENABLED = 'nowplaying_infoblurb_enabled'
const KEY_INFOBLURB_TONE    = 'nowplaying_infoblurb_tone'

// Create settings table if missing
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run()
} catch (e) {
  console.error('[announceNowPlaying] Failed to ensure app_settings table:', e)
}

// Helpers
function readSetting(key) {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
    return row ? row.value : null
  } catch (e) {
    console.error('[announceNowPlaying] readSetting error:', e)
    return null
  }
}
function writeSetting(key, value) {
  try {
    db.prepare(
      'INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(key, String(value))
  } catch (e) {
    console.error('[announceNowPlaying] writeSetting error:', e)
  }
}

// ───────────────────────────────────────────────────────────
// Tones
// ───────────────────────────────────────────────────────────
const TONES = ['neutral','playful','cratedigger','hype','classy','chartbot','djtech','vibe']
const TONE_ALIASES = {
  nerd: 'cratedigger', crate: 'cratedigger', digger: 'cratedigger',
  n: 'neutral', neutral: 'neutral',
  p: 'playful', fun: 'playful', playful: 'playful',
  hype: 'hype', amp: 'hype',
  classy: 'classy', formal: 'classy',
  chart: 'chartbot', charts: 'chartbot', chartbot: 'chartbot',
  tech: 'djtech', djtech: 'djtech',
  vibe: 'vibe', chill: 'vibe'
}
function normalizeTone(raw) {
  const t = String(raw || '').toLowerCase()
  const aliased = TONE_ALIASES[t] || t
  return TONES.includes(aliased) ? aliased : 'neutral'
}

// ───────────────────────────────────────────────────────────
/** Toggle: AI info blurb on/off + tone (DB-backed with env defaults)
 * Env: NOWPLAYING_INFOBLURB=true|1|on|yes (default ON if missing)
 * Env: NOWPLAYING_INFOBLURB_TONE=neutral|playful|cratedigger|hype|classy|chartbot|djtech|vibe
 */
const envEnabledDefault = ['1','true','on','yes'].includes(String(process.env.NOWPLAYING_INFOBLURB ?? '').toLowerCase())
const envToneDefaultRaw = (process.env.NOWPLAYING_INFOBLURB_TONE || 'neutral')
const envToneDefault    = normalizeTone(envToneDefaultRaw)

// Initialize from DB or env (and persist)
let INFO_BLURB_ENABLED = (() => {
  const v = readSetting(KEY_INFOBLURB_ENABLED)
  if (v === null) {
    const initial = (envEnabledDefault || true) // default ON
    writeSetting(KEY_INFOBLURB_ENABLED, initial ? '1' : '0')
    return !!initial
  }
  return v === '1'
})()

let INFO_BLURB_TONE = (() => {
  const v = readSetting(KEY_INFOBLURB_TONE)
  if (v === null) {
    writeSetting(KEY_INFOBLURB_TONE, envToneDefault)
    return envToneDefault
  }
  return normalizeTone(v)
})()

// Public API for toggles
export function enableNowPlayingInfoBlurb()  { INFO_BLURB_ENABLED = true;  writeSetting(KEY_INFOBLURB_ENABLED, '1') }
export function disableNowPlayingInfoBlurb() { INFO_BLURB_ENABLED = false; writeSetting(KEY_INFOBLURB_ENABLED, '0') }
export function setNowPlayingInfoBlurb(enabled) { INFO_BLURB_ENABLED = !!enabled; writeSetting(KEY_INFOBLURB_ENABLED, enabled ? '1' : '0') }
export function isNowPlayingInfoBlurbEnabled() { return INFO_BLURB_ENABLED }

export function setNowPlayingInfoBlurbTone(tone) {
  const norm = normalizeTone(tone)
  INFO_BLURB_TONE = norm
  writeSetting(KEY_INFOBLURB_TONE, norm)
}
export function getNowPlayingInfoBlurbTone() { return INFO_BLURB_TONE }

// ───────────────────────────────────────────────────────────
// Blurb cache (avoid repeat AI calls for same song)
// ───────────────────────────────────────────────────────────
const BLURB_TTL_MS = 15 * 60 * 1000
const blurbCache = new Map() // key -> { text, ts }
function blurbKey(song) {
  return song.songId || song.spotifyTrackId || `${song.trackName}|${song.artistName}`
}

// ───────────────────────────────────────────────────────────
// Adaptive soft deadline + retry configs
// ───────────────────────────────────────────────────────────
const AI_HARD_TIMEOUT_MS = 15000 // total hard timeout per attempt
const LAT_WIN = 20
let aiLatencies = [] // ms for successful attempts

function recordAiLatency(ms) {
  aiLatencies.push(ms)
  if (aiLatencies.length > LAT_WIN) aiLatencies.shift()
}
function median(arr) {
  if (!arr.length) return null
  const a = [...arr].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}
// choose deadline = clamp(median + 250ms, 900..2200ms)
function getSoftDeadlineMs() {
  const m = median(aiLatencies) ?? 1200
  const d = m + 250
  return Math.max(900, Math.min(2200, d))
}

// ───────────────────────────────────────────────────────────
// AI helpers for ultra-brief blurbs
// ───────────────────────────────────────────────────────────
export function buildSongBlurbPrompt(song, tone = 'neutral') {
  const {
    trackName, artistName, albumName, releaseDate, popularity
  } = song || {}

  const toneMap = {
    neutral:     'Tone: neutral, informative.',
    playful:     'Tone: playful, 1 tasteful emoji allowed; light slang ok.',
    cratedigger: 'Tone: cratedigger—include one micro fact (sample lineage, producer, label, key, or chart stat).',
    hype:        'Tone: hype—energetic, crowd-facing, one short exclamation allowed; no caps-lock.',
    classy:      'Tone: classy—no slang, no emojis; concise editorial style.',
    chartbot:    'Tone: chartbot—prioritize chart peaks (with country) or certifications; keep it snappy.',
    djtech:      'Tone: djtech—mention BPM range or key if meaningful; avoid jargon beyond one term.',
    vibe:        'Tone: vibe—paint the mood with 1–2 genre adjectives; avoid numbers unless iconic.'
  }
  const toneLine = toneMap[normalizeTone(tone)] || toneMap.neutral

  return `You are a music room bot. Write ONE ultra-brief blurb (max 200 characters) about the current song.
Only include facts you are highly confident in (>=90%): year, subgenre, remix/cover/sample relationship, notable chart peak (with country), country of origin, producer, label, instrumentation/vibe, BPM/key if meaningful.
NEVER mention identifiers or codes (ISRC, UPC, catalog numbers, file hashes, streaming IDs). Do not include raw URLs or handle-like IDs.
Do NOT repeat the song title or artist name—the room already shows them.
If unsure, favor a concise vibe/genre description. No links, no hashtags, no quotes, no extra lines. Output ONLY the blurb text.
${toneLine}

Song metadata:
Title: ${trackName || 'Unknown'}
Artist: ${artistName || 'Unknown'}
Album: ${albumName || 'Unknown'}
Release: ${releaseDate || 'Unknown'}
Spotify popularity: ${popularity ?? 'Unknown'}`
}

function extractText(reply) {
  if (!reply) return null
  if (typeof reply === 'string') return reply
  if (reply.text) return reply.text
  if (reply.candidates?.[0]?.content?.parts?.[0]?.text) return reply.candidates[0].content.parts[0].text
  return null
}

// attempt with hard timeout + latency logging
async function attemptAI(prompt) {
  const t0 = Date.now()
  try {
    const result = await Promise.race([
      askQuestion(prompt),
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), AI_HARD_TIMEOUT_MS))
    ])
    const txt = extractText(result)
    if (!txt) throw new Error('AI_EMPTY_RESPONSE')
    recordAiLatency(Date.now() - t0)
    return txt.trim()
  } catch (e) {
    console.warn('[NowPlaying][AI] attempt failed:', e?.message || e)
    return null
  }
}

// safeAskQuestion with one retry on a simplified prompt
async function safeAskQuestion(prompt) {
  // 1st try: full prompt
  let text = await attemptAI(prompt)
  if (text) return text

  // 2nd try: simplified prompt (short + vibe)
  const simple = prompt
    .replace(/NEVER mention[\s\S]*?IDs\).*/i, '')
    .replace(/Only include facts[\s\S]*?meaningful\.\n/i, 'Only include one confident micro-fact or a concise vibe.\n')
    .replace(/Output ONLY the blurb text\./i, 'Output ONLY the blurb text.')
  return await attemptAI(simple)
}

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function sanitizeBlurb(text, song) {
  if (!text) return text

  // 1) trim quotes
  let t = text.replace(/^["'“”]+|["'“”]+$/g, '').trim()

  // 2) remove forbidden identifiers (ISRC/UPC/catalog numbers/IDs)
  t = t
    .replace(/\bISRC\b[:\s-]*[A-Z0-9-_.]+/gi, '')
    .replace(/\bUPC\b[:\s-]*\d{8,}/gi, '')
    .replace(/\b(catalog|catalogue|cat\.?\s*no\.?)\b[:\s-]*[A-Z0-9-_.]+/gi, '')
    .replace(/\b(id|track id|song id)\b[:\s-]*[A-Z0-9-_.]+/gi, '')

  // 3) remove repeated title/artist words (we already show them)
  const names = [song?.trackName, song?.artistName].filter(x => x && x.length > 3)
  for (const n of names) {
    const re = new RegExp(`\\b${escapeRegExp(n)}\\b`, 'ig')
    t = t.replace(re, ' ')
  }

  // 4) tidy punctuation/spacing
  t = t.replace(/^[\-–—:,\s]+/, '').replace(/\s{2,}/g, ' ').trim()
  t = t.replace(/[,;:]\s*[,;:]+/g, ', ') // collapse repeating punctuation

  // 5) if we accidentally nuked everything, bail
  return t || null
}

// Ask AI with an adaptive soft deadline so we can send Now Playing first if needed
async function getBlurbWithSoftDeadline(song, tone) {
  const prompt = buildSongBlurbPrompt(song, tone)

  let softTimedOut = false
  const aiWork = (async () => {
    let blurb = await safeAskQuestion(prompt)
    blurb = sanitizeBlurb(blurb, song)
    if (blurb && blurb.length > 200) blurb = blurb.slice(0, 197) + '…'
    return blurb || null
  })()

  const softDeadline = getSoftDeadlineMs()
  const soft = await Promise.race([
    aiWork,
    new Promise((res) => setTimeout(() => { softTimedOut = true; res(null) }, softDeadline))
  ])

  return { soft, final: aiWork, softTimedOut }
}

// ───────────────────────────────────────────────────────────
// Main: announceNowPlaying with optional AI blurb
//  - include in same message if AI fast
//  - otherwise post base message, then follow up with blurb
// ───────────────────────────────────────────────────────────
export async function announceNowPlaying(room) {
  try {
    const song = roomBot.currentSong
    if (!song || !song.trackName || !song.artistName || !song.songId) return

    // 🧠 Skip standard message if we're in an album theme — let handleAlbumTheme() do its thing
    const theme = (roomThemes[room] || '').toLowerCase()
    const albumThemes = ['album monday', 'albums', 'album day']
    const isAlbumTheme = albumThemes.includes(theme)
    if (isAlbumTheme) {
      console.log(`🎧 Album theme detected (${theme}) — skipping default now playing message.`)
      return
    }

    const stats = db.prepare(`
      SELECT playCount, lastPlayed
      FROM room_stats
      WHERE songId = ?
    `).get(song.songId)

    const avgInfo = await getAverageRating(song)

    let message = `🎵 Now playing: “${song.trackName}” by ${song.artistName}`

    if (!stats?.lastPlayed || stats.playCount === 1) {
      message += `\n🆕 First time playing in this room!`
    } else {
      message += `\n🔁 Played ${stats.playCount} time${stats.playCount !== 1 ? 's' : ''}`
      const lastPlayedTime = formatDistanceToNow(new Date(stats.lastPlayed), { addSuffix: true })
      message += `\n🕒 Last played ${lastPlayedTime}`
    }

    if (avgInfo.found) {
      message += `\n⭐ ${avgInfo.average}/5 (${avgInfo.count} rating${avgInfo.count === 1 ? '' : 's'})`
    }

    // ——— AI Info Blurb ———
    if (INFO_BLURB_ENABLED) {
      const key = blurbKey(song)
      const cached = blurbCache.get(key)
      let blurb = cached && (Date.now() - cached.ts < BLURB_TTL_MS) ? cached.text : null

      if (!blurb) {
        const { soft, final, softTimedOut } = await getBlurbWithSoftDeadline(song, INFO_BLURB_TONE)

        if (soft) {
          blurb = soft
          blurbCache.set(key, { text: blurb, ts: Date.now() })
          message += `\nℹ️ ${blurb}` // same message include (fast path)
          await postMessage({ room, message })
          return
        }

        // AI was slow → post base message now
        await postMessage({ room, message })

        if (softTimedOut) {
          // await the final result and post follow-up if we get one
          const finalBlurb = await final.catch(() => null)
          if (finalBlurb) {
            blurbCache.set(key, { text: finalBlurb, ts: Date.now() })
            await postMessage({ room, message: `ℹ️ ${finalBlurb}` })
          }
        }
        return
      }

      // had cached blurb
      message += `\nℹ️ ${blurb}`
    }

    // no AI or cached added → post once
    await postMessage({ room, message })
  } catch (err) {
    console.error('Error in announceNowPlaying:', err)
  }
}
