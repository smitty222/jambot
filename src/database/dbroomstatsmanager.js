import db from './db.js'

// 🔁 Add or update current song stats
export function logCurrentSong(song, likes = 0, dislikes = 0, stars = 0) {
  if (!song || !song.trackName || !song.artistName) return

  const existing = db.prepare(`
    SELECT * FROM room_stats
    WHERE (songId IS NOT NULL AND songId = ?)
       OR (songId IS NULL AND trackName = ? AND artistName = ?)
  `).get(song.songId || null, song.trackName, song.artistName)

  if (existing) {
    db.prepare(`
      UPDATE room_stats SET
        playCount = playCount + 1,
        likes = likes + ?,
        dislikes = dislikes + ?,
        stars = stars + ?,
        songId = COALESCE(songId, ?),
        spotifyTrackId = COALESCE(spotifyTrackId, ?),
        songDuration = COALESCE(songDuration, ?)
      WHERE id = ?
    `).run(
      likes, dislikes, stars,
      song.songId || null,
      song.spotifyTrackId || null,
      song.songDuration || null,
      existing.id
    )
  } else {
    db.prepare(`
      INSERT INTO room_stats (
        trackName, artistName, songId, spotifyTrackId, songDuration,
        playCount, likes, dislikes, stars
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      song.trackName,
      song.artistName,
      song.songId || null,
      song.spotifyTrackId || null,
      song.songDuration || null,
      likes,
      dislikes,
      stars
    )
  }
}

// ⏱️ Update lastPlayed timestamp
export function updateLastPlayed(song) {
  if (!song || !song.trackName || !song.artistName) return

  const now = new Date().toISOString()

  db.prepare(`
    UPDATE room_stats
    SET lastPlayed = ?
    WHERE (songId IS NOT NULL AND songId = ?)
       OR (songId IS NULL AND trackName = ? AND artistName = ?)
  `).run(
    now,
    song.songId || null,
    song.trackName,
    song.artistName
  )
}

// 🔍 Get user song reviews
export function getUserSongReviews(userId, limit = 5) {
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
