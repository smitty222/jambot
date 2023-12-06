import { postMessage } from '../libs/cometchat.js';
import { askQuestion } from '../libs/ai.js';
import { logger } from '../utils/logging.js';

// Store to keep track of themes
const roomThemes = {};


// AI CHAT STUFF
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
    try {
      // Fetch user roles for the room with authorization header
      const userRolesResponse = await fetch(`https://rooms.prod.tt.fm/roomUserRoles/just-jams`, {
        headers: {
          Authorization: `Bearer ${process.env.TTL_USER_TOKEN}`,
        },
      });
  
      if (!userRolesResponse.ok) {
        const errorMessage = await userRolesResponse.text();
        console.error('User Roles Response Error:', errorMessage);
        throw new Error(`User Roles request failed with status ${userRolesResponse.status}`);
      }
  
      const userRolesData = await userRolesResponse.json();
      const userRoles = Array.isArray(userRolesData) ? userRolesData : [];
  
      // Check if user is a moderator or owner
      const allowedRoles = ['moderator', 'owner'];
      const userRole = userRoles.find(role => role.userUuid === payload.sender)?.role;
  
      if (allowedRoles.includes(userRole)) {
        // Extract theme from the command
        const theme = payload.message.replace('/settheme', '').trim();
  
        // Store the theme for the room
        roomThemes[room] = theme;
  
        await postMessage({
          room,
          message: `Theme set to: ${theme}`
        });
      } else {
        await postMessage({
          room,
          message: 'You need to be a moderator or owner to execute this command.'
        });
      }
    } catch (error) {
      console.error('Error fetching user roles:', error.message);
      await postMessage({
        room,
        message: 'An error occurred while fetching user roles. Please try again.'
      });
    }
    
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
    try {
      // Fetch user roles for the room with authorization header
      const userRolesResponse = await fetch(`https://rooms.prod.tt.fm/roomUserRoles/just-jams`, {
        headers: {
          Authorization: `Bearer ${process.env.TTL_USER_TOKEN}`,
        },
      });
  
      if (!userRolesResponse.ok) {
        const errorMessage = await userRolesResponse.text();
        console.error('User Roles Response Error:', errorMessage);
        throw new Error(`User Roles request failed with status ${userRolesResponse.status}`);
      }
  
      const userRolesData = await userRolesResponse.json();
      const userRoles = Array.isArray(userRolesData) ? userRolesData : [];
  
      // Check if user is a moderator or owner
      const allowedRoles = ['moderator', 'owner'];
      const userRole = userRoles.find(role => role.userUuid === payload.sender)?.role;
  
      if (allowedRoles.includes(userRole)) {
        // Remove the theme for the room
        delete roomThemes[room];
  
        await postMessage({
          room,
          message: 'Theme removed.'
        });
      } else {
        await postMessage({
          room,
          message: 'You need to be a moderator or owner to execute this command.'
        });
      }
    } catch (error) {
      console.error('Error fetching user roles:', error.message);
      await postMessage({
        room,
        message: 'An error occurred while fetching user roles. Please try again.'
      });
    }
  }
  
  }


