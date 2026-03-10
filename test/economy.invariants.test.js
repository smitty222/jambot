import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

const tmpDbPath = path.join(
  os.tmpdir(),
  `jamflowbot-economy-${process.pid}-${Date.now()}.db`
)

process.env.DB_PATH = tmpDbPath

const { default: db } = await import('../src/database/db.js')
const {
  debitGameBet,
  creditGameWin,
  getLifetimeNet,
  applyGameDeltaInTransaction,
  syncWalletBalanceFromDb
} = await import('../src/database/dbwalletmanager.js')

const dbUnavailableReason = 'better-sqlite3 is unavailable in this environment'

function resetEconomyTables () {
  db.prepare('DROP TABLE IF EXISTS economy_events').run()
  db.prepare('DROP TABLE IF EXISTS users').run()

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
}

function getEventSummary (userUUID) {
  return db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS net
    FROM economy_events
    WHERE userUUID = ?
  `).get(userUUID)
}

test.beforeEach(() => {
  resetEconomyTables()
})

test.after(() => {
  db.close()
  try {
    fs.unlinkSync(tmpDbPath)
  } catch {
    // best-effort cleanup for temp DB
  }
})

test('debit + credit keep balance, lifetime net, and economy events aligned', {
  skip: !db.available && dbUnavailableReason
}, async () => {
  const userUUID = 'user-econ-1'
  assert.equal(syncWalletBalanceFromDb(userUUID), 50)

  assert.equal(debitGameBet(userUUID, 20, { source: 'slots', category: 'bet' }), true)
  assert.equal(await creditGameWin(userUUID, 35, null, { source: 'slots', category: 'spin_win' }), true)

  const balance = syncWalletBalanceFromDb(userUUID)
  const lifetime = getLifetimeNet(userUUID)
  const events = getEventSummary(userUUID)

  assert.equal(balance, 65)
  assert.equal(lifetime, 15)
  assert.equal(Number(events.count), 2)
  assert.equal(Number(events.net), 15)
})

test('insufficient debit does not mutate wallet or event ledger', {
  skip: !db.available && dbUnavailableReason
}, () => {
  const userUUID = 'user-econ-2'
  assert.equal(syncWalletBalanceFromDb(userUUID), 50)

  const ok = debitGameBet(userUUID, 999, { source: 'slots', category: 'bet' })
  const balance = syncWalletBalanceFromDb(userUUID)
  const lifetime = getLifetimeNet(userUUID)
  const events = getEventSummary(userUUID)

  assert.equal(ok, false)
  assert.equal(balance, 50)
  assert.equal(lifetime, 0)
  assert.equal(Number(events.count), 0)
  assert.equal(Number(events.net), 0)
})

test('transaction rollback preserves wallet and ledger invariants', {
  skip: !db.available && dbUnavailableReason
}, () => {
  const userUUID = 'user-econ-3'
  assert.equal(syncWalletBalanceFromDb(userUUID), 50)

  const tx = db.transaction(() => {
    const debit1 = applyGameDeltaInTransaction(userUUID, -10, {
      requireSufficientFunds: true,
      updateCache: false,
      meta: { source: 'slots', category: 'bet' }
    })
    assert.equal(debit1.ok, true)

    const debit2 = applyGameDeltaInTransaction(userUUID, -1000, {
      requireSufficientFunds: true,
      updateCache: false,
      meta: { source: 'slots', category: 'bet' }
    })
    if (!debit2.ok) throw new Error('INSUFFICIENT')
  })

  assert.throws(() => tx(), /INSUFFICIENT/)

  const balance = syncWalletBalanceFromDb(userUUID)
  const lifetime = getLifetimeNet(userUUID)
  const events = getEventSummary(userUUID)

  assert.equal(balance, 50)
  assert.equal(lifetime, 0)
  assert.equal(Number(events.count), 0)
  assert.equal(Number(events.net), 0)
})
