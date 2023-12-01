import { postMessage } from '../libs/cometchat.js';

export default async (state, room) => {
  // Access state here
  console.log('Current state:', state); // Add this line for testing
  
  // Command logic here
  if (state && state.theme) {
    // Respond with the current theme
    await postMessage({
      room,
      message: `The current theme is: ${state.theme}`,
    });
  } else {
    // If no theme is set, notify the user
    await postMessage({
      room,
      message: 'No theme set. Use /settheme command to set a theme.',
    });
  }
};
