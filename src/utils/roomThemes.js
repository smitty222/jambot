// src/utils/roomThemes.js
//
// A shared store for room themes. Many parts of the bot read and write
// the current theme for a room. Previously this state lived on the
// message handler module and was imported across the codebase, which
// created tight coupling and circular dependencies. By centralising the
// store here, consumers can import the object without pulling in the
// entire message handler.

/**
 * A mutable object mapping room UUIDs to their current theme. Modules
 * can read from and write to this map. When the application starts up,
 * themes are loaded from the database via themeManager and merged into
 * this object.
 */
export const roomThemes = {}

/**
 * Replace all current theme entries with the provided map. Useful when
 * loading themes from disk or the database at startup.
 *
 * @param {Record<string,string>} themes
 */
export function setThemes(themes) {
  // Clear existing keys without losing identity
  Object.keys(roomThemes).forEach(k => delete roomThemes[k])
  Object.assign(roomThemes, themes)
}
