// handlers/theme.js
export default async (payload, room) => {
    if (payload.message.startsWith('/settheme')) {
      // Extract the new theme from the command
      const newTheme = payload.message.replace('/settheme', '').trim();
  
      // Set the new theme
      this.currentTheme = newTheme;
  
      // Respond with a confirmation message
      await postMessage({
        room,
        message: `Theme set to: ${newTheme}`
      });
    } else if (payload.message.startsWith('/gettheme')) {
      // Respond with the current theme
      await postMessage({
        room,
        message: `Current Theme: ${this.currentTheme}`
      });
    }
  };