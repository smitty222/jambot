// src/utils/API.js
import { buildUrl, makeRequest } from './networking.js'

/* ────────────────────────────────────────────────────────────────
 * Config & Constants
 * ──────────────────────────────────────────────────────────────── */
const cfg = {
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  defaultPlaylistId: process.env.DEFAULT_PLAYLIST_ID,
  redirectUri: process.env.REDIRECT_URI,

  // TT
  ttGateway: 'https://gateway.prod.tt.fm',
  roomSlug: process.env.ROOM_SLUG || 'just-jams',
  roomUUID: process.env.ROOM_UUID,
  userToken: process.env.TTL_USER_TOKEN,

  // Third-party
  lastfmKey: process.env.LASTFM_API_KEY,
  geniusToken: process.env.GENIUS_TOKEN,

  // CometChat
  comet: {
    appId: process.env.CHAT_TT_APP_ID,
    authKey: process.env.CHAT_AUTH_KEY
  }
}

/* ────────────────────────────────────────────────────────────────
 * Small utilities
 * ──────────────────────────────────────────────────────────────── */
const now = () => Date.now()

class SimpleLRU {
  constructor (max = 200, ttlMs = 10 * 60 * 1000) {
    this.max = max
    this.ttl = ttlMs
    this.map = new Map()
  }

  get (key) {
    const e = this.map.get(key)
    if (!e) return null
    if (e.exp <= now()) {
      this.map.delete(key)
      return null
    }
    // LRU bump
    this.map.delete(key)
    this.map.set(key, e)
    return e.val
  }

  set (key, val) {
    this.map.set(key, { val, exp: now() + this.ttl })
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value
      this.map.delete(first)
    }
  }
}

const inflight = new Map()
function singleFlight (key, fn) {
  if (inflight.has(key)) return inflight.get(key)
  const p = (async () => {
    try { return await fn() } finally { inflight.delete(key) }
  })()
  inflight.set(key, p)
  return p
}

function ttHeaders (extra = {}) {
  return {
    Authorization: `Bearer ${cfg.userToken}`,
    accept: 'application/json',
    ...extra
  }
}

function withQuery (url, q) {
  const u = new URL(url)
  if (q) {
    for (const [k, v] of Object.entries(q)) {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v))
    }
  }
  return u.toString()
}

/* ────────────────────────────────────────────────────────────────
 * Generic caches for non‑Spotify APIs
 * ──────────────────────────────────────────────────────────────── */
// The bot makes frequent requests to fetch user profiles, roles, sports scores
// and other third‑party data. These calls can become latency bottlenecks if
// executed on every message. To minimise network overhead and improve overall
// responsiveness, we keep small in‑memory caches for various data.  The caches
// use a time‑to‑live (TTL) and least‑recently‑used (LRU) eviction to avoid
// unbounded growth.
const userProfileCache = new SimpleLRU(500, 10 * 60 * 1000) // 10 minutes
const userRoleCache = new SimpleLRU(500, 10 * 60 * 1000)
const nicknameCache = new SimpleLRU(500, 10 * 60 * 1000)
const scoreboardCache = new SimpleLRU(10, 60 * 1000) // 1 minute TTL
const lastFmCache = new SimpleLRU(200, 30 * 60 * 1000) // 30 minutes

// Helper for caching scoreboard results.  Accepts a sport key (e.g. "baseball/mlb")
// and a function to compute the result.  Returns the cached value if present,
// otherwise computes, stores and returns the value.
async function getCachedScoreboard (sportPath, fn) {
  const cached = scoreboardCache.get(sportPath)
  if (cached) return cached
  const result = await fn()
  if (result) scoreboardCache.set(sportPath, result)
  return result
}

/* ────────────────────────────────────────────────────────────────
 * Spotify token & request helpers
 * ──────────────────────────────────────────────────────────────── */
let spotifyToken = { token: null, exp: 0 } // exp = epoch ms

