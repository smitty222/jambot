
import { v4 as uuidv4 } from 'uuid';

export const buildChatMetadata = (message) => ({
  message: message || '',
  avatarId: process.env.CHAT_AVATAR_ID,
  userName: process.env.CHAT_NAME,
  color: `#${process.env.CHAT_COLOUR}`,
  mentions: [],
  userUuid: process.env.BOT_USER_UUID,
  badges: ['VERIFIED', 'STAFF'],
  id: uuidv4()
});

export const buildPayload = (options) => {
  let type = 'text';
  const data = {};

  if (options.images || options.gifs) {
    type = 'image';
    data.attachments = [];
    const mediaUrls = options.images || options.gifs;
    for (const url of mediaUrls) {
      const filename = url.split('/').pop();
      const extension = filename.split('.').pop();
      const mimeType = extension === 'gif' ? 'image/gif' : `image/${extension}`;
      data.attachments.push({
        url,
        name: filename,
        mimeType,
        extension,
        size: 'unknown'
      });
    }
  } else {
    data.text = options.message || '';
  }

  data.metadata = {
    chatMessage: buildChatMetadata(options.message)
  };

  return {
  type,
  receiverType: options.receiverType === 'user' ? 'user' : 'group',
  category: 'message',
  receiver: options.receiverType === 'user' ? options.receiver : options.room,
  sender: process.env.BOT_USER_UUID, // ✅ Required when using API key auth
  data
}
};
