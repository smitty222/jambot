const fetch = require('node-fetch');

// Define Spotify playlist interfaces
const ISpotifyTrack = {
  artists: [{ name: '' }],
  duration_ms: 0,
  id: '',
  external_ids: { isrc: '' },
  name: '',
};

const ISpotifyPlaylistTracks = {
  items: [ISpotifyTrack],
  next: null,
};

// Function to obtain access token from Spotify Accounts service
const getSpotifyAccessToken = async (spotifyCredentials) => {
  try {
    const options = {
      method: 'POST',
      headers: {
        Authorization: `Basic ${spotifyCredentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    };

    const response = await fetch('https://accounts.spotify.com/api/token', options);
    const parsedResponse = await response.json();

    return parsedResponse.access_token;
  } catch (error) {
    console.error('Error fetching Spotify access token:', error);
    throw error;
  }
};

// Function to fetch tracks from a Spotify playlist
const fetchSpotifyPlaylistTracks = async (playlistId, spotifyCredentials) => {
  const tracks = [];
  let token;

  try {
    // Obtain access token
    token = await getSpotifyAccessToken(spotifyCredentials);
  } catch (error) {
    console.error('Error obtaining Spotify access token:', error);
    throw error;
  }

  // Iterate through pages of tracks
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
  while (url) {
    try {
      const options = {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      };

      const response = await fetch(url, options);
      const playlist = await response.json();

      // Extract track items and append to tracks array
      if (playlist.items && playlist.items.length) {
        tracks.push(...playlist.items);
      }

      // Update URL for next page of tracks
      url = playlist.next;
    } catch (error) {
      console.error('Error fetching Spotify playlist tracks:', error);
      url = null; // Stop loop on error
    }
  }

  return tracks;
};

module.exports = {
  fetchSpotifyPlaylistTracks,
};