async function fetchSpotifyAccessToken () {
  const key = 'spotify-token'
  return singleFlight(key, async () => {
    const body = 'grant_type=client_credentials&scope=' + encodeURIComponent('playlist-modify-public')
    const hdrs = {
      Authorization:
        'Basic ' + Buffer.from(`${cfg.spotifyClientId}:${cfg.spotifyClientSecret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    }
    const { ok, data, error } = await makeRequest('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: hdrs,
      body
    })
    if (!ok || !data?.access_token) {
      throw new Error(`Failed to retrieve access token: ${error || 'unknown'}`)
    }
    // expires_in is seconds; refresh 60s early
    const ttlMs = Math.max(0, (Number(data.expires_in) || 3600) * 1000 - 60_000)
    spotifyToken = { token: data.access_token, exp: now() + ttlMs }
    return spotifyToken.token
  })
}

async function getSpotifyToken () {
  if (spotifyToken.token && spotifyToken.exp > now()) return spotifyToken.token
  return fetchSpotifyAccessToken()
}

async function spotifyRequest (url, opts = {}, retryOn401 = true) {
  const token = await getSpotifyToken()
  const headers = { Authorization: `Bearer ${token}`, ...(opts.headers || {}) }

  let res = await makeRequest(url, { ...opts, headers })
  if (res.status === 401 && retryOn401) {
    try { await fetchSpotifyAccessToken() } catch {}
    const headers2 = { Authorization: `Bearer ${spotifyToken.token}`, ...(opts.headers || {}) }
    res = await makeRequest(url, { ...opts, headers: headers2 })
  }
  return res
}

/* ────────────────────────────────────────────────────────────────
 * TT Gateway helpers
 * ──────────────────────────────────────────────────────────────── */
async function ttRequest (path, { method = 'GET', headers = {}, body, search } = {}) {
  const url = buildUrl(cfg.ttGateway.replace(/^https?:\/\//, ''), path.split('/').filter(Boolean), search)
  return makeRequest(url, { method, headers: ttHeaders(headers), body })
}

/* ────────────────────────────────────────────────────────────────
 * Room / User APIs
 * ──────────────────────────────────────────────────────────────── */
export async function updateRoomInfo (payload) {
  const { ok, data, error } = await ttRequest(`/api/room-service/rooms/${cfg.roomSlug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!ok) throw new Error(`Failed to update room info: ${error || 'unknown'}`)
  return data
}

export async function updateRoomPosterFile (slug, posterFileUrl) {
  const { ok, data, error } = await ttRequest(`/api/room-service/rooms/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ posterFile: posterFileUrl })
  })
  if (!ok) throw new Error(`Failed to update posterFile: ${error || 'unknown'}`)
  return data
}

export async function fetchCurrentlyPlayingSong () {
  const { ok, data, error } = await ttRequest(`/api/room-service/rooms/uuid/${cfg.roomUUID}`)
  if (!ok) throw new Error(`Failed to fetch current song: ${error || 'unknown'}`)

  const song = data?.song
  if (!song) throw new Error('No song data found in response')

  return {
    songId: song.songId || null,
    trackName: song.trackName || 'Unknown',
    artistName: song.artistName || 'Unknown',
    duration: song.duration || 0,
    isrc: song.isrc || null,
    explicit: song.explicit || false,
    genre: song.genre || null,
    thumbnails: song.thumbnails || {},
    links: song.links || {},
    musicProviders: song.musicProviders || {},
    playbackToken: song.playbackToken || null,
    status: song.status || null,
    createdAt: song.createdAt || null,
    updatedAt: song.updatedAt || null,
    albumId: song.albumId || null,
    albumName: song.albumName || null,
    releaseDate: song.releaseDate || null
  }
}

export async function currentsongduration () {
  const { ok, data, error } = await ttRequest(`/api/room-service/rooms/uuid/${cfg.roomUUID}`)
  if (!ok) throw new Error(`Failed to fetch current song: ${error || 'unknown'}`)

  const dur = data?.song?.duration
  if (!dur) throw new Error('Song duration not found in the current song')
  return dur
}

export async function fetchRecentSongs () {
  const { ok, data, error } = await ttRequest(`/api/playlist-service/rooms/${cfg.roomSlug}/recent-songs`)
  if (!ok) throw new Error(`Failed to fetch recent songs: ${error || 'unknown'}`)
  return data?.songPlays || []
}

export async function fetchSongData (spotifyTrackId) {
  const { ok, data, error } = await ttRequest(`/api/playlist-service/song-data/${spotifyTrackId}/spotify`)
  if (!ok) throw new Error(`Failed to fetch song data: ${error || 'unknown'}`)
  return data
}

export async function fetchCurrentUsers () {
  const { ok, data, error } = await ttRequest(`/api/room-service/rooms/${cfg.roomSlug}`)
  if (!ok) throw new Error(`Failed to fetch current users: ${error || 'unknown'}`)

  const users = data?.usersInRoomUuids
  if (!Array.isArray(users)) throw new Error('Failed to fetch current users: Invalid response format')
  return users
}

export async function updateUserAvatar (userToken, avatarId, color) {
  const { ok, data, error } = await makeRequest(`${cfg.ttGateway}/api/user-service/users/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`
    },
    body: JSON.stringify({ avatarId, color })
  })
  if (!ok) throw new Error(data?.message || error || 'Unknown error')
  return data
}

/* ────────────────────────────────────────────────────────────────
 * Queue / Crate APIs
 * ──────────────────────────────────────────────────────────────── */
export async function fetchAllUserQueueSongIDsWithUUID (userToken) {
  if (!userToken) throw new Error('User token is required for fetching queue songs.')

  const all = []
  let offset = 0
  const limit = 100

  // TT playlist service uses offset/limit pagination
  for (;;) {
    const { ok, data, error } = await makeRequest(
      withQuery(`${cfg.ttGateway}/api/playlist-service/crate/special/queue/songs`, { limit, offset }),
      { headers: ttHeaders({ Authorization: `Bearer ${userToken}` }) }
    )
    if (!ok) throw new Error(`Failed to fetch queue songs: ${error || 'unknown'}`)

    const songs = data?.songs || []
    if (!songs.length) break

    all.push(
      ...songs.map(s => ({
        songID: s.songId,
        crateSongUUID: s.crateSongUUID
      }))
    )
    offset += songs.length
  }
  return all
}

export async function DeleteQueueSong (crateSongUuid, userToken) {
  if (!crateSongUuid) throw new Error('crateSongUuid must be provided')
  if (!userToken) throw new Error('User token must be provided')

  const { ok, data, error } = await makeRequest(
    `${cfg.ttGateway}/api/playlist-service/crate/special/queue/songs/${crateSongUuid}`,
    { method: 'DELETE', headers: ttHeaders({ Authorization: `Bearer ${userToken}` }) }
  )
  if (!ok) throw new Error(`Failed to delete song from queue: ${error || 'unknown'}`)
  return data
}

export async function addSongsToCrate (crateId, songs, append = true, token) {
  const { ok, data, error } = await makeRequest(
    `${cfg.ttGateway}/api/playlist-service/crate/${crateId}/songs`,
    {
      method: 'POST',
      headers: ttHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ songs, append })
    }
  )
  if (!ok) throw new Error(`Failed to add songs to crate: ${error || 'unknown'}`)
  return data
}

export async function getUserQueueCrateId (userId) {
  const token = getUserToken(userId)
  if (!token) return null

  const { ok, data } = await makeRequest(
    `${cfg.ttGateway}/api/playlist-service/crate/special/queue`,
    { headers: ttHeaders({ Authorization: `Bearer ${token}` }) }
  )
  if (!ok) return null
  return data // { crateUuid, ... }
}

export async function clearUserQueueCrate (userId) {
  const token = getUserToken(userId)
  if (!token) throw new Error('No token found for user')

  const { ok, data, error } = await makeRequest(
    `${cfg.ttGateway}/api/playlist-service/crate/special/queue/songs/clear`,
    {
      method: 'POST',
      headers: ttHeaders({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }),
      body: ''
    }
  )
  if (!ok) throw new Error(`Failed to clear user crate: ${error || 'unknown'}`)
  return data
}

/* ────────────────────────────────────────────────────────────────
 * Spotify APIs (with caching + single-flight)
 * ──────────────────────────────────────────────────────────────── */
const spotifyCache = new SimpleLRU(250, 10 * 60 * 1000)

export async function fetchSpotifyPlaylistTracks (playlistId) {
  const pid = playlistId || cfg.defaultPlaylistId
  if (!pid) return []

  let url = withQuery(`https://api.spotify.com/v1/playlists/${pid}/tracks`, {
    limit: 100,
    additional_types: 'track'
  })

  const tracks = []
  while (url) {
    const { ok, data } = await spotifyRequest(url)
    if (!ok) return []
    const items = data?.items || []
    if (items.length) tracks.push(...items)
    url = data?.next || null
  }
  return tracks
}

export async function spotifyTrackInfo (trackId) {
  if (!trackId) return null
  const key = `track:${trackId}`

  const cached = spotifyCache.get(key)
  if (cached) return cached

  const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`
  const res = await singleFlight(key, async () => {
    const { ok, data } = await spotifyRequest(url)
    if (!ok || !data) return null

    const t = data
    const out = {
      spotifyTrackName: t.name || 'Unknown',
      spotifyArtistName: Array.isArray(t.artists) ? t.artists.map(a => a.name).join(', ') : 'Unknown',
      spotifyAlbumName: t.album?.name || 'Unknown',
      spotifyReleaseDate: t.album?.release_date || 'Unknown',
      spotifyAlbumType: t.album?.album_type || 'Unknown',
      spotifyTrackNumber: t.track_number || 'Unknown',
      spotifyTotalTracks: t.album?.total_tracks || 'Unknown',
      spotifyDuration: t.duration_ms
        ? `${Math.floor(t.duration_ms / 60000)}:${String(Math.floor((t.duration_ms % 60000) / 1000)).padStart(2, '0')}`
        : 'Unknown',
      spotifyAlbumArt: t.album?.images?.[0]?.url || '',
      spotifyPopularity: t.popularity || 0,
      spotifyPreviewUrl: t.preview_url || '',
      spotifySpotifyUrl: t.external_urls?.spotify || '',
      spotifyIsrc: t.external_ids?.isrc || 'Unknown',
      spotifyTrackUri: t.uri || 'Unknown',
      spotifyAlbumID: t.album?.id || 'Unknown'
    }
    spotifyCache.set(key, out)
    return out
  })
  return res
}

export async function spotifyArtistGenres (artistId) {
  if (!artistId) return []
  const key = `artist-genres:${artistId}`

  const cached = spotifyCache.get(key)
  if (cached) return cached

  const url = `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}`
  const res = await singleFlight(key, async () => {
    const { ok, data } = await spotifyRequest(url)
    if (!ok) return []
    const genres = data?.genres || []
    spotifyCache.set(key, genres)
    return genres
  })
  return res
}

export async function getAlbumTracks (albumId) {
  if (!albumId) return []
  const key = `album-tracks:${albumId}`

  const cached = spotifyCache.get(key)
  if (cached) return cached

  const url = `https://api.spotify.com/v1/albums/${encodeURIComponent(albumId)}/tracks?limit=50`
  const res = await singleFlight(key, async () => {
    const { ok, data } = await spotifyRequest(url)
    if (!ok) return []
    const items = data?.items || []
    spotifyCache.set(key, items)
    return items
  })
  return res
}

export async function searchSpotify (artistName, trackName) {
  if (!artistName || !trackName) return null
  const key = `search:${artistName}|${trackName}`

  const cached = spotifyCache.get(key)
  if (cached) return cached

  const q = `artist:${artistName} track:${trackName}`
  const url = withQuery('https://api.spotify.com/v1/search', {
    q,
    type: 'track',
    limit: 1
  })

  const res = await singleFlight(key, async () => {
    const { ok, data } = await spotifyRequest(url)
    if (!ok) return null
    const t = data?.tracks?.items?.[0]
    if (!t || !t.id || !t.album || !t.album.name || !t.album.images?.[0]?.url) return null

    const out = {
      spotifyTrackID: t.id,
      spotifyTrackName: t.name,
      spotifyArtistName: (t.artists || []).map(a => a.name).join(', '),
      spotifyUrl: t.external_urls?.spotify,
      spotifyAlbumName: t.album?.name,
      spotifyAlbumArt: t.album?.images?.[0]?.url || '',
      spotifyReleaseDate: t.album?.release_date,
      spotifyTrackNumber: t.track_number,
      popularity: t.popularity
    }
    spotifyCache.set(key, out)
    return out
  })
  return res
}

export async function getAlbumsByArtist (artistName) {
  if (!artistName) return []
  const key = `albums-by-artist:${artistName.toLowerCase()}`

  const cached = spotifyCache.get(key)
  if (cached) return cached

  const searchUrl = withQuery('https://api.spotify.com/v1/search', {
    q: artistName,
    type: 'artist',
    limit: 1
  })

  const res = await singleFlight(key, async () => {
    const s = await spotifyRequest(searchUrl)
    if (!s.ok) return []
    const artist = s.data?.artists?.items?.[0]
    if (!artist?.id) return []

    const albumsUrl = `https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album,single&limit=50`
    const a = await spotifyRequest(albumsUrl)
    if (!a.ok) return []

    const seen = new Set()
    const items = (a.data?.items || []).filter(alb => {
      if (!alb?.name) return false
      if (seen.has(alb.name)) return false
      seen.add(alb.name)
      return true
    }).map(alb => ({
      name: alb.name,
      id: alb.id,
      releaseDate: alb.release_date,
      totalTracks: alb.total_tracks,
      image: alb.images?.[0]?.url || ''
    }))

    spotifyCache.set(key, items)
    return items
  })
  return res
}

export async function fetchTrackDetails (trackUri) {
  try {
    const trackId = await extractTrackId(trackUri)
    const url = `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`
    const { ok, data, error } = await spotifyRequest(url)
    if (!ok) throw new Error(error || 'Failed to fetch track details')
    return {
      title: data?.name,
      artist: Array.isArray(data?.artists) ? data.artists.map(a => a.name).join(', ') : 'Unknown'
    }
  } catch (e) {
    return null
  }
}

/* ────────────────────────────────────────────────────────────────
 * User/Profile APIs
 * ──────────────────────────────────────────────────────────────── */
export async function fetchUserData (userUUIDs) {
  // Normalise to an array and filter falsy values.
  const uuids = (Array.isArray(userUUIDs) ? userUUIDs : [userUUIDs]).filter(Boolean)
  if (!uuids.length) throw new Error('No user UUIDs provided')

  // Collect cached profiles and determine which UUIDs still need to be fetched.
  const profiles = []
  const missing = []
  for (const uuid of uuids) {
    const cached = userProfileCache.get(uuid)
    if (cached) {
      profiles.push(cached)
    } else {
      missing.push(uuid)
    }
  }

  // If there are any uncached UUIDs, fetch them in a single request.
  if (missing.length) {
    const qs = missing.map(u => `users=${encodeURIComponent(u)}`).join('&')
    const endpoint = `${cfg.ttGateway}/api/user-service/users/profiles?${qs}`
    const { ok, data, error } = await makeRequest(endpoint, { headers: ttHeaders() })
    if (!ok) throw new Error(`Failed to fetch user data: ${error || 'unknown'}`)

    const fetched = (Array.isArray(data) ? data : [])
      .map(e => e.userProfile)
      .filter(p => p && p.uuid)
    // Populate the cache and the result list.
    for (const profile of fetched) {
      if (profile && profile.uuid) {
        userProfileCache.set(profile.uuid, profile)
        profiles.push(profile)
      }
    }
  }
  return profiles
}




const USER_ROLES_URL = `${cfg.ttGateway}/api/room-service/roomUserRoles/${cfg.roomSlug}`

export async function fetchUserRoles (userUuid, token = cfg.userToken) {
  // Check cache first.
  const cached = userRoleCache.get(userUuid)
  if (cached) return cached
  const { ok, data, error } = await makeRequest(`${USER_ROLES_URL}/${encodeURIComponent(userUuid)}`, {
    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }
  })
  if (!ok) throw new Error(`Failed to fetch user roles: ${error || 'unknown'}`)
  // Cache the result to reduce subsequent fetches.
  userRoleCache.set(userUuid, data)
  return data
}

export async function isUserAuthorized (userUuid, token = cfg.userToken) {
  try {
    const roles = await fetchUserRoles(userUuid, token)
    const role = roles?.[0]?.role || null
    return role === 'moderator' || role === 'owner' || role === 'coOwner'
  } catch {
    return false
  }
}

export async function isUserOwner (userUuid, token = cfg.userToken) {
  try {
    const roles = await fetchUserRoles(userUuid, token)
    const role = roles?.[0]?.role || null
    return role === 'owner'
  } catch {
    return false
  }
}

/* ────────────────────────────────────────────────────────────────
 * ESPN Scores (MLB / NHL / NBA)
 * ──────────────────────────────────────────────────────────────── */
async function espnScoreboard (sportPath) {
  return getCachedScoreboard(sportPath, async () => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard`
    const { ok, data } = await makeRequest(url)
    if (!ok) return 'No scores available.\n'

    const games = data?.events || []
    games.sort((a, b) => {
      const pa = a?.competitions?.[0]?.status?.period || 0
      const pb = b?.competitions?.[0]?.status?.period || 0
      return pb - pa
    })

    const lines = games.map(g => {
      const comp = g?.competitions?.[0]
      const home = comp?.competitors?.find(c => c.homeAway === 'home')
      const away = comp?.competitors?.find(c => c.homeAway === 'away')
      const status = g?.status?.type?.description

      const hName = (home?.team?.displayName || '').split(' ').slice(-1).join(' ')
      const aName = (away?.team?.displayName || '').split(' ').slice(-1).join(' ')

      let statusMsg = status || ''
      if (status === 'In Progress') {
        const period = comp?.status?.period
        statusMsg = `${sportPath.includes('baseball') ? 'Inning' : sportPath.includes('hockey') ? 'Period' : 'Quarter'} ${period}`
      } else if (status === 'Scheduled') {
        const d = g?.status?.startDate ? new Date(g.status.startDate) : null
        statusMsg = d && !isNaN(d)
          ? `Scheduled at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Scheduled'
      }
      return `${aName} ${away?.score ?? 0} @ ${hName} ${home?.score ?? 0} (${statusMsg})`
    })

    return `${sportPath.toUpperCase().includes('MLB')
? 'MLB'
      : sportPath.toUpperCase().includes('NHL')
? 'NHL'
      : 'NBA'} Scores:\n${lines.join('\n')}\n`
  })
}

