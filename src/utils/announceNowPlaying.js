// src/handlers/announceNowPlaying.js
import { formatDistanceToNow } from 'date-fns'
import { getAverageRating } from './voteCounts.js'
import { postMessage } from '../libs/cometchat.js'
import { getTheme } from '../utils/themeManager.js'
import db from '../database/db.js'
import { roomBot } from '../index.js'
import { askQuestion } from '../libs/ai.js'
import { getGeniusAbout } from '../utils/API.js' // returns { songId, aboutPlain, aboutHtml, descAnno }

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
/** Toggle: AI info blurb on/off + tone (DB-backed with env defaults) */
const envEnabledDefault = ['1','true','on','yes'].includes(String(process.env.NOWPLAYING_INFOBLURB ?? '').toLowerCase())
const envToneDefaultRaw = (process.env.NOWPLAYING_INFOBLURB_TONE || 'neutral')
const envToneDefault    = normalizeTone(envToneDefaultRaw)

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
// Blurb cache
// ───────────────────────────────────────────────────────────
const BLURB_TTL_MS = 15 * 60 * 1000
const blurbCache = new Map() // key -> { text, ts }
function blurbKey(song) {
  return song.songId || song.spotifyTrackId || `${song.trackName}|${song.artistName}`
}

// ───────────────────────────────────────────────────────────
// Genius fetch cache + normalization
// ───────────────────────────────────────────────────────────
const GENIUS_TTL_MS = 12 * 60 * 60 * 1000 // 12h
const GENIUS_TIMEOUT_MS = 1500
const geniusCache = new Map() // key -> { about: string, ts: number }

// Treat trivial/placeholder text as "no info"
function normalizeGeniusAbout(about) {
  const t = String(about || '').trim()
  if (!t) return null
  const placeholders = new Set(['?', '-', '—', 'n/a', 'na', 'none', 'unknown', 'tbd'])
  if (placeholders.has(t.toLowerCase())) return null
  const letters = (t.match(/[A-Za-z]/g) || []).length
  if (t.length < 12 || letters < 6) return null
  return t
}

async function fetchGeniusAboutWithTimeout(title, artist) {
  const k = `${title}::${artist}`
  const now = Date.now()
  const cached = geniusCache.get(k)

  if (cached && (now - cached.ts < GENIUS_TTL_MS)) {
    const ageMs = now - cached.ts
    console.log(`[NowPlaying][Genius] cache HIT for "${k}" (age=${ageMs}ms, len=${cached.about?.length || 0})`)
    return normalizeGeniusAbout(cached.about) || null
  }

  console.log(`[NowPlaying][Genius] fetching About for "${k}" (timeout ${GENIUS_TIMEOUT_MS}ms)…`)

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
      console.log(
        `[NowPlaying][Genius] fetch DONE for "${k}": ` +
        (normalized ? `usable len=${normalized.length}` : `TRIVIAL ("${raw || '∅'}") — treating as NONE`)
      )
      return normalized || null
    } catch (e) {
      console.warn(`[NowPlaying][Genius] fetch ERROR for "${k}":`, e?.message || e)
      return null
    }
  })()

  const about = await Promise.race([task, timeoutPromise])
  if (timedOut) {
    console.warn(`[NowPlaying][Genius] fetch TIMED OUT for "${k}" after ${GENIUS_TIMEOUT_MS}ms`)
  }
  return about
}

// ───────────────────────────────────────────────────────────
// AI plumbing
// ───────────────────────────────────────────────────────────
const AI_HARD_TIMEOUT_MS = 15000 // total per attempt
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
function getSoftDeadlineMs() {
  const m = median(aiLatencies) ?? 1200
  const d = m + 250
  return Math.max(900, Math.min(2200, d))
}

function toneLineFor(tone) {
  const t = normalizeTone(tone)
  const map = {
    neutral:     'Tone: neutral, informative.',
    playful:     'Tone: playful, 1 tasteful emoji allowed; light slang ok.',
    cratedigger: 'Tone: cratedigger—include one micro fact (producer, sample lineage, label, or chart stat).',
    hype:        'Tone: hype—energetic, crowd-facing; one short exclamation allowed; no caps-lock.',
    classy:      'Tone: classy—no slang, no emojis; concise editorial style.',
    chartbot:    'Tone: chartbot—prioritize chart peaks (with country) or certifications.',
    djtech:      'Tone: djtech—mention BPM range or key if meaningful; avoid heavy jargon.',
    vibe:        'Tone: vibe—1–2 genre adjectives; no numbers unless iconic.'
  }
  return map[t] || map.neutral
}

