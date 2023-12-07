// userJoined.js
import { postMessage } from '../libs/cometchat.js';

export default async (payload, room) => {
  try {
    console.log('User joined handler called:');

    if (!payload.allUsers || payload.allUsers.length === 0) {
      console.log('No user information found in payload');
      return;
    }

    const joinedUser = payload.allUsers.find(user => user.tokenRole === 'user');

    if (!joinedUser || !joinedUser.userProfile || !joinedUser.userProfile.uuid) {
      console.log('User information not found in payload');
      return;
    }

    const { userProfile: { nickname, uuid } } = joinedUser;

    // Exclude the bot's user ID defined in the .env file
    const botUserId = process.env.BOT_USER_UUID;
    if (uuid === botUserId) {
      console.log(`Bot user ${nickname} is excluded from the welcome message`);
      return;
    }

    await postMessage({
      room,
      message: `Welcome @${nickname || 'User'}... feel free to ask me any questions!`,
      mentions: [{
        position: 8,
        nickname: nickname || 'User',
        userId: uuid,
      }],
    });

    console.log(`Welcome message sent successfully to ${nickname}`);
  } catch (error) {
    console.error('Error sending the welcome message:', error.message);
  }
};