export async function getMLBScores () { return espnScoreboard('baseball/mlb') }
export async function getNHLScores () { return espnScoreboard('hockey/nhl') }
export async function getNBAScores () { return espnScoreboard('basketball/nba') }

/* ────────────────────────────────────────────────────────────────
 * Last.fm helpers
 * ──────────────────────────────────────────────────────────────── */
export function cleanArtistName (artist) {
  return String(artist || '').split(/feat\.|ft\./i)[0].split(',')[0].trim()
}
export function cleanTrackName (track) {
  return String(track || '').replace(/\(feat\..*?\)|\(ft\..*?\)/gi, '').trim()
}

export async function getSimilarTracks (artist, track) {
  const a = cleanArtistName(artist)
  const t = cleanTrackName(track)
  // Use cache to avoid repeated external lookups.
  const cacheKey = `similar:${a}|${t}`
  const cached = lastFmCache.get(cacheKey)
  if (cached) return cached
  const url = withQuery('https://ws.audioscrobbler.com/2.0/', {
    method: 'track.getsimilar',
    artist: a,
    track: t,
    autocorrect: 1,
    api_key: cfg.lastfmKey,
    format: 'json',
    limit: 10
  })

  try {
    const { ok, data } = await makeRequest(url)
    if (!ok || data?.error) return []
    let raw = data?.similartracks?.track
    if (!raw) return []
    if (!Array.isArray(raw)) raw = [raw]
    const result = raw
      .filter(x => x?.name && x?.artist?.name)
      .map(x => ({ trackName: x.name, artistName: x.artist.name }))
    lastFmCache.set(cacheKey, result)
    return result
  } catch {
    return []
  }
}

