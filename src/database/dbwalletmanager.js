// src/libs/dbWalletManager.js

// NOTE: this file is generated as part of the assistant's update.  It
// replicates the existing wallet manager logic and introduces helper
// functions for tracking lifetime net gains/losses without altering
// existing balance functionality.  See the accompanying report for
// details on how to update game modules to use these helpers.

import db from './db.js'
// Helpers for working with mentions and nicknames. We avoid storing
// mention strings (e.g. `<@uid:abcd>`) in the users table. Instead we
// keep the human‑friendly nickname when available and compute the
// mention format on the fly when sending messages.
import { sanitizeNickname } from '../utils/names.js'
import { fetchRecentSongs } from '../utils/API.js'
import { getCryptoPrice } from '../utils/cryptoPrice.js'
import { maybeAwardDjPrestige, syncMonthlyPrestigeAwards } from './dbprestige.js'

// ───────────────────────────────────────────────────────────
// Structured logging
import { logger } from '../utils/logging.js'
// In-memory wallet cache. Reading balances from the DB on every
// operation causes synchronous blocking (db.prepare().get()) and
// repeated disk I/O. To minimise latency, we initialise a cache on
// first use and update it for subsequent reads. Writes still persist
// to the database, but are scheduled via setImmediate so they don’t
// block the event loop on the hot path.
//
// The cache is a Map keyed by user UUID → balance (number). When
// wallets are created or updated, the cache is updated immediately
// and a synchronous DB write is deferred via setImmediate.
const walletCache = new Map()
const NET_WORTH_TTL_MS = Number(process.env.NET_WORTH_TTL_MS ?? 30_000)
const netWorthCache = {
  ts: 0,
  rows: null,
  promise: null
}

// Serialise wallet transfers to avoid race conditions. Multiple concurrent
// transferTip() calls could read stale balances from the cache. This
// promise queue ensures that transfers execute one after the other.
let _transferQueue = Promise.resolve()

// Lazy-load all wallets into the cache on first access. This avoids
// scanning the DB multiple times and keeps the cache in sync until
// process restart. If new users are added, they will be inserted into
// the cache on demand.
function ensureWalletCache () {
  if (walletCache.size > 0) return
  // Load balances directly from the users table. We no longer use
  // the legacy wallets table for primary data storage. See initdb.js
  // for migration logic that copies balances into users.balance.
  const rows = db.prepare('SELECT uuid, balance FROM users').all()
  for (const { uuid, balance } of rows) {
    walletCache.set(uuid, roundToTenth(balance))
  }
}

function invalidateNetWorthCache () {
  netWorthCache.ts = 0
  netWorthCache.rows = null
  netWorthCache.promise = null
}

// Persist a single user balance to the DB. Called asynchronously via
// setImmediate from getUserWallet/addToUserWallet/removeFromUserWallet.
function persistWallet (uuid, balance) {
  try {
    // Upsert the balance into the users table. We default the
    // nickname to the UUID if the row does not yet exist to satisfy
    // the NOT NULL constraint on users.nickname. A later call to
    // addOrUpdateUser() can update the nickname when a human name is
    // known. We intentionally avoid updating nickname here.
    db.prepare(
      `INSERT INTO users (uuid, nickname, balance)
       VALUES (?, ?, ?)
       ON CONFLICT(uuid) DO UPDATE SET balance = excluded.balance`
    ).run(uuid, uuid, balance)
  } catch (err) {
    logger.error('[WalletCache] Failed to persist wallet', { err: err?.message || err })
  }
}

function roundToTenth (amount) {
  return Math.round(amount * 10) / 10
}

const WEALTH_BANDS = [
  { min: 100000, label: 'tycoon', rate: 0.15 },
  { min: 25000, label: 'high_roller', rate: 0.10 },
  { min: 5000, label: 'comfortable', rate: 0.05 },
  { min: 0, label: 'standard', rate: 0 }
]

const WEALTH_RATE_MULT_BY_SOURCE = {
  slots: 1.00,
  roulette: 0.85,
  horse_race: 0.80,
  horse: 0.90,
  f1: 1.20,
  default: 1.00
}

const WEALTH_MIN_BASE_BY_SOURCE = {
  slots: 100,
  roulette: 100,
  horse_race: 100,
  horse: 1000,
  f1: 500,
  default: 250
}

const DJ_STREAK_MIN_LIKES = 3
const DJ_STREAK_REWARDS = [
  { streak: 12, bonus: 150 },
  { streak: 8, bonus: 60 },
  { streak: 5, bonus: 25 },
  { streak: 3, bonus: 10 }
]

export function getWealthBand (balance) {
  const bal = Math.max(0, Number(balance || 0))
  return WEALTH_BANDS.find(band => bal >= band.min) || WEALTH_BANDS[WEALTH_BANDS.length - 1]
}

