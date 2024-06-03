import 'dotenv/config';
import express from 'express';
import { Chain } from 'repeat';
import { Bot, getCurrentDJUUIDs } from './libs/bot.js';
import { updateCurrentUsers } from './utils/currentUsers.js';
import { fetchCurrentUsers } from './utils/API.js';

const app = express();

const roomBot = new Bot(process.env.JOIN_ROOM);

const startupTasks = async () => {
  try {
    await roomBot.connect();
    roomBot.configureListeners();
    const currentUsers = await fetchCurrentUsers(); // Fetch current room users on bot startup
    console.log('Current Room Users', currentUsers);
    const currentDJs = getCurrentDJUUIDs(roomBot.state);
    console.log('Current DJs', currentDJs);
    updateCurrentUsers(currentUsers); // Update current users
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

export { roomBot };
