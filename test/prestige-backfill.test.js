import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDbPath = path.join(
  os.tmpdir(),
  `jamflowbot-prestige-backfill-${process.pid}-${Date.now()}.db`
)

process.env.DB_PATH = tmpDbPath

const { default: db } = await import('../src/database/db.js')
const { backfillHistoricalPrestigeBadges } = await import('../src/database/dbprestige.js')

const dbUnavailableReason = 'better-sqlite3 is unavailable in this environment'

function resetPrestigeBackfillTables () {
  db.exec(`
    DROP TABLE IF EXISTS prestige_badges;
    DROP TABLE IF EXISTS lottery_winners;
    DROP TABLE IF EXISTS horses;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS economy_events;

    CREATE TABLE prestige_badges (
      userUUID TEXT NOT NULL,
      badgeKey TEXT NOT NULL,
      awardedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT,
      meta TEXT,
      expiresAt TEXT,
      PRIMARY KEY (userUUID, badgeKey)
    );

    CREATE TABLE lottery_winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      displayName TEXT NOT NULL DEFAULT '',
      winningNumber INTEGER NOT NULL,
      amountWon INTEGER DEFAULT 100000,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE horses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      ownerId TEXT,
      wins INTEGER DEFAULT 0
    );

    CREATE TABLE users (
      uuid TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      balance REAL DEFAULT 0
    );

    CREATE TABLE economy_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userUUID TEXT NOT NULL,
      amount REAL NOT NULL,
      balanceAfter REAL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)
}

test.beforeEach(() => {
  resetPrestigeBackfillTables()
})

test.after(() => {
  db.close()
  try {
    fs.unlinkSync(tmpDbPath)
  } catch {
    // best-effort cleanup
  }
})

test('backfillHistoricalPrestigeBadges awards lottery, horse, and champagne history once', {
  skip: !db.available && dbUnavailableReason
}, () => {
  const insertLotteryWinner = db.prepare(`
    INSERT INTO lottery_winners (userId, nickname, displayName, winningNumber)
    VALUES (?, ?, ?, ?)
  `)
  insertLotteryWinner.run('lotto-1', '<@uid:lotto-1>', 'Lotto One', 7)
  insertLotteryWinner.run('lotto-1', '<@uid:lotto-1>', 'Lotto One', 11)
  insertLotteryWinner.run('lotto-1', '<@uid:lotto-1>', 'Lotto One', 22)
  insertLotteryWinner.run('lotto-2', '<@uid:lotto-2>', 'Lotto Two', 8)

  db.prepare('INSERT INTO horses (name, ownerId, wins) VALUES (?, ?, ?)').run('Fast One', 'horse-1', 3)
  db.prepare('INSERT INTO horses (name, ownerId, wins) VALUES (?, ?, ?)').run('Fast Two', 'horse-1', 2)
  db.prepare('INSERT INTO horses (name, ownerId, wins) VALUES (?, ?, ?)').run('New Foal', 'horse-2', 1)

  db.prepare('INSERT INTO users (uuid, nickname, balance) VALUES (?, ?, ?)').run('champagne-current', 'Champagne Current', 125000)
  db.prepare('INSERT INTO users (uuid, nickname, balance) VALUES (?, ?, ?)').run('champagne-past', 'Champagne Past', 500)
  db.prepare(`
    INSERT INTO economy_events (userUUID, amount, balanceAfter, source, category)
    VALUES (?, ?, ?, ?, ?)
  `).run('champagne-past', 150000, 150000, 'lottery', 'win')

  const firstRun = backfillHistoricalPrestigeBadges()
  assert.deepEqual(firstRun, {
    lottery_first_hit: 2,
    lottery_repeat_winner: 1,
    horse_first_winner: 2,
    horse_stable_star: 1,
    champagne: 2,
    total: 8
  })

  const badges = db.prepare(`
    SELECT userUUID, badgeKey
    FROM prestige_badges
    ORDER BY userUUID, badgeKey
  `).all()

  assert.deepEqual(badges, [
    { userUUID: 'champagne-current', badgeKey: 'champagne' },
    { userUUID: 'champagne-past', badgeKey: 'champagne' },
    { userUUID: 'horse-1', badgeKey: 'horse_first_winner' },
    { userUUID: 'horse-1', badgeKey: 'horse_stable_star' },
    { userUUID: 'horse-2', badgeKey: 'horse_first_winner' },
    { userUUID: 'lotto-1', badgeKey: 'lottery_first_hit' },
    { userUUID: 'lotto-1', badgeKey: 'lottery_repeat_winner' },
    { userUUID: 'lotto-2', badgeKey: 'lottery_first_hit' }
  ])

  assert.equal(backfillHistoricalPrestigeBadges().total, 0)
})
