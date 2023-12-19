import { Chain } from 'repeat'
import { Bot } from './libs/bot.js'
import { addBotAsDj } from './handlers/djActions.js';

const roomBot = new Bot(process.env.JOIN_ROOM);

// Connect the bot before configuring listeners and repeating tasks
await roomBot.connect();

// Configure listeners after the bot has connected
roomBot.configureListeners();

// Add repeated tasks after the bot has connected
const repeatedTasks = new Chain()
  .add(async () => {
    await roomBot.processNewMessages();
  })
  .every(500);

  