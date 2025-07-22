
import { buildHeaders } from './headers.js';
import { buildUrl, makeRequest } from '../../utils/networking.js';

export const joinChat = async (roomId) => {
  const headers = buildHeaders();
  const paths = ['v3.0', 'groups', roomId, 'members'];

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths);
  const response = await makeRequest(url, { headers, method: 'POST' });
  return response;
};
