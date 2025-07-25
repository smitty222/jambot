// src/libs/themeManager.js
import db from '../database/db.js'

// Get current theme for a room
export function getTheme(roomId) {
  const result = db.prepare('SELECT theme FROM themes WHERE roomId = ?').get(roomId)
  return result?.theme || null
}

// Set or update a theme for a room
export function setTheme(roomId, theme) {
  db.prepare(`
    INSERT INTO themes (roomId, theme)
    VALUES (?, ?)
    ON CONFLICT(roomId) DO UPDATE SET theme = excluded.theme
  `).run(roomId, theme)
}

// Optional: Load all themes (room → theme map)
export function loadThemes() {
  const rows = db.prepare('SELECT * FROM themes').all()
  const map = {}
  for (const row of rows) {
    map[row.roomId] = row.theme
  }
  return map
}