export async function getTrackTags (artist, track) {
  const a = cleanArtistName(artist)
  const t = cleanTrackName(track)
  // Cache tags to reduce repeated lookups.
  const cacheKey = `tracktags:${a}|${t}`
  const cached = lastFmCache.get(cacheKey)
  if (cached) return cached
  const url = withQuery('https://ws.audioscrobbler.com/2.0/', {
    method: 'track.gettoptags',
    artist: a,
    track: t,
    api_key: cfg.lastfmKey,
    format: 'json'
  })
  const { ok, data } = await makeRequest(url)
  if (!ok) return []
  const result = data?.toptags?.tag?.map(z => String(z.name || '').toLowerCase()) || []
  lastFmCache.set(cacheKey, result)
  return result
}

export async function getArtistTags (artistName) {
  const a = cleanArtistName(artistName)
  // Cache artist tags.
  const cacheKey = `artisttags:${a}`
  const cached = lastFmCache.get(cacheKey)
  if (cached) return cached
  const url = withQuery('https://ws.audioscrobbler.com/2.0/', {
    method: 'artist.gettoptags',
    artist: a,
    api_key: cfg.lastfmKey,
    format: 'json'
  })
  try {
    const { ok, data } = await makeRequest(url)
    if (!ok) return []
    const tags = data?.toptags?.tag || []
    const result = tags
      .filter(t => t.name && !isNaN(parseInt(t.count)))
      .sort((x, y) => parseInt(y.count) - parseInt(x.count))
      .map(t => String(t.name).toLowerCase())
    lastFmCache.set(cacheKey, result)
    return result
  } catch {
    return []
  }
}

