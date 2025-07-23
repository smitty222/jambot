import { buildHeaders, buildApiKeyHeaders } from './headers.js';
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

  const url = buildUrl(`${process.env.COMETCHAT_APP_ID}.api-us.cometchat.io`, paths, searchParams);


  try {
    const response = await makeRequest(url, { headers });
    return response;
  } catch (error) {
    console.error(`❌ Failed to get messages for ${receiverType} ${roomOrUserId}:`, error.message);
    throw error;
  }
};

export const getDirectConversation = async (userUUID, botUUID = process.env.BOT_USER_UUID, limit = 50) => {
  const headers = buildApiKeyHeaders();

  const searchParams = [
    ['conversationType', 'user'],
    ['limit', limit],
    ['uid', botUUID]
  ];

  const paths = ['v3', 'users', userUUID, 'conversation'];
  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths, searchParams);

  try {
    const response = await makeRequest(url, { headers });

    // Optional: Debug raw response
    // console.log('[getDirectConversation] Full raw response:', JSON.stringify(response, null, 2));

    return response;
  } catch (error) {
    console.error(`❌ Error fetching conversation for ${userUUID}:`, error.message);
    if (error.response) {
      console.error('🚨 API Response:', error.response.status, JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
};
