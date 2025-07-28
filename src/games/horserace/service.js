// src/games/horserace/service.js

import { EventEmitter } from 'events';

// ─── Event Bus ───────────────────────────────────────────────────────────────
// Used to emit and listen for “betsClosed” so the simulation can start
export const bus = new EventEmitter();

// ─── safeCall retry-wrapper ──────────────────────────────────────────────────
/**
 * Wrap any async function call with retries + delay between attempts.
 *
 * @param {Function} fn        The async function to call
 * @param {Array}    args      Arguments to pass to fn
 * @param {number}   retries   How many retries (default: 2)
 * @param {number}   delayMs   Milliseconds to wait between retries (default: 500)
 * @returns {Promise<*>}       Resolves with fn(...args) or rejects after all retries
 */
export async function safeCall(fn, args = [], retries = 2, delayMs = 500) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(...args);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        // Wait before retrying
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  }
  // All retries failed
  throw lastError;
}
