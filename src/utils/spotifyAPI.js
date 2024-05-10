import fetch from 'node-fetch';

let accessToken = null;

async function exchangeAuthorizationCodeForAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  // Encode the concatenated string to base64
  const encodedAuthString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Construct the Authorization header value
  const authorizationHeader = `Basic ${encodedAuthString}`;

  console.log('Authorization header:', authorizationHeader); // Logging the authorization header

  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      grant_type: 'client_credentials'
    },
    headers: {
      'Authorization': authorizationHeader,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    json: true
  };

  try {
    const response = await fetch(authOptions.url, {
      method: 'POST',
      body: new URLSearchParams(authOptions.form),
      headers: authOptions.headers
    });

    const data = await response.json();
    const accessToken = data.access_token;

    console.log('Access token:', accessToken); // Logging the access token

    return accessToken; // Return the access token
  } catch (error) {
    console.error('Error exchanging authorization code for access token:', error);
    throw error;
  }
}

async function fetchSpotifyPlaylistTracks(playlistId) {
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;

  if (!accessToken) {
    // If access token is not available or expired, refresh it
    accessToken = await exchangeAuthorizationCodeForAccessToken(); // Assuming you have a function to obtain the access token
  }

  try {
    while (url) {
      const options = {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      };

      const response = await fetch(url, options);
      const playlist = await response.json();

      if (!response.ok) {
        // Handle non-OK responses (e.g., 4xx or 5xx status codes)
        console.error('Error fetching playlist tracks:', playlist);
        return []; // Return empty array or throw an error
      }

      if (playlist.items?.length) {
        tracks.push(...playlist.items);
      }
      url = playlist.next;
    }
  } catch (error) {
    // Handle network errors or other exceptions
    console.error('Error fetching playlist tracks:', error);
    return []; // Return empty array or throw an error
  }

  return tracks;
}


export { exchangeAuthorizationCodeForAccessToken, fetchSpotifyPlaylistTracks };
