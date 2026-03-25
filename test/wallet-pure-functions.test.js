// test/wallet-pure-functions.test.js
//
// Unit tests for pure / side-effect-free exports from the wallet and
// leaderboard modules.  No real network calls or meaningful DB writes
// are made — a throw-away temp database is created only to satisfy the
// SQLite import at module load time.
//
// Covers:
//   - getWealthBand        — balance → band label + rate
//   - getProgressiveWealthFee — wealth-tax calculation
//   - getCurrentMonthKey   — date → "YYYY-MM" string
//   - compactLeaderboardName — display-name truncation
//   - formatCompactLeaderboardLine — full rank-line formatter

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

// Point the DB module at a temporary file so SQLite initialises cleanly
// without touching any real data.  Must be set before the first import
// of any module that transitively requires db.js.
const tmpDbPath = path.join(
  os.tmpdir(),
  `jamflowbot-wallet-pure-${process.pid}-${Date.now()}.db`
)
process.env.DB_PATH = tmpDbPath

const { default: db } = await import('../src/database/db.js')

// formatCompactLeaderboardLine calls getCompactEquippedTitleTag → getEquippedTitle
// which reads from prestige_profiles.  Create the table so the query succeeds
// (all users will simply have no equipped title, which is fine for these tests).
db.exec(`CREATE TABLE IF NOT EXISTS prestige_profiles (
  userUUID TEXT PRIMARY KEY,
  equippedTitleKey TEXT
)`)

const {
  getWealthBand,
  getProgressiveWealthFee,
  getCurrentMonthKey
} = await import('../src/database/dbwalletmanager.js')

const {
  compactLeaderboardName,
  formatCompactLeaderboardLine
} = await import('../src/handlers/prestigeCommands.js')

test.after(() => {
  try { db.close() } catch { /* best-effort */ }
  try { fs.unlinkSync(tmpDbPath) } catch { /* best-effort */ }
})

// ─────────────────────────────────────────────────────────────────────────────
// getWealthBand
// ─────────────────────────────────────────────────────────────────────────────

test('getWealthBand: 0 balance → standard band', () => {
  const band = getWealthBand(0)
  assert.equal(band.label, 'standard')
  assert.equal(band.rate, 0)
})

test('getWealthBand: negative balance treated as 0 → standard band', () => {
  assert.equal(getWealthBand(-500).label, 'standard')
})

test('getWealthBand: null / undefined treated as 0 → standard band', () => {
  assert.equal(getWealthBand(null).label, 'standard')
  assert.equal(getWealthBand(undefined).label, 'standard')
})

test('getWealthBand: 5000 → comfortable band', () => {
  const band = getWealthBand(5000)
  assert.equal(band.label, 'comfortable')
  assert.equal(band.rate, 0.05)
})

test('getWealthBand: 24999 → comfortable band (just below high_roller)', () => {
  assert.equal(getWealthBand(24999).label, 'comfortable')
})

test('getWealthBand: 25000 → high_roller band', () => {
  const band = getWealthBand(25000)
  assert.equal(band.label, 'high_roller')
  assert.equal(band.rate, 0.10)
})

test('getWealthBand: 100000 → tycoon band', () => {
  const band = getWealthBand(100000)
  assert.equal(band.label, 'tycoon')
  assert.equal(band.rate, 0.15)
})

test('getWealthBand: 999999 → tycoon band', () => {
  assert.equal(getWealthBand(999999).label, 'tycoon')
})

// ─────────────────────────────────────────────────────────────────────────────
// getProgressiveWealthFee
// ─────────────────────────────────────────────────────────────────────────────

test('getProgressiveWealthFee: standard band → zero fee', () => {
  const result = getProgressiveWealthFee({ balance: 100, baseAmount: 500, source: 'slots' })
  assert.equal(result.fee, 0)
  assert.equal(result.total, 500)
  assert.equal(result.bandLabel, 'standard')
})

test('getProgressiveWealthFee: amount below minBase → zero fee', () => {
  // slots minBase is 100; amount of 50 is below threshold
  const result = getProgressiveWealthFee({ balance: 200000, baseAmount: 50, source: 'slots' })
  assert.equal(result.fee, 0)
  assert.equal(result.total, 50)
})

test('getProgressiveWealthFee: tycoon + slots → 15% fee', () => {
  // balance=200000 (tycoon, rate=0.15), slots mult=1.0, effectiveRate=0.15
  // baseAmount=1000 → fee=floor(1000*0.15)=150
  const result = getProgressiveWealthFee({ balance: 200000, baseAmount: 1000, source: 'slots' })
  assert.equal(result.fee, 150)
  assert.equal(result.total, 1150)
  assert.equal(result.bandLabel, 'tycoon')
  assert.equal(result.effectiveRate, 0.15)
})

test('getProgressiveWealthFee: high_roller + roulette → 8.5% fee (rate×mult)', () => {
  // high_roller rate=0.10, roulette mult=0.85 → effectiveRate=0.085
  // baseAmount=1000 → fee=floor(1000*0.085)=85
  const result = getProgressiveWealthFee({ balance: 30000, baseAmount: 1000, source: 'roulette' })
  assert.equal(result.fee, 85)
  assert.equal(result.total, 1085)
  assert.equal(result.bandLabel, 'high_roller')
})

