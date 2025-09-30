// src/handlers/announceNowPlaying.js
import { formatDistanceToNow } from 'date-fns'
import { getAverageRating } from './voteCounts.js'
import { postMessage } from '../libs/cometchat.js'
import { getTheme } from '../utils/themeManager.js'
import db from '../database/db.js'
import { roomBot } from '../index.js'
import { askQuestion } from '../libs/ai.js'
import { getGeniusAbout } from '../utils/API.js' // { songId, aboutPlain, aboutHtml, descAnno }

// ───────────────────────────────────────────────────────────
// Logging (defaults to info; set LOG_LEVEL=debug for extra detail)
// ───────────────────────────────────────────────────────────
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase()
const isInfo = LOG_LEVEL === 'info' || LOG_LEVEL === 'debug'
const isDebug = LOG_LEVEL === 'debug'
const log = (...a) => { if (isInfo) console.log(...a) }
const debug = (...a) => { if (isDebug) console.debug(...a) }

// ───────────────────────────────────────────────────────────
// Settings persistence (SQLite via db)
// ───────────────────────────────────────────────────────────
const KEY_INFOBLURB_ENABLED = 'nowplaying_infoblurb_enabled'
const KEY_INFOBLURB_TONE = 'nowplaying_infoblurb_tone'

// Ensure settings table
try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run()
} catch (e) {
  console.error('[NowPlaying] Failed to ensure app_settings table:', e)
}

