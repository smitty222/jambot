// commands/addDJ.js
const { SocketClient, ActionName } = require('ttfm-socket');

async function addDJCommand(authToken, roomId) {
  try {
    const client = new SocketClient('https://socket.prod.tt.fm');
    
    // Connect to the room
    await client.joinRoom(authToken, {
      roomUuid: roomId,
    });

    // Send the addDj action
    await client.action(ActionName.addDj, { song: { /* song details if needed */ } });

    console.log('Bot added to DJ stage successfully.');
  } catch (error) {
    console.error('Error adding bot to DJ stage:', error.message);
  }
}

module.exports = addDJCommand;
