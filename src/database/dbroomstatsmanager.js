import db from './db.js'
// Import helpers for normalising song information and fuzzy matching.
import { buildNormKey, isFuzzyMatch } from './normalizeSong.js'

// Helper to compute a canonical key for songs. We prefer using the
// provided songId if present; otherwise fall back to a lowercased
// combination of trackName and artistName separated by a pipe. This
// prevents expensive OR conditions in queries and aligns with the
// database migration introduced in initdb.js.
function getCanonSongKey (song) {
  if (!song) return null
  // Prefer the platform-specific ID when available. This ensures that
  // plays from different platforms can still link to the same row if
  // they share an identifier. Otherwise, fall back to a normalised
  // key derived from track and artist.
  if (song.songId) return String(song.songId)
  const { normKey } = buildNormKey(song.trackName, song.artistName)
  return normKey
}

// 🔁 Add or update current song stats
export function logCurrentSong (song, likes = 0, dislikes = 0, stars = 0) {
  if (!song || !song.trackName || !song.artistName) return
  // Compute normalised fields and canonical key. If a platform
  // identifier (songId) exists, the canonical key will be that ID;
  // otherwise it will be derived from the normalised track and artist.
  const { normArtist, normTrack, normKey } = buildNormKey(song.trackName, song.artistName)
  const canon = song.songId ? String(song.songId) : normKey
  let existing = null
  if (canon) {
    existing = db.prepare('SELECT * FROM room_stats WHERE canonSongKey = ?').get(canon)
  }
  // Fuzzy fallback: if no exact match, search for rows with the same
  // normalised artist and a similar title. We limit the search to
  // entries whose normArtist matches to reduce scan cost. The
  // normalised fields may be NULL for older rows, so we fall back
  // to a raw LOWER comparison if necessary.
  if (!existing && normArtist) {
    const candidates = db.prepare(
      `SELECT * FROM room_stats
       WHERE (normArtist = @na OR (normArtist IS NULL AND LOWER(artistName) = LOWER(@origArtist)))`
    ).all({ na: normArtist, origArtist: song.artistName })
    for (const candidate of candidates) {
      if (isFuzzyMatch(song.trackName, candidate.trackName, song.artistName, candidate.artistName)) {
        existing = candidate
        break
      }
    }
  }
  if (existing) {
    // Update existing row: increment play count and reactions. Also
    // set canonical and normalisation fields if they were previously
    // null. Use the computed canon so that a previously unknown
    // songId can promote the canonical key from normKey to songId.
    db.prepare(
      `UPDATE room_stats SET
        playCount = playCount + 1,
        likes = likes + ?,
        dislikes = dislikes + ?,
        stars = stars + ?,
        songId = COALESCE(songId, ?),
        spotifyTrackId = COALESCE(spotifyTrackId, ?),
        songDuration = COALESCE(songDuration, ?),
        canonSongKey = COALESCE(canonSongKey, ?),
        normTrack = COALESCE(normTrack, ?),
        normArtist = COALESCE(normArtist, ?),
        normSongKey = COALESCE(normSongKey, ?)
      WHERE id = ?`
    ).run(
      likes,
      dislikes,
      stars,
      song.songId || null,
      song.spotifyTrackId || null,
      song.songDuration || null,
      canon,
      normTrack,
      normArtist,
      normKey,
      existing.id
    )
  } else {
    // Insert a new row with canonical key, normalised fields and
    // initial stats. Normalisation fields help future fuzzy
    // deduplication and speed up lookups.
    db.prepare(
      `INSERT INTO room_stats (
        trackName, artistName, songId, spotifyTrackId, songDuration,
        playCount, likes, dislikes, stars, canonSongKey,
        normTrack, normArtist, normSongKey
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      song.trackName,
      song.artistName,
      song.songId || null,
      song.spotifyTrackId || null,
      song.songDuration || null,
      likes,
      dislikes,
      stars,
      canon,
      normTrack,
      normArtist,
      normKey
    )
  }
}

// ⏱️ Update lastPlayed timestamp
export function updateLastPlayed (song) {
  if (!song || !song.trackName || !song.artistName) return
  const now = new Date().toISOString()
  const { normArtist, normTrack, normKey } = buildNormKey(song.trackName, song.artistName)
  const canon = song.songId ? String(song.songId) : normKey
  if (!canon) return
  // Update lastPlayed on all rows that match the canonical key OR have
  // the same track/artist combination (case-insensitive). In
  // addition to the timestamp, promote canonical and normalised
  // fields when they are missing. This keeps legacy rows in sync
  // with updated key derivation and aids future deduplication.
  db.prepare(
    `UPDATE room_stats
      SET lastPlayed = ?,
          canonSongKey = COALESCE(canonSongKey, ?),
          normTrack = COALESCE(normTrack, ?),
          normArtist = COALESCE(normArtist, ?),
          normSongKey = COALESCE(normSongKey, ?)
      WHERE canonSongKey = ?
         OR (LOWER(trackName) = LOWER(?) AND LOWER(artistName) = LOWER(?))`
  ).run(
    now,
    canon,
    normTrack,
    normArtist,
    normKey,
    canon,
    song.trackName,
    song.artistName
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