// Helpers
function readSetting (key) {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
    return row ? row.value : null
  } catch (e) {
    console.error('[NowPlaying] readSetting error:', e)
    return null
  }
}
function writeSetting (key, value) {
  try {
    db.prepare(
      'INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(key, String(value))
  } catch (e) {
    console.error('[NowPlaying] writeSetting error:', e)
  }
}

// ───────────────────────────────────────────────────────────
// Tones
// ───────────────────────────────────────────────────────────
const TONES = ['neutral', 'playful', 'cratedigger', 'hype', 'classy', 'chartbot', 'djtech', 'vibe']
const TONE_ALIASES = {
  nerd: 'cratedigger',
  crate: 'cratedigger',
  digger: 'cratedigger',
  n: 'neutral',
  neutral: 'neutral',
  p: 'playful',
  fun: 'playful',
  playful: 'playful',
  hype: 'hype',
  amp: 'hype',
  classy: 'classy',
  formal: 'classy',
  chart: 'chartbot',
  charts: 'chartbot',
  chartbot: 'chartbot',
  tech: 'djtech',
  djtech: 'djtech',
  vibe: 'vibe',
  chill: 'vibe'
}
function normalizeTone (raw) {
  const t = String(raw || '').toLowerCase()
  const aliased = TONE_ALIASES[t] || t
  return TONES.includes(aliased) ? aliased : 'neutral'
}
function toneLineFor (tone) {
  const t = normalizeTone(tone)
  const map = {
    neutral: 'Tone: neutral, informative.',
    playful: 'Tone: playful—light slang ok; one tasteful emoji allowed.',
    cratedigger: 'Tone: cratedigger—include one micro fact (producer, sample, label, or chart stat).',
    hype: 'Tone: hype—energetic, crowd-facing; one short exclamation allowed; no caps-lock.',
    classy: 'Tone: classy—no slang, no emojis; concise editorial style.',
    chartbot: 'Tone: chartbot—prefer chart peaks (with country) or certifications.',
    djtech: 'Tone: djtech—mention BPM/key if present; avoid heavy jargon.',
    vibe: 'Tone: vibe—1–2 genre adjectives; avoid numbers unless iconic.'
  }
  return map[t] || map.neutral
}

// ───────────────────────────────────────────────────────────
// Toggles (DB-backed; env defaults)
// ───────────────────────────────────────────────────────────
const envEnabledDefault = ['1', 'true', 'on', 'yes'].includes(String(process.env.NOWPLAYING_INFOBLURB ?? '').toLowerCase())
const envToneDefaultRaw = (process.env.NOWPLAYING_INFOBLURB_TONE || 'neutral')
const envToneDefault = normalizeTone(envToneDefaultRaw)

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

export function enableNowPlayingInfoBlurb () { INFO_BLURB_ENABLED = true; writeSetting(KEY_INFOBLURB_ENABLED, '1') }
export function disableNowPlayingInfoBlurb () { INFO_BLURB_ENABLED = false; writeSetting(KEY_INFOBLURB_ENABLED, '0') }
export function setNowPlayingInfoBlurb (enabled) { INFO_BLURB_ENABLED = !!enabled; writeSetting(KEY_INFOBLURB_ENABLED, enabled ? '1' : '0') }
export function isNowPlayingInfoBlurbEnabled () { return INFO_BLURB_ENABLED }
export function setNowPlayingInfoBlurbTone (tone) {
  const norm = normalizeTone(tone)
  INFO_BLURB_TONE = norm
  writeSetting(KEY_INFOBLURB_TONE, norm)
}
export function getNowPlayingInfoBlurbTone () { return INFO_BLURB_TONE }

// ───────────────────────────────────────────────────────────
// Blurb cache
// ───────────────────────────────────────────────────────────
const BLURB_TTL_MS = 15 * 60 * 1000
const BLURB_MAX_CHARS = Number(process.env.NOWPLAYING_BLURB_MAX_CHARS || 320) // multi-sentence cap
const blurbCache = new Map() // key -> { text, ts }
function blurbKey (song) {
  return song.songId || song.spotifyTrackId || `${song.trackName}|${song.artistName}`
}

// ───────────────────────────────────────────────────────────
// Genius fetch + normalization
// ───────────────────────────────────────────────────────────
const GENIUS_TTL_MS = 12 * 60 * 60 * 1000 // 12h
const GENIUS_TIMEOUT_MS = Number(process.env.NOWPLAYING_GENIUS_TIMEOUT_MS || 3000)
const geniusCache = new Map() // key -> { about: string, ts: number }

function normalizeGeniusAbout (about) {
  const t = String(about || '').trim()
  if (!t) return null
  const placeholders = new Set(['?', '-', '—', 'n/a', 'na', 'none', 'unknown', 'tbd'])
  if (placeholders.has(t.toLowerCase())) return null
  const letters = (t.match(/[A-Za-z]/g) || []).length
  if (t.length < 12 || letters < 6) return null
  return t
}

async function fetchGeniusAboutWithTimeout (title, artist) {
  const k = `${title}::${artist}`
  const now = Date.now()
  const cached = geniusCache.get(k)
  if (cached && (now - cached.ts < GENIUS_TTL_MS)) {
    const norm = normalizeGeniusAbout(cached.about) || null
    log('[NowPlaying][Genius][CACHE]', JSON.stringify({ key: k, present: !!norm, len: norm?.length || 0 }))
    return norm
  }

  let timedOut = false
  const timeoutPromise = new Promise(res =>
    setTimeout(() => { timedOut = true; res(null) }, GENIUS_TIMEOUT_MS)
  )

  const task = (async () => {
    try {
      const res = await getGeniusAbout({ title, artist }) // { songId, aboutPlain, ... }
      const raw = (res?.aboutPlain || '').trim()
      const normalized = normalizeGeniusAbout(raw)
      geniusCache.set(k, { about: normalized || '', ts: Date.now() })
      log('[NowPlaying][Genius][FETCHED]', JSON.stringify({
        key: k, usable: !!normalized, rawLen: raw.length, useLen: normalized?.length || 0
      }))
      return normalized || null
    } catch (e) {
      console.error(`[NowPlaying][Genius] fetch ERROR for "${k}":`, e?.message || e)
      return null
    }
  })()

  const about = await Promise.race([task, timeoutPromise])
  if (timedOut) {
    console.error(`[NowPlaying][Genius] fetch TIMED OUT for "${k}" after ${GENIUS_TIMEOUT_MS}ms`)
  }
  return about
}

// ───────────────────────────────────────────────────────────
// Blurb formatting helpers (multi-sentence, smart clipping)
// ───────────────────────────────────────────────────────────
const SENTENCE_SPLIT_RE = /(?<=\S[.?!])\s+(?=(?:["'“”‘’]?\p{Lu}|\d))/gu

function smartClipToSentences (text, {
  maxChars = BLURB_MAX_CHARS,
  minSentences = 2,
  maxSentences = 3
} = {}) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\s([,;:.?!])/g, '$1')
    .trim()

  const parts = clean.split(SENTENCE_SPLIT_RE).filter(Boolean)
  if (parts.length === 0) return ''

  const out = []
  let used = 0
  for (const s of parts) {
    const will = used + (out.length ? 1 : 0) + s.length // +1 for joining space
    if (out.length < minSentences && will <= maxChars) {
      out.push(s); used = will; continue
    }
    if (out.length >= maxSentences) break
    if (will <= maxChars) {
      out.push(s); used = will; continue
    }
    break
  }

  let final = out.join(' ')
  if (!final && parts.length) {
    // ensure at least the first sentence, clipped hard if needed
    final = parts[0].slice(0, Math.max(0, maxChars - 1)).replace(/[ ,;:.?!-]+$/, '') + '…'
  } else if (final.length > maxChars) {
    final = final.slice(0, Math.max(0, maxChars - 1)).replace(/[ ,;:.?!-]+$/, '') + '…'
  } else if (out.length < parts.length) {
    final = final + '…'
  }
  return final
}

// Sanitize output (remove IDs/names/etc.)
const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function sanitizeBlurb (text, song) {
  if (!text) return text
  let t = String(text).replace(/^["'“”]+|["'“”]+$/g, '').trim()
  t = t
    .replace(/\bISRC\b[:\s-]*[A-Z0-9-_.]+/gi, '')
    .replace(/\bUPC\b[:\s-]*\d{8,}/gi, '')
    .replace(/\b(catalog|catalogue|cat\.?\s*no\.?)\b[:\s-]*[A-Z0-9-_.]+/gi, '')
    .replace(/\b(id|track id|song id)\b[:\s-]*[A-Z0-9-_.]+/gi, '')
  const names = [song?.trackName, song?.artistName].filter(x => x && x.length > 3)
  for (const n of names) {
    const re = new RegExp(`\\b${escapeRegExp(n)}\\b`, 'ig')
    t = t.replace(re, ' ')
  }
  t = t.replace(/\s{2,}/g, ' ').replace(/^[\-–—:,\s]+/, '').trim()
  t = t.replace(/[,;:]\s*[,;:]+/g, ', ')
  return t || null
}

function isBlandBlurb (t = '') {
  const s = String(t).toLowerCase()
  const generic = /(a song by|single by|track by|an? american (singer|dj)|popular song|club single)/i.test(s)
  const hasConcrete = /(\b(19|20)\d{2}\b|billboard|hot\s*100|uk\s*singles|no\.\s*\d|platinum|gold|certified|produced by|label)/i.test(s)
  return generic || !hasConcrete || s.split(/\s+/).length < 10
}

// ───────────────────────────────────────────────────────────
// AI summarization (Genius only) — multi-sentence, reliable free-tier models
// ───────────────────────────────────────────────────────────
const NOWPLAYING_AI_MODEL = (
  process.env.NOWPLAYING_AI_MODEL ||
  'gemini-2.5-flash-lite,gemini-2.0-flash-lite,gemini-2.5-flash,gemini-2.0-flash'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const AI_HARD_TIMEOUT_MS = 45000

function buildGeniusBlurbPrompt (song, aboutText, tone = 'neutral') {
  const { trackName, artistName } = song || {}
  const safeAbout = String(aboutText || '').slice(0, 4000)
  return `Summarize the following Genius "About" section for a song as **2–3 short sentences** (clear, readable).
- Keep it under about ${BLURB_MAX_CHARS} characters total.
- Base ONLY on the provided text.
- Include **one concrete detail** (e.g., a year, chart peak + country, certification, notable collaborator, or label).
- Do **not** repeat the song title or artist name.
- No hashtags, no links, no quotes; avoid generic filler.

${toneLineFor(tone)}

Song: ${trackName || 'Unknown'} — ${artistName || 'Unknown'}
About (Genius):
"""${safeAbout}"""`
}

async function summarizeGeniusAbout (song, aboutText, tone = 'neutral') {
  const prompt = buildGeniusBlurbPrompt(song, aboutText, tone)
  debug('[NowPlaying][Blurb][AI][PROMPT]', prompt)
  try {
    log('[NowPlaying][Blurb][AI][MODEL]', NOWPLAYING_AI_MODEL.join(','))
    const p = askQuestion(prompt, {
      returnApologyOnError: false,
      retries: 0,              // avoid multiplying traffic on 429/503
      backoffMs: 600,
      models: NOWPLAYING_AI_MODEL,
      maxTokens: 180           // a few sentences; still compact
    })
    const result = await Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), AI_HARD_TIMEOUT_MS))
    ])
    const txt = (typeof result === 'string') ? result : result?.text
    if (!txt) throw new Error('AI_EMPTY_RESPONSE')
    let blurb = sanitizeBlurb(txt, song)
    blurb = smartClipToSentences(blurb, { maxChars: BLURB_MAX_CHARS, minSentences: 2, maxSentences: 3 })
    if (!blurb || isBlandBlurb(blurb)) return null
    return blurb
  } catch (e) {
    console.error('[NowPlaying][Blurb][AI][ERROR]', e?.message || e)
    return null
  }
}

