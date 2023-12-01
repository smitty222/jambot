import { postMessage } from '../libs/cometchat.js';

export default async (payload, room) => {
  console.log('Received payload:', payload);

  if (!payload.userUuid) {
    console.log('User UUID not found in payload');
    return;
  }

  if ([process.env.CHAT_USER_ID, process.env.CHAT_REPLY_ID].includes(payload.userUuid)) {
    console.log('User is bot or reply, skipping.');
    return;
  }

  const theme = payload.message.replace('/settheme', '').trim();

  console.log('Theme set to:', theme);

  // Ensure that room is defined and postMessage is correctly formatted
  await postMessage({
    room,
    message: `Command processed. Theme set to: ${theme}`,
  });
};
