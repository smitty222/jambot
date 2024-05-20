import { postMessage } from '../libs/cometchat.js';
import { roomThemes } from './message.js';

// Define custom welcome messages for specific users
const customWelcomeMessages = {
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': 'Rsmitty has arrived!', // Rsmitty
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': 'DJ Shirley! Welcome back! I missed you so much!', // Shirley
  '92302b7d-ae5e-466f-975b-d3fee461f13f': 'Ayo Normac! Good to see you', // Cam
  // Add more user UUIDs and their custom welcome messages as needed
};

// Function to get the theme message
const getThemeMessage = (theme) => {
  return theme ? ` The room theme is currently set to: ${theme}` : ' There is currently no room theme set. Play whatever you like!';
};

let previousUserState = [];

const updateUserState = (currentUsers) => {
  previousUserState = [...currentUsers];
};

const identifyNewUser = (currentUsers) => {
  return currentUsers.find(uuid => !previousUserState.includes(uuid));
};

export default async (payload, room) => {
  try {
    console.log('User joined handler called:');
    console.log('Received Payload:', payload);

    if (!payload.allUserData) {
      console.log('No user data found in payload');
      return;
    }

    const botUserId = process.env.BOT_USER_UUID;

    const currentUsers = payload.allUsers.map(user => user.uuid);
    const newUserUuid = identifyNewUser(currentUsers);

    if (!newUserUuid) {
      console.log('No new user identified');
      return;
    }

    const newUser = payload.allUserData[newUserUuid];
    const userProfile = newUser ? newUser.userProfile : null;

    if (!userProfile || !userProfile.nickname) {
      console.log('User profile or nickname not found for the new user');
      return;
    }

    // Get the theme for the room
    const theme = roomThemes[room];
    
    // Get the custom welcome message for the new user, if available
    const customWelcomeMessage = customWelcomeMessages[newUserUuid];
    // Construct the welcome message with the custom message (if available) and the theme message
    const welcomeMessage = `${customWelcomeMessage || `Welcome to the room, @${userProfile.nickname}!`}${getThemeMessage(theme)}`;

    await postMessage({
      room,
      message: welcomeMessage,
      mentions: customWelcomeMessage ? [] : undefined
    });

    console.log(`Welcome message sent successfully to ${userProfile.nickname}`);

    updateUserState(currentUsers);
  } catch (error) {
    console.error('Error sending the welcome message:', error.message);
  }
};

