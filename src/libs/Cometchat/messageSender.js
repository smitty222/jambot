
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
      receiver: receiverUUID,       // 🟢 Required for DMs
      receiverType: 'user',
      room: receiverUUID            // 🟢 Forces fallback logic to still work
    };
    return await postMessage(options);
  } catch (error) {
    console.error(`Failed to send direct message to ${receiverUUID}:`, error.message);
  }
};


export async function sendAuthenticatedDM(toUserUUID, text) {
  const url = `https://${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io/v3.0/messages`

  const payload = {
    receiver: toUserUUID,
    receiverType: 'user',
    category: 'message',
    type: 'text',
    data: {
      text
    }
  }

  const headers = {
    appid: process.env.CHAT_API_KEY,
    authtoken: process.env.CHAT_TOKEN, // 👈 Auth token for your bot
    'Content-Type': 'application/json'
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })

    const json = await res.json()

    if (!res.ok) {
      console.error('❌ Failed to send DM:', res.status, json)
    } else {
      console.log(`✅ DM sent to ${toUserUUID}`)
    }

    return json
  } catch (err) {
    console.error('🔥 sendAuthenticatedDM error:', err.message)
  }
}


