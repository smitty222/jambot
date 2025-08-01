import { EventEmitter } from 'events';

/**
 * Event bus for the horse race lifecycle.
 */
export const bus = new EventEmitter();

/**
 * Executes an async function with retry support.
 * @param {Function} fn - Async function to call.
 * @param {Array} args - Arguments for fn.
 * @param {number} retries - Number of retry attempts.
 * @param {number} delayMs - Delay between retries in ms.
 * @returns {Promise<*>} Result of fn.
 * @throws Error when all attempts fail.
 */
export async function safeCall(fn, args = [], retries = 2, delayMs = 500) {
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn(...args);
    } catch (err) {
      lastError = err;
      if (i < retries) await new Promise(res => setTimeout(res, delayMs));
    }
  }

  const error = new Error(
    `${fn.name || 'anonymous'} failed after ${retries + 1} attempts: ${lastError.message}`
  );
  error.cause = lastError;
  throw error;
}
