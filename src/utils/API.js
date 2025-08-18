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
      spotifyTrackUri: trackInfo.uri || 'Unknown',
      spotifyAlbumID: trackInfo.album.id || 'Unknown'
    }

    return spotifyTrackDetails
  } catch (error) {
    console.error('Error fetching track info:', error)
    return null
  }
}
export async function spotifyArtistGenres(artistId) {
  const url = `https://api.spotify.com/v1/artists/${artistId}`

  // Ensure token is valid (reuse logic from your existing spotifyTrackInfo)
  if (!accessToken) {
    accessToken = await getAccessToken(config.clientId, config.clientSecret)
  }

  const options = {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` }
  }

  let response = await fetch(url, options)
  let artistInfo = await response.json()

  // Handle expired token
  if (response.status === 401) {
    console.log('🎟️ Token expired. Refreshing...')
    accessToken = await getAccessToken(config.clientId, config.clientSecret)
    options.headers.Authorization = `Bearer ${accessToken}`
    response = await fetch(url, options)
    artistInfo = await response.json()
  }

  if (!response.ok) {
    console.error('❌ Error fetching artist info:', artistInfo)
    return []
  }

  return artistInfo.genres || []
}

export async function getAlbumTracks(albumId) {
  const url = `https://api.spotify.com/v1/albums/${albumId}/tracks`

  async function makeSpotifyAlbumRequest () {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret)
    }

    const options = {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    }

    const response = await fetch(url, options)
    const albumData = await response.json()

    if (response.status === 401) {
      console.log('Access token expired. Refreshing token...')
      accessToken = await getAccessToken(config.clientId, config.clientSecret)

      // Retry the request with the new token
      options.headers.Authorization = `Bearer ${accessToken}`
      const retryResponse = await fetch(url, options)
      return await retryResponse.json()
    }

    if (!response.ok) {
      console.error('Error fetching album tracks:', albumData)
      return []
    }

    return albumData.items || []
  }

  try {
    return await makeSpotifyAlbumRequest()
  } catch (error) {
    console.error('Error getting album tracks:', error)
    return []
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

async function fetchCurrentlyPlayingSong() {
  const token = process.env.TTL_USER_TOKEN;
  const roomUUID = process.env.ROOM_UUID;

  try {
    const response = await fetch(`https://gateway.prod.tt.fm/api/room-service/rooms/uuid/${roomUUID}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch current song: ${response.statusText}`);
    }

    const data = await response.json();
    const song = data.song;

    if (!song) {
      throw new Error('No song data found in response');
    }

    // Always return core info
    const basicSongInfo = {
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
      releaseDate: song.releaseDate || null,
      // Add any other fields you want here
    };

    return basicSongInfo;
  } catch (error) {
    throw new Error(`Error fetching current song: ${error.message}`);
  }
}


export async function updateUserAvatar(userToken, avatarId, color) {
  const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`
    },
    body: JSON.stringify({ avatarId, color })
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || 'Unknown error')
  }

  return response.json()
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

export async function updateRoomPosterFile(slug, posterFileUrl) {
  const token = process.env.TTL_USER_TOKEN

  try {
    const response = await fetch(`https://gateway.prod.tt.fm/api/room-service/rooms/${slug}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        posterFile: posterFileUrl
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to update posterFile: ${response.statusText}`)
    }

    const data = await response.json()
    return data
  } catch (error) {
    throw new Error(`Error updating room posterFile: ${error.message}`)
  }
}


export async function fetchUserData(userUUIDs) {
  const token = process.env.TTL_USER_TOKEN;

  // Accept both single UUID and array of UUIDs
  const uuids = Array.isArray(userUUIDs) ? userUUIDs : [userUUIDs];

  if (!uuids.length) {
    throw new Error('No user UUIDs provided');
  }

  const queryString = uuids.map(uuid => `users=${uuid}`).join('&');
  const endpoint = `https://gateway.prod.tt.fm/api/user-service/users/profiles?${queryString}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch user data: ${response.statusText} - ${errorText}`);
  }

  const raw = await response.json();

  // Transform into flat user profiles
  const parsed = raw
    .map(entry => entry.userProfile)
    .filter(profile => profile && profile.uuid); // Sanity check

  return parsed; // Returns array of { uuid, nickname, ... }
}