test('getProgressiveWealthFee: comfortable + f1 → above-base fee (rate×1.2)', () => {
  // comfortable rate=0.05, f1 mult=1.2 → effectiveRate=0.06, f1 minBase=500
  // baseAmount=1000 → fee=floor(1000*0.06)=60
  const result = getProgressiveWealthFee({ balance: 10000, baseAmount: 1000, source: 'f1' })
  assert.equal(result.fee, 60)
  assert.equal(result.total, 1060)
})

test('getProgressiveWealthFee: zero baseAmount → zero fee and total', () => {
  const result = getProgressiveWealthFee({ balance: 200000, baseAmount: 0, source: 'slots' })
  assert.equal(result.fee, 0)
  assert.equal(result.total, 0)
})

test('getProgressiveWealthFee: unknown source falls back to default multiplier', () => {
  // tycoon rate=0.15, default mult=1.0 → effectiveRate=0.15
  const result = getProgressiveWealthFee({ balance: 200000, baseAmount: 1000, source: 'unknown_game' })
  assert.equal(result.effectiveRate, 0.15)
  assert.equal(result.source, 'unknown_game')
})

test('getProgressiveWealthFee: no args → zero fee (safe defaults)', () => {
  const result = getProgressiveWealthFee()
  assert.equal(result.fee, 0)
  assert.equal(result.total, 0)
})

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentMonthKey
// ─────────────────────────────────────────────────────────────────────────────

test('getCurrentMonthKey: January is padded to 2 digits', () => {
  assert.equal(getCurrentMonthKey(new Date('2025-01-15T00:00:00Z')), '2025-01')
})

test('getCurrentMonthKey: December produces correct key', () => {
  assert.equal(getCurrentMonthKey(new Date('2024-12-31T23:59:59Z')), '2024-12')
})

test('getCurrentMonthKey: returns YYYY-MM format', () => {
  const key = getCurrentMonthKey(new Date('2026-03-24T00:00:00Z'))
  assert.match(key, /^\d{4}-\d{2}$/)
  assert.equal(key, '2026-03')
})

test('getCurrentMonthKey: string date input is parsed correctly', () => {
  assert.equal(getCurrentMonthKey('2023-07-04'), '2023-07')
})

test('getCurrentMonthKey: no argument returns current month', () => {
  const key = getCurrentMonthKey()
  assert.match(key, /^\d{4}-\d{2}$/)
})

// ─────────────────────────────────────────────────────────────────────────────
// compactLeaderboardName
// ─────────────────────────────────────────────────────────────────────────────

test('compactLeaderboardName: short name returned as-is', () => {
  assert.equal(compactLeaderboardName('Allen', 'uuid-1'), 'Allen')
})

test('compactLeaderboardName: strips leading @ sign', () => {
  assert.equal(compactLeaderboardName('@Allen', 'uuid-1'), 'Allen')
})

test('compactLeaderboardName: name longer than maxLen is truncated with dot', () => {
  const name = 'VeryLongDisplayName'
  const result = compactLeaderboardName(name, 'uuid-1', 10)
  assert.equal(result.length, 10)
  assert.ok(result.endsWith('.'))
})

test('compactLeaderboardName: name at exactly maxLen is not truncated', () => {
  const name = '1234567890' // 10 chars
  assert.equal(compactLeaderboardName(name, 'uuid-1', 10), '1234567890')
})

test('compactLeaderboardName: uid mention format falls back to user-<short-uuid>', () => {
  const result = compactLeaderboardName('<@uid:abc123>', 'abc123')
  assert.equal(result, 'user-abc123')
})

test('compactLeaderboardName: null name falls back to user-<short-uuid>', () => {
  assert.ok(compactLeaderboardName(null, 'def456').startsWith('user-'))
})

test('compactLeaderboardName: empty string falls back to user-<short-uuid>', () => {
  assert.ok(compactLeaderboardName('', 'ghi789').startsWith('user-'))
})

// ─────────────────────────────────────────────────────────────────────────────
// formatCompactLeaderboardLine
// ─────────────────────────────────────────────────────────────────────────────

test('formatCompactLeaderboardLine: positive amount formatted with $', () => {
  const line = formatCompactLeaderboardLine({ rank: 1, uuid: 'u1', name: 'Alice', amount: 1500 })
  assert.match(line, /^1\./)
  assert.match(line, /Alice/)
  assert.match(line, /\$1,500/)
})

test('formatCompactLeaderboardLine: negative amount has leading minus', () => {
  const line = formatCompactLeaderboardLine({ rank: 2, uuid: 'u2', name: 'Bob', amount: -250 })
  assert.match(line, /^2\./)
  assert.match(line, /-\$250/)
})

test('formatCompactLeaderboardLine: zero amount shows $0', () => {
  const line = formatCompactLeaderboardLine({ rank: 3, uuid: 'u3', name: 'Carol', amount: 0 })
  assert.match(line, /\$0/)
})

test('formatCompactLeaderboardLine: rank is included in output', () => {
  const line = formatCompactLeaderboardLine({ rank: 7, uuid: 'u7', name: 'Dave', amount: 100 })
  assert.match(line, /^7\./)
})

test('formatCompactLeaderboardLine: long name is truncated in output', () => {
  const line = formatCompactLeaderboardLine({ rank: 1, uuid: 'u1', name: 'A'.repeat(30), amount: 500 })
  // output should not explode; name is compact-capped
  assert.ok(typeof line === 'string')
  assert.ok(line.length < 60, 'line should not be excessively long')
})
