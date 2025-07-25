// src/database/dbavatars.js
import db from './db.js'

export function getAllAvatarSlugs() {
  return db.prepare('SELECT slug FROM avatars').all().map(row => row.slug)
}

export function getAvatarsBySlugs(slugs) {
  const placeholders = slugs.map(() => '?').join(', ')
  return db.prepare(`SELECT slug FROM avatars WHERE slug IN (${placeholders})`).all(...slugs)
}

export function getRandomAvatarSlug() {
  const result = db.prepare('SELECT slug FROM avatars ORDER BY RANDOM() LIMIT 1').get()
  return result?.slug || null
}

export function insertAvatarSlug(slug) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO avatars (slug)
    VALUES (?)
  `)
  stmt.run(slug)
}
