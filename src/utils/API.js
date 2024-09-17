import fetch from 'node-fetch'

const config = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  defaultPlaylistId: process.env.DEFAULT_PLAYLIST_ID,
  redirectUri: process.env.REDIRECT_URI
}

let accessToken = null

async function getAccessToken (clientId, clientSecret) {
  const encodedAuthString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const authorizationHeader = `Basic ${encodedAuthString}`
  const scope = 'playlist-modify-public' // Specify the required scope

  const authOptions = {
    method: 'POST',
    headers: {
      Authorization: authorizationHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', authOptions)

    if (!response.ok) {
      throw new Error(`Failed to retrieve access token: ${response.statusText}`)
    }

    const data = await response.json()
    return data.access_token
  } catch (error) {
    console.error('Error getting access token:', error)
    throw error
  }
}
export async function updateRoomInfo(payload) {
  const token = process.env.TTL_USER_TOKEN;

  try {
    const response = await fetch('https://gateway.prod.tt.fm/api/room-service/rooms/just-jams', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Failed to update room info: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`Error updating room info: ${error.message}`);
  }
}


async function fetchSpotifyPlaylistTracks () {
  const playlistId = process.env.DEFAULT_PLAYLIST_ID
  const tracks = []
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`

  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
    }

    while (url) {
      const options = {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      }

      const response = await fetch(url, options)
      const playlist = await response.json()

      if (!response.ok) {
        console.error('Error fetching playlist tracks:', playlist)
        return []
      }

      if (playlist.items?.length) {
        tracks.push(...playlist.items)
      }
      url = playlist.next
    }
  } catch (error) {
    console.error('Error fetching playlist tracks:', error)
    return []
  }

  return tracks
}
async function spotifyTrackInfo (trackId) {
  const url = `https://api.spotify.com/v1/tracks/${trackId}`
  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
    }
    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    }
    const response = await fetch(url, options)
    const trackInfo = await response.json()
    if (!response.ok) {
      console.error('Error fetching track info:', trackInfo)
      return null
    }
    const spotifyTrackDetails = {
      spotifyTrackName: trackInfo.name || 'Unknown',
      spotifyArtistName: trackInfo.artists.map(artist => artist.name).join(', ') || 'Unknown',
      spotifyAlbumName: trackInfo.album.name || 'Unknown',
      spotifyReleaseDate: trackInfo.album.release_date || 'Unknown',
      spotifyAlbumType: trackInfo.album.album_type || 'Unknown', // Added album type
      spotifyTrackNumber: trackInfo.track_number || 'Unknown', // Added track number
      spotifyTotalTracks: trackInfo.album.total_tracks || 'Unknown', // Added total tracks
      spotifyDuration: trackInfo.duration_ms
        ? `${Math.floor(trackInfo.duration_ms / 60000)}:${((trackInfo.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`
        : 'Unknown',
      spotifyAlbumArt: trackInfo.album.images?.[0]?.url || '',
      spotifyPopularity: trackInfo.popularity || 0,
      spotifyPreviewUrl: trackInfo.preview_url || '',
      spotifySpotifyUrl: trackInfo.external_urls.spotify || '',
      spotifyIsrc: trackInfo.external_ids.isrc || 'Unknown'
    }
    return spotifyTrackDetails
  } catch (error) {
    console.error('Error fetching track info:', error)
    return null
  }
}
async function fetchTrackDetails (trackUri) {
  const trackId = trackUri.split(':').pop()
  const accessToken = await getAccessToken(config.clientId, config.clientSecret)

  try {
    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch track details: ${response.statusText}`)
    }

    const trackData = await response.json()
    return {
      title: trackData.name,
      artist: trackData.artists.map(artist => artist.name).join(', ')
    }
  } catch (error) {
    console.error('Error fetching track details:', error)
    return null
  }
}
async function fetchAudioFeatures (trackId) {
  const url = `https://api.spotify.com/v1/audio-features/${trackId}`

  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
    }

    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    }

    const response = await fetch(url, options)
    const audioFeatures = await response.json()

    if (!response.ok) {
      console.error('Error fetching audio features:', audioFeatures)
      throw new Error('Failed to fetch audio features')
    }

    return audioFeatures
  } catch (error) {
    console.error('Error fetching audio features:', error)
    throw error // Optionally rethrow the error to be handled upstream
  }
}

async function fetchSpotifyRecommendations (seedArtists = [], seedGenres = [], seedTracks = [], limit = 5) {
  const recommendationsUrl = 'https://api.spotify.com/v1/recommendations'

  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
    }

    // Construct the query parameters
    const params = new URLSearchParams({
      seed_artists: seedArtists.join(','),
      seed_genres: seedGenres.join(','),
      seed_tracks: seedTracks.join(','),
      limit: 5
    })

    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    }

    const response = await fetch(`${recommendationsUrl}?${params}`, options)

    if (!response.ok) {
      const errorResponse = await response.json()
      console.error('Error fetching recommendations:', errorResponse)
      throw new Error(`Failed to fetch recommendations: ${errorResponse.error.message}`)
    }

    const recommendations = await response.json()
    return recommendations.tracks // Return only the tracks array
  } catch (error) {
    console.error('Error fetching Spotify recommendations:', error)
    return [] // Return an empty array in case of error
  }
}

/// //////////// TURNTABLE API /////////////////////////////

