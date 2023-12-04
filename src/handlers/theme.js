import { postMessage } from '../libs/cometchat.js';

export default async (payload, room) => {
  // Check if the message is a command to set the theme
  if (payload.message.startsWith('/settheme')) {
    // Extract the theme from the command
    const theme = payload.message.replace('/settheme', '').trim();

    // Perform any logic or validation related to the theme if needed

    // Set the theme (for example, storing it in a variable or database)
    // ...

    // Respond to the user
    await postMessage({
      room,
      message: `Theme set to: ${theme}`
    });
  }
};
