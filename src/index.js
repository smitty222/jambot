import express from 'express';
import { Chain } from 'repeat';
import { Bot } from './libs/bot.js';

const app = express(); 

const roomBot = new Bot(process.env.JOIN_ROOM);

const startupTasks = async () => {
  try {
    await roomBot.connect();
    roomBot.configureListeners();
    await roomBot.storeCurrentRoomUsers(); // Fetch and store current room users on bot startup
  } catch (error) {
    console.error('Error during bot startup:', error.message);
  }
};

startupTasks();

const repeatedTasks = new Chain()
  .add(async () => {
    await roomBot.processNewMessages();
  })
  .every(500);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

export { roomBot };