export async function getTopChartTracks (limit = 50) {
  // Cache chart tracks.
  const cacheKey = `charttracks:${limit}`
  const cached = lastFmCache.get(cacheKey)
  if (cached) return cached
  const url = withQuery('https://ws.audioscrobbler.com/2.0/', {
    method: 'chart.gettoptracks',
    api_key: cfg.lastfmKey,
    format: 'json',
    limit
  })
  try {
    const { ok, data } = await makeRequest(url)
    if (!ok) return []
    const items = data?.tracks?.track || []
    const result = items.map(tr => ({
      trackName: tr.name,
      artistName: tr.artist?.name,
      playcount: parseInt(tr.playcount || '0', 10),
      listeners: parseInt(tr.listeners || '0', 10)
    }))
    lastFmCache.set(cacheKey, result)
    return result
  } catch {
    return []
  }
}

export async function getTopArtistTracks (artist) {
  const a = cleanArtistName(artist)
  // Cache top artist tracks.
  const cacheKey = `artisttop:${a}`
  const cached = lastFmCache.get(cacheKey)
  if (cached) return cached
  const url = withQuery('https://ws.audioscrobbler.com/2.0/', {
    method: 'artist.gettoptracks',
    artist: a,
    api_key: cfg.lastfmKey,
    format: 'json',
    limit: 10
  })
  try {
    const { ok, data } = await makeRequest(url)
    if (!ok) return []
    const list = data?.toptracks?.track || []
    const result = list.map(t => ({
      trackName: t.name,
      playcount: t.playcount ? parseInt(t.playcount, 10) : 0
    }))
    lastFmCache.set(cacheKey, result)
    return result
  } catch {
    return []
  }
}

