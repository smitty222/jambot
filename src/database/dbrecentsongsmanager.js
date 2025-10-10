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

// A FIFO queue of pending song updates. Each entry is a tuple of
// `{ newSong, resolve, reject }` corresponding to the update request and
// its promise handlers.
const _updateQueue = []

// Indicates whether an update is currently in progress.
let _updateInProgress = false

// Kick off processing of the next item in the queue if not already
// running. This is called after each update completes or when a new
// entry is enqueued. It processes one item at a time to avoid
// overlapping external API calls.
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
    // Defer to the event loop before processing the next item
    setImmediate(_processNext)
  }
}

// Internal helper that performs the actual update logic: fetches
// similar tracks, writes to the database and trims old entries. Not
// intended to be called directly.
async function _performUpdate (newSong) {
  // Guard against invalid input
  if (!newSong || !newSong.trackName || !newSong.artistName) {
    return
  }
  // Attempt to fetch similar tracks from the primary source
  let similarTracks = []
  try {
    similarTracks = await getSimilarTracks(newSong.artistName, newSong.trackName)
  } catch (err) {
    logger.warn('[RecentSongs] getSimilarTracks failed', { err: err?.message || err })
    similarTracks = []
  }

  // Fallback: use the top tracks API if no results. This also
  // gracefully handles errors by logging and moving on.
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

  // Persist the song along with its similar tracks. Use parameter
  // bindings to avoid SQL injection and ensure the date is recorded
  // with SQLite’s datetime('now') function. Default values are used
  // for missing properties.
  try {
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
    logger.info('[RecentSongs] Stored song', { track: newSong.trackName, artist: newSong.artistName })
  } catch (err) {
    // Log the error but do not rethrow; the caller will still resolve
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
/**
 * Queue and persist a new song into the recent_songs table. This
 * function returns a Promise that resolves when the entry has been
 * processed. Calls are serialized via an internal queue to avoid
 * overlapping external API calls. See the module-level comment for
 * details.
 *
 * @param {Object} newSong
 * @returns {Promise<void>}
 */
export function updateRecentSongs (newSong) {
  return new Promise((resolve, reject) => {
    _updateQueue.push({ newSong, resolve, reject })
    _processNext()
  })
}
