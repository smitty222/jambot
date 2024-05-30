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

// TURNTABLE API
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

async function fetchRecentSongs() {
  const token = process.env.TTL_USER_TOKEN;

  try {
    const response = await fetch('https://playlists.prod.tt.fm/rooms/just-jams/recent-songs', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch recent songs: ${response.statusText}`);
    }

    const data = await response.json();
    return data.songPlays;
  } catch (error) {
    throw new Error(`Error fetching recent songs: ${error.message}`);
  }
}

async function fetchCurrentUsers() {
  const token = process.env.TTL_USER_TOKEN;

  try {
    const response = await fetch('https://rooms.prod.tt.fm/rooms/just-jams', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch current users: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data || !data.usersInRoomUuids) {
      throw new Error("Failed to fetch current users: Invalid response format");
    }

    return data.usersInRoomUuids;
  } catch (error) {
    throw new Error(`Error fetching current users: ${error.message}`);
  }
}

async function fetchUserData(userUUIDs) {
  const token = process.env.TTL_USER_TOKEN;
  const endpoint = `https://api.prod.tt.fm/users/profiles?users=${userUUIDs}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user data: ${response.statusText}`);
    }

    const userData = await response.json();
    
    // Extract nicknames from user profiles
    const nicknames = userData.map(user => user.userProfile.nickname);

    return nicknames;
  } catch (error) {
    throw new Error(`Error fetching user data: ${error.message}`);
  }
}

export { getAccessToken, fetchUserData, fetchRecentSongs,fetchCurrentUsers, fetchSpotifyPlaylistTracks,fetchCurrentlyPlayingSong};