export async function getTopTracksByTag (tag, limit = 10) {
  // Cache top tracks by tag.
  const cacheKey = `tagtop:${tag}|${limit}`
  const cached = lastFmCache.get(cacheKey)
  if (cached) return cached
  const url = withQuery('https://ws.audioscrobbler.com/2.0/', {
    method: 'tag.gettoptracks',
    tag,
    api_key: cfg.lastfmKey,
    format: 'json',
    limit
  })
  try {
    const { ok, data } = await makeRequest(url)
    if (!ok) return []
    const items = data?.tracks?.track || []
    const result = items.map(tr => ({ trackName: tr.name, artistName: tr.artist?.name }))
    lastFmCache.set(cacheKey, result)
    return result
  } catch {
    return []
  }
}

/* ────────────────────────────────────────────────────────────────
 * Trivia
 * ──────────────────────────────────────────────────────────────── */
export async function getTriviaQuestions (categoryId, amount = 5) {
  // Cache trivia questions by category and amount to avoid repeated network calls.
  const cacheKey = `trivia:${categoryId || 'any'}|${amount}`
  const cached = lastFmCache.get(cacheKey)
  if (cached) return cached
  const url = withQuery('https://opentdb.com/api.php', {
    amount,
    type: 'multiple',
    ...(categoryId ? { category: categoryId } : {})
  })

  const { ok, data } = await makeRequest(url)
  if (!ok || !Array.isArray(data?.results) || !data.results.length) return []

  const result = data.results.map(q => {
    const questionText = q.question || ''
    const correctAnswerText = q.correct_answer || ''
    const incorrectAnswers = q.incorrect_answers || []
    const answers = [...incorrectAnswers, correctAnswerText].sort(() => Math.random() - 0.5)
    return {
      question: decodeHtml(questionText),
      correctAnswer: mapCorrectLetter(correctAnswerText, answers),
      answers: answers.map((a, i) => `${'ABCD'[i]}. ${decodeHtml(a || '')}`)
    }
  })
  lastFmCache.set(cacheKey, result)
  return result
}

export function decodeHtml (html) {
  if (typeof html !== 'string') html = ''
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&eacute;/g, 'é')
    .replace(/&rsquo;/g, '’')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&shy;/g, '')
    .replace(/&nbsp;/g, ' ')
}

function mapCorrectLetter (correctAnswer, answers) {
  const index = answers.indexOf(correctAnswer)
  return index >= 0 ? 'ABCD'[index] : 'A'
}

/* ────────────────────────────────────────────────────────────────
 * CometChat login
 * ──────────────────────────────────────────────────────────────── */
export async function loginCometChatUser (uid) {
  const url = `https://${cfg.comet.appId}.api-us.cometchat.io/v3.0/users/${encodeURIComponent(uid)}/auth_tokens`
  const headers = { accept: 'application/json', apikey: cfg.comet.authKey, 'Content-Type': 'application/json' }
  const { ok, data } = await makeRequest(url, { method: 'POST', headers })
  if (!ok) return null
  return data?.data?.authToken || data?.authToken || data?.data?.token || null
}

/* ────────────────────────────────────────────────────────────────
 * Genius (About)
 * ──────────────────────────────────────────────────────────────── */
const GHEAD = { Authorization: `Bearer ${cfg.geniusToken}` }

async function geniusRequest (url) {
  return makeRequest(url, { headers: GHEAD })
}

const searchSong = async (q) => {
  const url = `https://api.genius.com/search?q=${encodeURIComponent(q)}`
  const { ok, data } = await geniusRequest(url)
  if (!ok) return []
  return data?.response?.hits || []
}

const getSong = async (id, fmt = 'plain') => {
  const url = `https://api.genius.com/songs/${id}?text_format=${fmt}`
  const { ok, data } = await geniusRequest(url)
  if (!ok) return null
  return data?.response?.song || null
}

export async function getGeniusAbout ({ title, artist }) {
  const hits = await searchSong(`${title} ${artist}`)
  const best = hits?.find(h =>
    h.type === 'song' &&
    h.result?.primary_artist?.name?.toLowerCase()?.includes(String(artist).toLowerCase())
  )?.result || hits?.[0]?.result

  if (!best) return { aboutPlain: null, aboutHtml: null, songId: null }

  const song = await getSong(best.id, 'plain,html')
  const aboutPlain = song?.description?.plain?.trim() || null
  const aboutHtml = song?.description?.html || null
  const descAnno = song?.description_annotation || null

  return { songId: song?.id || null, aboutPlain, aboutHtml, descAnno }
}

/* ────────────────────────────────────────────────────────────────
 * Dog API (dog.ceo)
 * ──────────────────────────────────────────────────────────────── */
export async function getRandomDogImage (breedPath /* e.g., "shiba" or "hound/afghan" */) {
  const base = 'https://dog.ceo/api'
  const url = breedPath
    ? `${base}/breed/${encodeURIComponent(breedPath)}/images/random`
    : `${base}/breeds/image/random`

  try {
    const { ok, data } = await makeRequest(url, {
      headers: { accept: 'application/json' },
      timeoutMs: 5000
    })
    if (!ok) return null

    // dog.ceo returns { status: 'success', message: <url|string|array> }
    const msg = data?.message
    if (data?.status !== 'success' || !msg) return null

    return typeof msg === 'string' ? msg : (Array.isArray(msg) ? (msg[0] || null) : null)
  } catch {
    // Keep quiet; caller handles user-facing errors
    return null
  }
}

