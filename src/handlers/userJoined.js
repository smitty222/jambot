// userJoined.js
import { postMessage } from '../libs/cometchat.js';

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

    const userDisplayName = userProfile.nickname;

    await postMessage({
      room,
      message: `Welcome to Just Jams @${userProfile.nickname} . Feel free to ask me any questions by tagging me or use /commands for a list of commands`,
      mentions: [{
        position: 8,
        nickname: userProfile.nickname,
        userId: joinedUser.uuid,
      }],
    });

    console.log(`Welcome message sent successfully to ${userDisplayName}`);
  } catch (error) {
    console.error('Error sending the welcome message:', error.message);
  }
};
