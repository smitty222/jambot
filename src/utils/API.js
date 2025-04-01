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
export async function updateRoomInfo (payload) {
  const token = process.env.TTL_USER_TOKEN

  try {
    const response = await fetch('https://gateway.prod.tt.fm/api/room-service/rooms/just-jams', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Failed to update room info: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    throw new Error(`Error updating room info: ${error.message}`)
  }
}

async function fetchSpotifyPlaylistTracks (playlistId) {
  if (!playlistId) {
    console.error('No playlist ID provided')
    return []
  }

  console.log('Fetching tracks for playlist ID:', playlistId) // Log playlist ID

  const tracks = []
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`

  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
      console.log('Access token:', accessToken) // Log access token
    }

    while (url) {
      const options = {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` }
      }

      const response = await fetch(url, options)
      const playlist = await response.json()

      console.log('Full playlist response:', playlist) // Log the full response

      if (!response.ok) {
        console.error('Error fetching playlist tracks:', playlist)
        return []
      }

      if (playlist.items?.length) {
        console.log(`Fetched ${playlist.items.length} tracks.`)
        tracks.push(...playlist.items)
      } else {
        console.log('No tracks found in the playlist or empty response.')
      }

      url = playlist.next // Get the next page of tracks
    }
  } catch (error) {
    console.error('Error fetching playlist tracks:', error)
    return []
  }

  return tracks
}

async function spotifyTrackInfo (trackId) {
  const url = `https://api.spotify.com/v1/tracks/${trackId}`

  // Function to make the API request
  async function makeSpotifyRequest () {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
    }

    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    }

    const response = await fetch(url, options)
    const trackInfo = await response.json()

    // If the token expired, try refreshing it and retry the request
    if (response.status === 401) {
      console.log('Access token expired. Refreshing token...')
      accessToken = await getAccessToken(config.clientId, config.clientSecret)

      // Retry the request with the new token
      options.headers.Authorization = `Bearer ${accessToken}`
      const retryResponse = await fetch(url, options)
      return await retryResponse.json()
    }

    if (!response.ok) {
      console.error('Error fetching track info:', trackInfo)
      return null
    }

    return trackInfo
  }

  try {
    const trackInfo = await makeSpotifyRequest()
    if (!trackInfo) return null

    const spotifyTrackDetails = {
      spotifyTrackName: trackInfo.name || 'Unknown',
      spotifyArtistName: trackInfo.artists.map(artist => artist.name).join(', ') || 'Unknown',
      spotifyAlbumName: trackInfo.album.name || 'Unknown',
      spotifyReleaseDate: trackInfo.album.release_date || 'Unknown',
      spotifyAlbumType: trackInfo.album.album_type || 'Unknown',
      spotifyTrackNumber: trackInfo.track_number || 'Unknown',
      spotifyTotalTracks: trackInfo.album.total_tracks || 'Unknown',
      spotifyDuration: trackInfo.duration_ms
        ? `${Math.floor(trackInfo.duration_ms / 60000)}:${((trackInfo.duration_ms % 60000) / 1000).toFixed(0).padStart(2, '0')}`
        : 'Unknown',
      spotifyAlbumArt: trackInfo.album.images?.[0]?.url || '',
      spotifyPopularity: trackInfo.popularity || 0,
      spotifyPreviewUrl: trackInfo.preview_url || '',
      spotifySpotifyUrl: trackInfo.external_urls.spotify || '',
      spotifyIsrc: trackInfo.external_ids.isrc || 'Unknown',
      spotifyTrackUri: trackInfo.uri || 'Unknown'
    }

    return spotifyTrackDetails
  } catch (error) {
    console.error('Error fetching track info:', error)
    return null
  }
}
async function fetchTrackDetails (trackUri) {
  try {
    const trackId = extractTrackId(trackUri) // Extract track ID
    const accessToken = await getAccessToken(config.clientId, config.clientSecret) // Refresh token if needed

    const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
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
// Deprecated SPOTIFY ENDPOINT
/* async function fetchAudioFeatures(trackId, retries = 3) {
  const url = `https://api.spotify.com/v1/audio-features/${trackId}`;

  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret);
    }

    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      // Add a timeout using AbortController
      timeout: 5000 // Timeout after 5 seconds
    };

    const response = await fetch(url, options);
    const audioFeatures = await response.json();

    if (!response.ok) {
      console.error('Error fetching audio features:', audioFeatures);
      throw new Error(`Failed to fetch audio features: ${response.statusText}`);
    }

    return audioFeatures;

  } catch (error) {
    // Retry if the error is recoverable
    if (retries > 0 && error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
      console.warn(`Retrying fetchAudioFeatures for track ${trackId}. Retries left: ${retries}`);
      return fetchAudioFeatures(trackId, retries - 1);
    } else {
      // Handle token expiration or other errors
      if (error.message.includes('401')) {
        console.error('Access token expired, fetching a new token');
        accessToken = await getAccessToken(config.clientId, config.clientSecret);
        return fetchAudioFeatures(trackId, retries); // Retry with a new token
      }

      console.error('Error fetching audio features:', error);
      throw error; // Re-throw the error to handle it upstream if necessary
    }
  }
} */
export async function fetchRecentArtists (limit = 5) {
  const recentArtistsUrl = 'https://api.spotify.com/v1/me/top/artists'

  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
    }

    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    }

    const response = await fetch(`${recentArtistsUrl}?limit=${limit}`, options)

    if (!response.ok) {
      console.error('Error fetching recent artists:', await response.json())
      throw new Error('Failed to fetch recent artists')
    }

    const data = await response.json()
    return data.items.map(artist => ({
      id: artist.id,
      name: artist.name,
      popularity: artist.popularity,
      genres: artist.genres,
      followers: artist.followers.total,
      spotifyUrl: artist.external_urls.spotify,
      images: artist.images
    }))
  } catch (error) {
    console.error('Error fetching recent artists:', error)
    throw error
  }
}
// Deprecated SPOTIFY ENDPOINT
/* async function fetchSpotifyRecommendations(seedArtists = [], seedGenres = [], seedTracks = [], limit = 5) {
  const recommendationsUrl = 'https://api.spotify.com/v1/recommendations';

  try {
    // Ensure access token is available
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret);
    }

    // Construct the query parameters
    const params = new URLSearchParams({
      seed_artists: seedArtists.join(','),
      seed_genres: seedGenres.join(','),
      seed_tracks: seedTracks.join(','),
      limit: limit.toString(),
    });

    let response = await makeSpotifyRequest(recommendationsUrl, params);

    // If unauthorized (token expired), get a new token and retry
    if (response.status === 401) {
      console.log('Access token expired. Refreshing token...');
      accessToken = await getAccessToken(config.clientId, config.clientSecret);
      response = await makeSpotifyRequest(recommendationsUrl, params); // Retry the request with new token
    }

    // Parse the response
    const recommendations = await response.json();

    if (!response.ok) {
      console.error('Error fetching recommendations:', recommendations);
      throw new Error(`Failed to fetch recommendations: ${recommendations.error.message}`);
    }

    return recommendations.tracks; // Return only the tracks array
  } catch (error) {
    console.error('Error fetching Spotify recommendations:', error);
    return []; // Return an empty array in case of error
  }
} */

