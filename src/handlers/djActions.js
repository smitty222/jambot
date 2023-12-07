// djActions.js

import { Bot } from './libs/bot.js';

export async function addBotAsDj() {
  const roomBot = new Bot(process.env.JOIN_ROOM);
  
  try {
    // Connect the bot before calling the addDj action
    await roomBot.connect();
    
    // Call the addDj action
    const result = await roomBot.getSocketInstance().actions.addDj.run({
      roomUuid: process.env.ROOM_UUID, // replace with your actual room UUID
      userUuid: process.env.BOT_USER_UUID, // replace with your bot's user UUID
      tokenRole: 'Bot', // replace with the appropriate token role for a DJ
    });

    // Check if the bot is in the list of current DJs
    const botIsDj = result.djs.some(dj => dj.userUuid === process.env.BOT_USER_UUID);

    if (botIsDj) {
      console.log('Bot successfully added as DJ!');
      // Your additional logic here (e.g., start playing music)
    } else {
      console.log('Bot was not added as DJ. Check the result for more details.');
    }
  } catch (error) {
    console.error('Error adding bot as DJ:', error.message);
  }
}
