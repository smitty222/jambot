import { fetchSpotifyPlaylistTracks } from './API.js'
import fetch from 'node-fetch'
import { env } from '../config.js'
import { logger } from './logging.js'

const clientId = env.spotifyClientId
const clientSecret = env.spotifyClientSecret
let accessToken = env.spotifyAccessToken
const refreshToken = env.spotifyRefreshToken

async function refreshSpotifyAccessTokenWithRefreshToken (refreshTokenValue) {
  const authOptions = {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=refresh_token&refresh_token=${refreshTokenValue}`
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', authOptions)

    if (!response.ok) {
      throw new Error(`Failed to refresh access token: ${response.statusText}`)
    }

    const data = await response.json()
    const expiresIn = Number(data.expires_in) || 3600
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshTokenValue,
      expiresAt: Date.now() + (expiresIn * 1000) - 60_000,
      expiresIn
    }
  } catch (error) {
    logger.error('[playlistUpdate] error refreshing access token', { err: error })
    throw error
  }
}

async function refreshAccessToken () {
  const refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshToken)
  accessToken = refreshed.accessToken
  return accessToken
}

function getAccessToken () {
  return accessToken
}

async function requestCreateSpotifyPlaylist (bearerToken, name, options = {}) {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) {
    throw new Error('Playlist name is required.')
  }

  const url = 'https://api.spotify.com/v1/me/playlists'
  const headers = {
    Authorization: `Bearer ${bearerToken}`,
    'Content-Type': 'application/json'
  }

  const body = {
    name: trimmedName,
    public: options.public !== false
  }

  const description = String(options.description || '').trim()
  if (description) body.description = description

  if (typeof options.collaborative === 'boolean') {
    body.collaborative = options.collaborative
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`)
  }

  return await response.json()
}

async function createSpotifyPlaylist (name, options = {}) {
  try {
    try {
      return await requestCreateSpotifyPlaylist(getAccessToken(), name, options)
    } catch (error) {
      if (!/Status:\s*401\b/.test(String(error?.message || ''))) throw error
      const newToken = await refreshAccessToken()
      return await requestCreateSpotifyPlaylist(newToken, name, options)
    }
  } catch (error) {
    logger.error('[playlistUpdate] error creating playlist', { name: String(name || '').trim(), err: error })
    throw error
  }
}

async function createSpotifyPlaylistForRefreshToken (refreshTokenValue, name, options = {}, tokenState = {}) {
  if (!refreshTokenValue) throw new Error('refreshToken is required')

  let token = String(tokenState.accessToken || '').trim()
  const expiresAt = Number(tokenState.expiresAt || 0)
  const isExpired = !token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()
  let refreshed = null

  if (isExpired) {
    refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshTokenValue)
    token = refreshed.accessToken
  }

  try {
    const playlist = await requestCreateSpotifyPlaylist(token, name, options)
    return {
      playlist,
      auth: refreshed || {
        accessToken: token,
        refreshToken: refreshTokenValue,
        expiresAt
      }
    }
  } catch (error) {
    if (!/Status:\s*401\b/.test(String(error?.message || ''))) throw error
    refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshTokenValue)
    const playlist = await requestCreateSpotifyPlaylist(refreshed.accessToken, name, options)
    return { playlist, auth: refreshed }
  }
}

async function addTracksToPlaylist (playlistId, trackUris, position = null) {
  // Fetch current tracks in the specified playlist
  const currentTracks = await fetchSpotifyPlaylistTracks(playlistId)

  // Extract the track URIs from the fetched tracks
  const existingTrackUris = currentTracks.map(item => item.track.uri)

  // Filter out tracks that already exist in the playlist
  const tracksToAdd = trackUris.filter(uri => !existingTrackUris.includes(uri))

  if (tracksToAdd.length === 0) {
    logger.info('[playlistUpdate] no new tracks to add', { playlistId })
    return null // No new tracks to add
  }

  const url = `https://api.spotify.com/v1/playlists/${playlistId}/items`
  const headers = {
    Authorization: `Bearer ${getAccessToken()}`,
    'Content-Type': 'application/json'
  }

  const body = {
    uris: tracksToAdd
  }

  if (position !== null) {
    body.position = position
  }

  try {
    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      if (response.status === 401) { // If unauthorized, refresh the token
        const newToken = await refreshAccessToken()
        headers.Authorization = `Bearer ${newToken}`
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        })

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
      } else {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
    }

    const data = await response.json()
    return data.snapshot_id // Return the snapshot ID of the updated playlist
  } catch (error) {
    logger.error('[playlistUpdate] error adding tracks to playlist', { playlistId, err: error })
    throw error
  }
}

