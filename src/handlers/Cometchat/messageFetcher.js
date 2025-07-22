
import { buildHeaders } from './headers.js';
import { buildUrl, makeRequest } from '../../utils/networking.js';

export const getMessages = async (roomOrUserId, fromTimestamp, receiverType = 'group') => {
  const headers = buildHeaders();
  const messageLimit = 50;

  const searchParams = [
    ['per_page', messageLimit],
    ['hideMessagesFromBlockedUsers', 0],
    ['unread', 0],
    ['withTags', 0],
    ['hideDeleted', 0],
    ['sentAt', fromTimestamp],
    ['affix', 'append']
  ];

  let paths;
  if (receiverType === 'group') {
    paths = ['v3.0', 'groups', roomOrUserId, 'messages'];
  } else if (receiverType === 'user') {
    paths = ['v3.0', 'users', roomOrUserId, 'messages'];
  } else {
    throw new Error(`Invalid receiverType "${receiverType}"`);
  }

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths, searchParams);

  try {
    const response = await makeRequest(url, { headers });
    return response;
  } catch (error) {
    console.error(`Failed to get messages for ${receiverType} ${roomOrUserId}:`, error.message);
    throw error;
  }
};

export const getDirectConversation = async (userUUID, botUUID = process.env.BOT_USER_UUID, limit = 50) => {
  const headers = buildHeaders();

  const searchParams = [
    ['conversationType', 'user'],
    ['limit', limit],
    ['uid', botUUID]
  ];

  const paths = ['v3', 'users', userUUID, 'conversation'];
  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths, searchParams);

  try {
    const response = await makeRequest(url, { headers });
    return response;
  } catch (error) {
    console.error(`Failed to get direct conversation with user ${userUUID}:`, error.message);
    throw error;
  }
};
