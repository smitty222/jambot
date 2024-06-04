import { fetchCurrentUsers } from "../utils/API.js";
import { getCurrentUsers, updateCurrentUsers } from "../utils/currentUsers.js"; // Import getCurrentUsers and updateCurrentUsers
import { postMessage } from "../libs/cometchat.js";

let greetingMessagesEnabled = true;

// Mapping object for custom welcome messages
const customWelcomeMessages = {
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': 'Rsmitty has arrived!',
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': 'DJ Shirley! Welcome Back! I missed you so much!',
  '92302b7d-ae5e-466f-975b-d3fee461f13f': 'Ello Noremac! Welcome!',
  // Add more UUIDs and their corresponding custom welcome messages here
};

export default async (payload) => {
  try {
    const previousUsers = getCurrentUsers();
    const currentUsers = await fetchCurrentUsers();
    const newUser = currentUsers.find(user => !previousUsers.includes(user));

    const newUserProfile = payload.allUserData[newUser]?.userProfile;
    const nickname = newUserProfile ? newUserProfile.nickname : 'Unknown';
    const uuid = newUserProfile ? newUserProfile.uuid : null;

    // If the nickname is "Unknown", skip sending the welcome message
    if (nickname === 'Unknown') {
      console.log('No New User. Probably a user refreshed');
      return;
    }

    console.log('New user who joined:', nickname);

    let welcomeMessage = null;

    // Check if the new user's UUID has a custom welcome message
    if (uuid && customWelcomeMessages[uuid]) {
      welcomeMessage = customWelcomeMessages[uuid];
    } else {
      welcomeMessage = `Welcome to the room, @${nickname}\n- Current Theme is: ${theme}\n- You can type /commands to see what other things I can do!`;
    }

    if (welcomeMessage) {
      await postMessage({
        room: process.env.ROOM_UUID,
        message: welcomeMessage
      });
    }

    updateCurrentUsers(currentUsers);
    console.log('Updated current room users:', currentUsers);
  } catch (error) {
    console.error('Error handling userJoined event:', error.message);
    // Handle errors appropriately
  }
};

export function enableGreetingMessages() {
  greetingMessagesEnabled = true;
}

export function disableGreetingMessages() {
  greetingMessagesEnabled = false;
}

export {greetingMessagesEnabled}