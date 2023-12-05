import { postMessage } from '../libs/cometchat.js';

export default async (payload, room) => {
  try {
    console.log('User joined handler called:', payload);

    if (!payload.userUuid) {
      console.log('User UUID not found in payload');
      return;
    }

    if ([process.env.CHAT_USER_ID, process.env.CHAT_REPLY_ID].includes(payload.userUuid)) {
      console.log(`User ${payload.nickname} is excluded from welcome message`);
      return;
    }
    
    await postMessage({
      room,
      message: `Welcome @${payload.nickname}... feel free to ask me any questions!`,
      mentions: [{
        position: 8,
        nickname: payload.nickname,
        userId: payload.userUuid,
      }],
    });

    console.log('Welcome message sent successfully');
  } catch (error) {
    console.error('Error in user joined handler:', error.message);
  }
};