async function removeTrackFromPlaylist (playlistId, trackUri) {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/items`
  const headers = {
    Authorization: `Bearer ${getAccessToken()}`,
    'Content-Type': 'application/json'
  }

  // Ensure trackUri is in the correct format with 'spotify:track:' prefix
  if (!trackUri.startsWith('spotify:track:')) {
    trackUri = `spotify:track:${trackUri}`
  }

  const body = {
    items: [{ uri: trackUri }]
  }

  logger.debug('[playlistUpdate] removing track from playlist', {
    playlistId,
    url,
    body
  })

  try {
    let response = await fetch(url, {
      method: 'DELETE',
      headers,
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      if (response.status === 401) { // If unauthorized, refresh the token
        const newToken = await refreshAccessToken()
        headers.Authorization = `Bearer ${newToken}`
        response = await fetch(url, {
          method: 'DELETE',
          headers,
          body: JSON.stringify(body)
        })

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`)
        }
      } else {
        throw new Error(`HTTP error! Status: ${response.status}`)
      }
    }

    const data = await response.json()
    return data.snapshot_id
  } catch (error) {
    logger.error('[playlistUpdate] error removing track from playlist', { playlistId, trackUri, err: error })
    throw error
  }
}

async function saveToSpotifyLikedSongs (refreshTokenValue, trackId, tokenState = {}) {
  if (!refreshTokenValue) throw new Error('refreshToken is required')
  if (!trackId) throw new Error('trackId is required')

  let token = String(tokenState.accessToken || '').trim()
  const expiresAt = Number(tokenState.expiresAt || 0)
  const isExpired = !token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()
  let refreshed = null

  if (isExpired) {
    refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshTokenValue)
    token = refreshed.accessToken
  }

  const doSave = async (bearerToken) => {
    const res = await fetch('https://api.spotify.com/v1/me/tracks', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ids: [trackId] })
    })
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`)
  }

  try {
    await doSave(token)
  } catch (err) {
    if (!/Status:\s*401\b/.test(String(err?.message || ''))) throw err
    refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshTokenValue)
    await doSave(refreshed.accessToken)
  }

  return refreshed || { accessToken: token, refreshToken: refreshTokenValue, expiresAt }
}

async function addTrackToPlaylistForUser (refreshTokenValue, playlistId, trackUri, tokenState = {}) {
  if (!refreshTokenValue) throw new Error('refreshToken is required')

  let token = String(tokenState.accessToken || '').trim()
  const expiresAt = Number(tokenState.expiresAt || 0)
  const isExpired = !token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()
  let refreshed = null

  if (isExpired) {
    refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshTokenValue)
    token = refreshed.accessToken
  }

  const doAdd = async (bearerToken) => {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [trackUri] })
    })
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`)
    const data = await res.json()
    return data.snapshot_id
  }

  let snapshotId
  try {
    snapshotId = await doAdd(token)
  } catch (err) {
    if (!/Status:\s*401\b/.test(String(err?.message || ''))) throw err
    refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshTokenValue)
    snapshotId = await doAdd(refreshed.accessToken)
  }

  return { snapshotId, auth: refreshed || { accessToken: token, refreshToken: refreshTokenValue, expiresAt } }
}

async function removeTrackFromPlaylistForUser (refreshTokenValue, playlistId, trackUri, tokenState = {}) {
  if (!refreshTokenValue) throw new Error('refreshToken is required')

  let token = String(tokenState.accessToken || '').trim()
  const expiresAt = Number(tokenState.expiresAt || 0)
  const isExpired = !token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()
  let refreshed = null

  if (isExpired) {
    refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshTokenValue)
    token = refreshed.accessToken
  }

  const doRemove = async (bearerToken) => {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${bearerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracks: [{ uri: trackUri }] })
    })
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`)
    const data = await res.json()
    return data.snapshot_id
  }

  let snapshotId
  try {
    snapshotId = await doRemove(token)
  } catch (err) {
    if (!/Status:\s*401\b/.test(String(err?.message || ''))) throw err
    refreshed = await refreshSpotifyAccessTokenWithRefreshToken(refreshTokenValue)
    snapshotId = await doRemove(refreshed.accessToken)
  }

  return { snapshotId, auth: refreshed || { accessToken: token, refreshToken: refreshTokenValue, expiresAt } }
}

export {
  addTracksToPlaylist,
  removeTrackFromPlaylist,
  createSpotifyPlaylist,
  createSpotifyPlaylistForRefreshToken,
  refreshSpotifyAccessTokenWithRefreshToken,
  saveToSpotifyLikedSongs,
  addTrackToPlaylistForUser,
  removeTrackFromPlaylistForUser
}
