import { postMessage } from '../libs/cometchat.js';
import { logger } from '../utils/logging.js';
import { roomThemes } from './message.js';

let greetingMessagesEnabled = true;

const customWelcomeMessages = {
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': '{nickname} has arrived!', //Rsmitty
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': '{nickname} Welcome Back You MFer! I missed you so much!', //Shirey
  '92302b7d-ae5e-466f-975b-d3fee461f13f': 'Ello {nickname}! Welcome!', //Cam
  '1225f84a-c57a-4589-8994-8069794b91ab': 'Govna! Welcome Back {nickname}!', //Dan
  '4c340480-4f5c-4b9a-9e43-f80519154cb0': '{nickname}! Im so happy to see you!', //BeRad
  // Add more UUIDs and their corresponding custom welcome messages here
};

const generateWelcomeMessage = (uuid, nickname, room) => {
  if (customWelcomeMessages[uuid]) {
    // Replace the placeholder `{nickname}` with the actual nickname
    return customWelcomeMessages[uuid].replace('{nickname}', nickname);
  }
  
  // If greeting messages are disabled, send a basic welcome message
  if (!greetingMessagesEnabled) {
    return `Welcome to the room, @${nickname}`;
  }

  const theme = roomThemes[room] || 'Just Jam';
  return `Welcome to the room, @${nickname}\n- Current Theme is: ${theme}\n- Type /commands to see what else I can do!`;
};

const handleUserJoinedWithStatePatch = async (payload) => {
  try {
    // Extract new users from the statePatch array
    let newUserProfile = null;
    payload.statePatch.forEach((patch) => {
      if (patch.op === 'add' && patch.path.startsWith('/allUserData/')) {
        newUserProfile = patch.value.userProfile;
      }
    });

    if (newUserProfile) {
      const { uuid, nickname } = newUserProfile;

      console.log('New user who joined:', nickname);

      const welcomeMessage = generateWelcomeMessage(uuid, nickname, process.env.ROOM_UUID);

      // Always send the welcome message, regardless of greetingMessagesEnabled
      const messagePayload = {
        room: process.env.ROOM_UUID, // Send message to the room
        message: welcomeMessage,
        sender: process.env.BOT_USER_UUID // Ensure the bot UUID is the sender
      };

      console.log('Sending message payload:', messagePayload);

      const response = await postMessage(messagePayload);

      console.log('Message sent response:', response);
    } else {
      console.log('No new user identified in statePatch.');
    }
  } catch (error) {
    logger.error('Error handling userJoined event with statePatch:', error.message);
  }
};

const enableGreetingMessages = () => {
  greetingMessagesEnabled = true;
};

const disableGreetingMessages = () => {
  greetingMessagesEnabled = false;
};

export default handleUserJoinedWithStatePatch;
export { enableGreetingMessages, disableGreetingMessages, greetingMessagesEnabled };
