// commands/addDJ.js
import { SocketClient, ActionName } from 'ttfm-socket';

async function addDJCommand() {
  try {
    const authToken = process.env.TTL_USER_TOKEN; // Get the auth token from the environment variables
    const roomId = process.env.ROOM_UUID; // Get the room ID from the environment variables

    // Check if authToken and roomId are defined
    if (!authToken || !roomId) {
      throw new Error('Authentication token or room ID not provided.');
    }

    // Create a new SocketClient instance
    const client = new SocketClient('https://socket.prod.tt.fm');

    // Connect to the room
    await client.joinRoom(authToken, {
      roomUuid: roomId,
    });

    // Send the addDj action
    await client.action(ActionName.addDj, {});

    console.log('Bot added to DJ stage successfully.');
  } catch (error) {
    console.error('Error adding bot to DJ stage:', error.message);
  }
}

export { addDJCommand };
