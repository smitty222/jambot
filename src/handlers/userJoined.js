// userJoined.js
import { postMessage } from '../libs/cometchat.js';

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

    // Send a welcome message to the joined user
    const welcomeMessage = `Welcome to the room, ${userProfile.nickname}!`;

    // Send welcome message
    await postMessage({
      room,
      message: welcomeMessage,
    });

    console.log(`Welcome message sent successfully to ${userProfile.nickname}`);
  } catch (error) {
    console.error('Error handling userJoined event:', error.message);
  }
};
