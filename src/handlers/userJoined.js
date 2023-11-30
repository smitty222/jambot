export default async (payload, room) => {
  console.log('Received payload:', payload);

  if (!payload.userUuid) {
    console.log('User UUID is falsy. Exiting.');
    return;
  }

  if ([process.env.CHAT_USER_ID, process.env.CHAT_REPLY_ID].includes(payload.userUuid)) {
    console.log('User ID is excluded. Exiting.');
    return;
  }

  console.log('Posting welcome message...');
  postMessage({
    room,
    message: `Welcome @${payload.nickname}... feel free to ask me any questions!`,
    mentions: [{
      position: 8,
      nickname: payload.nickname,
      userId: payload.userUuid
    }]
  });
}
