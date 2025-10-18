// tools/publishSnapshot.js
// Safer raw snapshot publisher for low-RAM Fly instances.
// - Mirrors ONLY allowlisted tables to avoid OOM.
// - Can be run as a CLI or imported and used programmatically.

import fs from 'fs/promises'
import path from 'path'
import Database from 'better-sqlite3'
import url from 'url'

// ---------------------------
// Environment/config
// ---------------------------
const DB_PATH = process.env.DB_PATH || '/data/app.db'
const OUTPUT_DIR = process.env.OUTPUT_DIR || '/data/app'     // where to write JSON
const OUTPUT_FILE = process.env.OUTPUT_FILE || 'db_raw.json' // filename inside OUTPUT_DIR
const PRETTY = process.env.PUBLISH_JSON_PRETTY === '1'

// Comma-separated list of tables to mirror. Keep this tight to avoid memory spikes.
const RAW_TABLE_ALLOWLIST = (process.env.RAW_TABLE_ALLOWLIST || [
  'users',
  'wallets',
  'lottery_winners',
  'lottery_stats',
  'dj_queue',
  'themes',
  'jackpot',
  'horses',
  'avatars',
  'current_state',
  'craps_records'
].join(','))
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// ---------------------------
// Helpers
// ---------------------------
function ensureDir (dir) {
  return fs.mkdir(dir, { recursive: true })
}

function getAllTableNames (db) {
  // We only use this for existence/validation if needed.
  const stmt = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `)
  return stmt.all().map(r => r.name)
}

function dumpTableAll (db, name) {
  try {
    return db.prepare(`SELECT * FROM "${name}"`).all()
  } catch (e) {
    console.warn(`[publish-snapshot] skip "${name}": ${e.message}`)
    return null
  }
}

// Small utility to reduce risk of accidental huge payloads.
// If a table explodes in size later, we can cap rows via env.
function maybeCapRows (rows, name) {
  const capCfg = process.env.RAW_TABLE_ROW_CAPS || '' // e.g. "users:20000,lottery_winners:10000"
  if (!capCfg) return rows
  const caps = Object.fromEntries(capCfg
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(pair => {
      const [tbl, capStr] = pair.split(':').map(x => x.trim())
      return [tbl, Number(capStr || '0')]
    }))
  const cap = caps[name]
  if (cap && rows.length > cap) {
    console.warn(`[publish-snapshot] table "${name}" capped at ${cap} rows (had ${rows.length})`)
    return rows.slice(0, cap)
  }
  return rows
}

// ---------------------------
// Core
// ---------------------------
export function buildRawSnapshot (db) {
  const existingTables = new Set(getAllTableNames(db))
  const chosen = RAW_TABLE_ALLOWLIST.filter(t => {
    if (!existingTables.has(t)) {
      console.warn(`[publish-snapshot] allowlisted table "${t}" does not exist; skipping`)
      return false
    }
    return true
  })

  const out = {}
  for (const name of chosen) {
    const rows = dumpTableAll(db, name)
    if (!rows) continue
    out[name] = maybeCapRows(rows, name)
  }
  return out
}

export async function writeRawSnapshotToDisk ({
  dbPath = DB_PATH,
  outputDir = OUTPUT_DIR,
  outputFile = OUTPUT_FILE
} = {}) {
  const started = Date.now()
  const db = new Database(dbPath, { readonly: true })
  try {
    const payload = buildRawSnapshot(db)
    await ensureDir(outputDir)

    const full = path.join(outputDir, outputFile)
    const body = PRETTY ? JSON.stringify(payload, null, 2) : JSON.stringify(payload)
    await fs.writeFile(full, body, 'utf8')

    const kb = Math.round(Buffer.byteLength(body, 'utf8') / 1024)
    console.log(`[publish-snapshot] wrote ${outputFile} (${kb} KB) in ${Date.now() - started} ms`)
    return { path: full, bytes: Buffer.byteLength(body, 'utf8'), tables: Object.keys(payload).length }
  } finally {
    db.close()
  }
}

// ---------------------------
// CLI support
// ---------------------------
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  // Usage:
  //   node tools/publishSnapshot.js
  // Env:
  //   DB_PATH=/data/app.db OUTPUT_DIR=/data/app RAW_TABLE_ALLOWLIST="users,lottery_winners"
  writeRawSnapshotToDisk().catch(err => {
    console.error('[publish-snapshot] ERROR:', err)
    process.exitCode = 1
  })
}
