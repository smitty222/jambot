import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDbPath = path.join(
  os.tmpdir(),
  `jamflowbot-feature-${process.pid}-${Date.now()}.db`
)

process.env.DB_PATH = tmpDbPath

const { default: db } = await import('../src/database/db.js')

const dbUnavailableReason = 'better-sqlite3 is unavailable in this environment'

function bootstrapSlotsModulePrereqs () {
  db.prepare('DROP TABLE IF EXISTS jackpot').run()
  db.prepare(`
    CREATE TABLE jackpot (
      id INTEGER PRIMARY KEY,
      progressiveJackpot REAL NOT NULL
    )
  `).run()
  db.prepare('INSERT INTO jackpot (id, progressiveJackpot) VALUES (1, 100)').run()
}

bootstrapSlotsModulePrereqs()

const { handleSlotsCommand } = await import('../src/handlers/slots.js')
const { syncWalletBalanceFromDb, getLifetimeNet } = await import('../src/database/dbwalletmanager.js')

function resetTestTables () {
  db.prepare('DROP TABLE IF EXISTS economy_events').run()
  db.prepare('DROP TABLE IF EXISTS users').run()
  db.prepare('DROP TABLE IF EXISTS jackpot').run()
  db.prepare('DROP TABLE IF EXISTS slot_feature_sessions').run()
  db.prepare('DROP TABLE IF EXISTS slot_bonus_sessions').run()
  db.prepare('DROP TABLE IF EXISTS slot_collections').run()
  db.prepare('DROP TABLE IF EXISTS slot_jackpot_contributions').run()
  db.prepare('DROP TABLE IF EXISTS app_settings').run()
  db.prepare('DROP TABLE IF EXISTS prestige_profiles').run()
  db.prepare('DROP TABLE IF EXISTS prestige_titles').run()
  db.prepare('DROP TABLE IF EXISTS prestige_badges').run()

  db.prepare(`
    CREATE TABLE users (
      uuid TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      lifetime_net REAL NOT NULL DEFAULT 0,
      nicknameUpdatedAt TEXT
    )
  `).run()

  db.prepare(`
    CREATE TABLE economy_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userUUID TEXT NOT NULL,
      amount REAL NOT NULL,
      balanceAfter REAL,
      source TEXT,
      category TEXT,
      note TEXT,
      metadata TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  db.prepare(`
    CREATE TABLE jackpot (
      id INTEGER PRIMARY KEY,
      progressiveJackpot REAL NOT NULL
    )
  `).run()
  db.prepare('INSERT INTO jackpot (id, progressiveJackpot) VALUES (1, 100)').run()

  db.prepare(`
    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE prestige_badges (
      userUUID TEXT NOT NULL,
      badgeKey TEXT NOT NULL,
      awardedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT,
      meta TEXT,
      expiresAt TEXT,
      PRIMARY KEY (userUUID, badgeKey)
    )
  `).run()

  db.prepare(`
    CREATE TABLE prestige_titles (
      userUUID TEXT NOT NULL,
      titleKey TEXT NOT NULL,
      awardedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      source TEXT,
      meta TEXT,
      expiresAt TEXT,
      PRIMARY KEY (userUUID, titleKey)
    )
  `).run()

  db.prepare(`
    CREATE TABLE prestige_profiles (
      userUUID TEXT PRIMARY KEY,
      equippedTitleKey TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  db.prepare(`
    CREATE TABLE slot_collections (
      userUUID TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE slot_bonus_sessions (
      userUUID TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE slot_feature_sessions (
      userUUID TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `).run()

  db.prepare(`
    CREATE TABLE slot_jackpot_contributions (
      userUUID TEXT PRIMARY KEY,
      lifetimeContributed REAL NOT NULL DEFAULT 0,
      effectiveContributed REAL NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL
    )
  `).run()
}

function saveFeatureSession (userUUID, data) {
  db.prepare(`
    INSERT INTO slot_feature_sessions (userUUID, data, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(userUUID) DO UPDATE SET
      data = excluded.data,
      updatedAt = excluded.updatedAt
  `).run(userUUID, JSON.stringify(data), new Date().toISOString())
}

function readFeatureSession (userUUID) {
  const row = db.prepare('SELECT data FROM slot_feature_sessions WHERE userUUID = ?').get(userUUID)
  return row?.data ? JSON.parse(row.data) : null
}

function readBonusSession (userUUID) {
  const row = db.prepare('SELECT data FROM slot_bonus_sessions WHERE userUUID = ?').get(userUUID)
  return row?.data ? JSON.parse(row.data) : null
}

function getEventSummary (userUUID) {
  return db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS net
    FROM economy_events
    WHERE userUUID = ?
  `).get(userUUID)
}

function withMockedRandom (values, fn) {
  const original = Math.random
  const queue = [...values]
  Math.random = () => (queue.length > 0 ? queue.shift() : 0)

  try {
    return fn()
  } finally {
    Math.random = original
  }
}

async function withSilencedConsoleError (fn) {
  const original = console.error
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.error = original
  }
}

test.beforeEach(() => {
  resetTestTables()
})

test.after(() => {
  db.close()
  try {
    fs.unlinkSync(tmpDbPath)
  } catch {
    // best-effort cleanup
  }
})

test('feature payout spin commits wallet + ledger + session completion atomically', {
  skip: !db.available && dbUnavailableReason
}, async () => {
  const userUUID = 'user-feature-payout'
  assert.equal(syncWalletBalanceFromDb(userUUID), 50)

  saveFeatureSession(userUUID, {
    spinsLeft: 1,
    spinsTotal: 1,
    totalWon: 0,
    startedAt: new Date().toISOString(),
    jackpotBonusUsed: true
  })

  const response = await withMockedRandom([0.6, 0.6, 0.6], async () => {
    return await handleSlotsCommand(userUUID, 'free')
  })

  assert.match(response, /FEATURE WIN/)
  assert.match(response, /TOTAL FEATURE WINS/)
  assert.equal(readFeatureSession(userUUID), null)

  const balance = syncWalletBalanceFromDb(userUUID)
  const lifetime = getLifetimeNet(userUUID)
  const events = getEventSummary(userUUID)

  assert.equal(balance, 6650)
  assert.equal(lifetime, 6600)
  assert.equal(Number(events.count), 1)
  assert.equal(Number(events.net), 6600)
})

test('feature triple-diamond bonus trigger commits paused feature + bonus session atomically', {
  skip: !db.available && dbUnavailableReason
}, async () => {
  const userUUID = 'user-feature-bonus'
  assert.equal(syncWalletBalanceFromDb(userUUID), 50)
  db.prepare('UPDATE jackpot SET progressiveJackpot = ? WHERE id = 1').run(12345)

  saveFeatureSession(userUUID, {
    spinsLeft: 2,
    spinsTotal: 2,
    totalWon: 100,
    startedAt: new Date().toISOString(),
    jackpotBonusUsed: false
  })

  const response = await withMockedRandom([0.8, 0.8, 0.8, 0.0], async () => {
    return await handleSlotsCommand(userUUID, 'free')
  })

  assert.match(response, /JACKPOT BONUS TRIGGERED/)

  const featureSession = readFeatureSession(userUUID)
  const bonusSession = readBonusSession(userUUID)
  const events = getEventSummary(userUUID)

  assert.equal(featureSession.spinsLeft, 2)
  assert.equal(featureSession.spinsTotal, 2)
  assert.equal(featureSession.totalWon, 100)
  assert.equal(featureSession.jackpotBonusUsed, true)

  assert.equal(bonusSession.spinsTotal, 3)
  assert.equal(bonusSession.spinsLeft, 3)
  assert.equal(bonusSession.lockedJackpot, 12345)

  assert.equal(syncWalletBalanceFromDb(userUUID), 50)
  assert.equal(getLifetimeNet(userUUID), 0)
  assert.equal(Number(events.count), 0)
  assert.equal(Number(events.net), 0)
})

test('feature settlement rollback leaves wallet and sessions unchanged on forced write failure', {
  skip: !db.available && dbUnavailableReason
}, async () => {
  const userUUID = 'user-feature-rollback'
  assert.equal(syncWalletBalanceFromDb(userUUID), 50)

  saveFeatureSession(userUUID, {
    spinsLeft: 2,
    spinsTotal: 2,
    totalWon: 0,
    startedAt: new Date().toISOString(),
    jackpotBonusUsed: true
  })

  db.prepare(`
    CREATE TRIGGER fail_feature_session_upsert
    BEFORE INSERT ON slot_feature_sessions
    BEGIN
      SELECT RAISE(ABORT, 'forced_feature_session_write_fail');
    END;
  `).run()

  const response = await withSilencedConsoleError(async () => {
    return await withMockedRandom([0.6, 0.6, 0.6], async () => {
      return await handleSlotsCommand(userUUID, 'free')
    })
  })

  assert.equal(response, 'An error occurred while settling your free spin.')

  const featureSession = readFeatureSession(userUUID)
  const events = getEventSummary(userUUID)

  assert.equal(featureSession.spinsLeft, 2)
  assert.equal(featureSession.spinsTotal, 2)
  assert.equal(featureSession.totalWon, 0)
  assert.equal(featureSession.jackpotBonusUsed, true)

  assert.equal(syncWalletBalanceFromDb(userUUID), 50)
  assert.equal(getLifetimeNet(userUUID), 0)
  assert.equal(Number(events.count), 0)
  assert.equal(Number(events.net), 0)
})
