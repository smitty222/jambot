// src/libs/dbRecentSongsManager.js
import db from './db.js'
import {
  getSimilarTracks,
  getTopArtistTracks
} from '../utils/API.js'
import { logger } from '../utils/logging.js'

//
// This module persists and reads recently played songs. When a new
// track is logged, we enrich it with similar tracks via external
// services. Those lookups can be expensive and should not overwhelm
// the event loop if multiple songs are played in rapid succession. To
// mitigate this, updateRecentSongs() uses a simple promise queue so
// that only one update runs at a time. Additional calls are enqueued
// and processed in order. If a new song is enqueued while another is
// running, it will wait its turn. Use updateRecentSongs() as an async
// function; it returns a promise that resolves once the entry has
// been persisted.
//
// NOTE: recent_songs is intentionally kept small (trimmed to 30).
// For analytics (Wrapped), we ALSO log an append-only row into
// song_plays (created in initdb.js).

const _updateQueue = []
let _updateInProgress = false

async function _processNext () {
  if (_updateInProgress) return
  const next = _updateQueue.shift()
  if (!next) return
  _updateInProgress = true
  const { newSong, resolve, reject } = next
  try {
    await _performUpdate(newSong)
    resolve()
  } catch (err) {
    reject(err)
  } finally {
    _updateInProgress = false
    setImmediate(_processNext)
  }
}

async function _performUpdate (newSong) {
  if (!newSong || !newSong.trackName || !newSong.artistName) return

  // Attempt to fetch similar tracks from the primary source
  let similarTracks = []
  try {
    similarTracks = await getSimilarTracks(newSong.artistName, newSong.trackName)
  } catch (err) {
    logger.warn('[RecentSongs] getSimilarTracks failed', { err: err?.message || err })
    similarTracks = []
  }

  // Fallback: use the top tracks API if no results.
  if (!Array.isArray(similarTracks) || similarTracks.length === 0) {
    try {
      const topTracks = await getTopArtistTracks(newSong.artistName)
      const validTracks = Array.isArray(topTracks)
        ? topTracks.filter(t => t?.trackName)
        : []
      if (validTracks.length > 0) {
        const randomIndex = Math.floor(Math.random() * Math.min(10, validTracks.length))
        similarTracks = [
          {
            trackName: validTracks[randomIndex].trackName,
            artistName: newSong.artistName
          }
        ]
      }
    } catch (err) {
      logger.warn('[RecentSongs] getTopArtistTracks failed', { err: err?.message || err })
    }
  }

  try {
    // 1) recent_songs: small UX list (trimmed)
    db.prepare(
      `INSERT INTO recent_songs (
        trackName,
        artistName,
        albumName,
        releaseDate,
        spotifyUrl,
        popularity,
        dj,
        playedAt,
        similarTracks
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
    ).run(
      newSong.trackName,
      newSong.artistName,
      newSong.albumName || 'Unknown',
      newSong.releaseDate || 'Unknown',
      newSong.spotifyUrl || '',
      newSong.popularity || 0,
      newSong.dj || 'unknown',
      serializeSimilarTracks(similarTracks)
    )

    // Keep at most 30 entries. Trim the oldest records if necessary.
    const { total } = db.prepare('SELECT COUNT(*) as total FROM recent_songs').get()
    if (total > 30) {
      const toDelete = total - 30
      db.prepare(
        `DELETE FROM recent_songs
         WHERE id IN (
           SELECT id FROM recent_songs
           ORDER BY playedAt ASC
           LIMIT ?
         )`
      ).run(toDelete)
    }

    // 2) song_plays: append-only analytics log for Wrapped (do NOT trim)
    // This is intentionally lightweight. Missing fields are stored as NULL.
    try {
      db.prepare(
        `INSERT INTO song_plays (
          trackName,
          artistName,
          albumName,
          songId,
          spotifyTrackId,
          djUuid,
          djNickname,
          playedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        newSong.trackName,
        newSong.artistName,
        newSong.albumName || 'Unknown',
        newSong.songId || null,
        newSong.spotifyTrackId || null,
        newSong.djUuid || null,
        newSong.djNickname || newSong.dj || 'unknown'
      )
    } catch (err) {
      // Non-fatal: wrapped can still work even if this fails occasionally
      logger.warn('[RecentSongs] song_plays insert failed', { err: err?.message || err })
    }

    logger.info('[RecentSongs] Stored song', { track: newSong.trackName, artist: newSong.artistName })
  } catch (err) {
    logger.error('[RecentSongs] DB update failed', { err: err?.message || err })
  }
}

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

export function updateRecentSongs (newSong) {
  return new Promise((resolve, reject) => {
    _updateQueue.push({ newSong, resolve, reject })
    _processNext()
  })
}
