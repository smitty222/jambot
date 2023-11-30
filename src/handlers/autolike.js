// autoLike.js
const { SocketClient } = require('ttfm-socket');
const { applyPatch } = require('fast-json-patch');
require('dotenv').config();

const authToken = process.env.AUTH_TOKEN;
const roomId = process.env.ROOM_ID;

// Initialize previous state
let prevState = {};

async function autoLike() {
  try {
    const client = new SocketClient('https://socket.prod.tt.fm');
    console.log('SocketClient created.');

    const { state } = await client.joinRoom(authToken, {
      roomUuid: roomId,
      // Optionally include the room password if applicable
      password: "{optional room password}",
    });

    console.log('Joined room:');

    // Automatically like every song
    client.on('statefulMessage', (message) => {
      if (message.name === 'playedSong' && message.statePatch.nowPlaying) {
        const songIdToLike = message.statePatch.nowPlaying.songId;
        client.action('voteOnSong', {
          value: 1,  // 1 for like, -1 for dislike
          songId: songIdToLike,
        });
      }

      // Update local state using JSON Patch
      prevState = applyPatch(prevState, message.statePatch, true, false).newDocument;
      // You can add your own logic based on the received message here
    });
  } catch (error) {
    console.error('Error joining room:', error.message);
  }
}

// Call the autoLike function
autoLike();