async function getSenderNickname(senderUuid) {
  try {
    const senderData = await fetchUserData([senderUuid]);

    if (!senderData.length) return 'Unknown User';

    const profile = senderData[0];
    const nickname = profile.nickname || 'Unknown User';

    return nickname;
  } catch (error) {
    console.error('Error fetching sender nickname:', error);
    return 'Unknown User';
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
export async function getAlbumsByArtist(artistName) {
  try {
    if (!accessToken) {
      accessToken = await getAccessToken(process.env.SPOTIFY_CLIENT_ID, process.env.SPOTIFY_CLIENT_SECRET)
    }

    // Step 1: Get the artist ID from their name
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!searchRes.ok) {
      throw new Error(`Spotify artist search failed: ${searchRes.statusText}`)
    }

    const artistData = await searchRes.json()
    const artist = artistData.artists.items[0]

    if (!artist || !artist.id) {
      console.warn(`No artist found for "${artistName}"`)
      return []
    }

    const artistId = artist.id

    // Step 2: Get their albums
    const albumsUrl = `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&limit=20`
    const albumsRes = await fetch(albumsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!albumsRes.ok) {
      throw new Error(`Spotify album fetch failed: ${albumsRes.statusText}`)
    }

    const albumsData = await albumsRes.json()

    // Step 3: Filter duplicates by album name
    const seen = new Set()
    const uniqueAlbums = albumsData.items.filter(album => {
      if (seen.has(album.name)) return false
      seen.add(album.name)
      return true
    })

    return uniqueAlbums.map(album => ({
      name: album.name,
      id: album.id,
      releaseDate: album.release_date,
      totalTracks: album.total_tracks,
      image: album.images?.[0]?.url || ''
    }))
  } catch (err) {
    console.error('Error getting top albums:', err)
    return []
  }
}

///////////////////////  QUEUE  /////////////////////////////////////////////
export async function addSongsToCrate(crateId, songs, append = true, token) {
  try {
    const response = await fetch(`https://gateway.prod.tt.fm/api/playlist-service/crate/${crateId}/songs`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ songs, append }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to add songs to crate: ${response.status} ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`Error adding songs to crate: ${error.message}`);
  }
}

