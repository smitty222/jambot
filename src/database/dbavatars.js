// src/database/dbavatars.js
import db from './db.js'

/*
 * Avatar slug caching
 *
 * Many avatar update commands repeatedly query SQLite to retrieve a random slug
 * or filter allowed slugs. While SQLite is fast, the synchronous queries in
 * `getRandomAvatarSlug` and `getAvatarsBySlugs` are called on every avatar
 * command, adding unnecessary latency to user interactions. To improve
 * responsiveness, we load the full list of avatar slugs into memory once at
 * module load and perform all random selection and filtering operations in
 * memory. When new slugs are inserted or removed via `insertAvatarSlug` or
 * `removeAvatarSlug`, the cache is updated accordingly.  Fall back to an
 * empty array if the database read fails.
 */

// In‑memory cache of all avatar slugs loaded from the database.  This is
// populated once at startup and kept in sync with insert/remove operations.
let allAvatarSlugs = []

function loadAllAvatarSlugs () {
  try {
    allAvatarSlugs = db.prepare('SELECT slug FROM avatars').all().map(row => row.slug) || []
  } catch (err) {
    // If the DB read fails (e.g. missing table), default to an empty list.
    allAvatarSlugs = []
  }
}

// Immediately load slugs on module import.
loadAllAvatarSlugs()

export function getAllAvatarSlugs () {
  // Return a shallow copy to avoid accidental mutation by callers.
  return [...allAvatarSlugs]
}

export function getAvatarsBySlugs (slugs) {
  // Filter allowed slugs from the cached list and return objects mimicking
  // database row shape.  Using the cache avoids a synchronous DB query per call.
  const results = []
  for (const slug of slugs) {
    if (allAvatarSlugs.includes(slug)) {
      results.push({ slug })
    }
  }
  return results
}

export function getRandomAvatarSlug () {
  if (!allAvatarSlugs || allAvatarSlugs.length === 0) return null
  const idx = Math.floor(Math.random() * allAvatarSlugs.length)
  return allAvatarSlugs[idx] || null
}

export function insertAvatarSlug (slug) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO avatars (slug)
    VALUES (?)
  `)
  const info = stmt.run(slug)
  // If a new row was inserted, update the in-memory cache as well.  Without
  // this, newly added avatars would be invisible to getRandomAvatarSlug and
  // getAvatarsBySlugs until the process restarts.
  if (info.changes > 0 && slug && !allAvatarSlugs.includes(slug)) {
    allAvatarSlugs.push(slug)
  }
}

export function removeAvatarSlug (slug) {
  const stmt = db.prepare('DELETE FROM avatars WHERE slug = ?')
  const info = stmt.run(slug)
  // Synchronise the in-memory cache on delete.  Remove all occurrences of
  // the slug from the cached list.  This keeps the cache consistent with
  // the underlying database state.
  if (info.changes > 0) {
    allAvatarSlugs = allAvatarSlugs.filter(s => s !== slug)
  }
  return info.changes // 0 if not found, >0 if deleted
}
