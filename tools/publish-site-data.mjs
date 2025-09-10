// tools/publish-site-data.mjs
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import process from 'process'

const API_BASE = process.env.API_BASE
const PUBLISH_TOKEN = process.env.PUBLISH_TOKEN
const DB_PATH = process.env.DB_PATH || path.resolve('src/data/app.db')
if (!API_BASE || !PUBLISH_TOKEN) {
  console.error('[publish] Missing API_BASE or PUBLISH_TOKEN')
  process.exit(1)
}
function tryReadJson(p) { try { return JSON.parse(fs.readFileSync(p,'utf-8')) } catch { return null } }

const commands = tryReadJson(process.env.COMMANDS_JSON || 'site/commands.public.json') || []
const commands_mod = tryReadJson(process.env.COMMANDS_MOD_JSON || 'site/commands.mod.json') || []

async function postJson(pathname, payload) {
  const res = await fetch(`${API_BASE}${pathname}`, {
    method: 'POST',
    headers: { 'content-type':'application/json', 'authorization': `Bearer ${PUBLISH_TOKEN}` },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error(`${pathname} ${res.status}: ${await res.text()}`)
  return res.json()
}

async function publishCommands() {
  if (!commands.length && !commands_mod.length) return
  console.log('[publish] commands')
  await postJson('/api/publishCommands', { commands, commands_mod })
}

const DEFAULT_TABLES = []
function discoverTables(db) {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
  return rows.map(r => r.name)
}
function dumpTable(db, name) {
  try { return db.prepare(`SELECT * FROM ${name}`).all() }
  catch (e) { console.warn('[publish] skip', name, e.message); return null }
}

async function publishDb() {
  console.log('[publish] db snapshots')
  const db = new Database(DB_PATH, { readonly: true })
  const tables = {}
  for (const name of discoverTables(db)) {
    const data = dumpTable(db, name)
    if (data) tables[name] = data
  }
  const publicTables = (process.env.PUBLIC_TABLES || 'room_stats,album_stats,lottery_stats,recent_songs').split(',').map(s=>s.trim()).filter(Boolean)
  const privateOnly = (process.env.PRIVATE_ONLY || '').split(',').map(s=>s.trim()).filter(Boolean)
  await postJson('/api/publishDb', { tables, public: publicTables, privateOnly })
  db.close()
}

async function publishStats() {
  const now = new Date().toISOString()
  try { await postJson('/api/publishStats', { totals: { updatedAt: now }, topSongs: [], topAlbums: [] }) } catch {}
}

const main = async () => { await publishCommands(); await publishDb(); await publishStats(); console.log('[publish] done') }
main().catch(err => { console.error(err); process.exit(1) })
