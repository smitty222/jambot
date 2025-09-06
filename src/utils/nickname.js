// src/utils/nickname.js
//
// A small utility to centralize nickname lookup. The bot uses a simple
// convention of formatting a user UUID into a mention string. Having this
// defined in its own module avoids circular dependencies on the heavy
// message handler and allows other modules to import the function
// directly. If in the future nicknames are stored in a database or
// fetched from an API, the implementation can be swapped here without
// touching consumers.

/**
 * Return a mention string for a given user UUID. This implementation
 * simply wraps the UUID in the Turntable-specific <@uid:...> syntax.
 *
 * @param {string} userId
 * @returns {Promise<string>} a formatted mention
 */
export async function getUserNickname(userId) {
  // If a UUID array is passed inadvertently (legacy callers), handle it
  // gracefully by taking the first element.
  const id = Array.isArray(userId) ? userId[0] : userId
  // In a future refactor, replace this with a DB/API lookup.
  return `<@uid:${id}>`
}
