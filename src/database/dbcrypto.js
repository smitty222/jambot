// src/database/dbcrypto.js
//
// Helper functions for managing users’ paper crypto portfolios. This module
// provides a simple in‑memory and SQLite backed ledger for tracking cash
// balances, positions and trade history. It is intentionally kept small and
// self‑contained so other parts of the bot can interact with crypto accounts
// without worrying about SQL statements.

import db from './db.js'
import { logger } from '../utils/logging.js'

// Ensure a crypto account exists for the given user. Accounts start with
// zero cash; callers are expected to credit the account with an initial
// bankroll (if desired) on first use.
export function ensureCryptoAccount (userId) {
  try {
    db.prepare(
      `INSERT OR IGNORE INTO crypto_accounts (userId, cashUsd)
       VALUES (?, 0)`
    ).run(userId)
  } catch (err) {
    logger.error('[dbcrypto] Failed to ensure account', { err: err?.message || err })
  }
}

// Get the current cash balance for a user. If the account does not exist it
// will be created with zero cash.
export function getCryptoCash (userId) {
  ensureCryptoAccount(userId)
  const row = db.prepare('SELECT cashUsd FROM crypto_accounts WHERE userId = ?').get(userId)
  return row?.cashUsd ?? 0
}

// Increment (or decrement) the cash balance for a user. Negative deltas are
// allowed. If the resulting balance would fall below zero, an exception is
// thrown. This helper ensures the account exists before updating.
export function updateCryptoCash (userId, delta) {
  ensureCryptoAccount(userId)
  const row = db.prepare('SELECT cashUsd FROM crypto_accounts WHERE userId = ?').get(userId)
  const current = row?.cashUsd ?? 0
  const next = current + delta
  if (next < -1e-6) {
    throw new Error('INSUFFICIENT_CASH')
  }
  db.prepare('UPDATE crypto_accounts SET cashUsd = ? WHERE userId = ?').run(next, userId)
  return next
}

// Retrieve a position (if any) for a user and coin. Returns null when the user
// holds no quantity of the given coin.
export function getPosition (userId, coinId) {
  const row = db
    .prepare('SELECT quantity, avgCostUsd, symbol FROM crypto_positions WHERE userId = ? AND coinId = ?')
    .get(userId, coinId)
  if (!row) return null
  return { quantity: row.quantity, avgCostUsd: row.avgCostUsd, symbol: row.symbol }
}

// Return all positions for a user. Each entry contains coinId, symbol,
// quantity and average cost.
export function getPositions (userId) {
  return db
    .prepare('SELECT coinId, symbol, quantity, avgCostUsd FROM crypto_positions WHERE userId = ?')
    .all(userId)
}

// Upsert a position when buying coins. The average cost is updated via a
// weighted average. Throws if quantity or price are invalid.
export function addPosition (userId, coinId, symbol, quantity, priceUsd) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('INVALID_QUANTITY')
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new Error('INVALID_PRICE')
  const existing = getPosition(userId, coinId)
  if (!existing) {
    db.prepare(
      `INSERT INTO crypto_positions (userId, coinId, symbol, quantity, avgCostUsd)
       VALUES (?, ?, ?, ?, ?)`
    ).run(userId, coinId, symbol, quantity, priceUsd)
  } else {
    const newQty = existing.quantity + quantity
    const newAvg = ((existing.quantity * existing.avgCostUsd) + (quantity * priceUsd)) / newQty
    db.prepare(
      `UPDATE crypto_positions
         SET quantity = ?, avgCostUsd = ?
       WHERE userId = ? AND coinId = ?`
    ).run(newQty, newAvg, userId, coinId)
  }
}

// Reduce a position when selling coins. Removes the row entirely when the
// resulting quantity is zero. Throws if the user tries to sell more than they
// own or if invalid arguments are supplied.
export function reducePosition (userId, coinId, quantity) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('INVALID_QUANTITY')
  const existing = getPosition(userId, coinId)
  if (!existing || existing.quantity < quantity - 1e-12) throw new Error('INSUFFICIENT_POSITION')
  const remaining = existing.quantity - quantity
  if (remaining <= 1e-12) {
    db.prepare('DELETE FROM crypto_positions WHERE userId = ? AND coinId = ?').run(userId, coinId)
  } else {
    db.prepare('UPDATE crypto_positions SET quantity = ? WHERE userId = ? AND coinId = ?')
      .run(remaining, userId, coinId)
  }
}

// Record a trade in the history table. The side should be either 'BUY' or
// 'SELL'. Quantity and price must be positive numbers. Timestamp defaults to
// the current ISO string when not provided.
export function recordTrade (userId, coinId, side, quantity, priceUsd, timestamp = null) {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('INVALID_QUANTITY')
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) throw new Error('INVALID_PRICE')
  const ts = timestamp || new Date().toISOString()
  db.prepare(
    `INSERT INTO crypto_trades (userId, coinId, side, quantity, priceUsd, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, coinId, side, quantity, priceUsd, ts)
}
