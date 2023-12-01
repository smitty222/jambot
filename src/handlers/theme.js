// theme.js
import { postMessage } from '../libs/cometchat.js';
import { logger } from '../utils/logging.js';

export default async (payload, room) => {
  logger.info({ sender: payload.senderName, message: payload.message });

  console.log('Entered theme.js');

  if (payload.message.startsWith('/settheme')) {
    console.log('Received /settheme command');

    const theme = payload.message.replace('/settheme', '').trim();

    console.log('Received theme:', theme);

    try {
      // Respond to the theme setting command
      await postMessage({
        room,
        message: `Theme set to: ${theme}`,
      });

      console.log('Sent response message');
    } catch (error) {
      console.error('Error posting message:', error.message);
    }
  }
};
