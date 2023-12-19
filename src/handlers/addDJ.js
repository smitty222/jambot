// Import the AddDjAction from ttfm-socket
const { AddDjAction } = require('ttfm-socket');

const addDJ = async (payload, room) => {

// Define the parameters for AddDjAction
const addDjParams = {
  roomUuid: process.env.ROOM_UUID,
  song: '', // You can provide a default song if needed
  tokenRole: '...', // Replace with the desired token role
  userUuid: process.env.BOT_USER_UUID,
};

// Create an instance of AddDjAction with the specified parameters
const addDjAction = new AddDjAction(addDjParams);

// Run the AddDjAction to make the bot join the DJ stand
addDjAction.run()
  .then((result) => {
    console.log(`Bot user ${process.env.BOT_USER_UUID} has been added to the DJ lineup.`, result);
  })
  .catch((error) => {
    console.error('Error adding bot as DJ:', error.message);
  });
}

  export default addDJ;
