import db from './db.js'

// Helper to compute a canonical key for songs. We prefer using the
// provided songId if present; otherwise fall back to a lowercased
// combination of trackName and artistName separated by a pipe. This
// prevents expensive OR conditions in queries and aligns with the
// database migration introduced in initdb.js.
function getCanonSongKey (song) {
  if (!song) return null
  if (song.songId) return String(song.songId)
  const track = String(song.trackName || '').toLowerCase().trim()
  const artist = String(song.artistName || '').toLowerCase().trim()
  if (!track || !artist) return null
  return `${track}|${artist}`
}

// 🔁 Add or update current song stats
export function logCurrentSong (song, likes = 0, dislikes = 0, stars = 0) {
  if (!song || !song.trackName || !song.artistName) return
  const canon = getCanonSongKey(song)
  // Look up existing stats by canonical song key. This avoids OR
  // conditions and leverages the idx_room_stats_canon index.
  const existing = canon
    ? db.prepare('SELECT * FROM room_stats WHERE canonSongKey = ?').get(canon)
    : null

  if (existing) {
    // Update existing row: increment play count and reactions. Also
    // set canonical fields if they were previously null. Use the
    // computed canon so that a previously unknown songId can promote
    // the canonical key from track|artist to songId.
    db.prepare(
      `UPDATE room_stats SET
        playCount = playCount + 1,
        likes = likes + ?,
        dislikes = dislikes + ?,
        stars = stars + ?,
        songId = COALESCE(songId, ?),
        spotifyTrackId = COALESCE(spotifyTrackId, ?),
        songDuration = COALESCE(songDuration, ?),
        canonSongKey = COALESCE(canonSongKey, ?)
      WHERE id = ?`
    ).run(
      likes,
      dislikes,
      stars,
      song.songId || null,
      song.spotifyTrackId || null,
      song.songDuration || null,
      canon,
      existing.id
    )
  } else {
    // Insert a new row with canonical key and initial stats.
    db.prepare(
      `INSERT INTO room_stats (
        trackName, artistName, songId, spotifyTrackId, songDuration,
        playCount, likes, dislikes, stars, canonSongKey
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
    ).run(
      song.trackName,
      song.artistName,
      song.songId || null,
      song.spotifyTrackId || null,
      song.songDuration || null,
      likes,
      dislikes,
      stars,
      canon
    )
  }
}

// ⏱️ Update lastPlayed timestamp
export function updateLastPlayed (song) {
  if (!song || !song.trackName || !song.artistName) return
  const now = new Date().toISOString()
  const canon = getCanonSongKey(song)
  if (!canon) return
  db.prepare(
    `UPDATE room_stats
      SET lastPlayed = ?, canonSongKey = COALESCE(canonSongKey, ?)
      WHERE canonSongKey = ?`
  ).run(
    now,
    canon,
    canon
  )
}

// 🔍 Get user song reviews
export function getUserSongReviews (userId, limit = 5) {
  const rows = db.prepare(`
    SELECT rs.trackName, rs.artistName, rs.songDuration, rs.spotifyTrackId,
           sr.rating
    FROM song_reviews sr
    JOIN room_stats rs ON rs.songId = sr.songId
    WHERE sr.userId = ?
    ORDER BY sr.rating DESC
    LIMIT ?
  `).all(userId, limit)

  return rows.map(row => ({
    trackName: row.trackName,
    artistName: row.artistName,
    albumName: 'Unknown Album',
    spotifyTrackId: row.spotifyTrackId,
    rating: row.rating
  }))
}
