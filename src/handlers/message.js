import { postMessage } from '../libs/cometchat.js';
import { askQuestion } from '../libs/ai.js';
import { logger } from '../utils/logging.js';

// Store to keep track of themes
const roomThemes = {};

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

      // "HELLO"
  } else if (payload.message.startsWith('/hello')) {
    await postMessage({
       room,
      message: 'Hi!'
    });

      // "BERAD"
  } else if (payload.message.startsWith('/berad')) {
    await postMessage({
      room,
      message: '@BeRad is the raddest guy in town'
    });

      // "CAM"
  } else if (payload.message.startsWith('/cam')) {
    await postMessage({
      room,
      message: '@Cam i love you'
    });
  }

  // "/ THEME COMMANDS"
  else if (payload.message.startsWith('/settheme')) {
    // Extract theme from the command
    const theme = payload.message.replace('/settheme', '').trim();

    // Store the theme for the room
    roomThemes[room] = theme;

    await postMessage({
      room,
      message: `Theme set to: ${theme}`
    });
  } else if (payload.message.startsWith('/gettheme')) {
    // Retrieve and post the theme for the room
    const theme = roomThemes[room];
    if (theme) {
      await postMessage({
        room,
        message: `Current theme: ${theme}`
      });
    } else {
      await postMessage({
        room,
        message: 'No theme set.'
      });
    }
  } else if (payload.message.startsWith('/removetheme')) {
    // Remove the theme for the room
    delete roomThemes[room];

    await postMessage({
      room,
      message: 'Theme removed.'
    });
  }
}