export async function getUserQueueCrateId(userId) {
  const token = getUserToken(userId);
  if (!token) {
    console.warn(`[getUserQueueCrateId] No token found for user: ${userId}`);
    return null;
  }

  try {
    const response = await fetch('https://gateway.prod.tt.fm/api/playlist-service/crate/special/queue', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[getUserQueueCrateId] Failed response: ${response.status} ${response.statusText} - ${text}`);
      return null;
    }

    const data = await response.json();
    return data; // data.crateUuid should exist here
  } catch (error) {
    console.error(`[getUserQueueCrateId] Fetch error: ${error.message}`);
    return null;
  }
}


export async function clearUserQueueCrate(userId) {
  const token = getUserToken(userId);
  if (!token) throw new Error('No token found for user');

  try {
    const response = await fetch('https://gateway.prod.tt.fm/api/playlist-service/crate/special/queue/songs/clear', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: '' // no body needed
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to clear user crate: ${response.status} ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    return data; // contains crate info after clear
  } catch (error) {
    throw new Error(`Error clearing user crate: ${error.message}`);
  }
}




//////////////////////   MLB   ////////////////////////////////////
export async function getMLBScores() {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard';
  const response = await fetch(url);
  const data = await response.json();

  const games = data.events;

  // Sort games based on the inning or the period (furthest along first)
  games.sort((a, b) => {
    const inningA = a.competitions[0].status.period || 0; // Use 0 if the game is not in progress
    const inningB = b.competitions[0].status.period || 0; // Use 0 if the game is not in progress
    return inningB - inningA; // Sort by highest inning first
  });

  let result = 'MLB Scores:\n'; // Start with a header

  games.forEach(game => {
    const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
    const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
    const status = game.status.type.description;

    // Extract the team names (just the last part of the name)
    const homeTeamName = home.team.displayName.split(' ').slice(-1).join(' '); // Take the last word (team name)
    const awayTeamName = away.team.displayName.split(' ').slice(-1).join(' '); // Take the last word (team name)

    let statusMessage = '';
    
    if (status === 'In Progress') {
      const inning = game.competitions[0].status.period;
      statusMessage = `Inning ${inning}`;
    } else if (status === 'Scheduled') {
      statusMessage = 'Scheduled';
    } else {
      statusMessage = status; // For completed games or others, keep the default status
    }

    result += `${awayTeamName} ${away.score} @ ${homeTeamName} ${home.score} (${statusMessage})\n`;
  });

  return result; // Return the formatted string
}

export async function getTopHomeRunLeaders() {
  const url = 'https://site.api.espn.com/apis/common/v3/sports/baseball/mlb/statistics/byathlete?category=batting&sort=batting.homeRuns&limit=50';
  const response = await fetch(url);
  const data = await response.json();

  const players = data.athletes;

  const leaderLines = players.map((player, i) => {
    const name = player.athlete.displayName ?? 'Unknown player';
    const team = player.athlete.teamShortName ?? (player.athlete.teams?.[0]?.abbreviation ?? 'unknown team');

    // Find the batting category and get HRs from index 7
    const batting = player.categories?.find(c => c.name === 'batting');
    const homeRuns = batting?.totals?.[7] ?? '?';

    return `${i + 1}. ${name} (${team}) - ${homeRuns} HR`;
  });

  return `Top 50 Home Run Leaders:\n\n${leaderLines.join('\n')}`;
}




//////////////////////   NHL   ////////////////////////////////////
export async function getNHLScores() {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard';
  const response = await fetch(url);
  const data = await response.json();

  const games = data.events;

  // Sort games based on the period or the game state (furthest along first)
  games.sort((a, b) => {
    const periodA = a.competitions[0].status.period || 0; // Use 0 if the game is not in progress
    const periodB = b.competitions[0].status.period || 0; // Use 0 if the game is not in progress
    return periodB - periodA; // Sort by the highest period (most advanced game) first
  });

  let result = 'NHL Scores:\n'; // Start with a header

  games.forEach(game => {
    const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
    const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
    const status = game.status.type.description;

    // Extract the team names (just the last part of the name)
    const homeTeamName = home.team.displayName.split(' ').slice(-1).join(' '); // Take the last word (team name)
    const awayTeamName = away.team.displayName.split(' ').slice(-1).join(' '); // Take the last word (team name)

    let statusMessage = '';
    
    if (status === 'In Progress') {
      const period = game.competitions[0].status.period;
      statusMessage = `Period ${period}`;
    } else if (status === 'Scheduled') {
      statusMessage = 'Scheduled';
    } else {
      statusMessage = status; // For completed games or others, keep the default status
    }

    result += `${awayTeamName} ${away.score} @ ${homeTeamName} ${home.score} (${statusMessage})\n`;
  });

  return result; // Return the formatted string
}
//////////////////////   NBA   ////////////////////////////////////
export async function getNBAScores() {
  const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
  const response = await fetch(url);
  const data = await response.json();

  const games = data.events;

  // Sort games based on the quarter or game state (furthest along first)
  games.sort((a, b) => {
    const quarterA = a.competitions[0].status.period || 0; // Use 0 if the game is not in progress
    const quarterB = b.competitions[0].status.period || 0; // Use 0 if the game is not in progress
    return quarterB - quarterA; // Sort by the highest period (most advanced game) first
  });

  let result = 'NBA Scores:\n'; // Start with a header

  games.forEach(game => {
    const home = game.competitions[0].competitors.find(c => c.homeAway === 'home');
    const away = game.competitions[0].competitors.find(c => c.homeAway === 'away');
    const status = game.status.type.description;

    // Extract the team names (just the last part of the name)
    const homeTeamName = home.team.displayName.split(' ').slice(-1).join(' '); // Take the last word (team name)
    const awayTeamName = away.team.displayName.split(' ').slice(-1).join(' '); // Take the last word (team name)

    let statusMessage = '';
    
    if (status === 'In Progress') {
      const quarter = game.competitions[0].status.period;
      statusMessage = `Quarter ${quarter}`;
    } else if (status === 'Scheduled') {
      // Check if a valid scheduled time is available
      const scheduledDate = game.status.startDate ? new Date(game.status.startDate) : null;
      if (scheduledDate && !isNaN(scheduledDate)) {
        // Format the scheduled time if it's a valid date
        const scheduledTime = scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        statusMessage = `Scheduled at ${scheduledTime}`;
      } else {
        statusMessage = 'Scheduled'; // No specific time available
      }
    } else {
      statusMessage = status; // For completed games or others, keep the default status
    }

    result += `${awayTeamName} ${away.score} @ ${homeTeamName} ${home.score} (${statusMessage})\n`;
  });

  return result; // Return the formatted string
}

////////////////////////// LAST FM ////////////////////////////////////

export function cleanArtistName(artist) {
  return artist
    .split(/feat\.|ft\./i)[0]
    .split(',')[0]
    .trim();
}

export function cleanTrackName(track) {
  return track.replace(/\(feat\..*?\)|\(ft\..*?\)/gi, '').trim();
}

async function getSimilarArtists(artistId) {
  const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/related-artists`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ Spotify API error ${response.status}:`, errorText)
    return [] // or null
  }

  try {
    const json = await response.json()
    return json.artists || []
  } catch (err) {
    console.error('❌ Failed to parse JSON from Spotify:', err.message)
    return []
  }
}


export async function getSimilarTracks(artist, track) {
  const cleanedArtistName = cleanArtistName(artist);
  const cleanedTrackName = cleanTrackName(track);
  const url = `https://ws.audioscrobbler.com/2.0/?method=track.getsimilar&artist=${encodeURIComponent(cleanedArtistName)}&track=${encodeURIComponent(cleanedTrackName)}&autocorrect=1&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=10`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.error) {
      return [];
    }

    let rawTracks = data.similartracks?.track;
    if (!rawTracks) return [];

    if (!Array.isArray(rawTracks)) {
      rawTracks = [rawTracks];
    }

    return rawTracks
      .filter(t => t?.name && t?.artist?.name)
      .map(t => ({
        trackName: t.name,
        artistName: t.artist.name
      }));

  } catch {
    return [];
  }
}

