import express from 'express';
import { Chain } from 'repeat';
import { Bot } from './libs/bot.js';

const app = express(); // Create an instance of Express application

const roomBot = new Bot(process.env.JOIN_ROOM);

await roomBot.connect();

roomBot.configureListeners();

const repeatedTasks = new Chain()
  .add(async () => {
    await roomBot.processNewMessages();
  })
  .every(500);

// Get the port from the environment variable or default to 3000
const PORT = process.env.PORT || 3000;

// Start listening on the specified port
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export { roomBot };
