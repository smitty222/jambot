// src/handlers/theme.js
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

import { postMessage } from '../libs/cometchat.js';
import { isUserAuthorized, updateRoomInfo } from '../utils/API.js';

const ROOM         = process.env.ROOM_UUID;
const DB_FILE      = process.env.DB_FILE || './mydb.sqlite';
const DEFAULT      = 'Just Jam';
const TTL_TOKEN    = process.env.TTL_USER_TOKEN;

// map of theme keys → room‐update payloads
const THEME_CONFIGS = [
  { keys: ['albums','album monday','album day'], payload: { design: 'FERRY_BUILDING', numberOfDjs: 1 } },
  { keys: ['covers','cover friday'],                payload: { design: 'FESTIVAL',        numberOfDjs: 4 } },
  { keys: ['country'],                               payload: { design: 'BARN',            numberOfDjs: 4 } },
  { keys: ['rock'],                                  payload: { design: 'UNDERGROUND',     numberOfDjs: 4 } },
  { keys: ['happy hour'],                            payload: { design: 'TOMORROWLAND',    numberOfDjs: 5 } },
  { keys: ['rap','club'],                            payload: { design: 'CLUB',            numberOfDjs: 4 } },
  { keys: ['name game'],                             payload: { design: 'FESTIVAL',        numberOfDjs: 5 } },
  { keys: ['dark'],                                  payload: { design: 'CHAT_ONLY',       numberOfDjs: 5 } },
];

// open (and bootstrap) the DB once
const dbPromise = open({
  filename: DB_FILE,
  driver: sqlite3.Database
}).then(async db => {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      roomId TEXT PRIMARY KEY,
      theme  TEXT
    );
  `);
  return db;
});

function normalizeTheme(raw) {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function findRoomUpdatePayload(theme) {
  const lower = theme.toLowerCase();
  for (const cfg of THEME_CONFIGS) {
    if (cfg.keys.includes(lower)) return cfg.payload;
  }
  return null;
}

export async function handleThemeCommand({ sender, room = ROOM, message }) {
  const db = await dbPromise;
  const parts = message.trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();

  try {
    if (cmd === '/theme') {
      const row   = await db.get(`SELECT theme FROM themes WHERE roomId = ?`, [room]);
      const theme = row?.theme || DEFAULT;
      return await postMessage({
        room,
        message: `🎨 Current theme: **${theme}**`
      });
    }

    if (cmd === '/settheme') {
      if (!(await isUserAuthorized(sender, TTL_TOKEN))) {
        return await postMessage({ room, message: '🔒 Moderator only.' });
      }
      const raw = parts.slice(1).join(' ').trim();
      if (!raw) {
        return await postMessage({ room, message: '❗ Usage: `/settheme <theme name>`' });
      }
      const theme = normalizeTheme(raw);

      await db.run(
        `INSERT INTO themes(roomId, theme) VALUES(?, ?)
         ON CONFLICT(roomId) DO UPDATE SET theme = excluded.theme;`,
        [room, theme]
      );

      const payload = findRoomUpdatePayload(theme);
      if (payload) {
        await updateRoomInfo(payload);
      }

      return await postMessage({
        room,
        message: `✅ Theme set to: **${theme}**`
      });
    }

    if (cmd === '/removetheme') {
      if (!(await isUserAuthorized(sender, TTL_TOKEN))) {
        return await postMessage({ room, message: '🔒 Moderator only.' });
      }

      await db.run(
        `INSERT INTO themes(roomId, theme) VALUES(?, ?)
         ON CONFLICT(roomId) DO UPDATE SET theme = excluded.theme;`,
        [room, DEFAULT]
      );

      await updateRoomInfo({ design: 'YACHT', numberOfDjs: 3 });

      return await postMessage({
        room,
        message: `♻️ Theme reset to default: **${DEFAULT}**`
      });
    }
  } catch (err) {
    console.error('[theme] handler error:', err);
    return await postMessage({
      room,
      message: '⚠️ Something went wrong. Please try again later.'
    });
  }
}
