// src/database/dbcars.js
import db from './db.js'

function ensureCarsTable () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ownerId TEXT NOT NULL,
      ownerName TEXT,
      teamId INTEGER,
      name TEXT NOT NULL,
      livery TEXT,
      tier TEXT,
      price INTEGER DEFAULT 0,

      power INTEGER DEFAULT 50,
      handling INTEGER DEFAULT 50,
      aero INTEGER DEFAULT 50,
      reliability INTEGER DEFAULT 50,
      tire INTEGER DEFAULT 50,

      wear INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      races INTEGER DEFAULT 0,

      retired INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cars_owner ON cars(ownerId);
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cars_team ON cars(teamId);
  `)
}

ensureCarsTable()

export function insertCar (car) {
  ensureCarsTable()
  const stmt = db.prepare(`
    INSERT INTO cars (
      ownerId, ownerName, teamId, name, livery, tier, price,
      power, handling, aero, reliability, tire,
      wear, wins, races, retired
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `)

  const info = stmt.run(
    String(car.ownerId),
    String(car.ownerName || ''),
    car.teamId != null ? Number(car.teamId) : null,
    String(car.name),
    String(car.livery || ''),
    String(car.tier || ''),
    Math.floor(Number(car.price || 0)),

    Math.floor(Number(car.power || 50)),
    Math.floor(Number(car.handling || 50)),
    Math.floor(Number(car.aero || 50)),
    Math.floor(Number(car.reliability || 50)),
    Math.floor(Number(car.tire || 50)),

    Math.floor(Number(car.wear || 0)),
    Math.floor(Number(car.wins || 0)),
    Math.floor(Number(car.races || 0)),
    car.retired ? 1 : 0
  )

  return info.lastInsertRowid
}

export function getAllCars () {
  ensureCarsTable()
  return db.prepare(`SELECT * FROM cars`).all()
}

export function getUserCars (ownerId) {
  ensureCarsTable()
  return db.prepare(`SELECT * FROM cars WHERE ownerId = ? ORDER BY retired ASC, wins DESC, races ASC, name ASC`).all(String(ownerId))
}

export function getCarById (id) {
  ensureCarsTable()
  return db.prepare(`SELECT * FROM cars WHERE id = ?`).get(Number(id))
}

export function getCarByNameCaseInsensitive (name) {
  ensureCarsTable()
  return db.prepare(`SELECT * FROM cars WHERE lower(name) = lower(?)`).get(String(name))
}

export function updateCarAfterRace (id, { win = false, wearDelta = 0 }) {
  ensureCarsTable()
  const car = getCarById(id)
  if (!car) return false

  const newRaces = Number(car.races || 0) + 1
  const newWins = Number(car.wins || 0) + (win ? 1 : 0)
  const newWear = Math.max(0, Math.min(100, Number(car.wear || 0) + Math.floor(wearDelta)))

  const stmt = db.prepare(`UPDATE cars SET races = ?, wins = ?, wear = ? WHERE id = ?`)
  stmt.run(newRaces, newWins, newWear, Number(id))
  return true
}

export function setCarWear (id, wear) {
  ensureCarsTable()
  const w = Math.max(0, Math.min(100, Math.floor(Number(wear || 0))))
  return db.prepare(`UPDATE cars SET wear = ? WHERE id = ?`).run(w, Number(id))
}

export function setCarTeam (id, teamId) {
  ensureCarsTable()
  return db.prepare(`UPDATE cars SET teamId = ? WHERE id = ?`).run(teamId != null ? Number(teamId) : null, Number(id))
}