export function getProgressiveWealthFee ({ balance, baseAmount, source = 'default' } = {}) {
  const base = Math.max(0, Math.floor(Number(baseAmount || 0)))
  const normalizedSource = String(source || 'default').trim().toLowerCase() || 'default'
  const minBase = Number(WEALTH_MIN_BASE_BY_SOURCE[normalizedSource] ?? WEALTH_MIN_BASE_BY_SOURCE.default)
  const band = getWealthBand(balance)
  const sourceMult = Number(WEALTH_RATE_MULT_BY_SOURCE[normalizedSource] ?? WEALTH_RATE_MULT_BY_SOURCE.default)
  const effectiveRate = Math.max(0, band.rate * sourceMult)

  if (base <= 0 || base < minBase || effectiveRate <= 0) {
    return {
      fee: 0,
      total: base,
      bandLabel: band.label,
      effectiveRate: 0,
      source: normalizedSource
    }
  }

  const fee = Math.max(0, Math.floor(base * effectiveRate))
  return {
    fee,
    total: base + fee,
    bandLabel: band.label,
    effectiveRate,
    source: normalizedSource
  }
}

export function getCurrentMonthKey (date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function getMonthBounds (monthKey = getCurrentMonthKey()) {
  const [yearRaw, monthRaw] = String(monthKey || '').split('-')
  const year = Number.parseInt(yearRaw, 10)
  const monthIndex = Number.parseInt(monthRaw, 10) - 1
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0))
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0))
  return {
    monthKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    startIso: start.toISOString(),
    endIso: end.toISOString()
  }
}

function getDjStreakRow (userUUID) {
  return db.prepare(`
    SELECT userUUID, streakCount, bestStreak, lastPlayedAt, lastQualifiedAt
    FROM dj_streaks
    WHERE userUUID = ?
  `).get(String(userUUID)) || null
}

function saveDjStreakRow (userUUID, row = {}) {
  db.prepare(`
    INSERT INTO dj_streaks (
      userUUID, streakCount, bestStreak, lastPlayedAt, lastQualifiedAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(userUUID) DO UPDATE SET
      streakCount = excluded.streakCount,
      bestStreak = excluded.bestStreak,
      lastPlayedAt = excluded.lastPlayedAt,
      lastQualifiedAt = excluded.lastQualifiedAt,
      updatedAt = CURRENT_TIMESTAMP
  `).run(
    String(userUUID),
    Math.max(0, Math.floor(Number(row.streakCount || 0))),
    Math.max(0, Math.floor(Number(row.bestStreak || 0))),
    row.lastPlayedAt || null,
    row.lastQualifiedAt || null
  )
}

function normalizeEconomyMeta (meta = null) {
  const source = String(meta?.source || 'unknown').trim().toLowerCase() || 'unknown'
  const category = String(meta?.category || 'uncategorized').trim().toLowerCase() || 'uncategorized'
  const note = meta?.note == null ? null : String(meta.note).trim().slice(0, 200)
  const extra = meta && typeof meta === 'object'
    ? Object.fromEntries(Object.entries(meta).filter(([key]) => !['source', 'category', 'note'].includes(key)))
    : null

  return {
    source,
    category,
    note,
    metadata: extra && Object.keys(extra).length ? JSON.stringify(extra) : null
  }
}