// Helper function to extract track ID from Spotify URL/URI
export async function extractTrackId (input) {
  // Spotify track URL pattern
  const trackUrlPattern = /https?:\/\/(open\.)?spotify\.com\/track\/([a-zA-Z0-9]+)(\?.*)?/
  const match = input.match(trackUrlPattern)

  if (match && match[2]) {
    // Extract the track ID from the URL
    return match[2]
  }

  // If the input is a URI or direct track ID, return the last segment
  if (input.includes(':')) {
    return input.split(':').pop()
  }

  // If it's already a valid track ID (base62 format), return it
  if (/^[a-zA-Z0-9]+$/.test(input)) {
    return input
  }

  throw new Error('Invalid track ID or URL')
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
      const spotifyTrackId = song.musicProviders.spotify // This contains the Spotify track ID
      const songId = song.id // Assuming song.id exists in the response

      return { spotifyTrackId, songId } // Return both spotifyTrackId and songId
    } else {
      throw new Error('Spotify track info not found in the current song')
    }
  } catch (error) {
    throw new Error(`Error fetching current song: ${error.message}`)
  }
}

async function fetchAllUserQueueSongIDsWithUUID (userToken) {
  if (!userToken) {
    throw new Error('User token is required for fetching queue songs.')
  }

  let allSongs = []
  let offset = 0
  const defaultLimit = 100 // Maximum limit per request (adjust if necessary)

  try {
    while (true) {
      const response = await fetch(`https://gateway.prod.tt.fm/api/playlist-service/crate/special/queue/songs?limit=${defaultLimit}&offset=${offset}`, {
        headers: {
          Authorization: `Bearer ${userToken}`, // Use the user-specific token
          accept: 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch queue songs: ${response.statusText}`)
      }

      const data = await response.json()
      const songs = data.songs // Assuming `data.songs` contains the list of songs

      if (songs.length === 0) {
        break // Exit if no more songs are returned
      }

      // Extract both the songID and crateSongUUID for each song
      const songDetails = songs.map(song => ({
        songID: song.songId, // Assuming each song has a `songID` field
        crateSongUUID: song.crateSongUUID // Assuming each song has a `crateSongUUID` field
      }))

      allSongs = allSongs.concat(songDetails) // Append to the list of all songs
      offset += songs.length // Update the offset for pagination
    }

    return allSongs // Return an array of objects containing `songID` and `crateSongUUID`
  } catch (error) {
    console.error('Error fetching user queue song details:', error.message)
    throw error
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

async function fetchSongData (spotifyTrackId) {
  const token = process.env.TTL_USER_TOKEN

  try {
    const response = await fetch(`https://gateway.prod.tt.fm/api/playlist-service/song-data/${spotifyTrackId}/spotify`, {
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

export async function fetchUserData (userUUIDs) {
  const token = process.env.TTL_USER_TOKEN
  if (!userUUIDs || userUUIDs.length === 0) {
    console.error('No user UUIDs provided')
    throw new Error('No user UUIDs provided')
  }

  const queryString = userUUIDs.map(uuid => `users=${uuid}`).join('&') // Correct query format
  const endpoint = `https://gateway.prod.tt.fm/api/user-service/users/profiles?${queryString}`

  if (!token) {
    console.error('TTL_USER_TOKEN is not set')
    throw new Error('TTL_USER_TOKEN is not set')
  }

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: 'application/json'
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to fetch user data: ${response.statusText} - ${errorText}`)
  }

  const userData = await response.json()
  return userData // Return the array of user profiles
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
export async function isUserOwner (userUuid, token) {
  try {
    const userRoles = await fetchUserRoles(userUuid, token)
    console.log('User Roles:', userRoles) // Log user roles fetched from the endpoint
    const userRole = userRoles.length > 0 ? userRoles[0].role : null
    return userRole === 'owner'
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
async function DeleteQueueSong (crateSongUuid, userToken) {
  if (!crateSongUuid) {
    throw new Error('crateSongUuid must be provided')
  }

  if (!userToken) {
    throw new Error('User token must be provided')
  }

  try {
    const response = await fetch(`https://gateway.prod.tt.fm/api/playlist-service/crate/special/queue/songs/${crateSongUuid}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${userToken}`,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to delete song from queue: ${response.statusText}`)
    }

    const data = await response.json()
    return data // Return the response data from the API
  } catch (error) {
    throw new Error(`Error deleting song from queue: ${error.message}`)
  }
}

async function searchSpotify (artistName, trackName) {
  const searchUrl = `https://api.spotify.com/v1/search?q=artist:${encodeURIComponent(artistName)}%20track:${encodeURIComponent(trackName)}&type=track&limit=1`

  try {
    // Ensure access token is available
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
    }

    // Fetch track data from Spotify
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    // Check if the response was successful
    if (!response.ok) {
      throw new Error(`Failed to search for track: ${response.statusText} for artist: ${artistName} and track: ${trackName}`)
    }

    // Parse the response data
    const data = await response.json()

    // Check if tracks were found
    if (data.tracks.items.length === 0) {
      console.error(`Track not found: ${trackName} by ${artistName}`)
      return null // Return null if track not found
    }

    // Get the first track result
    const track = data.tracks.items[0]

    // Validate track data
    if (!track || !track.id || !track.album || !track.album.name || !track.album.images[0]?.url) {
      console.error('Invalid track data received:', track)
      return null // Return null if track data is incomplete
    }

    // Return track details
    return {
      spotifyTrackID: track.id, // Track ID
      spotifyTrackName: track.name, // Track name
      spotifyArtistName: track.artists.map(artist => artist.name).join(', '), // Artist names
      spotifyUrl: track.external_urls.spotify, // Spotify URL
      spotifyAlbumName: track.album.name, // Album name
      spotifyAlbumArt: track.album.images[0]?.url || '', // Album art
      spotifyReleaseDate: track.album.release_date, // Release date
      spotifyTrackNumber: track.track_number, // Track number in the album
      popularity: track.popularity // Popularity score
    }
  } catch (error) {
    console.error('Error searching for track:', error)
    return null // Return null in case of an error
  }
}

export { getAccessToken, currentsongduration, spotifyTrackInfo, fetchTrackDetails, isUserAuthorized, fetchUserRoles, fetchRecentSongs, fetchCurrentUsers, fetchSpotifyPlaylistTracks, fetchCurrentlyPlayingSong, fetchSongData, DeleteQueueSong, fetchAllUserQueueSongIDsWithUUID, searchSpotify }
