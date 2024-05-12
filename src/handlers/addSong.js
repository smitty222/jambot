//addSong.js

import { fetchRecentSongs } from '../utils/recentSongs';
import { addTrackToPlaylist } from './spotifyAPI';
import { postMessage } from './messaging';

// Define the command handler function
async function handleAddSongCommand(payload) {
  try {
    const token = process.env.TTL_USER_TOKEN;
    const recentSong = await fetchRecentSongs(token);
    const trackURI = recentSong.songPlays[0]?.song?.musicProviders?.spotify;

    if (!trackURI) {
      throw new Error('Track URI not found for the recent song');
    }

    // Add the track to the playlist
    await addTrackToPlaylist(trackURI);
    
    // Send a success message
    await postMessage({
      room: payload.room,
      message: 'The recent song has been added to the playlist successfully.'
    });
  } catch (error) {
    // Handle errors
    console.error('Error adding song to playlist:', error);
    await postMessage({
      room: payload.room,
      message: 'Sorry, an error occurred while adding the song to the playlist.'
    });
  }
}

export {handleAddSongCommand};
