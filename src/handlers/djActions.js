// djActions.js
import { Bot } from "../libs/bot.js";

export async function addBotAsDj() {
  const roomBot = new Bot(process.env.JOIN_ROOM);

  try {
    // Connect the bot before calling the addDj action
    await roomBot.connect();

    // Wait for the bot to join the room
    await new Promise(resolve => setTimeout(resolve, 5000)); // Adjust the delay as needed

    // Get the room state
    const roomState = await roomBot.getSocketInstance().getRoomState(process.env.ROOM_UUID);

    // Ensure that the bot is not already a DJ
    const botIsDj = roomState.djs.some(dj => dj.userUuid === process.env.BOT_USER_UUID);
    if (!botIsDj) {
      // Send the addDj action using sendRequest
      const addDjAction = {
        name: 'addDj',
        args: {
          roomUuid: process.env.ROOM_UUID,
          userUuid: process.env.BOT_USER_UUID,
          tokenRole: 'Bot',
        },
      };

      await roomBot.getSocketInstance().sendRequest(addDjAction);

      console.log('Bot successfully added as DJ!');
      // Your additional logic here (e.g., start playing music)
    } else {
      console.log('Bot is already a DJ in the room.');
    }
  } catch (error) {
    console.error('Error adding bot as DJ:', error.message);
  }
}
