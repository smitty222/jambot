// src/database/dbteams.js
import db from './db.js'

function ensureTeamsTable () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ownerId TEXT NOT NULL UNIQUE,
      ownerName TEXT,
      name TEXT NOT NULL,
      badge TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      garageLevel INTEGER DEFAULT 1
    );
  `)
}

ensureTeamsTable()

export function createTeam ({ ownerId, ownerName, name, badge = '' }) {
  ensureTeamsTable()
  const stmt = db.prepare(`
    INSERT INTO teams (ownerId, ownerName, name, badge)
    VALUES (?, ?, ?, ?)
  `)
  const info = stmt.run(String(ownerId), String(ownerName || ''), String(name), String(badge || ''))
  return info.lastInsertRowid
}

export function getTeamByOwner (ownerId) {
  ensureTeamsTable()
  const stmt = db.prepare(`SELECT * FROM teams WHERE ownerId = ?`)
  return stmt.get(String(ownerId))
}

export function getTeamById (id) {
  ensureTeamsTable()
  const stmt = db.prepare(`SELECT * FROM teams WHERE id = ?`)
  return stmt.get(Number(id))
}
export function updateTeamIdentity (ownerId, name, badge = '') {
  ensureTeamsTable()
  const stmt = db.prepare(`UPDATE teams SET name = ?, badge = ? WHERE ownerId = ?`)
  return stmt.run(String(name), String(badge || ''), String(ownerId))
}

export function updateTeamGarageLevel (ownerId, garageLevel) {
  ensureTeamsTable()
  const stmt = db.prepare(`UPDATE teams SET garageLevel = ? WHERE ownerId = ?`)
  return stmt.run(Number(garageLevel), String(ownerId))
}