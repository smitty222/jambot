// src/libs/dbRecentSongsManager.js
import db from './db.js'
import {
  getSimilarTracks,
  getTopArtistTracks
} from '../utils/API.js'

function serializeSimilarTracks (tracks) {
  return JSON.stringify(tracks || [])
}

function deserializeSimilarTracks (jsonStr) {
  try {
    return JSON.parse(jsonStr || '[]')
  } catch {
    return []
  }
}

// ✅ Read N most recent songs from DB
export function readRecentSongs (limit = 30) {
  const rows = db.prepare(`
    SELECT *
    FROM recent_songs
    ORDER BY playedAt DESC
    LIMIT ?
  `).all(limit)

  return rows.map(row => ({
    ...row,
    similarTracks: deserializeSimilarTracks(row.similarTracks)
  }))
}

// ✅ Insert a new song into recent_songs
export async function updateRecentSongs (newSong) {
  try {
    let similarTracks = await getSimilarTracks(newSong.artistName, newSong.trackName)

    // Fallback: Use Last.fm top tracks from artist
    if (!similarTracks?.length) {
      const topTracks = await getTopArtistTracks(newSong.artistName)
      const validTracks = topTracks.filter(t => t?.trackName)

      if (validTracks.length > 0) {
        const randomIndex = Math.floor(Math.random() * Math.min(10, validTracks.length))
        similarTracks = [
          {
            trackName: validTracks[randomIndex].trackName,
            artistName: newSong.artistName
          }
        ]
      }
    }

    // Insert into DB
    db.prepare(`
      INSERT INTO recent_songs (
        trackName,
        artistName,
        albumName,
        releaseDate,
        spotifyUrl,
        popularity,
        dj,
        playedAt,
        similarTracks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `).run(
      newSong.trackName,
      newSong.artistName,
      newSong.albumName || 'Unknown',
      newSong.releaseDate || 'Unknown',
      newSong.spotifyUrl || '',
      newSong.popularity || 0,
      newSong.dj || 'unknown',
      serializeSimilarTracks(similarTracks)
    )

    // Keep recent_songs trimmed to last 30 entries
    const { total } = db.prepare('SELECT COUNT(*) as total FROM recent_songs').get()
    if (total > 30) {
      const toDelete = total - 30
      db.prepare(`
        DELETE FROM recent_songs
        WHERE id IN (
          SELECT id FROM recent_songs
          ORDER BY playedAt ASC
          LIMIT ?
        )
      `).run(toDelete)
    }

    console.log(`✅ Stored recent song: ${newSong.trackName} by ${newSong.artistName}`)
  } catch (error) {
    console.error('❌ Error updating recent songs:', error)
  }
}
