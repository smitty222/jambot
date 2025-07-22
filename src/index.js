import 'dotenv/config';
import express from 'express';
import { Bot, getCurrentDJUUIDs } from './libs/bot.js';
import { updateCurrentUsers } from './utils/currentUsers.js';
import { fetchCurrentUsers } from './utils/API.js';
import * as themeStorage from './utils/themeManager.js';
import { roomThemes } from './handlers/message.js';
import { addTrackedUser, getTrackedUsers } from './utils/trackedUsers.js';
import { pollDirectMessages } from './handlers/directmessageHandler.js';

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

const botUUID = process.env.BOT_USER_UUID;

const pollDMConversations = async () => {
  const users = getTrackedUsers();

  for (const userUUID of users) {
    try {
      const url = `https://${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io/v3/users/${userUUID}/conversation`;
      const params = new URLSearchParams({
        conversationType: 'user',
        limit: '50',
        uid: botUUID
      });

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          appid: process.env.CHAT_API_KEY,
          authtoken: process.env.CHAT_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      const messages = response.data?.data?.messages || [];

      if (messages.length > 0) {
        console.log(`Polled DM conversation with ${userUUID}, messages count: ${messages.length}`);
        // Here you can add your message processing logic per message
      }
    } catch (error) {
      console.error(`Error polling DM conversation with ${userUUID}:`, error.message);
    }
  }
};

setInterval(() => {
  pollDirectMessages()
}, 5000) // every 5 seconds

const repeatedTasks = setInterval(async () => {
  await roomBot.processNewMessages();
}, 500);

app.get('/', (req, res) => {
  res.send('Jamflow bot is alive and running!');
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () =>
  console.log(`Listening on ${port}`));


export { roomBot };
