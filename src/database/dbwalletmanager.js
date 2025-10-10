// src/libs/dbWalletManager.js
import db from './db.js'
// Import the standalone nickname util instead of importing from the
// message handler. This avoids circular dependencies.
import { getUserNickname } from '../utils/nickname.js'
import { fetchRecentSongs } from '../utils/API.js'

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
  const rows = db.prepare('SELECT uuid, balance FROM wallets').all()
  for (const { uuid, balance } of rows) {
    walletCache.set(uuid, roundToTenth(balance))
  }
}

// Persist a single user balance to the DB. Called asynchronously via
// setImmediate from getUserWallet/addToUserWallet/removeFromUserWallet.
function persistWallet (uuid, balance) {
  try {
    db.prepare(
      `INSERT INTO wallets (uuid, balance) VALUES (?, ?)
       ON CONFLICT(uuid) DO UPDATE SET balance = excluded.balance`
    ).run(uuid, balance)
  } catch (err) {
    logger.error('[WalletCache] Failed to persist wallet', { err: err?.message || err })
  }
}

function roundToTenth (amount) {
  return Math.round(amount * 10) / 10
}

export async function addOrUpdateUser (userUUID) {
  const nickname = await getUserNickname(userUUID)
  if (!nickname) return
  db.prepare(
    `INSERT INTO users (uuid, nickname)
     VALUES (?, ?)
     ON CONFLICT(uuid) DO UPDATE SET nickname = excluded.nickname`
  ).run(userUUID, nickname)
}

export function loadWallets () {
  ensureWalletCache()
  const out = {}
  for (const [uuid, balance] of walletCache.entries()) {
    out[uuid] = { balance }
  }
  return out
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
          const row = db.prepare('SELECT balance FROM wallets WHERE uuid = ?').get(fromUuid) || { balance: 0 }
          const fromBalance = row.balance ?? 0
          if (fromBalance < amount) throw new Error('INSUFFICIENT_FUNDS')
          // Debit sender
          db.prepare('UPDATE wallets SET balance = balance - ? WHERE uuid = ?').run(amount, fromUuid)
          // Credit recipient (upsert). Note: inserts a new wallet row if needed.
          db.prepare(
            `INSERT INTO wallets (uuid, balance) VALUES (?, ?)
             ON CONFLICT(uuid) DO UPDATE SET balance = balance + excluded.balance`
          ).run(toUuid, amount)
        })
        tx(fromUuid, toUuid, amount)
        // Read fresh balances from DB to update cache accurately
        const senderRow = db.prepare('SELECT balance FROM wallets WHERE uuid = ?').get(fromUuid) || { balance: 0 }
        const recipientRow = db.prepare('SELECT balance FROM wallets WHERE uuid = ?').get(toUuid) || { balance: 0 }
        const senderBal = roundToTenth(senderRow.balance ?? 0)
        const recipientBal = roundToTenth(recipientRow.balance ?? 0)
        walletCache.set(fromUuid, senderBal)
        walletCache.set(toUuid, recipientBal)
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
  // Persist asynchronously to avoid blocking the event loop.
  setImmediate(() => persistWallet(userUUID, initialBalance))
  return initialBalance
}

export function removeFromUserWallet (userUUID, amount) {
  ensureWalletCache()
  const current = getUserWallet(userUUID)
  if (current < amount) return false
  const newBalance = roundToTenth(current - amount)
  walletCache.set(userUUID, newBalance)
  // Persist asynchronously
  setImmediate(() => persistWallet(userUUID, newBalance))
  return true
}

export async function addToUserWallet (userUUID, amount, nickname = null) {
  await addOrUpdateUser(userUUID, nickname)
  ensureWalletCache()
  const current = getUserWallet(userUUID)
  const newBalance = roundToTenth(current + amount)
  walletCache.set(userUUID, newBalance)
  // Persist asynchronously
  setImmediate(() => persistWallet(userUUID, newBalance))
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
  const wallets = db.prepare(`
    SELECT u.uuid, u.nickname, w.balance
    FROM wallets w
    LEFT JOIN users u ON u.uuid = w.uuid
  `).all()

  return wallets.map(({ uuid, nickname, balance }) => ({
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

  await addToUserWallet(userUuid, amount, nickname)

  logger.info(`Added $${amount} to ${nickname}'s wallet (${userUuid}).`)
}

export function getBalanceByNickname (nickname) {
  const row = db.prepare(`
    SELECT w.balance FROM wallets w
    JOIN users u ON u.uuid = w.uuid
    WHERE LOWER(u.nickname) = ?
  `).get(nickname.toLowerCase())

  return row ? roundToTenth(row.balance) : null
}

export async function songPayment () {
  try {
    const songPlays = await fetchRecentSongs()
    if (!Array.isArray(songPlays) || songPlays.length === 0) {
      logger.info('No recent songs found.')
      return
    }

    const { djUuid: userUUID, voteCounts } = songPlays[0]
    const voteCount = voteCounts.likes

    if (userUUID && typeof voteCount === 'number' && voteCount > 0) {
      const success = await addToUserWallet(userUUID, voteCount * 2)
      if (success) {
        logger.info(`Added $${voteCount * 2} to user ${userUUID}'s wallet for ${voteCount} likes.`)
      } else {
        logger.error(`Failed to add to wallet for user ${userUUID}`)
      }
    } else {
      logger.error('Invalid userUUID or voteCount for songPlay')
    }
  } catch (error) {
    logger.error('Error in songPayment', { err: error?.message || error })
  }
}