async function getTrackTags(artist, track) {
  const cleanedArtistName = cleanArtistName(artist);
  const cleanedTrackName = cleanTrackName(track);
  const url = `https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&artist=${encodeURIComponent(cleanedArtistName)}&track=${encodeURIComponent(cleanedTrackName)}&api_key=${process.env.LASTFM_API_KEY}&format=json`;

  const res = await fetch(url);
  const data = await res.json();
  return data.toptags?.tag?.map(t => t.name.toLowerCase()) || [];
}

export async function getArtistTags(artistName) {
  const cleanedArtistName = cleanArtistName(artistName);
  const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(cleanedArtistName)}&api_key=${process.env.LASTFM_API_KEY}&format=json`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data?.toptags?.tag?.length) {
      return data.toptags.tag
        .filter(tag => tag.name && !isNaN(parseInt(tag.count)))
        .sort((a, b) => parseInt(b.count) - parseInt(a.count))
        .map(tag => tag.name.toLowerCase());
    }

    return [];
  } catch {
    return [];
  }
}

export async function getTopChartTracks(limit = 50) {
  const url = `https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=${limit}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data?.tracks?.track?.length) {
      return data.tracks.track.map(track => ({
        trackName: track.name,
        artistName: track.artist.name,
        playcount: parseInt(track.playcount),
        listeners: parseInt(track.listeners),
      }));
    }

    return [];
  } catch {
    return [];
  }
}

