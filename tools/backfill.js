#!/usr/bin/env node
/**
 * scripts/backfill-user-nicknames.mjs
 *
 * Backfills clean, human-friendly nicknames into:
 *   - users.nickname (primary source of truth)
 *   - lottery_winners.nickname (optional convenience for site)
 *   - craps_records.shooterNickname (optional convenience for site)
 *
 * Strategy:
 *   1) Ensure all referenced UUIDs (from winners + craps) exist in `users`.
 *   2) Find users with empty/uuid-ish nicknames.
 *   3) Fetch Turntable profiles in gentle batches using fetchUserData().
 *   4) Sanitize nickname and UPDATE `users.nickname`.
 *   5) (Optional) Fill winners/craps missing names from `users`.
 */

import db from '../src/database/db.js'
import { fetchUserData } from '../src/utils/API.js'
import { sanitizeNickname } from '../src/utils/names.js'

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

const BATCH = 25 // TT handles 25-50 comfortably; keep gentle
const PAUSE_MS = 400 // small pause between batches

// 0) Safety: make sure the core tables exist (no-ops if they already do)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uuid TEXT PRIMARY KEY,
    nickname TEXT NOT NULL DEFAULT '',
    balance REAL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS lottery_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    nickname TEXT,
    winningNumber INTEGER,
    amountWon REAL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS craps_records (
    roomId TEXT PRIMARY KEY,
    maxRolls INTEGER NOT NULL,
    shooterId TEXT,
    shooterNickname TEXT,
    achievedAt TEXT
  );
`)

// 1) Ensure all referenced UUIDs exist in `users` (seed nickname with uuid)
db.prepare(`
  INSERT OR IGNORE INTO users (uuid, nickname, balance)
  SELECT DISTINCT lw.userId, lw.userId, 0 FROM lottery_winners lw
`).run()

db.prepare(`
  INSERT OR IGNORE INTO users (uuid, nickname, balance)
  SELECT DISTINCT cr.shooterId, cr.shooterId, 0 FROM craps_records cr
  WHERE cr.shooterId IS NOT NULL AND cr.shooterId <> ''
`).run()

// 2) Find users needing hydration (nickname empty or equals uuid)
const need = db.prepare(`
  SELECT uuid
  FROM users
  WHERE nickname IS NULL OR nickname='' OR nickname = uuid
`).all()

if (need.length === 0) {
  console.log('Nothing to hydrate — all users have nicknames. ✅')
} else {
  console.log(`Users needing hydration: ${need.length}`)

  const uuids = need.map(r => r.uuid)
  let updated = 0; let attempted = 0

  for (let i = 0; i < uuids.length; i += BATCH) {
    const chunk = uuids.slice(i, i + BATCH)
    attempted += chunk.length

    try {
      const profiles = await fetchUserData(chunk) // returns array of userProfile objects (with .uuid, .nickname)
      const byId = new Map()
      for (const p of profiles || []) {
        if (p?.uuid) byId.set(p.uuid, sanitizeNickname(p.nickname))
      }

      db.transaction(() => {
        for (const id of chunk) {
          const nick = byId.get(id)
          if (nick) {
            db.prepare('UPDATE users SET nickname = ? WHERE uuid = ?').run(nick, id)
            updated++
          }
        }
      })()

      const got = [...byId.values()].filter(Boolean).length
      console.log(`Batch ${Math.floor(i / BATCH) + 1}: updated ${got}/${chunk.length}`)
    } catch (e) {
      console.error(`Batch failed (${i}-${i + chunk.length}):`, e?.message || e)
    }

    await sleep(PAUSE_MS)
  }

  console.log(`\n✅ Users hydration complete. Attempted=${attempted}, Updated=${updated}`)
}

// 3) Optional: fill missing display names in winners/craps from `users`
const fillWinners = db.prepare(`
  UPDATE lottery_winners
  SET nickname = (
    SELECT u.nickname FROM users u WHERE u.uuid = lottery_winners.userId
  )
  WHERE (nickname IS NULL OR nickname = '' OR nickname LIKE '<@uid:%>')
`).run()

const fillCraps = db.prepare(`
  UPDATE craps_records
  SET shooterNickname = (
    SELECT u.nickname FROM users u WHERE u.uuid = craps_records.shooterId
  )
  WHERE (shooterNickname IS NULL OR shooterNickname = '' OR shooterNickname LIKE '<@uid:%>')
    AND shooterId IS NOT NULL AND shooterId <> ''
`).run()

console.log(`Winners updated: ${fillWinners.changes || 0}`)
console.log(`Craps records updated: ${fillCraps.changes || 0}`)

console.log('\nAll done. 🎉')
