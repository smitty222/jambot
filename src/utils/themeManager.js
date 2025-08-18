// src/utils/themeManager.js
import db from '../database/db.js';

const DEFAULT_THEME = 'Just Jam';

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      roomId TEXT PRIMARY KEY,
      theme  TEXT NOT NULL
    );
  `);
}
ensureSchema();

export function normalizeTheme(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return DEFAULT_THEME;
  return s.split(/\s+/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// Map of roomId -> theme
export function loadThemes() {
  const rows = db.prepare(`SELECT roomId, theme FROM themes`).all();
  const map = Object.create(null);
  for (const r of rows) map[r.roomId] = r.theme;
  return map;
}

export function getTheme(roomId) {
  const row = db.prepare(`SELECT theme FROM themes WHERE roomId = ?`).get(roomId);
  return row?.theme || DEFAULT_THEME;
}

export function setTheme(roomId, theme) {
  const clean = normalizeTheme(theme);
  db.prepare(`
    INSERT INTO themes (roomId, theme)
    VALUES (?, ?)
    ON CONFLICT(roomId) DO UPDATE SET theme = excluded.theme
  `).run(roomId, clean);
  return clean;
}

export function removeTheme(roomId, fallback = DEFAULT_THEME) {
  if (!fallback) {
    db.prepare(`DELETE FROM themes WHERE roomId = ?`).run(roomId);
    return null;
  }
  return setTheme(roomId, fallback);
}