// ───────────────────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────────────────
export async function announceNowPlaying (room) {
  try {
    const song = roomBot.currentSong
    if (!song || !song.trackName || !song.artistName || !song.songId) return

    // Album theme → skip; separate announcer handles album mode
    const normalizedTheme = getTheme(room)
    const isAlbumTheme = ['album monday', 'albums', 'album day'].includes(normalizedTheme)
    if (isAlbumTheme) {
      log('[NowPlaying][Skip] Album theme active')
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
      message += '\n🆕 First time playing in this room!'
    } else {
      message += `\n🔁 Played ${stats.playCount} time${stats.playCount !== 1 ? 's' : ''}`
      const lastPlayedTime = formatDistanceToNow(new Date(stats.lastPlayed), { addSuffix: true })
      message += `\n🕒 Last played ${lastPlayedTime}`
    }

    if (avgInfo.found) {
      message += `\n⭐ ${avgInfo.average}/10 (${avgInfo.count} rating${avgInfo.count === 1 ? '' : 's'})`
    }

    // Always post the base message immediately
    await postMessage({ room, message })
    log('[NowPlaying][POST][BASE]', JSON.stringify({ track: song.trackName, artist: song.artistName }))

    // If info blurbs are disabled, stop here
    if (!INFO_BLURB_ENABLED) return

    // If we have a cached blurb, send it now
    const key = blurbKey(song)
    const cached = blurbCache.get(key)
    if (cached && (Date.now() - cached.ts < BLURB_TTL_MS)) {
      await postMessage({ room, message: `ℹ️ ${cached.text}` })
      log('[NowPlaying][Blurb][POST][CACHE]', JSON.stringify({
        track: song.trackName, artist: song.artistName, source: 'genius', length: cached.text.length
      }))
      return
    }

    // Fire-and-forget: fetch Genius → summarize → post if good
    ;(async () => {
      try {
        log('[NowPlaying][Blurb][GENIUS][FETCH]', JSON.stringify({ title: song.trackName, artist: song.artistName }))
        const about = await fetchGeniusAboutWithTimeout(song.trackName, song.artistName)
        if (!about) {
          log('[NowPlaying][Blurb][GENIUS][NONE]', JSON.stringify({ track: song.trackName, artist: song.artistName }))
          return
        }
        debug('[NowPlaying][Blurb][GENIUS][FOUND]', JSON.stringify({ len: about.length }))

        const blurb = await summarizeGeniusAbout(song, about, INFO_BLURB_TONE)
        if (!blurb) {
          log('[NowPlaying][Blurb][SKIP]', JSON.stringify({
            reason: 'ai-bland-or-failed', track: song.trackName, artist: song.artistName
          }))
          return
        }

        blurbCache.set(key, { text: blurb, ts: Date.now() })
        await postMessage({ room, message: `ℹ️ ${blurb}` })
        log('[NowPlaying][Blurb][POST]', JSON.stringify({
          track: song.trackName, artist: song.artistName, source: 'genius', length: blurb.length
        }))
      } catch (e) {
        console.error('[NowPlaying][Blurb][ASYNC][ERROR]', e?.message || e)
      }
    })()
  } catch (err) {
    console.error('Error in announceNowPlaying:', err)
  }
}
