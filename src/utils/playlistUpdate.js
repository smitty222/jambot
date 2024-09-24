import { fetchSpotifyPlaylistTracks } from './API.js'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config()

const clientId = process.env.SPOTIFY_CLIENT_ID
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
let accessToken = process.env.SPOTIFY_ACCESS_TOKEN
const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN


async function refreshAccessToken () {
  const authOptions = {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`
  }

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', authOptions)

    if (!response.ok) {
      throw new Error(`Failed to refresh access token: ${response.statusText}`)
    }

    const data = await response.json()
    accessToken = data.access_token // Update the access token
    return accessToken
  } catch (error) {
    console.error('Error refreshing access token:', error)
    throw error
  }
}

function getAccessToken () {
  return accessToken
}

async function addTracksToPlaylist(playlistId, trackUris, position = null) {
  // Fetch current tracks in the specified playlist
  const currentTracks = await fetchSpotifyPlaylistTracks(playlistId);
  
  // Extract the track URIs from the fetched tracks
  const existingTrackUris = currentTracks.map(item => item.track.uri);
  
  // Filter out tracks that already exist in the playlist
  const tracksToAdd = trackUris.filter(uri => !existingTrackUris.includes(uri));

  if (tracksToAdd.length === 0) {
    console.log('All tracks are already in the playlist. No new tracks added.');
    return null; // No new tracks to add
  }

  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  const headers = {
    Authorization: `Bearer ${getAccessToken()}`,
    'Content-Type': 'application/json'
  };

  const body = {
    uris: tracksToAdd
  };

  if (position !== null) {
    body.position = position;
  }

  try {
    let response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      if (response.status === 401) { // If unauthorized, refresh the token
        const newToken = await refreshAccessToken();
        headers.Authorization = `Bearer ${newToken}`;
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
      } else {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    }

    const data = await response.json();
    return data.snapshot_id; // Return the snapshot ID of the updated playlist
  } catch (error) {
    console.error('Error adding tracks to playlist:', error);
    throw error;
  }
}

async function removeTrackFromPlaylist(playlistId, trackUri) {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  const headers = {
    Authorization: `Bearer ${getAccessToken()}`,
    'Content-Type': 'application/json'
  };

  // Ensure trackUri is in the correct format with 'spotify:track:' prefix
  if (!trackUri.startsWith('spotify:track:')) {
    trackUri = `spotify:track:${trackUri}`;
  }

  const body = {
    tracks: [{ uri: trackUri }]
  };

  console.log('Request URL:', url); // Log the request URL
  console.log('Request Headers:', headers); // Log the request headers
  console.log('Request Body:', JSON.stringify(body)); // Log the request body

  try {
    let response = await fetch(url, {
      method: 'DELETE',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      if (response.status === 401) { // If unauthorized, refresh the token
        const newToken = await refreshAccessToken();
        headers.Authorization = `Bearer ${newToken}`;
        response = await fetch(url, {
          method: 'DELETE',
          headers,
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
      } else {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    }

    const data = await response.json();
    return data.snapshot_id;
  } catch (error) {
    console.error('Error removing track from playlist:', error);
    throw error;
  }
}

export { addTracksToPlaylist, removeTrackFromPlaylist }