/* ────────────────────────────────────────────────────────────────
 * Helpers & Exports kept for compatibility
 * ──────────────────────────────────────────────────────────────── */
export async function extractTrackId (input) {
  const s = String(input || '')
  const m = s.match(/https?:\/\/(open\.)?spotify\.com\/track\/([a-zA-Z0-9]+)(\?.*)?/)
  if (m && m[2]) return m[2]
  if (s.includes(':')) return s.split(':').pop()
  if (/^[a-zA-Z0-9]+$/.test(s)) return s
  throw new Error('Invalid track ID or URL')
}

/* NOTE: This is a static map in your original code. Left as-is. */
export function getUserToken (userId) {
  const userTokenMap = {
    '210141ad-6b01-4665-84dc-e47ea7c27dcb': 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MzMxLCJzdWIiOiIyMTAxNDFhZC02YjAxLTQ2NjUtODRkYy1lNDdlYTdjMjdkY2IiLCJyb2xlIjoidXNlciIsInN1YnNjcmlwdGlvbklkIjoicHJpY2VfMUlXTHR2R3FBTzhXejM4U05EVzFWY2RHIiwiY2FwYWJpbGl0aWVzIjpbInVwbG9hZE11c2ljIl0sInR5cGUiOiJ1c2VyIiwiaWF0IjoxNjk5ODE2ODY3LCJleHAiOjIwMTUxNzY4NjcsImlzcyI6InR1cm50YWJsZS11c2VyLXNlcnZpY2UifQ.TBI9bWe0JwIqGOvtjVNd9kiBpdgSth9v_fv5sGxSn2M4rR6e4WWNqMlC_L6iXoBL7QIpFQfHh41UVyYfBQrMmWyS4nWAYLx2CRLCVd2Ku5ybAcczJ59I_cL9JzwhYHXw89jURqCmr0WAcJ1RJnz_cQ1YksbxI-wROzRa_NWu9Ve7kDpECsMZmmWOh0JHJKyG-7oV57XHTD3OuaNmfoEmqqOuKV0liVlZ7zSNH7yno5ACeOuHW19BUVFtQLOVhwQe29KPzdxfyceTPs5gQGyU1hWZ1v6FvlO5lnuayMXMd8Y8vTVrikx4YbJySijM6FodXyYcU_IY_H3T13TDN7gtm3wW3fu0RNdo7CIAY72ltvXYgcdHgQV8ZWc1XaO92SNxLETrSfM5FFD0hhH6nwPR1rQp4Spjf-P1EmVnwKORjkc8QN1Kg812AheEAn-tqMR0DTn5txqZz25lv91NBQeb9HlbvcFvdUF9bS6Q-sKGVB8lYsGSoYq6bQtpf-iDN3oitA3eDCaL5hL0mz0AeGsEblHMTjdubIwy38Cxt1YrTVApiyWIOo8GgfP7TD3bRAJpZr9KE9opI1iu3SPy3Lkrvconizwt_nSekCTxZhSMaouNz-vdgaxp4sNhR-pS80YujqXU0zlD76WuGlFCVgI7ODqIcPQrWarroL8Hz4ldxcc',
    '92302b7d-ae5e-466f-975b-d3fee461f13f': 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTAyMiwic3ViIjoiOTIzMDJiN2QtYWU1ZS00NjZmLTk3NWItZDNmZWU0NjFmMTNmIiwicm9sZSI6InVzZXIiLCJjYXBhYmlsaXRpZXMiOlsidXBsb2FkTXVzaWMiXSwidHlwZSI6InVzZXIiLCJpYXQiOjE3Mjc0NjIzNzYsImV4cCI6MjA0MjgyMjM3NiwiaXNzIjoidHVybnRhYmxlLXVzZXItc2VydmljZSJ9.ZXLb2C9QARUVXU1dZ713LiaeVytQsCdLdd8BvfIXxDRXlQAPGQOnIVbG3FFimvRRbsZJ8NVh5LK9GxNz430arLeA0stt8B7O4LAR5J2yYCA_Z2R1sNAGSm6hhrYAW6nOhBPSH_xwt0c8OwAX9GelEXOsR7TKJTXgdQlCtQLt7NiuTEshG0BMfRSWPW7HMTytIsTwBV_53xGKbbtKRDRcShwdjy-iE9jruWy-RjQlUJ-M7fIJROQ1kxU27lAMhtWQ-wKTBWFf1YsiP9x_ZzkvkM1QMwLeIFkxQaaIHi8E7FWFeVzQT7o8E884BxKtrmSw5xLZ4WMFLNG9Gj1bvsAbrTRavi1mIaimhtwpCNEPZA0itdJGeaACZof04smnPzgBVCQMOcPj0lwciCdF36d3rJZeeC_7I2diHToa0ohH2MU_UPGb_Wc1MlF67bn-jjHpUBTTsyOoA1OzsyPfD76TVoCEfLIcCcCaBa8hhobfvky7w-y-mziGFa38cCh9dyIjofpmzUxaAxEAm_ZzeO2gfdeb9PLswKgswS9oVLGCLRiLiSSJ6l0oPxVVw0QegnM7ZrQpXmET75SBKoYVXMEw4fvJm7pQlsCpgXwsiXGVfMI-rHBimBaFmLNlY99N6vZnX6BzhE4x_UM-m3zpqm7PstVPTLi4_gHphaYh6oqt7fE',
    '072b0bb3-518e-4422-97fd-13dc53e8ae7e': 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODU3Nywic3ViIjoiMDcyYjBiYjMtNTE4ZS00NDIyLTk3ZmQtMTNkYzUzZThhZTdlIiwicm9sZSI6InVzZXIiLCJjYXBhYmlsaXRpZXMiOlsidXBsb2FkTXVzaWMiXSwidHlwZSI6InVzZXIiLCJpYXQiOjE3Mjc0NjIwMTQsImV4cCI6MjA0MjgyMjAxNCwiaXNzIjoidHVybnRhYmxlLXVzZXItc2VydmljZSJ9.TkaMY6S_8segACL0H6fzx75wpolIUFV1AL9kYc-704b7Wrtvxyx2hifpKPUJYyqnt5rE6NsYQNrhVB9nzUUSE0rh0DdEnSsQDv5QKkmbn4OMdpsw5Xq0EkzOLdaZyUxaURetGhtkC7YrO0-GJEVk2JFzkPebKEtnHTwhsYXZP73haH40GxJ5aavyNNLNlBbqd13FrOPc3uwZoEfS8XyWdNIYQI8UPjGKj9ASmMhbn-krPqbMwWXYakckasy8A3Hj5NY4ODBdsQSC_068_7XdzY1AtBCRdGCZgHh1-XrFoyIPoFOBsRTZuXtxDQx95NL83D-AskzU5IRvYEWvCFO-P3mm0lj7G6Yp0Zu5cErZvaj9OpJLCUW2RUuP7trJmETtbw0kFasQtDm7qOnyfXYblRfAA7KuPZgXkNqC7Svn-lgM2j8GXuLYUU20Yl15Qz_dsKmasIlqjOJT5oIVSj5SR0lZm297LZOjruBcRl4drvmpaZzm8F8nqv1On8IEINr9Oh88drvPwQx-6bFrqPwj1d58wCvuyCuq2FOpE5ZlmWJvOMHyJ1FeFDNRrHH1LHH0V9sHH4LxT5iIcnlmmJfGUIgwyN5MOyAi37_RjxdKOCtiXrakvIwgk_HoGC3M6do6rmIJYh3y8FuOjv5MkkqZ-FJB_HCuKf1WANmGguiSaXM'
  }
  const token = userTokenMap[userId]
  if (!token) { /* intentionally no loud logs */ }
  return token
}

