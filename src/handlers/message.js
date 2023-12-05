import { postMessage } from '../libs/cometchat.js';
import { askQuestion } from '../libs/ai.js';
import { logger } from '../utils/logging.js';

export default async (payload, room) => {
  logger.info({ sender: payload.senderName, message: payload.message });

  if (payload.message.includes(`@${process.env.CHAT_NAME}`)) {
    const keywords = process.env.MERCH_RESPONSE_KEYWORDS.split(',');
    for (const keyword of keywords) {
      if (payload.message.includes(keyword)) {
        return await postMessage({
          room,
          message: process.env.MERCH_MESSAGE
        });
      }
    }

    const reply = await askQuestion(payload.message.replace(`@${process.env.CHAT_NAME}`, ''), room);
    const responses = reply.split('\n');
    for (const response of responses) {
      const trimmedResponse = response.trim();
      if (trimmedResponse.length > 0) {
        await postMessage({
          room,
          message: trimmedResponse
        });
      }
    }
    // "/ COMMANDS" Start Here. 

  } else if (payload.message.startsWith('/hello')) {
    // Respond to /hello command
    await postMessage({
      room,
      message: 'Hi!'
    });
  }
  else if (payload.message.startsWith('/berad')) {
    // Respond to /berad command
    await postMessage({
      room,
      message: '@BeRad is the raddest guy in town'
    });
}}
