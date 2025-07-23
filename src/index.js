import 'dotenv/config';
import express from 'express';
import { Bot, getCurrentDJUUIDs } from './libs/bot.js';
import { updateCurrentUsers } from './utils/currentUsers.js';
import { fetchCurrentUsers } from './utils/API.js';
import * as themeStorage from './utils/themeManager.js';
import { roomThemes } from './handlers/message.js';
import { addTrackedUser, getTrackedUsers } from './utils/trackedUsers.js';
import { pollForDMs } from './libs/Cometchat/pollDMs.js';

const app = express();

const roomBot = new Bot(process.env.JOIN_ROOM);

const startupTasks = async () => {
  try {
    await roomBot.connect();
    roomBot.configureListeners();

    const currentUsers = await fetchCurrentUsers();
    console.log('Current Room Users', currentUsers);

    const currentDJs = getCurrentDJUUIDs(roomBot.state);
    console.log('Current DJs', currentDJs);

    updateCurrentUsers(currentUsers);
  } catch (error) {
    console.error('Error during bot startup:', error.message);
  }
};

startupTasks();

const savedThemes = themeStorage.loadThemes();
Object.assign(roomThemes, savedThemes);

const botUUID = process.env.BOT_USER_UUID

// Poll every 5 seconds
setInterval(() => {
  pollForDMs(botUUID)
}, 5000)

const repeatedTasks = setInterval(async () => {
  await roomBot.processNewMessages();
}, 500);

app.get('/', (req, res) => {
  res.send('Jamflow bot is alive and running!');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

console.log('🚀 NEW DEPLOYMENT APPLIED');


const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () =>
  console.log(`Listening on ${port}`));


export { roomBot };
