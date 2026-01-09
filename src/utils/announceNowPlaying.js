// src/handlers/announceNowPlaying.js

import { formatDistanceToNow } from 'date-fns'
import { getAverageRating } from './voteCounts.js'
import { postMessage } from '../libs/cometchat.js'
import { getTheme } from '../utils/themeManager.js'
// Import normalisation helper to compute canonical song keys. Using the same
// normalisation logic as dbroomstatsmanager ensures we search the same keys
// that logCurrentSong() writes to room_stats.
import { buildNormKey } from '../database/normalizesong.js'
import db from '../database/db.js'
import { roomBot } from '../index.js'

// ───────────────────────────────────────────────────────────
// Logging (defaults to info; set LOG_LEVEL=debug for extra detail)
// ───────────────────────────────────────────────────────────
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase()
const isInfo = LOG_LEVEL === 'info' || LOG_LEVEL === 'debug'
const isDebug = LOG_LEVEL === 'debug'
const log = (...a) => { if (isInfo) console.log(...a) }
const debug = (...a) => { if (isDebug) console.debug(...a) }

// ───────────────────────────────────────────────────────────
// Settings persistence (SQLite via db) — retained for compatibility,
// but the info blurb feature is fully disabled in this build.
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
// Tone + toggle API stubs (kept for external callers), but
// INFO_BLURB is hard-disabled here.
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

// Hard-disable the info blurb in this AI-free build:
let INFO_BLURB_ENABLED = false
let INFO_BLURB_TONE = (() => {
  const v = readSetting(KEY_INFOBLURB_TONE)
  if (v === null) {
    const def = 'neutral'
    writeSetting(KEY_INFOBLURB_TONE, def)
    return def
  }
  return normalizeTone(v)
})()

export function enableNowPlayingInfoBlurb () { INFO_BLURB_ENABLED = false; writeSetting(KEY_INFOBLURB_ENABLED, '0') }
export function disableNowPlayingInfoBlurb () { INFO_BLURB_ENABLED = false; writeSetting(KEY_INFOBLURB_ENABLED, '0') }
export function setNowPlayingInfoBlurb (enabled) { INFO_BLURB_ENABLED = false; writeSetting(KEY_INFOBLURB_ENABLED, '0') }
export function isNowPlayingInfoBlurbEnabled () { return false }
export function setNowPlayingInfoBlurbTone (tone) {
  const norm = normalizeTone(tone)
  INFO_BLURB_TONE = norm
  writeSetting(KEY_INFOBLURB_TONE, norm)
}
export function getNowPlayingInfoBlurbTone () { return INFO_BLURB_TONE }

// ---------------------------------------------------------------------------
// Title/Artist sanitizers (NO HTML encoding)
// - decode common HTML entities if they exist in stored data
// - strip ASCII control chars so CometChat text stays clean
function decodeEntities (s = '') {
  return String(s)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}
function safeText (str) {
  return String(str ?? '').replace(/[\u0000-\u001F\u007F]/g, '')
}

// ───────────────────────────────────────────────────────────
// Safe post with tiny retry for the BASE/STATS messages
// ───────────────────────────────────────────────────────────
async function postWithRetry ({ room, message }, tries = 2) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      await postMessage({ room, message })
      return true
    } catch (e) {
      lastErr = e
      const wait = 300 + Math.floor(Math.random() * 300)
      console.warn('[NowPlaying][POST][RETRY]', { attempt: i + 1, wait })
      await new Promise(r => setTimeout(r, wait))
    }
  }
  console.error('[NowPlaying][POST][FAILED]', lastErr?.message || lastErr)
  return false
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

    // ── 1) Always build & POST the base line first (no dependencies)
    const title  = safeText(decodeEntities(song.trackName))
    const artist = safeText(decodeEntities(song.artistName))
    const base = `🎧 Now playing: “${title}” by ${artist}`
    await postWithRetry({ room, message: base })
    log('[NowPlaying][POST][BASE]', JSON.stringify({ track: title, artist }))

    // ── 2) Best-effort: enrich the same message with stats (wrapped, non-fatal)
    try {
      // Canonical and normalised keys: prefer songId; otherwise use the
      // normalised track|artist key produced by buildNormKey(). Using the
      // same key derivation as logCurrentSong() allows announceNowPlaying() to
      // look up the exact row that /stats reports.
      const { normKey } = buildNormKey(song.trackName, song.artistName)
      const canonKey = song.songId ? String(song.songId) : normKey

      let stats = null
      // 1) Try the canonical key on canonSongKey
      if (canonKey) {
        stats = db.prepare('SELECT playCount, lastPlayed FROM room_stats WHERE canonSongKey = ?').get(canonKey)
      }
      // 2) Fallback to the songId column (older rows may not have canonSongKey set)
      if (!stats && song.songId) {
        stats = db.prepare('SELECT playCount, lastPlayed FROM room_stats WHERE songId = ?').get(song.songId)
      }
      // 3) Fallback to the normalised key stored in normSongKey (populated by migrations)
      if (!stats && normKey) {
        try {
          stats = db.prepare('SELECT playCount, lastPlayed FROM room_stats WHERE normSongKey = ?').get(normKey)
        } catch (_) {
          // If normSongKey column does not exist, skip silently
        }
      }
      // 4) Final fallback: match on raw track and artist ignoring case
      if (!stats) {
        stats = db.prepare('SELECT playCount, lastPlayed FROM room_stats WHERE LOWER(trackName) = LOWER(?) AND LOWER(artistName) = LOWER(?)').get(song.trackName, song.artistName)
      }

      const lines = []
      // announceNowPlaying() is called before logCurrentSong() updates room_stats,
      // so stats reflect previous plays.
      const prevCount = Number(stats?.playCount || 0)
      const totalPlays = prevCount + 1
      if (prevCount < 1) {
        lines.push('🆕 First time playing in this room!')
      } else {
        lines.push(`📈 Played ${totalPlays} time${totalPlays !== 1 ? 's' : ''}`)
        const lp = stats?.lastPlayed
        if (lp) {
          const lastPlayedTime = formatDistanceToNow(new Date(lp), { addSuffix: true })
          lines.push(`🗓️ Last played ${lastPlayedTime}`)
        }
      }

      // Average rating (non-fatal)
      try {
        const avgInfo = await getAverageRating(song)
        if (avgInfo?.found) {
          lines.push(`⭐ ${avgInfo.average}/10 (${avgInfo.count} rating${avgInfo.count === 1 ? '' : 's'})`)
        }
      } catch (e) {
        console.warn('[NowPlaying][AVG][WARN]', e?.message || e)
      }

      if (lines.length) {
        await postWithRetry({ room, message: lines.join('\n') })
        log('[NowPlaying][POST][STATS]', { lines: lines.length })
      }
    } catch (e) {
      console.warn('[NowPlaying][STATS][WARN]', e?.message || e)
    }

    // ── 3) AI/Genius blurb is DISABLED in this build.
    debug('[NowPlaying] AI/Genius blurb disabled')

  } catch (err) {
    // Even if a top-level error happens after base, it won’t retract the already-sent base message
    console.error('Error in announceNowPlaying:', err)
  }
}