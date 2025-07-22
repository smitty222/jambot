
import { buildHeaders } from './headers.js';
import { buildPayload } from './metadata.js';
import { buildUrl, makeRequest } from '../../utils/networking.js';

export const postMessage = async (options) => {
  const headers = buildHeaders();
  const payload = buildPayload(options);
  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, ['v3.0', 'messages']);

  try {
    const messageResponse = await makeRequest(url, { method: 'POST', body: JSON.stringify(payload) }, headers);
    return {
      message: options.message,
      messageResponse
    };
  } catch (error) {
    console.error('Failed to post message:', error.message);
    throw error;
  }
};

export const sendDirectMessage = async (receiverUUID, message) => {
  try {
    const options = {
      message,
      receiver: receiverUUID,
      receiverType: 'user'
    };
    return await postMessage(options);
  } catch (error) {
    console.error(`Failed to send direct message to ${receiverUUID}:`, error.message);
  }
};
