// votecounts.js

import { postMessage } from '../libs/cometchat.js'
import { fetchRecentSongs, fetchUserData } from './API.js'
import db from '../database/db.js'

// Unified room stats manager helpers
// We import logCurrentSong and updateLastPlayed so that voteCounts
// updates the room_stats table using the same logic as the rest of
// the application. This ensures that the canonical key and
// normalisation fields are populated, preventing duplicate rows
// and enabling announceNowPlaying() to find previous plays by songId.
import {
  logCurrentSong,
  updateLastPlayed
} from '../database/dbroomstatsmanager.js'

let songStatsEnabled = false

//
// Exposed toggles for enabling/disabling song stats announcements.
// Some parts of the bot import enableSongStats(), disableSongStats() and
// isSongStatsEnabled() from this module. These functions simply toggle
// the in-memory flag and return its state. Leaving these exports in
// place preserves backwards compatibility with existing command handlers.

/**
 * Enable posting song statistics after a song finishes playing.
 */
export function enableSongStats () {
  songStatsEnabled = true
}

/**
 * Disable posting song statistics after a song finishes playing.
 */
export function disableSongStats () {
  songStatsEnabled = false
}

/**
 * Check whether song statistics posting is enabled.
 * @returns {boolean}
 */
export function isSongStatsEnabled () {
  return !!songStatsEnabled
}

// ───────────────────────────────────────────────────────────────
// Schema helpers (defensive; initDb also handles this)
// ───────────────────────────────────────────────────────────────
let __reviewsSchemaReady = false
let __roomStatsSchemaReady = false

function ensureReviewsSchema () {
  if (__reviewsSchemaReady) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS song_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      songId TEXT NOT NULL,
      userId TEXT NOT NULL,
      rating REAL,
      createdAt TEXT,
      UNIQUE(songId, userId)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_song_reviews ON 
    song_reviews(songId, userId);
  `)
  __reviewsSchemaReady = true
}

function ensureRoomStatsSchema () {
  if (__roomStatsSchemaReady) return
  // add averageReview if missing (initDb should have done this already)
  const cols = db.prepare('PRAGMA table_info(room_stats)').all()
  const hasAverage = cols.some(c => c.name === 'averageReview')
  if (!hasAverage) {
    db.exec('ALTER TABLE room_stats ADD COLUMN averageReview REAL;')
  }
  __roomStatsSchemaReady = true
}

// ───────────────────────────────────────────────────────────────
// Stats poster
// ───────────────────────────────────────────────────────────────
export async function postVoteCountsForLastSong (room) {
  try {
    ensureRoomStatsSchema()

    const recentSongs = await fetchRecentSongs()
    if (!recentSongs?.length) return console.log('No recent songs found.')

    const { song, voteCounts, djUuid } = recentSongs[0]
    if (!song) return console.log('No song found.')

    const { trackName, artistName, songId } = song
    const { likes = 0, dislikes = 0, stars = 0 } = voteCounts

    // Use the unified room stats manager to update play count and reactions.
    // This populates canonSongKey and normalisation fields if missing.
    try {
      logCurrentSong(song, likes, dislikes, stars)
      // Also update the last played timestamp for this song
      updateLastPlayed(song)
    } catch (e) {
      console.error('Error updating room stats via logCurrentSong:', e)
    }

    console.log(`Logged stats for ${trackName} by ${artistName}:  ${likes}, ${dislikes}, ❤️ ${stars}`)

    if (!songStatsEnabled) return

    let message = ` **Song Recap**\n *${trackName}* by *${artistName}*`

    // DJ nickname
    let djNickname = 'Unknown DJ'
    try {
      const [user] = await fetchUserData([djUuid])
      djNickname = user?.userProfile?.nickname || djNickname
    } catch {}

    message += `\n Played by: **${djNickname}**\n ${likes}    ${dislikes}   ❤️ ${stars}`

    // Append play count and avg review (/10 scale)
    const updated = db.prepare('SELECT playCount, averageReview FROM room_stats WHERE songId = ?').get(songId)
    if (updated) {
      if (updated.averageReview != null) {
        message += `   ⭐ ${updated.averageReview}/10`
      }
      if (updated.playCount) {
        message += `\n Played ${updated.playCount} time${updated.playCount !== 1 ? 's' : ''}`
      }
    }

    await postMessage({ room, message })
  } catch (error) {
    console.error('Error in postVoteCountsForLastSong:', error)
  }
}

// ───────────────────────────────────────────────────────────────
// Reviews (one per user per song; overrides using UPSERT)
// ───────────────────────────────────────────────────────────────
export async function saveSongReview ({ currentSong, rating, userId }) {
  try {
    ensureReviewsSchema()
    ensureRoomStatsSchema()

    const { songId } = currentSong || {}

    // normalize rating to 1–10, one decimal
    let r = Number.isFinite(rating) ? Math.round(rating * 10) / 10 : NaN
    if (!Number.isFinite(r) || r < 1 || r > 10) return { success: false, reason: 'bad_input' }
    if (!songId || !userId) return { success: false, reason: 'bad_input' }

    // Upsert review
    db.prepare(`
      INSERT INTO song_reviews (songId, userId, rating, createdAt)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(songId, userId) DO UPDATE SET
        rating    = excluded.rating,
        createdAt = datetime('now')
    `).run(songId, userId, r)

    // Recompute average to one decimal for room_stats
    const avgRow = db.prepare(`
      SELECT ROUND(AVG(rating), 1) AS average
      FROM song_reviews
      WHERE songId = ?
    `).get(songId)

    if (avgRow && avgRow.average != null) {
      db.prepare('UPDATE room_stats SET averageReview = ? WHERE songId = ?')
        .run(avgRow.average, songId)
    }

    return { success: true }
  } catch (err) {
    const msg = String(err?.message || '')
    if (err?.code === 'SQLITE_CONSTRAINT' || /UNIQUE/i.test(msg)) {
      return { success: false, reason: 'duplicate' }
    }
    console.error('Error in saveSongReview:', err)
    return { success: false, reason: 'db_error' }
  }
}

export async function getAverageRating (currentSong) {
  try {
    const result = db.prepare(`
      SELECT AVG(rating) as average, COUNT(*) as count
      FROM song_reviews
      WHERE songId = ?
    `).get(currentSong.songId)

    if (!result || result.count === 0) return { found: false }

    return {
      found: true,
      average: Number(result.average).toFixed(1),
      count: result.count
    }
  } catch (e) {
    console.error('Error in getAverageRating:', e)
    return { found: false }
  }
}