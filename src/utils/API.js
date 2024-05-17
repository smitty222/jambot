import fetch from 'node-fetch';

const config = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  defaultPlaylistId: process.env.DEFAULT_PLAYLIST_ID,
  ttlUserToken: process.env.TTL_USER_TOKEN
};

let accessToken = null;

async function getAccessToken(clientId, clientSecret) {
  const encodedAuthString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const authorizationHeader = `Basic ${encodedAuthString}`;
  const scope = 'playlist-modify-public'; // Specify the required scope

  const authOptions = {
    method: 'POST',
    headers: {
      'Authorization': authorizationHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`
  };

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', authOptions);

    if (!response.ok) {
      throw new Error(`Failed to retrieve access token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

async function addSongToPlaylist(playlistId, trackURI) {
  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret);
    }

    console.log('Access Token:', accessToken); // Log access token

    const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
    const requestBody = {
      uris: [trackURI],
      position: 0
    };

    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };

    console.log('Adding song to playlist:', trackURI);

    const response = await fetch(url, options);

    if (!response.ok) {
      if (response.status === 401) {
        // Access token expired, refresh it
        accessToken = await getAccessToken(config.clientId, config.clientSecret);
        console.log('Access token refreshed:', accessToken);
        // Return here instead of retrying immediately
        return;
      } else {
        const errorMessage = `Failed to add song to playlist: ${response.statusText}`;
        console.error(errorMessage);
        const responseBody = await response.text(); // Log response body for further investigation
        console.error('Response body:', responseBody);
        throw new Error(errorMessage);
      }
    }

    const data = await response.json();

    if (data && data.snapshot_id) {
      console.log('Song added to playlist successfully. Snapshot ID:', data.snapshot_id);
      return data.snapshot_id; // Return the snapshot ID for the playlist
    } else {
      console.error('Failed to retrieve snapshot ID from response:', data);
      // Log response status as well for further debugging
      console.error('Response status:', response.status);
      throw new Error('Snapshot ID is undefined in the response');
    }
  } catch (error) {
    console.error('Error adding song to playlist:', error);
    throw error;
  }
}

async function fetchCurrentlyPlayingSong() {
  const token = process.env.TTL_USER_TOKEN;

  try {
    const response = await fetch('https://rooms.prod.tt.fm/rooms/uuid/b868900c-fea2-4629-b316-9f9213a72507', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch currently playing song: ${response.statusText}`);
    }

    const data = await response.json();
    if (data?.song?.musicProviders?.spotify) {
      // Assuming the Spotify track ID is in the 'spotify' property of the 'musicProviders' object
      const spotifyTrackId = data.song.musicProviders.spotify;
      const spotifyTrackURI = spotifyTrackId.startsWith('spotify:track:') ? spotifyTrackId : `spotify:track:${spotifyTrackId}`;
      return spotifyTrackURI;
    } else {
      throw new Error("No Spotify track is currently playing.");
    }
  } catch (error) {
    throw new Error(`Error fetching currently playing song: ${error.message}`);
  }
}

async function fetchSpotifyPlaylistTracks() {
  const playlistId = process.env.DEFAULT_PLAYLIST_ID;
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;

  try {
    if (!accessToken) {
      accessToken = await getAccessToken(config.clientId, config.clientSecret);
    }

    while (url) {
      const options = {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      };

      const response = await fetch(url, options);
      const playlist = await response.json();

      if (!response.ok) {
        console.error('Error fetching playlist tracks:', playlist);
        return [];
      }

      if (playlist.items?.length) {
        tracks.push(...playlist.items);
      }
      url = playlist.next;
    }
  } catch (error) {
    console.error('Error fetching playlist tracks:', error);
    return [];
  }

  return tracks;
}

function decodeAccessToken(accessToken) {
  // Split the token into its three parts: header, payload, and signature
  const tokenParts = accessToken.split('.');
  // Decode the payload (the second part)
  const payload = JSON.parse(atob(tokenParts[1]));
  return payload;
}

export { getAccessToken, decodeAccessToken, fetchSpotifyPlaylistTracks, addSongToPlaylist, fetchCurrentlyPlayingSong};
