// src/database/dbalbumqueue.js
import db from './db.js'

export function addQueuedAlbum ({
  spotifyAlbumId,
  spotifyUrl = null,
  albumName = null,
  artistName = null,
  releaseDate = null,
  trackCount = null,
  albumArt = null,
  submittedByUserId = null,
  submittedByNickname = null
}) {
  const now = new Date().toISOString()

  // Insert if new; if it already exists, we DON'T overwrite metadata aggressively,
  // but we can “refresh” missing fields.
  const row = db.prepare(`
    INSERT INTO album_queue (
      spotifyAlbumId, spotifyUrl, albumName, artistName, releaseDate, trackCount, albumArt,
      submittedByUserId, submittedByNickname,
      status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', CURRENT_TIMESTAMP, ?)
    ON CONFLICT(spotifyAlbumId) DO UPDATE SET
      -- preserve status if it was played/removed; keep as-is unless it was removed and you want to re-queue (handled elsewhere)
      spotifyUrl = COALESCE(album_queue.spotifyUrl, excluded.spotifyUrl),
      albumName  = COALESCE(album_queue.albumName, excluded.albumName),
      artistName = COALESCE(album_queue.artistName, excluded.artistName),
      releaseDate= COALESCE(album_queue.releaseDate, excluded.releaseDate),
      trackCount = COALESCE(album_queue.trackCount, excluded.trackCount),
      albumArt   = COALESCE(album_queue.albumArt, excluded.albumArt),
      updatedAt  = excluded.updatedAt
    RETURNING id, spotifyAlbumId, status
  `).get(
    spotifyAlbumId,
    spotifyUrl,
    albumName,
    artistName,
    releaseDate,
    trackCount,
    albumArt,
    submittedByUserId,
    submittedByNickname,
    now
  )

  return row
}

export function listQueuedAlbums ({ limit = 50, includeNonQueued = false } = {}) {
  if (includeNonQueued) {
    return db.prepare(`
      SELECT * FROM album_queue
      ORDER BY datetime(createdAt) DESC, id DESC
      LIMIT ?
    `).all(limit)
  }

  return db.prepare(`
    SELECT * FROM album_queue
    WHERE COALESCE(status, 'queued') = 'queued'
    ORDER BY datetime(createdAt) ASC, id ASC
    LIMIT ?
  `).all(limit)
}

// Mark album as played/removed/etc by spotifyAlbumId
export function updateAlbumQueueStatus (spotifyAlbumId, status) {
  const now = new Date().toISOString()
  const res = db.prepare(`
    UPDATE album_queue
    SET status = ?, updatedAt = ?
    WHERE spotifyAlbumId = ?
  `).run(String(status), now, String(spotifyAlbumId))
  return res.changes > 0
}

export function removeQueuedAlbum (spotifyAlbumId) {
  return updateAlbumQueueStatus(spotifyAlbumId, 'removed')
}

export function markAlbumPlaying (spotifyAlbumId) {
  return updateAlbumQueueStatus(spotifyAlbumId, 'playing')
}

export function markAlbumPlayed (spotifyAlbumId) {
  return updateAlbumQueueStatus(spotifyAlbumId, 'played')
}

export function getQueuedAlbum (spotifyAlbumId) {
  return db.prepare(`SELECT * FROM album_queue WHERE spotifyAlbumId = ?`).get(String(spotifyAlbumId))
}
