// src/handlers/theme.js
import db from '../database/db.js';
import { postMessage } from '../libs/cometchat.js';
import { isUserAuthorized, updateRoomInfo } from '../utils/API.js';

const ROOM      = process.env.ROOM_UUID;
const DEFAULT   = 'Just Jam';
const TTL_TOKEN = process.env.TTL_USER_TOKEN;

// map of theme keys → room‐update payloads
const THEME_CONFIGS = [
  { keys: ['albums','album monday','album day'], payload: { design: 'FERRY_BUILDING', numberOfDjs: 1 } },
  { keys: ['covers','cover friday'],             payload: { design: 'FESTIVAL',        numberOfDjs: 4 } },
  { keys: ['country'],                            payload: { design: 'BARN',            numberOfDjs: 4 } },
  { keys: ['rock'],                               payload: { design: 'UNDERGROUND',     numberOfDjs: 4 } },
  { keys: ['happy hour'],                         payload: { design: 'TOMORROWLAND',    numberOfDjs: 5 } },
  { keys: ['rap','club'],                         payload: { design: 'CLUB',            numberOfDjs: 4 } },
  { keys: ['name game'],                          payload: { design: 'FESTIVAL',        numberOfDjs: 5 } },
  { keys: ['dark'],                               payload: { design: 'CHAT_ONLY',       numberOfDjs: 5 } },
];

function normalizeTheme(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function findRoomUpdatePayload(theme) {
  const lower = String(theme || '').toLowerCase();
  for (const cfg of THEME_CONFIGS) {
    if (cfg.keys.includes(lower)) return cfg.payload;
  }
  return null;
}

export async function handleThemeCommand({ sender, room = ROOM, message }) {
  try {
    // sanity log: ensure we’re using the same DB file as the rest of the app
    try {
      const dbList = db.prepare('PRAGMA database_list').all();
      console.log('[theme] DB attached:', dbList);
    } catch (_) {}

    const parts = (message || '').trim().split(/\s+/);
    const cmd   = parts[0]?.toLowerCase();

    if (cmd === '/theme') {
      const row   = db.prepare(`SELECT theme FROM themes WHERE roomId = ?`).get(room);
      const theme = row?.theme || DEFAULT;
      return await postMessage({ room, message: `🎨 Current theme: **${theme}**` });
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

      db.prepare(
        `INSERT INTO themes(roomId, theme) VALUES(?, ?)
         ON CONFLICT(roomId) DO UPDATE SET theme = excluded.theme;`
      ).run(room, theme);

      // read-back for log
      const confirm = db.prepare(`SELECT theme FROM themes WHERE roomId = ?`).get(room);
      console.log('[theme] settheme -> stored:', confirm);

      const payload = findRoomUpdatePayload(theme);
      if (payload) {
        try { await updateRoomInfo(payload); }
        catch (e) { console.warn('[theme] updateRoomInfo failed (non-fatal):', e?.message || e); }
      }

      return await postMessage({ room, message: `✅ Theme set to: **${theme}**` });
    }

    if (cmd === '/removetheme') {
      if (!(await isUserAuthorized(sender, TTL_TOKEN))) {
        return await postMessage({ room, message: '🔒 Moderator only.' });
      }

      db.prepare(
        `INSERT INTO themes(roomId, theme) VALUES(?, ?)
         ON CONFLICT(roomId) DO UPDATE SET theme = excluded.theme;`
      ).run(room, DEFAULT);

      try { await updateRoomInfo({ design: 'YACHT', numberOfDjs: 3 }); }
      catch (e) { console.warn('[theme] updateRoomInfo failed (non-fatal):', e?.message || e); }

      return await postMessage({ room, message: `♻️ Theme reset to default: **${DEFAULT}**` });
    }
  } catch (err) {
    console.error('[theme] handler error:', err);
    return await postMessage({ room, message: '⚠️ Something went wrong. Please try again later.' });
  }
}
