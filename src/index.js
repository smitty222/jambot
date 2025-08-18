// src/index.js
import 'dotenv/config';
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

// --- Adaptive poll loop (replaces setInterval) ---
const BASE_MS = 900;
const STEP_MS = 300;
const MAX_BACKOFF_STEPS = 4; // up to ~ +1200ms

function jitter(ms) {
  const delta = Math.floor(ms * 0.15); // ±15%
  return ms + (Math.floor(Math.random() * (2 * delta + 1)) - delta);
}

async function pollLoop() {
  try {
    await roomBot.processNewMessages();
  } catch (e) {
    console.error('pollLoop error:', e);
  } finally {
    const empty = roomBot._emptyPolls || 0;
    const backoffSteps = Math.min(empty, MAX_BACKOFF_STEPS);
    const delay = jitter(BASE_MS + backoffSteps * STEP_MS);
    setTimeout(pollLoop, delay);
  }
}

pollLoop(); // start

app.get('/', (req, res) => {
  res.send('Jamflow bot is alive and running!');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`));

export { roomBot };
