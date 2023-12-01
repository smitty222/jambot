// handlers/theme.js
export default async (payload, room, bot) => {
  try {
    console.log('Received theme command:', payload.message);

    if (payload.message.startsWith('/settheme')) {
      // Extract the new theme from the command
      const newTheme = payload.message.replace('/settheme', '').trim();

      console.log('Setting new theme:', newTheme);

      // Set the new theme
      bot.currentTheme = newTheme;

      // Respond with a confirmation message
      await postMessage({
        room,
        message: `Theme set to: ${newTheme}`
      });
    } else if (payload.message.startsWith('/gettheme')) {
      // Respond with the current theme
      console.log('Getting current theme:', bot.currentTheme);

      await postMessage({
        room,
        message: `Current Theme: ${bot.currentTheme}`
      });
    }
  } catch (error) {
    console.error('Error in theme handler:', error);
  }
};