async function fetchCurrentlyPlayingSong () {
  const token = process.env.TTL_USER_TOKEN
  const roomUUID = process.env.ROOM_UUID // Replace with your room UUID

  try {
    const response = await fetch(`https://gateway.prod.tt.fm/api/room-service/rooms/uuid/${roomUUID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch current song: ${response.statusText}`)
    }

    const data = await response.json()
    const song = data.song

    if (song && song.musicProviders && song.musicProviders.spotify) {
      const spotifyTrackId = song.musicProviders.spotify.split(':').pop() // Extract only the track ID part
      return spotifyTrackId // Return only the track ID, not the full URI
    } else {
      throw new Error('Spotify track info not found in the current song')
    }
  } catch (error) {
    throw new Error(`Error fetching current song: ${error.message}`)
  }
}

async function fetchRecentSongs () {
  const token = process.env.TTL_USER_TOKEN

  try {
    const response = await fetch('https://gateway.prod.tt.fm/api/playlist-service/rooms/just-jams/recent-songs', {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch recent songs: ${response.statusText}`)
    }

    const data = await response.json()
    return data.songPlays
  } catch (error) {
    throw new Error(`Error fetching recent songs: ${error.message}`)
  }
}

async function fetchSongData (spotifyUrl) {
  const token = process.env.TTL_USER_TOKEN

  const encodedUrl = encodeURIComponent(spotifyUrl)

  try {
    const response = await fetch(`https://gateway.prod.tt.fm/api/playlist-service/song-data/${encodedUrl}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch song data: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    throw new Error(`Error fetching song data: ${error.message}`)
  }
}

async function fetchCurrentUsers () {
  const token = process.env.TTL_USER_TOKEN

  try {
    const response = await fetch('https://gateway.prod.tt.fm/api/room-service/rooms/just-jams', {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch current users: ${response.statusText}`)
    }

    const data = await response.json()
    if (!data || !data.usersInRoomUuids) {
      throw new Error('Failed to fetch current users: Invalid response format')
    }

    return data.usersInRoomUuids
  } catch (error) {
    throw new Error(`Error fetching current users: ${error.message}`)
  }
}

async function fetchUserData (userUUIDs) {
  const token = process.env.TTL_USER_TOKEN
  if (!userUUIDs || userUUIDs.length === 0) {
    console.error('No user UUIDs provided')
    throw new Error('No user UUIDs provided')
  }

  const endpoint = `https://gateway.prod.tt.fm/api/user-service/users/profiles?users=${userUUIDs.join(',')}`

  if (!token) {
    console.error('TTL_USER_TOKEN is not set')
    throw new Error('TTL_USER_TOKEN is not set')
  }

  const maxRetries = 3
  const retryDelay = 2000 // 2 seconds delay between retries

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          accept: 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text() // Get the error response text
        throw new Error(`Failed to fetch user data: ${response.statusText} - ${errorText}`)
      }

      const userData = await response.json()

      // Extract nicknames from user profiles
      const nicknames = userData.map(user => user.userProfile.nickname)

      return nicknames
    } catch (error) {
      console.error(`Attempt ${attempt} failed: ${error.message}`)
      if (attempt < maxRetries) {
        console.log(`Retrying in ${retryDelay / 1000} seconds...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      } else {
        throw new Error(`Error fetching user data after ${maxRetries} attempts: ${error.message}`)
      }
    }
  }
}

const USER_ROLES_URL = 'https://gateway.prod.tt.fm/api/room-service/roomUserRoles/just-jams' // Adjusted URL with room slug

async function fetchUserRoles (userUuid, token) {
  try {
    const response = await fetch(`${USER_ROLES_URL}/${userUuid}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch user roles: ${response.statusText}`)
    }

    const userRoles = await response.json()
    return userRoles
  } catch (error) {
    throw new Error(`Error fetching user roles: ${error.message}`)
  }
}

async function isUserAuthorized (userUuid, token) {
  try {
    const userRoles = await fetchUserRoles(userUuid, token)
    console.log('User Roles:', userRoles) // Log user roles fetched from the endpoint
    const userRole = userRoles.length > 0 ? userRoles[0].role : null
    return userRole === 'moderator' || userRole === 'owner' || userRole === 'coOwner'
  } catch (error) {
    console.error('Error checking user authorization:', error)
    return false
  }
}

async function currentsongduration () {
  const token = process.env.TTL_USER_TOKEN
  const roomUUID = process.env.ROOM_UUID

  try {
    console.log('Fetching currently playing song duration...')
    const response = await fetch(`https://gateway.prod.tt.fm/api/room-service/rooms/uuid/${roomUUID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch current song: ${response.statusText}`)
    }

    const data = await response.json()
    const song = data.song

    if (!song || !song.duration) {
      throw new Error('Song duration not found in the current song')
    }

    const songDuration = song.duration // Duration of the currently playing song in seconds

    console.log(`Currently playing song duration: ${songDuration} seconds`)
    return songDuration
  } catch (error) {
    throw new Error(`Error fetching current song: ${error.message}`)
  }
}

export { getAccessToken, currentsongduration, fetchSpotifyRecommendations, fetchAudioFeatures, spotifyTrackInfo, fetchTrackDetails, isUserAuthorized, fetchUserRoles, fetchUserData, fetchRecentSongs, fetchCurrentUsers, fetchSpotifyPlaylistTracks, fetchCurrentlyPlayingSong, fetchSongData }
