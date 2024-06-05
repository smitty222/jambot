import { fetchCurrentUsers } from '../utils/API.js';
import { getCurrentUsers, updateCurrentUsers } from '../utils/currentUsers.js';
import { postMessage } from '../libs/cometchat.js';

let greetingMessagesEnabled = true;

const customWelcomeMessages = {
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': 'Rsmitty has arrived!',
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': 'DJ Shirley! Welcome Back! I missed you so much!',
  '92302b7d-ae5e-466f-975b-d3fee461f13f': 'Ello Noremac! Welcome!',
  // Add more UUIDs and their corresponding custom welcome messages here
};

const generateWelcomeMessage = (uuid, nickname, theme) => {
  if (customWelcomeMessages[uuid]) {
    return customWelcomeMessages[uuid];
  }
  return `Welcome to the room, @${nickname}\n- Current Theme is: ${theme}\n- You can type /commands to see what other things I can do!`;
};

const handleUserJoined = async (payload) => {
  try {
    const previousUsers = getCurrentUsers();
    const currentUsers = await fetchCurrentUsers();
    const newUser = currentUsers.find(user => !previousUsers.includes(user));

    if (!newUser) {
      console.log('No new user. Probably a user refreshed.');
      return;
    }

    const newUserProfile = payload.allUserData[newUser]?.userProfile;
    const nickname = newUserProfile?.nickname || 'Unknown';
    const uuid = newUserProfile?.uuid;

    if (nickname === 'Unknown') {
      console.log('No New User. Probably a user refreshed');
      return;
    }

    console.log('New user who joined:', nickname);

    const welcomeMessage = generateWelcomeMessage(uuid, nickname, process.env.ROOM_THEME);

    if (greetingMessagesEnabled && welcomeMessage) {
      await postMessage({
        room: process.env.ROOM_UUID,
        message: welcomeMessage
      });
    }

    updateCurrentUsers(currentUsers);
    console.log('Updated current room users:', currentUsers);
  } catch (error) {
    console.error('Error handling userJoined event:', error.message);
  }
};

const enableGreetingMessages = () => {
  greetingMessagesEnabled = true;
};

const disableGreetingMessages = () => {
  greetingMessagesEnabled = false;
};

export default handleUserJoined;
export { enableGreetingMessages, disableGreetingMessages, greetingMessagesEnabled };
