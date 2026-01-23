// src/utils/albumlistManager.js
//
// DB-backed album queue manager.
// This replaces the old JSON-file albumlist.json approach.
// Kept function names (addAlbum/removeAlbum/getAlbumList) for backward compatibility.
//
// New world:
// - addAlbum() expects a Spotify Album ID (base62, usually 22 chars)
// - removeAlbum() expects a Spotify Album ID
// - getAlbumList() returns an array of display strings (so legacy callers that
//   expected ["Album Name", ...] still get something readable)

import {
  addQueuedAlbum,
  removeQueuedAlbum,
  listQueuedAlbums
} from '../database/dbalbumqueue.js'

function looksLikeSpotifyId (s) {
  const t = String(s || '').trim()
  return /^[A-Za-z0-9]{15,30}$/.test(t)
}

/**
 * Add a new album to the remembered list (DB queue).
 *
 * Back-compat signature:
 * - Previously: addAlbum(albumName)
 * - Now: addAlbum(spotifyAlbumId, meta?)
 *
 * @param {string} spotifyAlbumId Spotify album ID
 * @param {object} [meta] Optional album metadata (if caller already fetched it)
 * @returns {Promise<boolean>} true if added/queued, false if already present or invalid
 */
export async function addAlbum (spotifyAlbumId, meta = null) {
  const id = String(spotifyAlbumId || '').trim()
  if (!id || !looksLikeSpotifyId(id)) return false

  // addQueuedAlbum is synchronous in your current usage patterns.
  // If yours is async, just `await` it — harmless either way.
  const res = addQueuedAlbum({
    spotifyAlbumId: id,
    spotifyUrl: meta?.spotifyUrl || '',
    albumName: meta?.albumName || '',
    artistName: meta?.artistName || '',
    releaseDate: meta?.releaseDate || '',
    trackCount: Number(meta?.trackCount || 0),
    albumArt: meta?.albumArt || '',
    submittedByUserId: meta?.submittedByUserId || '',
    submittedByNickname: meta?.submittedByNickname || ''
  })

  // Support a few possible return styles:
  // - boolean
  // - { inserted: true/false }
  // - { ok: true/false }
  if (typeof res === 'boolean') return res
  if (res && typeof res === 'object') {
    if (typeof res.inserted === 'boolean') return res.inserted
    if (typeof res.ok === 'boolean') return res.ok
  }

  // If db layer doesn't report, assume success.
  return true
}

/**
 * Remove an album from the remembered list (DB queue).
 *
 * Back-compat signature:
 * - Previously: removeAlbum(albumName)
 * - Now: removeAlbum(spotifyAlbumId)
 *
 * @param {string} spotifyAlbumId Spotify album ID
 * @returns {Promise<boolean>} true if removed, false if not found/invalid
 */
export async function removeAlbum (spotifyAlbumId) {
  const id = String(spotifyAlbumId || '').trim()
  if (!id || !looksLikeSpotifyId(id)) return false

  const res = removeQueuedAlbum(id)

  if (typeof res === 'boolean') return res
  if (res && typeof res === 'object') {
    if (typeof res.removed === 'boolean') return res.removed
    if (typeof res.ok === 'boolean') return res.ok
  }

  // If db layer doesn't report, assume it worked.
  return true
}

/**
 * Retrieve the current list of remembered albums.
 *
 * Back-compat behavior:
 * - Previously returned: string[] of album names
 * - Now returns: string[] of display lines ("Album — Artist (id)")
 *
 * If you want richer data for new code, call listQueuedAlbums() directly
 * from dbalbumqueue.js instead of this wrapper.
 *
 * @returns {Promise<string[]>}
 */
export async function getAlbumList () {
  const rows = listQueuedAlbums({ limit: 200, includeNonQueued: false })
  if (!Array.isArray(rows) || rows.length === 0) return []

  return rows.map(r => {
    const title = String(r.albumName || 'Unknown Album').trim()
    const artist = String(r.artistName || 'Unknown Artist').trim()
    const id = String(r.spotifyAlbumId || '').trim()
    return `${title} — ${artist}${id ? ` (${id})` : ''}`
  })
}
