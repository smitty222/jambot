// recentSongs.js

import fetch from 'node-fetch';

async function fetchRecentSongs(token) {
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
    return data;
  } catch (error) {
    throw new Error(`Error fetching recent songs: ${error.message}`);
  }
}

export { fetchRecentSongs };
