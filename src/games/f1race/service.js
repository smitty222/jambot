// src/games/f1race/service.js
import { EventEmitter } from 'events'

/** Global event bus for the F1 race lifecycle. */
export const bus = new EventEmitter()

/**
 * Retry wrapper for async calls with tiny backoff.
 * @param {Function} fn
 * @param {Array} [args=[]]
 * @param {number} [retries=1]
 * @param {number} [delayMs=120]
 */
export async function safeCall (fn, args = [], retries = 1, delayMs = 120) {
  let lastError
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn(...args)
    } catch (err) {
      lastError = err
      if (i < retries) await new Promise(r => setTimeout(r, delayMs))
    }
  }
  const error = new Error(`${fn.name || 'anonymous'} failed after ${retries + 1} attempts: ${lastError?.message}`)
  error.cause = lastError
  throw error
}