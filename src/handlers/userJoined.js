// userJoined.js
import { postMessage } from '../libs/cometchat.js';

// Define custom welcome messages for specific users
const customWelcomeMessages = {
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': 'Rsmitty has arrived!', // Rsmitty
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': 'DJ Shirley! Welcome back! I missed you so much!', //Shirley
  '92302b7d-ae5e-466f-975b-d3fee461f13f': 'hi Cam. Welcome back', //Cam
  // Add more user UUIDs and their custom welcome messages as needed
};

let lastGreetedUser = null;

export default async (payload, room) => {
  try {
    console.log('User joined handler called:');
    console.log('Received Payload:', payload);

    if (!payload.allUserData) {
      console.log('No user data found in payload');
      return;
    }

    const botUserId = process.env.BOT_USER_UUID;

    // Exclude the bot based on user UUID
    const joinedUser = payload.audienceUsers.find(user => user.uuid !== botUserId);

    if (!joinedUser) {
      console.log('User information not found in payload');
      return;
    }

    const userProfile = payload.allUserData[joinedUser.uuid]?.userProfile;

    if (!userProfile || !userProfile.nickname) {
      console.log('User profile or nickname not found');
      return;
    }

    // Check if the current joined user is different from the last greeted user
    if (!lastGreetedUser || (joinedUser.uuid !== lastGreetedUser.uuid || joinedUser.sessionId !== lastGreetedUser.sessionId)) {
      const customWelcomeMessage = customWelcomeMessages[joinedUser.uuid];

      // Send custom welcome message if available, else send a generic welcome message
      const welcomeMessage = customWelcomeMessage || `Welcome to the room, @${userProfile.nickname}! The current theme is: ${roomThemes[room]}`;

      // Send welcome message
      await postMessage({
        room,
        message: welcomeMessage,
        mentions: customWelcomeMessage ? [] : undefined,
      });

      console.log(`Welcome message sent successfully to ${userProfile.nickname}`);

      // Update the last greeted user
      lastGreetedUser = joinedUser;
    }
  } catch (error) {
    console.error('Error sending the welcome message:', error.message);
  }
};
