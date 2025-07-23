import { sendDirectMessage } from './messageSender.js';
import { getDirectConversation } from './messageFetcher.js';

const SMITTY_UUID = process.env.SMITTY_UUID;
const BOT_UUID = process.env.BOT_USER_UUID;

let lastMessageId = null;

export const pollDirectMessages = async () => {
  console.log('[DM Polling] Running pollDirectMessages...');

  try {
    const response = await getDirectConversation(SMITTY_UUID, BOT_UUID);

    if (!response || !response.data) {
      console.log('[DM Polling] No response data received.');
      return;
    }

    console.log('[DM Polling] Raw conversation response:', JSON.stringify(response.data, null, 2));

    const lastMessage = response.data?.data?.lastMessage;

    if (!lastMessage) {
      console.log('[DM Polling] No lastMessage found in conversation.');
      return;
    }

    if (lastMessage.receiver !== BOT_UUID) {
      console.log(`[DM Polling] Message was not sent to bot. Receiver: ${lastMessage.receiver}`);
      return;
    }

    if (lastMessage.id === lastMessageId) {
      console.log('[DM Polling] Duplicate message; already handled.');
      return;
    }

    lastMessageId = lastMessage.id;
    console.log(`[DM Polling] New message detected. ID: ${lastMessage.id}`);

    const text = lastMessage.data?.text?.trim();
    const sender = lastMessage.sender?.uid;

    console.log(`[DM Polling] Received message from ${sender}: "${text}"`);

    if (text === '/hello') {
      console.log('[DM Polling] Matched /hello command');
      await sendDirectMessage(sender, 'Hello there! 👋');
    } else {
      console.log('[DM Polling] No command match; echoing message');
      await sendDirectMessage(sender, `You said: "${text}"`);
    }
  } catch (err) {
    console.error('❌ Error polling direct messages:', err.message);
  }
};