/*
 * Return the Spotify user ID associated with a given TT.fm user UUID.
 *
 * Similar to getUserToken(), this map must be maintained by the bot
 * operator.  A Spotify user ID is required when searching a user's
 * playlists via the Spotify Web API.  Without it, /searchplaylist and
 * /qplaylist commands will return an error.  To find a user's Spotify
 * ID, visit their Spotify profile (or call the `me` endpoint with an
 * OAuth token) and copy the string after `user/` in the URL.  Then
 * populate the map below.
 */
export function getSpotifyUserId (userId) {
  const spotifyUserMap = {
    '072b0bb3-518e-4422-97fd-13dc53e8ae7e': 'ishirey45',
    '210141ad-6b01-4665-84dc-e47ea7c27dcb': '1251330663',
    '92302b7d-ae5e-466f-975b-d3fee461f13f': '12167509208'
  }
  return spotifyUserMap[userId]
}

/**
 * Fetch playlists owned or followed by the specified Spotify user.
 *
 * A Spotify user ID is required; it can be retrieved via getSpotifyUserId().
 * This function returns an array of playlist objects with at least
 * { id, name, tracks: { total } }.  Playlists are fetched in pages of 50
 * until all items are collected.  Any API error results in an empty
 * array being returned.
 *
 * @param {string} spotifyUserId – the Spotify user ID
 * @returns {Promise<Array>} – list of playlist objects
 */
export async function getUserPlaylists (spotifyUserId) {
  if (!spotifyUserId) return []
  const playlists = []
  let url = `https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}/playlists?limit=50`
  while (url) {
    const { ok, data } = await spotifyRequest(url)
    if (!ok) break
    const items = data?.items || []
    if (items.length) playlists.push(...items)
    url = data?.next || null
  }
  return playlists
}

/**
 * Retrieve all tracks from a given Spotify playlist.  The Spotify API
 * returns playlist items that wrap the track object; this helper
 * extracts only the track objects.  If no items are returned or
 * an error occurs, an empty array is returned.
 *
 * Note: for public playlists, a client-credentials token is sufficient.
 * Private playlists require the appropriate OAuth scopes on the token.
 *
 * @param {string} playlistId – the Spotify playlist ID
 * @returns {Promise<Array>} – list of track objects
 */
export async function getPlaylistTracks (playlistId) {
  if (!playlistId) return []
  const items = await fetchSpotifyPlaylistTracks(playlistId)
  if (!items || !items.length) return []
  const tracks = []
  for (const item of items) {
    const track = item?.track || null
    if (track && track.id) tracks.push(track)
  }
  return tracks
}

/* Legacy export kept */
export async function fetchRecentArtists (limit = 5) {
  const url = withQuery('https://api.spotify.com/v1/me/top/artists', { limit })
  // Note: requires a user OAuth token; with client-credentials this will likely 401.
  const { ok, data } = await spotifyRequest(url)
  if (!ok) throw new Error('Failed to fetch recent artists')
  const items = data?.items || []
  return items.map(artist => ({
    id: artist.id,
    name: artist.name,
    popularity: artist.popularity,
    genres: artist.genres,
    followers: artist.followers?.total,
    spotifyUrl: artist.external_urls?.spotify,
    images: artist.images
  }))
}
