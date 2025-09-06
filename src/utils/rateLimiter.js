// src/utils/rateLimiter.js
// A simple per-command, per-user rate limiter. It keeps a small in-memory
// bucket for each command/user combo and allows a limited number of
// executions within a rolling time window. This helps prevent spamming
// expensive commands like slots, roulette, or AI requests.

export default class RateLimiter {
  /**
   * Create a new RateLimiter.
   *
   * @param {Object.<string, {windowMs: number, max: number}>} defaults
   *   An object mapping command names to config objects. Each config
   *   includes `windowMs` (length of the window in milliseconds) and
   *   `max` (maximum allowed executions within the window). Commands not
   *   specified here fall back to a default of 1 execution per 10s.
   */
  constructor(defaults = {}) {
    this.defaults = defaults;
    // Buckets keyed by `${cmd}:${user}` → { start: number, count: number }
    this.buckets = {};
  }

  /**
   * Attempt to take a token for a given command/user. Returns true if
   * allowed, false otherwise. When a window expires, the bucket resets.
   *
   * @param {string} cmd The command name (without leading slash).
   * @param {string} userId The user’s unique identifier.
   * @returns {boolean} Whether the command is allowed to execute.
   */
  take(cmd, userId) {
    const cfg = this.defaults[cmd] || {};
    const windowMs = cfg.windowMs ?? 10_000;
    const max = cfg.max ?? 1;
    const key = `${cmd}:${userId}`;
    const now = Date.now();
    let bucket = this.buckets[key];
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      this.buckets[key] = bucket;
    }
    if (bucket.count >= max) {
      return false;
    }
    bucket.count++;
    return true;
  }
}