// GENIUS-summarizing prompt
export function buildGeniusBlurbPrompt(song, aboutText, tone = 'neutral') {
  const { trackName, artistName } = song || {}
  const safeAbout = String(aboutText || '').slice(0, 4000)
  return `Summarize the following Genius "About" section for a song into ONE ultra-brief blurb (max 200 characters).
Base the blurb ONLY on the provided text. If specific facts are not present, prefer a concise vibe/genre insight.
Do NOT repeat the song title or artist name. No links, no hashtags, no quotes, no extra lines. Output ONLY the blurb text.
${toneLineFor(tone)}

Song: ${trackName || 'Unknown'} — ${artistName || 'Unknown'}
About text:
"""${safeAbout}"""`}

// OPEN fallback prompt: “tell me about this song”
export function buildOpenBlurbPrompt(song, tone = 'neutral') {
  const { trackName, artistName } = song || {}
  return `Tell me about the song "${trackName || 'Unknown'}" by ${artistName || 'Unknown'} in ONE ultra-brief blurb (max 200 characters).
Prefer widely known facts (release year, subgenre, notable collaborators, chart peaks, producer/label) or, if unsure, give a concise vibe/genre insight.
Do NOT repeat the song title or artist name. No links, no hashtags, no quotes, no extra lines. Output ONLY the blurb text.
${toneLineFor(tone)}`
}

// Extract text from askQuestion() responses
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
    const dt = Date.now() - t0
    recordAiLatency(dt)
    console.log(`[NowPlaying][AI] attempt OK in ${dt}ms`)
    return txt.trim()
  } catch (e) {
    console.warn('[NowPlaying][AI] attempt failed:', e?.message || e)
    return null
  }
}

// safeAskQuestion with one retry on a simplified prompt
async function safeAskQuestion(prompt) {
  let text = await attemptAI(prompt)
  if (text) return text
  const simple = prompt
    .replace(/NEVER mention[\s\S]*?IDs\).*/i, '')
    .replace(/Only include.*?\n/i, 'Only include one confident micro-fact or a concise vibe.\n')
  return await attemptAI(simple)
}