export async function getTopArtistTracks(artist) {
  const cleanedArtistName = cleanArtistName(artist);
  const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist=${encodeURIComponent(cleanedArtistName)}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=10`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.toptracks && data.toptracks.track) {
      return data.toptracks.track.map(t => ({
        trackName: t.name,
        playcount: t.playcount ? parseInt(t.playcount, 10) : 0
      }));
    }

    return [];
  } catch {
    return [];
  }
}

export async function getTopTracksByTag(tag, limit = 10) {
  const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&api_key=${process.env.LASTFM_API_KEY}&format=json&limit=${limit}`

  try {
    const res = await fetch(url)
    const data = await res.json()

    if (data?.tracks?.track?.length) {
      return data.tracks.track.map(track => ({
        trackName: track.name,
        artistName: track.artist.name
      }))
    }

    return []
  } catch (error) {
    console.error(`❌ Error fetching top tracks by tag "${tag}":`, error)
    return []
  }
}


///////////////////////////// TRIVIA /////////////////////////////////
export async function getTriviaQuestions(categoryId, amount = 5) {
  try {
    const url = `https://opentdb.com/api.php?amount=${amount}&type=multiple${categoryId ? `&category=${categoryId}` : ''}`
    const res = await fetch(url)
    const data = await res.json()

    if (!data.results || data.results.length === 0) {
      console.warn('No trivia questions found for category:', categoryId)
      return []
    }

    return data.results.map(q => {
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
  } catch (err) {
    console.error('Failed to fetch trivia questions:', err)
    return []
  }
}


export function decodeHtml(html) {
  if (typeof html !== 'string') {
    html = ''  // fallback to empty string if not a string
  }
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


function mapCorrectLetter(correctAnswer, answers) {
  const index = answers.indexOf(correctAnswer)
  return index >= 0 ? 'ABCD'[index] : 'A' // default to 'A' or handle error
}

export function getUserToken(userId) {
  const userTokenMap = {
    '210141ad-6b01-4665-84dc-e47ea7c27dcb': 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MzMxLCJzdWIiOiIyMTAxNDFhZC02YjAxLTQ2NjUtODRkYy1lNDdlYTdjMjdkY2IiLCJyb2xlIjoidXNlciIsInN1YnNjcmlwdGlvbklkIjoicHJpY2VfMUlXTHR2R3FBTzhXejM4U05EVzFWY2RHIiwiY2FwYWJpbGl0aWVzIjpbInVwbG9hZE11c2ljIl0sInR5cGUiOiJ1c2VyIiwiaWF0IjoxNjk5ODE2ODY3LCJleHAiOjIwMTUxNzY4NjcsImlzcyI6InR1cm50YWJsZS11c2VyLXNlcnZpY2UifQ.TBI9bWe0JwIqGOvtjVNd9kiBpdgSth9v_fv5sGxSn2M4rR6e4WWNqMlC_L6iXoBL7QIpFQfHh41UVyYfBQrMmWyS4nWAYLx2CRLCVd2Ku5ybAcczJ59I_cL9JzwhYHXw89jURqCmr0WAcJ1RJnz_cQ1YksbxI-wROzRa_NWu9Ve7kDpECsMZmmWOh0JHJKyG-7oV57XHTD3OuaNmfoEmqqOuKV0liVlZ7zSNH7yno5ACeOuHW19BUVFtQLOVhwQe29KPzdxfyceTPs5gQGyU1hWZ1v6FvlO5lnuayMXMd8Y8vTVrikx4YbJySijM6FodXyYcU_IY_H3T13TDN7gtm3wW3fu0RNdo7CIAY72ltvXYgcdHgQV8ZWc1XaO92SNxLETrSfM5FFD0hhH6nwPR1rQp4Spjf-P1EmVnwKORjkc8QN1Kg812AheEAn-tqMR0DTn5txqZz25lv91NBQeb9HlbvcFvdUF9bS6Q-sKGVB8lYsGSoYq6bQtpf-iDN3oitA3eDCaL5hL0mz0AeGsEblHMTjdubIwy38Cxt1YrTVApiyWIOo8GgfP7TD3bRAJpZr9KE9opI1iu3SPy3Lkrvconizwt_nSekCTxZhSMaouNz-vdgaxp4sNhR-pS80YujqXU0zlD76WuGlFCVgI7ODqIcPQrWarroL8Hz4ldxcc',
    '92302b7d-ae5e-466f-975b-d3fee461f13f': 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTAyMiwic3ViIjoiOTIzMDJiN2QtYWU1ZS00NjZmLTk3NWItZDNmZWU0NjFmMTNmIiwicm9sZSI6InVzZXIiLCJjYXBhYmlsaXRpZXMiOlsidXBsb2FkTXVzaWMiXSwidHlwZSI6InVzZXIiLCJpYXQiOjE3Mjc0NjIzNzYsImV4cCI6MjA0MjgyMjM3NiwiaXNzIjoidHVybnRhYmxlLXVzZXItc2VydmljZSJ9.ZXLb2C9QARUVXU1dZ713LiaeVytQsCdLdd8BvfIXxDRXlQAPGQOnIVbG3FFimvRRbsZJ8NVh5LK9GxNz430arLeA0stt8B7O4LAR5J2yYCA_Z2R1sNAGSm6hhrYAW6nOhBPSH_xwt0c8OwAX9GelEXOsR7TKJTXgdQlCtQLt7NiuTEshG0BMfRSWPW7HMTytIsTwBV_53xGKbbtKRDRcShwdjy-iE9jruWy-RjQlUJ-M7fIJROQ1kxU27lAMhtWQ-wKTBWFf1YsiP9x_ZzkvkM1QMwLeIFkxQaaIHi8E7FWFeVzQT7o8E884BxKtrmSw5xLZ4WMFLNG9Gj1bvsAbrTRavi1mIaimhtwpCNEPZA0itdJGeaACZof04smnPzgBVCQMOcPj0lwciCdF36d3rJZeeC_7I2diHToa0ohH2MU_UPGb_Wc1MlF67bn-jjHpUBTTsyOoA1OzsyPfD76TVoCEfLIcCcCaBa8hhobfvky7w-y-mziGFa38cCh9dyIjofpmzUxaAxEAm_ZzeO2gfdeb9PLswKgswS9oVLGCLRiLiSSJ6l0oPxVVw0QegnM7ZrQpXmET75SBKoYVXMEw4fvJm7pQlsCpgXwsiXGVfMI-rHBimBaFmLNlY99N6vZnX6BzhE4x_UM-m3zpqm7PstVPTLi4_gHphaYh6oqt7fE',
    '072b0bb3-518e-4422-97fd-13dc53e8ae7e': 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ODU3Nywic3ViIjoiMDcyYjBiYjMtNTE4ZS00NDIyLTk3ZmQtMTNkYzUzZThhZTdlIiwicm9sZSI6InVzZXIiLCJjYXBhYmlsaXRpZXMiOlsidXBsb2FkTXVzaWMiXSwidHlwZSI6InVzZXIiLCJpYXQiOjE3Mjc0NjIwMTQsImV4cCI6MjA0MjgyMjAxNCwiaXNzIjoidHVybnRhYmxlLXVzZXItc2VydmljZSJ9.TkaMY6S_8segACL0H6fzx75wpolIUFV1AL9kYc-704b7Wrtvxyx2hifpKPUJYyqnt5rE6NsYQNrhVB9nzUUSE0rh0DdEnSsQDv5QKkmbn4OMdpsw5Xq0EkzOLdaZyUxaURetGhtkC7YrO0-GJEVk2JFzkPebKEtnHTwhsYXZP73haH40GxJ5aavyNNLNlBbqd13FrOPc3uwZoEfS8XyWdNIYQI8UPjGKj9ASmMhbn-krPqbMwWXYakckasy8A3Hj5NY4ODBdsQSC_068_7XdzY1AtBCRdGCZgHh1-XrFoyIPoFOBsRTZuXtxDQx95NL83D-AskzU5IRvYEWvCFO-P3mm0lj7G6Yp0Zu5cErZvaj9OpJLCUW2RUuP7trJmETtbw0kFasQtDm7qOnyfXYblRfAA7KuPZgXkNqC7Svn-lgM2j8GXuLYUU20Yl15Qz_dsKmasIlqjOJT5oIVSj5SR0lZm297LZOjruBcRl4drvmpaZzm8F8nqv1On8IEINr9Oh88drvPwQx-6bFrqPwj1d58wCvuyCuq2FOpE5ZlmWJvOMHyJ1FeFDNRrHH1LHH0V9sHH4LxT5iIcnlmmJfGUIgwyN5MOyAi37_RjxdKOCtiXrakvIwgk_HoGC3M6do6rmIJYh3y8FuOjv5MkkqZ-FJB_HCuKf1WANmGguiSaXM'
    // add more userId: token pairs as needed
  };

  const token = userTokenMap[userId];

  if (!token) {
    console.warn(`[getUserToken] No token found for user: ${userId}`);
  }

  return token;
}


export async function loginCometChatUser(uid) {
  const url = `https://${process.env.CHAT_API_KEY}.api-us.cometchat.io/v3.0/users/${uid}/auth_tokens`
  const headers = {
    accept: 'application/json',
    apikey: process.env.CHAT_AUTH_KEY,
    'Content-Type': 'application/json'
  }

  try {
    const res = await fetch(url, { method: 'POST', headers })
    const json = await res.json()

    if (!res.ok) {
      console.error('❌ Failed to log in bot:', res.status, json)
      return null
    }

    const authToken = json.data.authToken
    return authToken
  } catch (err) {
    console.error('🔥 CometChat login error:', err.message)
    return null
  }
}
const fetchDMsFromUser = async (userUUID) => {
  const url = `https://${process.env.CHAT_API_KEY}.api-us.cometchat.io/v3/users/${userUUID}/conversation?conversationType=user`

  const headers = {
    authtoken: process.env.CHAT_TOKEN,
    appid: process.env.CHAT_API_KEY,
    'Content-Type': 'application/json'
  }

  try {
    const res = await fetch(url, { method: 'GET', headers })
    const data = await res.json()

    console.log('📩 DMs received:', JSON.stringify(data, null, 2))
    return data
  } catch (err) {
    console.error('❌ Failed to fetch DM conversation:', err.message)
  }
}

// Needs GENIUS_TOKEN (client access token) in env
const H = { Authorization: `Bearer ${process.env.GENIUS_TOKEN}` };

const searchSong = async (q) => {
  const url = `https://api.genius.com/search?q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: H });
  const j = await r.json();
  return j.response.hits; // [{ result: {...} }]
};

const getSong = async (id, fmt = 'plain') => {
  const url = `https://api.genius.com/songs/${id}?text_format=${fmt}`;
  const r = await fetch(url, { headers: H });
  return (await r.json()).response.song;
};

// Example: title + artist → About text (plain & html)
export async function getGeniusAbout({ title, artist }) {
  const hits = await searchSong(`${title} ${artist}`);
  const best = hits?.find(h =>
    h.type === 'song' &&
    h.result?.primary_artist?.name?.toLowerCase().includes(artist.toLowerCase())
  )?.result || hits?.[0]?.result;

  if (!best) return { aboutPlain: null, aboutHtml: null, songId: null };

  const song = await getSong(best.id, 'plain,html');
  const aboutPlain = song?.description?.plain?.trim() || null;
  const aboutHtml  = song?.description?.html  || null;

  // Optional fallback: some songs also include a description annotation object
  // (useful if `description.plain` is empty)
  const descAnno   = song?.description_annotation || null;

  return { songId: song.id, aboutPlain, aboutHtml, descAnno };
}



export { getAccessToken, getSimilarArtists, getTrackTags, currentsongduration, spotifyTrackInfo, fetchTrackDetails, isUserAuthorized, fetchUserRoles, fetchRecentSongs, fetchCurrentUsers, fetchSpotifyPlaylistTracks, fetchCurrentlyPlayingSong, fetchSongData, DeleteQueueSong, fetchAllUserQueueSongIDsWithUUID, searchSpotify, getSenderNickname }
