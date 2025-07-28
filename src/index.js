// src/index.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module version of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DEBUG: list files in src/database at startup
try {
  // index.js is in src/, so database is a sibling folder under __dirname
  const dbPath = path.join(__dirname, 'database');
  const files = fs.readdirSync(dbPath);
  console.log('🔥 Contents of src/database at runtime:', files);
} catch (err) {
  console.error('❌ Could not read src/database:', err);
}

import express from 'express';
import { Bot, getCurrentDJUUIDs } from './libs/bot.js';
import { updateCurrentUsers } from './utils/currentUsers.js';
import { fetchCurrentUsers } from './utils/API.js';
import * as themeStorage from './utils/themeManager.js';
import { roomThemes } from './handlers/message.js';
import { addTrackedUser, getTrackedUsers } from './utils/trackedUsers.js';

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

const repeatedTasks = setInterval(async () => {
  await roomBot.processNewMessages();
}, 500);

app.get('/', (req, res) => {
  res.send('Jamflow bot is alive and running!');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () =>
  console.log(`Listening on ${port}`)
);

export { roomBot };