const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function sanitizeBlurb(text, song) {
  if (!text) return text
  let t = text.replace(/^["'“”]+|["'“”]+$/g, '').trim()
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
  t = t.replace(/^[\-–—:,\s]+/, '').replace(/\s{2,}/g, ' ').trim()
  t = t.replace(/[,;:]\s*[,;:]+/g, ', ')
  return t || null
}

// GENIUS path: soft-deadline builder
async function getBlurbFromGenius(song, tone, aboutText) {
  const softDeadline = getSoftDeadlineMs()
  console.log(`[NowPlaying][AI] building blurb from GENIUS; soft deadline=${softDeadline}ms`)
  let softTimedOut = false
  const aiWork = (async () => {
    let blurb = await safeAskQuestion(buildGeniusBlurbPrompt(song, aboutText, tone))
    blurb = sanitizeBlurb(blurb, song)
    if (blurb && blurb.length > 200) blurb = blurb.slice(0, 197) + '…'
    console.log(`[NowPlaying][AI] blurb ${blurb ? `READY len=${blurb.length}` : 'EMPTY'} from GENIUS`)
    return blurb || null
  })()
  const soft = await Promise.race([aiWork, new Promise(res => setTimeout(() => { softTimedOut = true; res(null) }, softDeadline))])
  return { soft, final: aiWork, softTimedOut }
}

// OPEN fallback: “tell me about this song”
async function getBlurbOpenFallback(song, tone) {
  const softDeadline = getSoftDeadlineMs()
  console.log(`[NowPlaying][AI] building blurb from OPEN fallback; soft deadline=${softDeadline}ms`)
  let softTimedOut = false
  const aiWork = (async () => {
    let blurb = await safeAskQuestion(buildOpenBlurbPrompt(song, tone))
    blurb = sanitizeBlurb(blurb, song)
    if (blurb && blurb.length > 200) blurb = blurb.slice(0, 197) + '…'
    console.log(`[NowPlaying][AI] blurb ${blurb ? `READY len=${blurb.length}` : 'EMPTY'} from OPEN fallback`)
    return blurb || null
  })()
  const soft = await Promise.race([aiWork, new Promise(res => setTimeout(() => { softTimedOut = true; res(null) }, softDeadline))])
  return { soft, final: aiWork, softTimedOut }
}

// ───────────────────────────────────────────────────────────
// Main: announceNowPlaying with AI blurb (Genius → Open fallback)
// ───────────────────────────────────────────────────────────
export async function announceNowPlaying(room) {
  try {
    const song = roomBot.currentSong
    if (!song || !song.trackName || !song.artistName || !song.songId) return

    // Album theme → skip; separate announcer handles album mode
    const normalizedTheme = getTheme(room) // normalized
    const isAlbumTheme = ['album monday', 'albums', 'album day'].includes(normalizedTheme)
    console.log(`[AlbumTheme] active=${isAlbumTheme} | song="${song.trackName}" id="${song.songId}"`)
    if (isAlbumTheme) {
      console.log(`🎧 Album theme detected (${normalizedTheme}) — skipping default now playing message.`)
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

    // ——— AI Info Blurb: GENIUS first, else OPEN fallback ———
    if (INFO_BLURB_ENABLED) {
      const key = blurbKey(song)
      const cached = blurbCache.get(key)
      let blurb = null

      if (cached && (Date.now() - cached.ts < BLURB_TTL_MS)) {
        const age = Date.now() - cached.ts
        blurb = cached.text
        console.log(`[NowPlaying][AI] blurb cache HIT for key=${key} (age=${age}ms, len=${blurb.length})`)
      } else if (cached) {
        console.log(`[NowPlaying][AI] blurb cache STALE for key=${key} — refreshing`)
      } else {
        console.log(`[NowPlaying][AI] blurb cache MISS for key=${key}`)
      }

      // Try to get usable Genius text first
      console.log(`[NowPlaying] attempting Genius About lookup for "${song.trackName}" — ${song.artistName}`)
      const geniusAbout = await fetchGeniusAboutWithTimeout(song.trackName, song.artistName)
      console.log(`[NowPlaying] Genius About result: ${geniusAbout ? `len=${geniusAbout.length}` : 'NONE'}`)

      if (!blurb) {
        let builder
        if (geniusAbout) {
          builder = getBlurbFromGenius(song, INFO_BLURB_TONE, geniusAbout)
        } else {
          builder = getBlurbOpenFallback(song, INFO_BLURB_TONE) // ⬅️ OPEN “tell me about this song” fallback
        }

        const { soft, final, softTimedOut } = await builder

        if (soft) {
          blurb = soft
          blurbCache.set(key, { text: blurb, ts: Date.now() })
          console.log('[NowPlaying][AI] sending message WITH inline blurb')
          message += `\nℹ️ ${blurb}`
          await postMessage({ room, message })
          return
        }

        // AI was slow → post base message now; follow up if/when ready
        console.log('[NowPlaying] posting base Now Playing without blurb (waiting for final)')
        await postMessage({ room, message })

        if (softTimedOut) {
          const finalBlurb = await final.catch(() => null)
          if (finalBlurb) {
            blurbCache.set(key, { text: finalBlurb, ts: Date.now() })
            console.log('[NowPlaying][AI] posting FOLLOW-UP blurb')
            await postMessage({ room, message: `ℹ️ ${finalBlurb}` })
          } else {
            console.log('[NowPlaying][AI] no final blurb available after wait')
          }
        }
        return
      }

      // had cached blurb
      console.log('[NowPlaying][AI] using CACHED blurb inline')
      message += `\nℹ️ ${blurb}`
    }

    // no (eligible) blurb added → post once
    await postMessage({ room, message })
  } catch (err) {
    console.error('Error in announceNowPlaying:', err)
  }
}
