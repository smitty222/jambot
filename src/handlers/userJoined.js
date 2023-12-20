// userJoined.js
import { postMessage } from '../libs/cometchat.js';

// Define custom welcome messages for specific users
const customWelcomeMessages = {
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': 'Test Test Test Rsmitty has joined', // Rsmitty
  'user_uuid_2': 'Hello, User2! Enjoy your time in the room and feel free to chat with me.',
  // Add more user UUIDs and their custom welcome messages as needed
};

export const handleUserJoined = async (payload, room) => {
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

    // Check if the current joined user is not in the list
    if (!joinedUserIds.includes(joinedUser.uuid)) {
      const customWelcomeMessage = customWelcomeMessages[joinedUser.uuid];

      // Send custom welcome message if available, else send a generic welcome message
      const welcomeMessage = customWelcomeMessage || `Welcome to the room, ${userProfile.nickname}!`;

      // Send welcome message
      await postMessage({
        room,
        message: welcomeMessage,
        mentions: customWelcomeMessage ? [] : undefined,
      });

      console.log(`Welcome message sent successfully to ${userProfile.nickname}`);

      // Update the list of joined users
      joinedUserIds.push(joinedUser.uuid);
    }
  } catch (error) {
    console.error('Error sending the welcome message:', error.message);
  }
};
