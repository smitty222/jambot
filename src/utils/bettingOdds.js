// src/utils/bettingOdds.js
//
// Manage a JSON file of betting odds with an in-memory cache. Reading
// and writing JSON synchronously on the hot path blocks the event loop,
// causing latency spikes under load. This module lazily loads the file
// once, keeps it in memory, and persists changes asynchronously. A
// watch is registered to invalidate the cache when the underlying file
// changes on disk.

import fs from 'fs/promises';
import * as fsSync from 'fs';

const FILE_PATH = 'src/data/bettingOdds.json';

// In-memory cache of all odds keyed by sport. Null indicates the
// cache has not been loaded yet or has been invalidated.
let oddsCache = null;

/**
 * Load and parse the entire odds file into memory. If the cache has
 * already been populated and not invalidated, the cached value is
 * returned.
 * @returns {Promise<Record<string, any>>}
 */
async function loadAllOdds() {
  if (oddsCache && typeof oddsCache === 'object') return oddsCache;
  try {
    const data = await fs.readFile(FILE_PATH, 'utf8');
    oddsCache = JSON.parse(data);
  } catch {
    oddsCache = {};
  }
  return oddsCache;
}

// Watch the odds file for changes and clear the cache when it changes.
try {
  fsSync.watchFile(FILE_PATH, { persistent: false }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      oddsCache = null;
    }
  });
} catch {
  // If watchFile is unsupported, we fall back to lazy loading without
  // invalidation. This may result in stale reads until process restart.
}

/**
 * Persist the entire odds map to disk. This helper is used internally
 * after modifying the cache. It writes the file asynchronously.
 * @param {Record<string, any>} allOdds
 */
async function persistOdds(allOdds) {
  oddsCache = allOdds;
  try {
    await fs.writeFile(FILE_PATH, JSON.stringify(allOdds, null, 2));
  } catch (err) {
    console.error('[bettingOdds] Failed to persist odds:', err);
  }
}

/**
 * Save the odds for a particular sport. The cache is updated and the
 * new odds are written to disk asynchronously. If the file cannot be
 * parsed, it will be overwritten with the provided sport odds only.
 * @param {string} sport
 * @param {any} odds
 * @returns {Promise<void>}
 */
export async function saveOddsForSport(sport, odds) {
  const allOdds = await loadAllOdds();
  allOdds[sport] = odds;
  await persistOdds(allOdds);
}

/**
 * Retrieve the odds for a given sport. Returns an empty array if the
 * sport is not found.
 * @param {string} sport
 * @returns {Promise<any[]>}
 */
export async function getOddsForSport(sport) {
  const allOdds = await loadAllOdds();
  return allOdds[sport] || [];
}
