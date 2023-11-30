import { postMessage } from '../libs/cometchat.js';
import { askQuestion } from '../libs/ai.js';
import { logger } from '../utils/logging.js';

export default async (payload, room) => {
  logger.info({ sender: payload.senderName, message: payload.message });

  if (payload.message.includes(`@${process.env.CHAT_NAME}`)) {
    const keywords = process.env.MERCH_RESPONSE_KEYWORDS.split(',');

    for (const keyword of keywords) {
      if (payload.message.includes(keyword.trim())) {
        return await postMessage({
          room,
          message: process.env.MERCH_MESSAGE,
        });
      }
    }

    const reply = await askQuestion(payload.message.replace(`@${process.env.CHAT_NAME}`, ''), room);
    const responses = reply.split('\n');

    for (const item of responses) {
      const response = item.trim();
      if (response.length > 0) {
        await postMessage({
          room,
          message: response,
        });
      }
    }
  }
};
