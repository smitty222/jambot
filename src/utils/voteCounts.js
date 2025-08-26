// votecounts.js
import { postMessage } from '../libs/cometchat.js'
import { fetchRecentSongs, fetchUserData } from './API.js'
import db from '../database/db.js'

let songStatsEnabled = false

// ───────────────────────────────────────────────────────────────
// Schema helpers (defensive; initDb also handles this)
// ───────────────────────────────────────────────────────────────
let __reviewsSchemaReady = false
let __roomStatsSchemaReady = false

function ensureReviewsSchema() {
  if (__reviewsSchemaReady) return
  db.exec(`
    CREATE TABLE IF NOT EXISTS song_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      songId TEXT NOT NULL,
      userId TEXT NOT NULL,
      rating INTEGER,
      createdAt TEXT,
      UNIQUE(songId, userId)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ux_song_reviews ON song_reviews(songId, userId);
  `)
  __reviewsSchemaReady = true
}

function ensureRoomStatsSchema() {
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
export async function postVoteCountsForLastSong(room) {
  try {
    ensureRoomStatsSchema()

    const recentSongs = await fetchRecentSongs()
    if (!recentSongs?.length) return console.log('No recent songs found.')

    const { song, voteCounts, djUuid } = recentSongs[0]
    if (!song) return console.log('No song found.')

    const { trackName, artistName, songId, duration } = song
    const { likes = 0, dislikes = 0, stars = 0 } = voteCounts

    const now = new Date().toISOString()
    const durationStr = duration || null

    // Upsert into room_stats keyed by songId
    const exists = db.prepare('SELECT 1 FROM room_stats WHERE songId = ?').get(songId)
    if (exists) {
      db.prepare(`
        UPDATE room_stats SET 
          playCount = playCount + 1,
          likes = likes + ?,
          dislikes = dislikes + ?,
          stars = stars + ?,
          lastPlayed = ?
        WHERE songId = ?
      `).run(likes, dislikes, stars, now, songId)
    } else {
      db.prepare(`
        INSERT INTO room_stats (
          trackName, artistName, songId, spotifyTrackId, songDuration,
          playCount, likes, dislikes, stars, lastPlayed
        )
        VALUES (?, ?, ?, NULL, ?, 1, ?, ?, ?, ?)
      `).run(trackName, artistName, songId, durationStr, likes, dislikes, stars, now)
    }

    console.log(`Logged stats for ${trackName} by ${artistName}: 👍 ${likes}, 👎 ${dislikes}, ❤️ ${stars}`)

    if (!songStatsEnabled) return

    let message = `🛑 **Song Recap**\n🎵 *${trackName}* by *${artistName}*`

    // DJ nickname
    let djNickname = 'Unknown DJ'
    try {
      const [user] = await fetchUserData([djUuid])
      djNickname = user?.userProfile?.nickname || djNickname
    } catch {}

    message += `\n🎧 Played by: **${djNickname}**\n👍 ${likes}   👎 ${dislikes}   ❤️ ${stars}`

    // Append play count and avg review (/6 scale)
    const updated = db.prepare('SELECT playCount, averageReview FROM room_stats WHERE songId = ?').get(songId)
    if (updated) {
      if (updated.averageReview != null) {
        message += `   ⭐ ${updated.averageReview}/6`
      }
      if (updated.playCount) {
        message += `\n🔁 Played ${updated.playCount} time${updated.playCount !== 1 ? 's' : ''}`
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
export async function saveSongReview({ currentSong, rating, userId }) {
  try {
    ensureReviewsSchema()
    ensureRoomStatsSchema()

    const { songId } = currentSong || {}
    if (!songId || !userId || !Number.isInteger(rating) || rating < 1 || rating > 6) {
      return { success: false, reason: 'bad_input' }
    }

    // Atomic upsert: keeps one review per (songId, userId); overrides rating & timestamp
    db.prepare(`
      INSERT INTO song_reviews (songId, userId, rating, createdAt)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(songId, userId) DO UPDATE SET
        rating    = excluded.rating,
        createdAt = datetime('now')
    `).run(songId, userId, rating)

    // Recompute average rating for room_stats
    const avgRow = db.prepare(`
      SELECT ROUND(AVG(rating), 2) AS average
      FROM song_reviews
      WHERE songId = ?
    `).get(songId)

    if (avgRow && avgRow.average != null) {
      db.prepare('UPDATE room_stats SET averageReview = ? WHERE songId = ?').run(avgRow.average, songId)
    }

    return { success: true }
  } catch (err) {
    const msg = String(err?.message || '')
    if (err?.code === 'SQLITE_CONSTRAINT' || /UNIQUE/i.test(msg)) {
      // With UPSERT this shouldn’t happen, but keep for safety
      return { success: false, reason: 'duplicate' }
    }
    console.error('Error in saveSongReview:', err)
    return { success: false, reason: 'db_error' }
  }
}

export async function getAverageRating(currentSong) {
  try {
    const result = db.prepare(`
      SELECT AVG(rating) as average, COUNT(*) as count
      FROM song_reviews
      WHERE songId = ?
    `).get(currentSong.songId)

    if (!result || result.count === 0) return { found: false }

    return {
      found: true,
      average: parseFloat(Number(result.average).toFixed(2)),
      count: result.count
    }
  } catch (err) {
    console.error('Error getting average rating:', err)
    return { found: false }
  }
}

// Flags
export function isSongStatsEnabled() { return songStatsEnabled }
export function enableSongStats()   { songStatsEnabled = true }
export function disableSongStats()  { songStatsEnabled = false }
