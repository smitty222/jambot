// src/database/db.js
import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Prefer explicit env, then Fly volume, then repo-local file
const repoDefault = path.join(__dirname, '../data/app.db')
const flyDir = '/data'

const candidates = [
  process.env.DB_PATH,                                  // e.g. /data/app.db (Fly)
  fs.existsSync(flyDir) ? path.join(flyDir, 'app.db') : null, // auto-pick /data if mounted
  repoDefault,                                          // local dev fallback
].filter(Boolean)

const DB_PATH = candidates[0]

// Ensure parent directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

// Helpful boot log to confirm which file is used in Fly logs
const source =
  process.env.DB_PATH ? 'env'
  : (DB_PATH.startsWith('/data') ? 'fly-auto' : 'repo-default')
console.log(`[db] Using ${DB_PATH} (${source})`)

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('busy_timeout = 5000')
// Enable enforcement of foreign key constraints. This ensures that
// referenced rows cannot be removed without handling dependent rows
// and improves relational integrity across the database. If a
// database created before this change already had foreign keys
// disabled, this pragma will turn them on for all new connections.
db.pragma('foreign_keys = ON')

export { DB_PATH }
export default db
