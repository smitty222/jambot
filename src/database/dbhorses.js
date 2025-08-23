import db from './db.js'

export function getAllHorses() {
  return db.prepare(`SELECT * FROM horses`).all()
}

export function getUserHorses(ownerId) {
  return db.prepare(`SELECT * FROM horses WHERE ownerId = ?`).all(ownerId)
}

export function getHorseByName(name) {
  return db.prepare(`SELECT * FROM horses WHERE LOWER(name) = ?`).get(name.toLowerCase())
}

export function insertHorse(horse) {
  const stmt = db.prepare(`
    INSERT INTO horses (
      name, baseOdds, volatility, owner, ownerId, tier,
      emoji, price, careerLength, wins, racesParticipated, retired, nickname, odds
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    horse.name,
    horse.baseOdds,
    horse.volatility,
    horse.owner,
    horse.ownerId,
    horse.tier,
    horse.emoji,
    horse.price,
    horse.careerLength || 0,
    horse.wins || 0,
    horse.racesParticipated || 0,
    horse.retired ? 1 : 0,
    horse.nickname || null,
    horse.odds || null
  )
}

export function updateHorseStats(horse) {
  const stmt = db.prepare(`
    UPDATE horses
    SET wins = ?, racesParticipated = ?, retired = ?
    WHERE name = ?
  `)

  stmt.run(horse.wins, horse.racesParticipated, horse.retired ? 1 : 0, horse.name)
}

export function updateHorseOdds(name, odds) {
  db.prepare(`UPDATE horses SET odds = ? WHERE name = ?`).run(odds, name)
}