export function recordEconomyEvent (userUUID, amount, balanceAfter = null, meta = null) {
  if (!userUUID || !Number.isFinite(amount) || amount === 0) return false

  const normalized = normalizeEconomyMeta(meta)

  try {
    db.prepare(`
      INSERT INTO economy_events (
        userUUID, amount, balanceAfter, source, category, note, metadata
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(userUUID),
      Number(amount),
      Number.isFinite(balanceAfter) ? Number(balanceAfter) : null,
      normalized.source,
      normalized.category,
      normalized.note,
      normalized.metadata
    )
    return true
  } catch (err) {
    logger.error('[recordEconomyEvent] failed', { err: err?.message || err, userUUID, amount })
    return false
  }
}

/**
 * Insert or update a user record. When a nickname is provided it is
 * sanitised and, if non‑empty, saved to the users table. If no
 * nickname is provided or the nickname sanitises to an empty string
 * (e.g. it was a mention token), then the existing nickname is left
 * unchanged. On first insert, the nickname falls back to the UUID so
 * the NOT NULL constraint on users.nickname is satisfied. Balance
 * remains untouched by this helper.
 *
 * @param {string} userUUID The user’s UUID
 * @param {string|null|undefined} nickname The raw nickname from a source event
 */
export function addOrUpdateUser (userUUID, nickname = null) {
  if (!userUUID) return

  const clean = sanitizeNickname(nickname)

  // Pull existing nickname so we don't overwrite a good one with junk
  const existingRow = db.prepare('SELECT nickname FROM users WHERE uuid = ?').get(userUUID)
  let existing = existingRow?.nickname

  // Treat stored mention tokens as empty
  if (existing && /^<@uid:[^>]+>$/.test(String(existing).trim())) existing = ''

  const finalNickname = clean || existing || userUUID

  try {
    db.prepare(`
      INSERT INTO users (uuid, nickname, balance, nicknameUpdatedAt)
      VALUES (
        ?,
        ?,
        COALESCE((SELECT balance FROM users WHERE uuid = ?), 0),
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(uuid) DO UPDATE SET
        nickname = excluded.nickname,
        nicknameUpdatedAt = CURRENT_TIMESTAMP
    `).run(userUUID, finalNickname, userUUID)
  } catch (err) {
    logger.error('[addOrUpdateUser] Failed to upsert user', { err: err?.message || err })
  }
}

export function loadWallets () {
  ensureWalletCache()
  const out = {}
  for (const [uuid, balance] of walletCache.entries()) {
    out[uuid] = { balance }
  }
  return out
}

export function hasUserWallet (userUUID) {
  ensureWalletCache()
  return walletCache.has(userUUID)
}

/**
 * Atomically transfer an amount from one wallet to another. This helper wraps
 * the debit and credit operations in a single transaction to avoid
 * inconsistent state (e.g. credit succeeds but debit fails). If the
 * sender has insufficient funds, an Error is thrown with the message
 * 'INSUFFICIENT_FUNDS'. On success, the walletCache is updated for
 * both parties.
 *
 * @param {Object} opts
 * @param {string} opts.fromUuid - The UUID of the wallet to debit
 * @param {string} opts.toUuid - The UUID of the wallet to credit
 * @param {number} opts.amount - The positive amount to transfer
 */
export function transferTip ({ fromUuid, toUuid, amount }) {
  return new Promise((resolve, reject) => {
    if (!fromUuid || !toUuid || !Number.isFinite(amount) || amount <= 0) {
      return reject(new Error('INVALID_TRANSFER'))
    }
    // Queue the transfer to avoid concurrent writes and stale cache reads
    _transferQueue = _transferQueue
      .then(() => {
        ensureWalletCache()
        // Perform both operations within a single transaction for atomicity
        const tx = db.transaction((fromUuid, toUuid, amount) => {
          const row = db.prepare('SELECT balance FROM users WHERE uuid = ?').get(fromUuid) || { balance: 0 }
          const fromBalance = row.balance ?? 0
          if (fromBalance < amount) throw new Error('INSUFFICIENT_FUNDS')
          // Debit sender
          db.prepare('UPDATE users SET balance = balance - ? WHERE uuid = ?').run(amount, fromUuid)
          // Credit recipient (upsert). Note: inserts a new user row if needed.
          db.prepare(
            `INSERT INTO users (uuid, nickname, balance) VALUES (?, ?, ?)
             ON CONFLICT(uuid) DO UPDATE SET balance = users.balance + excluded.balance`
          ).run(toUuid, toUuid, amount)
        })
        tx(fromUuid, toUuid, amount)
        // Read fresh balances from DB to update cache accurately
        const senderRow = db.prepare('SELECT balance FROM users WHERE uuid = ?').get(fromUuid) || { balance: 0 }
        const recipientRow = db.prepare('SELECT balance FROM users WHERE uuid = ?').get(toUuid) || { balance: 0 }
        const senderBal = roundToTenth(senderRow.balance ?? 0)
        const recipientBal = roundToTenth(recipientRow.balance ?? 0)
        walletCache.set(fromUuid, senderBal)
        walletCache.set(toUuid, recipientBal)
        invalidateNetWorthCache()
        recordEconomyEvent(fromUuid, -amount, senderBal, {
          source: 'tip',
          category: 'transfer_out',
          note: `Tip to ${toUuid}`,
          counterparty: toUuid
        })
        recordEconomyEvent(toUuid, amount, recipientBal, {
          source: 'tip',
          category: 'transfer_in',
          note: `Tip from ${fromUuid}`,
          counterparty: fromUuid
        })
      })
      .then(resolve)
      .catch((err) => {
        // Log the error for observability and reject the promise
        logger.error('[transferTip] failed', { err: err?.message || err })
        reject(err)
      })
  })
}

export function getUserWallet (userUUID) {
  ensureWalletCache()
  if (walletCache.has(userUUID)) {
    return walletCache.get(userUUID)
  }
  // Initialise a new wallet with $50 if not present. We update the cache
  // immediately and persist to DB asynchronously.
  const initialBalance = 50
  walletCache.set(userUUID, initialBalance)
  invalidateNetWorthCache()
  // Persist asynchronously to avoid blocking the event loop.
  setImmediate(() => persistWallet(userUUID, initialBalance))
  return initialBalance
}

export function removeFromUserWallet (userUUID, amount, meta = null) {
  ensureWalletCache()
  const current = getUserWallet(userUUID)
  if (current < amount) return false
  const newBalance = roundToTenth(current - amount)
  walletCache.set(userUUID, newBalance)
  invalidateNetWorthCache()
  // Persist asynchronously
  setImmediate(() => persistWallet(userUUID, newBalance))
  if (meta) recordEconomyEvent(userUUID, -Math.abs(amount), newBalance, meta)
  return true
}

export async function addToUserWallet (userUUID, amount, nickname = null, meta = null) {
  // Ensure the user exists and update their nickname if provided
  addOrUpdateUser(userUUID, nickname)
  ensureWalletCache()
  const current = getUserWallet(userUUID)
  const newBalance = roundToTenth(current + amount)
  walletCache.set(userUUID, newBalance)
  invalidateNetWorthCache()
  // Persist asynchronously
  setImmediate(() => persistWallet(userUUID, newBalance))
  if (meta) recordEconomyEvent(userUUID, Math.abs(amount), newBalance, meta)
  return true
}

export function loadUsers () {
  const rows = db.prepare('SELECT * FROM users').all()
  return rows.reduce((map, user) => {
    map[user.uuid] = { nickname: user.nickname }
    return map
  }, {})
}

export function getNicknamesFromWallets () {
  const rows = db.prepare(`
    SELECT uuid, nickname, balance
    FROM users
  `).all()
  return rows.map(({ uuid, nickname, balance }) => ({
    uuid,
    nickname: nickname || 'Unknown',
    balance: roundToTenth(balance)
  }))
}

export async function addDollarsByUUID (userUuid, amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    logger.error('Invalid amount for addDollarsByUUID', { amount })
    return
  }

  // Lookup the nickname (optional, but nice for logging)
  const row = db.prepare('SELECT nickname FROM users WHERE uuid = ?').get(userUuid)

  const nickname = row?.nickname || 'Unknown'

  await addToUserWallet(userUuid, amount, nickname, {
    source: 'admin',
    category: 'grant',
    note: 'Manual /addmoney grant'
  })

  logger.info(`Added $${amount} to ${nickname}'s wallet (${userUuid}).`)
}

export function getDjStreakStatus (userUUID) {
  const row = getDjStreakRow(userUUID)
  return {
    userUUID: String(userUUID || ''),
    streakCount: Number(row?.streakCount || 0),
    bestStreak: Number(row?.bestStreak || 0),
    lastPlayedAt: row?.lastPlayedAt || null,
    lastQualifiedAt: row?.lastQualifiedAt || null
  }
}

async function applyDjStreakReward ({ userUUID, likes = 0, playedAt = null } = {}) {
  if (!userUUID || !playedAt) return null

  const playedAtIso = new Date(playedAt).toISOString()
  const prior = getDjStreakRow(userUUID) || {
    streakCount: 0,
    bestStreak: 0,
    lastPlayedAt: null,
    lastQualifiedAt: null
  }

  if (prior.lastPlayedAt && String(prior.lastPlayedAt) === playedAtIso) {
    return {
      streakCount: Number(prior.streakCount || 0),
      bestStreak: Number(prior.bestStreak || 0),
      bonusAwarded: 0,
      streakQualified: Number(likes || 0) >= DJ_STREAK_MIN_LIKES
    }
  }

  const qualified = Number(likes || 0) >= DJ_STREAK_MIN_LIKES
  const streakCount = qualified ? Number(prior.streakCount || 0) + 1 : 0
  const bestStreak = Math.max(Number(prior.bestStreak || 0), streakCount)
  const milestone = qualified ? DJ_STREAK_REWARDS.find((entry) => streakCount === entry.streak) : null
  const bonusAwarded = Number(milestone?.bonus || 0)

  saveDjStreakRow(userUUID, {
    streakCount,
    bestStreak,
    lastPlayedAt: playedAtIso,
    lastQualifiedAt: qualified ? playedAtIso : prior.lastQualifiedAt || null
  })

  if (bonusAwarded > 0) {
    await addToUserWallet(userUUID, bonusAwarded, null, {
      source: 'dj',
      category: 'streak_bonus',
      note: `DJ streak ${streakCount}`,
      streak: streakCount,
      likes: Number(likes || 0)
    })
  }

  if (qualified) maybeAwardDjPrestige(userUUID, streakCount)

  return {
    streakCount,
    bestStreak,
    bonusAwarded,
    streakQualified: qualified,
    milestone: milestone?.streak || null
  }
}

export function getBalanceByNickname (nickname) {
  const row = db.prepare(`
    SELECT balance FROM users
    WHERE LOWER(nickname) = ?
  `).get(nickname.toLowerCase())
  return row ? roundToTenth(row.balance) : null
}

export async function songPayment () {
  try {
    const songPlays = await fetchRecentSongs()
    if (!Array.isArray(songPlays) || songPlays.length === 0) {
      logger.info('No recent songs found.')
      return null
    }

    const latestPlay = songPlays[0] || {}
    const { djUuid: userUUID, voteCounts } = latestPlay
    const voteCount = voteCounts.likes

    if (userUUID && typeof voteCount === 'number' && voteCount > 0) {
      const success = await addToUserWallet(userUUID, voteCount * 2, null, {
        source: 'dj',
        category: 'like_reward',
        note: `${voteCount} likes on recent song`,
        likes: voteCount
      })
      if (success) {
        logger.info(`Added $${voteCount * 2} to user ${userUUID}'s wallet for ${voteCount} likes.`)
        const streakOutcome = await applyDjStreakReward({
          userUUID,
          likes: voteCount,
          playedAt: latestPlay?.playedAt || null
        })
        return {
          userUUID,
          likes: voteCount,
          likeReward: voteCount * 2,
          ...streakOutcome
        }
      } else {
        logger.error(`Failed to add to wallet for user ${userUUID}`)
      }
    } else {
      if (userUUID && latestPlay?.playedAt) {
        return await applyDjStreakReward({
          userUUID,
          likes: Number(voteCount || 0),
          playedAt: latestPlay.playedAt
        })
      }
      logger.error('Invalid userUUID or voteCount for songPlay')
    }
  } catch (error) {
    logger.error('Error in songPayment', { err: error?.message || error })
  }
  return null
}

// ---------------------------------------------------------------------------
// Lifetime net helpers
//
// These helpers enable the site to track the cumulative net gain or loss
// for each user across game sessions.  They do not modify the existing
// wallet cache logic, so all current wallet operations continue to work
// as before.  Only game modules should call these helpers when money
// changes hands for bets and payouts.

/**
 * Adjust a user’s lifetime net total by a positive or negative amount.
 * If the user does not exist, insert a new row with the given amount.
 *
 * @param {string} userUUID
 * @param {number} amount A positive or negative number representing the change in net
 */
function updateLifetimeNet (userUUID, amount) {
  if (!Number.isFinite(amount) || amount === 0) return
  try {
    db.prepare(`
      INSERT INTO users (uuid, nickname, balance, lifetime_net)
      VALUES (?, ?, 0, ?)
      ON CONFLICT(uuid) DO UPDATE SET
        lifetime_net = COALESCE(lifetime_net, 0) + excluded.lifetime_net
    `).run(userUUID, userUUID, amount)
  } catch (err) {
    logger.error('[updateLifetimeNet] failed', { err: err?.message || err })
  }
}

/**
 * Remove a game bet from the user’s wallet and record a negative net.
 * Returns true on success (sufficient funds), false otherwise.
 *
 * @param {string} userUUID
 * @param {number} amount A positive number representing the bet
 */
export function debitGameBet (userUUID, amount, meta = null) {
  if (!Number.isFinite(amount) || amount <= 0) return false
  const success = removeFromUserWallet(userUUID, amount, {
    source: meta?.source || 'game',
    category: meta?.category || 'bet',
    note: meta?.note || null,
    ...(meta && typeof meta === 'object' ? meta : {})
  })
  if (success) updateLifetimeNet(userUUID, -amount)
  return success
}

/**
 * Credit a game win to the user’s wallet and record a positive net.
 * Returns true on success.
 *
 * @param {string} userUUID
 * @param {number} amount A positive number representing the winnings
 * @param {string|null} nickname Optional nickname to update in users table
 */
export async function creditGameWin (userUUID, amount, nickname = null, meta = null) {
  if (!Number.isFinite(amount) || amount <= 0) return false
  const success = await addToUserWallet(userUUID, amount, nickname, {
    source: meta?.source || 'game',
    category: meta?.category || 'win',
    note: meta?.note || null,
    ...(meta && typeof meta === 'object' ? meta : {})
  })
  if (success) updateLifetimeNet(userUUID, amount)
  return success
}

/**
 * Retrieve a user’s lifetime net total.
 *
 * @param {string} userUUID
 * @returns {number} The net gain (positive) or loss (negative)
 */
export function getLifetimeNet (userUUID) {
  const row = db.prepare('SELECT lifetime_net FROM users WHERE uuid = ?').get(userUUID)
  return row?.lifetime_net ?? 0
}

/**
 * Retrieve an array of all users and their lifetime net totals.
 *
 * @returns {Array<{uuid: string, lifetime_net: number}>}
 */
export function getAllNetTotals () {
  const rows = db.prepare('SELECT uuid, lifetime_net FROM users').all()
  return rows.map((row) => ({ uuid: row.uuid, lifetime_net: row.lifetime_net }))
}

export function getEconomySourceTotals (days = 7, limit = 10) {
  const nDays = Math.max(1, Math.min(3650, Math.floor(Number(days || 7))))
  const nLimit = Math.max(1, Math.min(50, Math.floor(Number(limit || 10))))
  const rows = db.prepare(`
    SELECT
      source,
      COUNT(*) AS eventCount,
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS created,
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS sunk,
      SUM(amount) AS net
    FROM economy_events
    WHERE createdAt >= datetime('now', ?)
    GROUP BY source
    ORDER BY net DESC, created DESC, source ASC
    LIMIT ?
  `).all(`-${nDays} days`, nLimit)

  return rows.map((row) => ({
    source: String(row.source || 'unknown'),
    eventCount: Number(row.eventCount || 0),
    created: Number(row.created || 0),
    sunk: Number(row.sunk || 0),
    net: Number(row.net || 0)
  }))
}

export async function getEconomyOverview (days = 7) {
  const nDays = Math.max(1, Math.min(3650, Math.floor(Number(days || 7))))
  const rows = await buildNetWorthRows()
  const topWallets = db.prepare(`
    SELECT uuid, nickname, COALESCE(balance, 0) AS balance
    FROM users
    ORDER BY balance DESC, uuid ASC
    LIMIT 5
  `).all().map((row) => ({
    uuid: String(row.uuid),
    nickname: row.nickname || 'Unknown',
    balance: Number(row.balance) || 0
  }))

  const totals = rows.reduce((acc, row) => {
    acc.cash += Number(row.cash) || 0
    acc.carValue += Number(row.carValue) || 0
    acc.horseValue += Number(row.horseValue) || 0
    acc.cryptoValue += Number(row.cryptoValue) || 0
    acc.netWorth += Number(row.totalNetWorth) || 0
    return acc
  }, { cash: 0, carValue: 0, horseValue: 0, cryptoValue: 0, netWorth: 0 })

  const eventTotals = db.prepare(`
    SELECT
      COUNT(*) AS eventCount,
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS created,
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS sunk,
      SUM(amount) AS net
    FROM economy_events
    WHERE createdAt >= datetime('now', ?)
  `).get(`-${nDays} days`) || {}

  return {
    days: nDays,
    walletCount: rows.length,
    currentCash: Number(totals.cash || 0),
    currentCarValue: Number(totals.carValue || 0),
    currentHorseValue: Number(totals.horseValue || 0),
    currentCryptoValue: Number(totals.cryptoValue || 0),
    currentNetWorth: Number(totals.netWorth || 0),
    recentEvents: {
      eventCount: Number(eventTotals.eventCount || 0),
      created: Number(eventTotals.created || 0),
      sunk: Number(eventTotals.sunk || 0),
      net: Number(eventTotals.net || 0)
    },
    topSources: getEconomySourceTotals(nDays, 8),
    topWallets,
    topNetWorth: rows
      .sort((a, b) => (Number(b.totalNetWorth) - Number(a.totalNetWorth)) || String(a.uuid).localeCompare(String(b.uuid)))
      .slice(0, 5)
  }
}

const MONTHLY_FILTERS = {
  monthly: {
    where: "source != 'admin' AND category NOT IN ('transfer_in', 'transfer_out', 'refund')",
    order: 'total DESC, eventCount DESC, userUUID ASC',
    label: 'Monthly Net Gain'
  },
  monthlydj: {
    where: "source = 'dj'",
    order: 'total DESC, eventCount DESC, userUUID ASC',
    label: 'Monthly DJ Earnings'
  },
  monthlyf1: {
    where: "source = 'f1'",
    order: 'total DESC, eventCount DESC, userUUID ASC',
    label: 'Monthly F1 Net'
  },
  monthlygamblers: {
    where: "source IN ('slots', 'roulette', 'horse_race', 'f1')",
    order: 'total DESC, eventCount DESC, userUUID ASC',
    label: 'Monthly Gambling Net'
  }
}

export function getMonthlyLeaderboard (leaderboardType = 'monthly', limit = 10, monthKey = getCurrentMonthKey()) {
  const type = String(leaderboardType || 'monthly').toLowerCase()
  const config = MONTHLY_FILTERS[type] || MONTHLY_FILTERS.monthly
  const nLimit = Math.max(1, Math.min(50, Math.floor(Number(limit || 10))))
  const bounds = getMonthBounds(monthKey)
  const rows = db.prepare(`
    SELECT
      userUUID,
      SUM(amount) AS total,
      COUNT(*) AS eventCount
    FROM economy_events
    WHERE createdAt >= ?
      AND createdAt < ?
      AND ${config.where}
    GROUP BY userUUID
    HAVING ABS(total) > 0
    ORDER BY ${config.order}
    LIMIT ?
  `).all(bounds.startIso, bounds.endIso, nLimit)

  return rows.map((row, index) => ({
    rank: index + 1,
    uuid: String(row.userUUID),
    amount: Number(row.total || 0),
    eventCount: Number(row.eventCount || 0),
    monthKey: bounds.monthKey,
    leaderboardType: type,
    label: config.label
  }))
}

export function snapshotMonthlyLeaderboard (leaderboardType = 'monthly', limit = 10, monthKey = getCurrentMonthKey()) {
  const rows = getMonthlyLeaderboard(leaderboardType, limit, monthKey)
  const type = String(leaderboardType || 'monthly').toLowerCase()
  const bounds = getMonthBounds(monthKey)
  const tx = db.transaction((entries) => {
    db.prepare(`
      DELETE FROM monthly_leaderboard_snapshots
      WHERE monthKey = ? AND leaderboardType = ?
    `).run(bounds.monthKey, type)

    const insert = db.prepare(`
      INSERT INTO monthly_leaderboard_snapshots (
        monthKey, leaderboardType, rank, userUUID, amount, meta, capturedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)

    for (const row of entries) {
      insert.run(
        bounds.monthKey,
        type,
        row.rank,
        row.uuid,
        row.amount,
        JSON.stringify({ eventCount: row.eventCount })
      )
    }
  })

  tx(rows)
  syncMonthlyPrestigeAwards(type, rows, bounds.monthKey)
  return rows
}

function tableExists (tableName) {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(String(tableName))
    return !!row
  } catch {
    return false
  }
}

function toInt (n) {
  return Math.floor(Number(n || 0))
}

function clamp (n, min, max) {
  return Math.max(min, Math.min(max, n))
}

// Keep this aligned with F1 /sellcar pricing.
function estimateCarSaleValue (car) {
  const price = Math.max(0, toInt(car?.price))
  const tier = String(car?.tier || 'starter').toLowerCase()
  const wear = Math.max(0, Math.min(100, toInt(car?.wear)))
  const wins = Math.max(0, toInt(car?.wins))
  const podiums = Math.max(0, toInt(car?.podiums))
  const earnings = Math.max(0, toInt(car?.careerEarnings))

  const basePctByTier = {
    starter: 0.64,
    pro: 0.58,
    hyper: 0.52,
    legendary: 0.46
  }
  const basePct = basePctByTier[tier] ?? 0.62
  const baseValue = price * basePct

  const wearFloorByTier = {
    starter: 0.35,
    pro: 0.32,
    hyper: 0.28,
    legendary: 0.24
  }
  const wearFactor = Math.max(wearFloorByTier[tier] ?? 0.24, 1 - (wear * 0.0068))

  const perfMultByTier = {
    starter: 0.85,
    pro: 0.92,
    hyper: 1.00,
    legendary: 1.06
  }
  const perfMult = perfMultByTier[tier] ?? 1
  const perfBonusRaw = ((wins * 600) + (podiums * 240) + (earnings * 0.02)) * perfMult
  const perfBonus = Math.min(price * 0.12, perfBonusRaw)

  const raw = Math.floor(baseValue * wearFactor + perfBonus)
  const minFloorByTier = {
    starter: 0.22,
    pro: 0.20,
    hyper: 0.18,
    legendary: 0.15
  }
  const maxCapByTier = {
    starter: 0.72,
    pro: 0.68,
    hyper: 0.62,
    legendary: 0.58
  }
  const minFloor = Math.floor(price * (minFloorByTier[tier] ?? 0.15))
  const maxCap = Math.floor(price * (maxCapByTier[tier] ?? 0.58))
  return Math.max(minFloor, Math.min(maxCap, raw))
}

// Keep this aligned with horse /sellhorse pricing.
function estimateHorseSaleValue (horse) {
  const price = Math.max(0, toInt(horse?.price))
  if (price <= 0) return 0

  const tier = String(horse?.tier || '').toLowerCase()
  const races = Math.max(0, toInt(horse?.racesParticipated))
  const wins = Math.max(0, toInt(horse?.wins))
  const careerLength = Math.max(0, toInt(horse?.careerLength))
  const retired = !!horse?.retired || Number(horse?.retired) === 1

  const basePctByTier = {
    basic: 0.58,
    elite: 0.50,
    champion: 0.42
  }
  const basePct = basePctByTier[tier] ?? 0.64
  const baseValue = price * basePct

  const left = Math.max(0, careerLength - races)
  const leftPct = careerLength > 0 ? clamp(left / careerLength, 0, 1) : 0.8
  const lifeFactor = retired ? 0.10 : (0.10 + (0.90 * Math.pow(leftPct, 1.85)))

  const winRate = wins / Math.max(1, races)
  const perfRaw = (wins * 180) + Math.floor(winRate * price * 0.04)
  const perfBonus = Math.floor(perfRaw * Math.pow(leftPct, 2.4))
  const performanceBonus = Math.min(Math.floor(price * 0.05), perfBonus)

  const raw = Math.floor((baseValue * lifeFactor) + performanceBonus)
  const minFloor = Math.floor(price * (retired ? 0.03 : 0.08))
  const maxCapByLife = Math.floor(price * (retired ? 0.12 : (0.14 + (0.46 * Math.pow(leftPct, 1.4)))))
  const maxCap = Math.max(minFloor, maxCapByLife)
  return Math.max(minFloor, Math.min(maxCap, raw))
}

function ensureUserRow (map, uuid) {
  const key = String(uuid)
  if (!map.has(key)) {
    map.set(key, {
      uuid: key,
      nickname: 'Unknown',
      cash: 0,
      carValue: 0,
      horseValue: 0,
      cryptoValue: 0,
      totalNetWorth: 0
    })
  }
  return map.get(key)
}

async function buildNetWorthRows () {
  const users = db.prepare(`
    SELECT uuid, nickname, COALESCE(balance, 0) AS balance
    FROM users
  `).all()

  const byUser = new Map()

  for (const row of users) {
    byUser.set(String(row.uuid), {
      uuid: String(row.uuid),
      nickname: row.nickname || 'Unknown',
      cash: Number(row.balance) || 0,
      carValue: 0,
      horseValue: 0,
      cryptoValue: 0,
      totalNetWorth: 0
    })
  }

  if (tableExists('cars')) {
    const cars = db.prepare(`
      SELECT ownerId, price, tier, wear, wins, podiums, careerEarnings
      FROM cars
      WHERE ownerId IS NOT NULL
        AND ownerId != ''
    `).all()

    for (const car of cars) {
      const row = ensureUserRow(byUser, car.ownerId)
      row.carValue += estimateCarSaleValue(car)
    }
  }

  if (tableExists('horses')) {
    const horses = db.prepare(`
      SELECT ownerId, price, tier, racesParticipated, wins, careerLength, retired
      FROM horses
      WHERE ownerId IS NOT NULL
        AND ownerId != ''
    `).all()

    for (const horse of horses) {
      const row = ensureUserRow(byUser, horse.ownerId)
      row.horseValue += estimateHorseSaleValue(horse)
    }
  }

  if (tableExists('crypto_positions')) {
    const positions = db.prepare(`
      SELECT userId, coinId, quantity
      FROM crypto_positions
      WHERE userId IS NOT NULL
        AND userId != ''
        AND quantity > 0
    `).all()

    if (positions.length) {
      const uniqueCoinIds = [...new Set(positions.map(p => String(p.coinId)))]
      const priceEntries = await Promise.all(
        uniqueCoinIds.map(async (coinId) => {
          try {
            const price = await getCryptoPrice(coinId)
            return [coinId, Number(price) || 0]
          } catch {
            return [coinId, 0]
          }
        })
      )
      const priceMap = new Map(priceEntries)

      for (const pos of positions) {
        const row = ensureUserRow(byUser, pos.userId)
        const price = Number(priceMap.get(String(pos.coinId)) || 0)
        const qty = Number(pos.quantity) || 0
        row.cryptoValue += (qty * price)
      }
    }
  }

  return Array.from(byUser.values()).map((row) => {
    const totalNetWorth =
      (Number(row.cash) || 0) +
      (Number(row.carValue) || 0) +
      (Number(row.horseValue) || 0) +
      (Number(row.cryptoValue) || 0)

    return { ...row, totalNetWorth }
  })
}

async function getCachedNetWorthRows () {
  const now = Date.now()
  if (netWorthCache.rows && now - netWorthCache.ts < NET_WORTH_TTL_MS) {
    return netWorthCache.rows
  }

  if (netWorthCache.promise) return netWorthCache.promise

  netWorthCache.promise = buildNetWorthRows()
    .then((rows) => {
      netWorthCache.rows = rows
      netWorthCache.ts = Date.now()
      netWorthCache.promise = null
      return rows
    })
    .catch((err) => {
      netWorthCache.promise = null
      throw err
    })

  return netWorthCache.promise
}

export async function getTopNetWorthLeaderboard (limit = 5) {
  const n = Math.max(1, Math.min(50, Math.floor(Number(limit || 5))))
  const rows = await getCachedNetWorthRows()

  return rows
    .sort((a, b) =>
      (Number(b.totalNetWorth) - Number(a.totalNetWorth)) ||
      (Number(b.cash) - Number(a.cash)) ||
      String(a.uuid).localeCompare(String(b.uuid))
    )
    .slice(0, n)
}

export async function getNetWorthForUser (userUUID) {
  const id = String(userUUID || '').trim()
  if (!id) return null

  const rows = await getCachedNetWorthRows()
  return rows.find(r => String(r.uuid) === id) || {
    uuid: id,
    nickname: 'Unknown',
    cash: 0,
    carValue: 0,
    horseValue: 0,
    cryptoValue: 0,
    totalNetWorth: 0
  }
}
