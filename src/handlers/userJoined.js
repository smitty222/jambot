import { postMessage } from '../libs/Cometchat/messageSender.js';
import { logger } from '../utils/logging.js';
import { roomThemes } from './message.js';
import * as themeManager from '../utils/themeManager.js'

let greetingMessagesEnabled = true;

const customWelcomeMessages = {
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': '{nickname} has arrived!', //Rsmitty
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': '🎧{nickname} in the building — not shy, just silently cooking heat 🔥', //Shirey
  '92302b7d-ae5e-466f-975b-d3fee461f13f': 'Ello {nickname}! Welcome!', //Cam
  '1225f84a-c57a-4589-8994-8069794b91ab': 'Govna! Welcome Back {nickname}!', //Dan
  '4c340480-4f5c-4b9a-9e43-f80519154cb0': '{nickname}! Im so happy to see you!', //BeRad
  'df2cd59d-c1ab-4589-98cd-e14f8a400f77': 'All the way from Kenya, everybody welcome {nickname}! Great to see you!', //Alvn
  '3ea72ae7-77db-4d08-9dc6-ce875890c1b5': 'He loves his Metal, but dont let him fool you, hes got tunes from all genres. Welcome back, {nickname}!',//Metalman
  'e99d7d47-7d45-4ab5-b868-8a188db1ec5f': 'Nobody chills harder than {nickname}! Welcome back!', //Straight up Chill
  '554d0d38-0b7b-45d8-9f18-20b4f5689e70': 'Busterrrrrrrrr Douglassssssss {nickname}! In the house!', // P Eacho
  'fd2f1b47-b1d4-4100-8f88-6e56aa82e13f': 'Our favorite groupie has arrived! Welcome {nickname}!', //Gab
  'a5e09ebd-ceb5-46b6-b962-52754e32840d': '{nickname}! Sniff this one!'
  // Add more UUIDs and their corresponding custom welcome messages here
};

const generateWelcomeMessage = (uuid, nickname, room) => {
  const mention = `<@uid:${uuid}>`;

  if (customWelcomeMessages[uuid]) {
    // Replace `{nickname}` with the actual mention
    return customWelcomeMessages[uuid].replace('{nickname}', mention);
  }

  // If greeting messages are disabled, use a basic mention
  if (!greetingMessagesEnabled) {
    return `Welcome to the room, ${mention}`;
  }

  const theme = themeManager.getTheme(room) || 'Just Jam';
  return `Hey ${mention}! 👋 Welcome to Just Jams! Feel free to hop on stage or vibe in the crowd. If you have any questions, just ask! Don't forget to say hi and invite friends who love music too 🎶\n- Current Theme is: ${theme}\n- Type /commands to see what else I can do!`;
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
