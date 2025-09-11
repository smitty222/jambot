// tools/publish-site-data.mjs
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import process from 'process';
import publishDbSnapshot from './publishSnapshot.js';

const API_BASE = process.env.API_BASE;
const PUBLISH_TOKEN = process.env.PUBLISH_TOKEN;
const DB_PATH = process.env.DB_PATH || path.resolve('src/data/app.db');

if (!API_BASE || !PUBLISH_TOKEN) {
  console.error('[publish] Missing API_BASE or PUBLISH_TOKEN');
  process.exit(1);
}
console.log('[publish] DB_PATH:', DB_PATH);

function tryReadJson(p) { try { return JSON.parse(fs.readFileSync(p,'utf-8')); } catch { return null; } }

const commands = tryReadJson(process.env.COMMANDS_JSON || 'site/commands.public.json') || [];
const commands_mod = tryReadJson(process.env.COMMANDS_MOD_JSON || 'site/commands.mod.json') || [];

async function postJson(pathname, payload) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type':'application/json', 'authorization': `Bearer ${PUBLISH_TOKEN}` },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function publishCommands() {
  if (!commands.length && !commands_mod.length) return;
  console.log('[publish] commands');
  await postJson('/api/publishCommands', { commands, commands_mod });
}

async function publishDb() {
  console.log('[publish] db snapshots');
  const db = new Database(DB_PATH, { readonly: true });
  try {
    // Build curated public views + mirror all raw tables for mod
    let lastPublic = [];
    await publishDbSnapshot({
      db,
      havePublishConfig: () => true,
      logger: { 
        log: (...a) => { 
          console.log(...a);
          // try to capture view list from publishDbSnapshot log (optional)
        },
        warn: (...a) => console.warn(...a)
      },
      // Shim postJson so we can ensure both 'public' and 'publicTables' are sent
      postJson: async (pathname, payload) => {
        if (pathname === '/api/publishDb') {
          const { tables, public: pubList = [], privateOnly = [] } = payload || {};
          lastPublic = pubList;
          return postJson('/api/publishDb', {
            tables,
            public: pubList,
            publicTables: pubList,   // <— compatibility with older Worker
            privateOnly
          });
        }
        return postJson(pathname, payload);
      }
    });
  } finally {
    db.close();
  }
}

async function publishStats() {
  const now = new Date().toISOString();
  try { await postJson('/api/publishStats', { totals: { updatedAt: now }, topSongs: [], topAlbums: [] }); } catch {}
}

const main = async () => {
  await publishCommands();
  await publishDb();
  await publishStats();
  console.log('[publish] done');
};
main().catch(err => { console.error(err); process.exit(1); });
