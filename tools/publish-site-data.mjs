// tools/publish-site-data.mjs
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import process from 'process';
import {publishDbSnapshot} from './publishSnapshot.js';

// ── Resolve API + auth ───────────────────────────────────────
const API_BASE = process.env.API_BASE;
const PUBLISH_TOKEN = process.env.PUBLISH_TOKEN;

// ── Resolve DB path robustly (prefer Fly volume) ─────────────
const FLY_DATA_DIR = '/data';
const RESOLVED_DB_PATH =
  process.env.DB_PATH
  || (fs.existsSync(FLY_DATA_DIR) ? path.join(FLY_DATA_DIR, 'app.db') : path.resolve('src/data/app.db'));

// make it visible to anything we import
process.env.DB_PATH = RESOLVED_DB_PATH;
console.log('[publish] Using DB_PATH =', process.env.DB_PATH);

// Ensure schema/migrations are loaded for this process too
// (IMPORTANT: path must match actual file name exactly on Linux)
await import(new URL('../src/database/initdb.js', import.meta.url));

// ── Cooldowns ────────────────────────────────────────────────
const COOLDOWN_MINUTES_DB       = Number(process.env.PUBLISH_DB_EVERY_MIN    || 240);
const COOLDOWN_MINUTES_COMMANDS = Number(process.env.PUBLISH_CMDS_EVERY_MIN  || 240);
const COOLDOWN_MINUTES_STATS    = Number(process.env.PUBLISH_STATS_EVERY_MIN || 240);
const COOLDOWN_MINUTES_SITEDATA = Number(process.env.PUBLISH_SITEDATA_EVERY_MIN || 10);

// Persist state on the volume so cooldowns survive restarts
const STATE_FILE = process.env.PUBLISH_STATE_FILE
  || (fs.existsSync(FLY_DATA_DIR) ? path.join(FLY_DATA_DIR, '.publish-state.json') : path.resolve('.publish-state.json'));

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return { last: {} }; }
}
function saveState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
}
function minutesSince(ts) {
  if (!ts) return Infinity;
  const diffMs = Date.now() - new Date(ts).getTime();
  return diffMs / 60000;
}

function tryReadJson(p) { try { return JSON.parse(fs.readFileSync(p,'utf-8')); } catch { return null; } }
const commands     = tryReadJson(process.env.COMMANDS_JSON     || 'site/commands.public.json') || [];
const commands_mod = tryReadJson(process.env.COMMANDS_MOD_JSON || 'site/commands.mod.json')    || [];

async function postJson(pathname, payload) {
  if (!API_BASE || !PUBLISH_TOKEN) {
    throw new Error('Missing API_BASE or PUBLISH_TOKEN');
  }
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type':'application/json', 'authorization': `Bearer ${PUBLISH_TOKEN}` },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Publish: Commands ────────────────────────────────────────
async function publishCommands(state) {
  if (!commands.length && !commands_mod.length) return;
  if (minutesSince(state.last?.commands) < COOLDOWN_MINUTES_COMMANDS) {
    console.log('[publish] commands skipped (cooldown)'); return;
  }
  const nextHash = JSON.stringify([commands, commands_mod]);
  if (state.last?.commandsHash === nextHash) {
    console.log('[publish] commands unchanged; skipped');
    state.last.commands = new Date().toISOString(); saveState(state); return;
  }
  console.log('[publish] commands');
  await postJson('/api/publishCommands', { commands, commands_mod });
  state.last.commands = new Date().toISOString();
  state.last.commandsHash = nextHash; saveState(state);
}

// ── Publish: Per-table DB mirrors ────────────────────────────
async function publishDb(state) {
  if (minutesSince(state.last?.db) < COOLDOWN_MINUTES_DB) {
    console.log('[publish] db skipped (cooldown)'); return;
  }
  console.log('[publish] db snapshots from', process.env.DB_PATH);
  const db = new Database(process.env.DB_PATH, { readonly: true });
  try {
    await publishDbSnapshot({
      db,
      havePublishConfig: () => true,
      logger: console,
      postJson: async (pathname, payload) => postJson(pathname, payload)
    });
    state.last.db = new Date().toISOString(); saveState(state);
  } finally { db.close(); }
}

// ── Publish: Stats (placeholder) ─────────────────────────────
async function publishStats(state) {
  if (minutesSince(state.last?.stats) < COOLDOWN_MINUTES_STATS) {
    console.log('[publish] stats skipped (cooldown)'); return;
  }
  const now = new Date().toISOString();
  try {
    await postJson('/api/publishStats', { totals: { updatedAt: now }, topSongs: [], topAlbums: [] });
    state.last.stats = now; saveState(state);
  } catch (e) { console.warn('[publish] stats failed:', e?.message || e); }
}

// ── Publish: siteData snapshot ───────────────────────────────
function fill1toN(list, n, toKey = x => x.number, toVal = x => x.count) {
  const map = new Map(list.map(x => [Number(toKey(x)), Number(toVal(x)) || 0]));
  const out = []; for (let i = 1; i <= n; i++) out.push({ number: i, count: map.get(i) ?? 0 }); return out;
}
async function publishSiteData(state) {
  if (minutesSince(state.last?.siteData) < COOLDOWN_MINUTES_SITEDATA) {
    console.log('[publish] siteData skipped (cooldown)'); return;
  }
  console.log('[publish] siteData snapshot from', process.env.DB_PATH);
  const db = new Database(process.env.DB_PATH, { readonly: true });
  try {
    const lotteryRows = db.prepare(`SELECT number, count FROM lottery_stats ORDER BY number ASC`).all();
    const lotteryStats = fill1toN(lotteryRows || [], 99, r => r.number, r => r.count);
    const snapshot = {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      lottery: { stats: lotteryStats }
    };
    await postJson('/api/siteData', snapshot);
    state.last.siteData = snapshot.updatedAt; saveState(state);
  } finally { db.close(); }
}

// ── Main ─────────────────────────────────────────────────────
const main = async () => {
  const state = loadState();
  await publishCommands(state);
  await publishDb(state);
  await publishStats(state);
  await publishSiteData(state);
  console.log('[publish] done');
};

main().catch(err => { console.error('[publish] ERROR:', err); process.exit(1); });
