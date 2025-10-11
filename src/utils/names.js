// src/utils/names.js
//
// Utility helpers for working with Turntable user identifiers and nicknames.
//
// In Turntable chat messages, users are mentioned via a special syntax
// `<@uid:UUID>` rather than by their plain nickname. When storing
// information about a user in our database we want to keep the
// human‑readable nickname separate from the mention format. This module
// provides helpers to format a mention from a UUID, parse a mention
// back into a UUID, and sanitise arbitrary nickname strings by
// stripping any mention formatting or leading punctuation.

/**
 * Given a user UUID return a properly formatted Turntable mention. This
 * function always wraps the UUID in the `<@uid:…>` envelope. Use this
 * when composing messages to the chat so that Turntable resolves the
 * user’s current display name.
 *
 * @param {string} uuid The unique identifier for the user
 * @returns {string} A Turntable mention like `<@uid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx>`
 */
export function formatMention (uuid) {
  return `<@uid:${uuid}>`
}

/**
 * Attempt to extract a UUID from a Turntable mention. If the input
 * resembles `<@uid:…>` then the inner UUID is returned, otherwise
 * `null` is returned. Whitespace around the input is ignored.
 *
 * @param {string} mention The mention string to parse
 * @returns {string|null} The extracted UUID or `null` if the input is not a mention
 */
export function parseMention (mention) {
  if (!mention) return null
  const trimmed = String(mention).trim()
  const m = /^<@uid:([^>]+)>$/.exec(trimmed)
  return m ? m[1] : null
}

/**
 * Sanitise a nickname for storage. Turntable sometimes sends nicknames
 * as mentions (e.g. `<@uid:abcd>`). When persisting to the database we
 * want to avoid storing these mention tokens because they are not
 * human‑friendly and will cause the site to display raw mention text.
 *
 * This helper strips leading `@` symbols, removes angle brackets, and
 * collapses whitespace. If the nickname looks like a mention (i.e.
 * matches `<@uid:…>`), an empty string is returned. Calling code can
 * detect the empty string and choose an appropriate fallback (such as
 * the user UUID) when inserting into the users table.
 *
 * @param {string|null|undefined} nickname The raw nickname from an event
 * @returns {string} A cleaned nickname, or empty string if it looked like a mention
 */
export function sanitizeNickname (nickname) {
  if (!nickname) return ''
  const s = String(nickname).trim()
  // If the entire string is a mention token (e.g. <@uid:abcd>) treat as no nickname
  if (/^<@uid:[^>]+>$/.test(s)) return ''
  // Remove leading @ (from @username) and any stray angle brackets
  return s.replace(/^@/, '').replace(/[<>]/g, '').trim()
}

/**
 * Lookup a user's display name from the database. Given a UUID, this
 * helper fetches the stored nickname from the users table. If no
 * record exists or the nickname column is null/empty, the UUID is
 * returned as a fallback. This should be used when you need a
 * human‑friendly name (e.g. for site display) rather than a raw
 * Turntable mention. Note: This function performs a synchronous
 * SQLite query; avoid calling it in tight loops on the hot path.
 *
 * @param {string} userId The unique identifier for the user
 * @returns {string} The user’s stored nickname or their UUID
 */
import db from '../database/db.js'

export function getDisplayName (userId) {
  try {
    const row = db.prepare('SELECT nickname FROM users WHERE uuid = ?').get(userId)
    const name = row?.nickname
    // If the nickname is empty or undefined, fall back to the UUID
    return name && String(name).trim().length > 0 ? name : userId
  } catch {
    return userId
  }
}