// src/database/dbcars.js
import db from './db.js'

function columnExists (table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all()
    return cols.some(c => String(c.name).toLowerCase() === String(column).toLowerCase())
  } catch {
    return false
  }
}

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

  // ✅ lightweight migration: add imageUrl if missing
  if (!columnExists('cars', 'imageUrl')) {
    try {
      db.exec('ALTER TABLE cars ADD COLUMN imageUrl TEXT;')
    } catch (e) {
      // if two processes race to migrate, ignore duplicate-column-ish errors
      console.warn('[dbcars] imageUrl migration skipped:', e?.message)
    }
  }

  const statColumns = [
    ['careerEarnings', 'INTEGER DEFAULT 0'],
    ['entryFeesPaid', 'INTEGER DEFAULT 0'],
    ['raceWinnings', 'INTEGER DEFAULT 0'],
    ['netRaceProfit', 'INTEGER DEFAULT 0'],
    ['repairSpend', 'INTEGER DEFAULT 0'],
    ['podiums', 'INTEGER DEFAULT 0'],
    ['dnfs', 'INTEGER DEFAULT 0'],
    ['fastestLaps', 'INTEGER DEFAULT 0'],
    ['polePositions', 'INTEGER DEFAULT 0'],
    ['bestFinish', 'INTEGER'],
    ['lastFinish', 'INTEGER'],
    ['lastRaceAt', 'TEXT'],
    ['finishSum', 'INTEGER DEFAULT 0'],
    ['finishCount', 'INTEGER DEFAULT 0']
  ]

  for (const [column, definition] of statColumns) {
    if (!columnExists('cars', column)) {
      try {
        db.exec(`ALTER TABLE cars ADD COLUMN ${column} ${definition};`)
      } catch (e) {
        console.warn(`[dbcars] ${column} migration skipped:`, e?.message)
      }
    }
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_cars_owner ON cars(ownerId);')
  db.exec('CREATE INDEX IF NOT EXISTS idx_cars_team ON cars(teamId);')
}

ensureCarsTable()

export function insertCar (car) {
  ensureCarsTable()

  const stmt = db.prepare(`
    INSERT INTO cars (
      ownerId, ownerName, teamId, name, livery, tier, price,
      power, handling, aero, reliability, tire,
      wear, wins, races, retired,
      imageUrl
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?
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
    car.retired ? 1 : 0,

    car.imageUrl ? String(car.imageUrl) : null
  )

  return info.lastInsertRowid
}

export function getAllCars () {
  ensureCarsTable()
  return db.prepare('SELECT * FROM cars').all()
}

export function getUserCars (ownerId) {
  ensureCarsTable()
  return db
    .prepare('SELECT * FROM cars WHERE ownerId = ? ORDER BY retired ASC, wins DESC, races ASC, name ASC')
    .all(String(ownerId))
}

export function getCarById (id) {
  ensureCarsTable()
  return db.prepare('SELECT * FROM cars WHERE id = ?').get(Number(id))
}

export function getCarByNameCaseInsensitive (name) {
  ensureCarsTable()
  return db.prepare('SELECT * FROM cars WHERE lower(name) = lower(?)').get(String(name))
}

export function updateCarAfterRace (id, { win = false, wearDelta = 0 }) {
  ensureCarsTable()
  const car = getCarById(id)
  if (!car) return false

  const newRaces = Number(car.races || 0) + 1
  const newWins = Number(car.wins || 0) + (win ? 1 : 0)
  const newWear = Math.max(0, Math.min(100, Number(car.wear || 0) + Math.floor(wearDelta)))

  db.prepare('UPDATE cars SET races = ?, wins = ?, wear = ? WHERE id = ?')
    .run(newRaces, newWins, newWear, Number(id))

  return true
}

export function updateCarAfterRaceResult (id, {
  win = false,
  wearDelta = 0,
  finishPosition = null,
  dnf = false
} = {}) {
  ensureCarsTable()
  const car = getCarById(id)
  if (!car) return false

  const newRaces = Number(car.races || 0) + 1
  const newWins = Number(car.wins || 0) + (win ? 1 : 0)
  const newWear = Math.max(0, Math.min(100, Number(car.wear || 0) + Math.floor(wearDelta)))
  const pos = Number.isFinite(Number(finishPosition)) && Number(finishPosition) > 0
    ? Math.floor(Number(finishPosition))
    : null

  const podiumInc = (pos && pos <= 3) ? 1 : 0
  const dnfInc = dnf ? 1 : 0
  const finished = !dnf && pos != null
  const finishSumInc = finished ? pos : 0
  const finishCountInc = finished ? 1 : 0

  let nextBest = car.bestFinish == null ? null : Number(car.bestFinish)
  if (finished) {
    nextBest = nextBest == null ? pos : Math.min(nextBest, pos)
  }

  db.prepare(`
    UPDATE cars
    SET races = ?,
        wins = ?,
        wear = ?,
        podiums = COALESCE(podiums, 0) + ?,
        dnfs = COALESCE(dnfs, 0) + ?,
        bestFinish = ?,
        lastFinish = ?,
        lastRaceAt = ?,
        finishSum = COALESCE(finishSum, 0) + ?,
        finishCount = COALESCE(finishCount, 0) + ?
    WHERE id = ?
  `).run(
    newRaces,
    newWins,
    newWear,
    podiumInc,
    dnfInc,
    nextBest,
    pos,
    new Date().toISOString(),
    finishSumInc,
    finishCountInc,
    Number(id)
  )

  return true
}

export function addCarEarnings (id, amount, { fastestLap = false, pole = false } = {}) {
  ensureCarsTable()
  const inc = Math.max(0, Math.floor(Number(amount || 0)))
  if (!Number.isFinite(inc) || inc <= 0) return false

  db.prepare(`
    UPDATE cars
    SET careerEarnings = COALESCE(careerEarnings, 0) + ?,
        fastestLaps = COALESCE(fastestLaps, 0) + ?,
        polePositions = COALESCE(polePositions, 0) + ?
    WHERE id = ?
  `).run(inc, fastestLap ? 1 : 0, pole ? 1 : 0, Number(id))

  return true
}

export function recordCarEntryFee (id, amount) {
  ensureCarsTable()
  const inc = Math.max(0, Math.floor(Number(amount || 0)))
  if (!Number.isFinite(inc) || inc <= 0) return false

  db.prepare(`
    UPDATE cars
    SET entryFeesPaid = COALESCE(entryFeesPaid, 0) + ?
    WHERE id = ?
  `).run(inc, Number(id))

  return true
}

export function recordCarRaceFinancials (id, { entryFee = 0, payout = 0 } = {}) {
  ensureCarsTable()
  const fee = Math.max(0, Math.floor(Number(entryFee || 0)))
  const winnings = Math.max(0, Math.floor(Number(payout || 0)))
  const net = winnings - fee

  db.prepare(`
    UPDATE cars
    SET entryFeesPaid = COALESCE(entryFeesPaid, 0) + ?,
        careerEarnings = COALESCE(careerEarnings, 0) + ?,
        raceWinnings = COALESCE(raceWinnings, 0) + ?,
        netRaceProfit = COALESCE(netRaceProfit, 0) + ?
    WHERE id = ?
  `).run(fee, winnings, winnings, net, Number(id))

  return true
}

export function recordCarRepairSpend (id, amount) {
  ensureCarsTable()
  const inc = Math.max(0, Math.floor(Number(amount || 0)))
  if (!Number.isFinite(inc) || inc <= 0) return false

  db.prepare(`
    UPDATE cars
    SET repairSpend = COALESCE(repairSpend, 0) + ?
    WHERE id = ?
  `).run(inc, Number(id))

  return true
}

export function getUserCarStatsSummary (ownerId) {
  ensureCarsTable()
  return db.prepare(`
    SELECT
      COUNT(*) AS carsOwned,
      COALESCE(SUM(price), 0) AS totalPurchaseSpend,
      COALESCE(SUM(careerEarnings), 0) AS totalCarEarnings,
      COALESCE(SUM(entryFeesPaid), 0) AS totalEntryFeesPaid,
      COALESCE(SUM(raceWinnings), 0) AS totalRaceWinnings,
      COALESCE(SUM(netRaceProfit), 0) AS totalNetRaceProfit,
      COALESCE(SUM(repairSpend), 0) AS totalRepairSpend,
      COALESCE(SUM(races), 0) AS totalRaces,
      COALESCE(SUM(wins), 0) AS totalWins,
      COALESCE(SUM(podiums), 0) AS totalPodiums,
      COALESCE(SUM(dnfs), 0) AS totalDnfs,
      COALESCE(SUM(fastestLaps), 0) AS totalFastestLaps,
      COALESCE(SUM(polePositions), 0) AS totalPoles,
      COALESCE(SUM(finishSum), 0) AS totalFinishSum,
      COALESCE(SUM(finishCount), 0) AS totalFinishCount
    FROM cars
    WHERE ownerId = ?
  `).get(String(ownerId))
}

export function getTopCarsByEarnings (ownerId, limit = 5) {
  ensureCarsTable()
  const n = Math.max(1, Math.min(20, Math.floor(Number(limit || 5))))
  return db.prepare(`
    SELECT *
    FROM cars
    WHERE ownerId = ?
    ORDER BY COALESCE(careerEarnings, 0) DESC, wins DESC, races DESC, name ASC
    LIMIT ?
  `).all(String(ownerId), n)
}

export function getTopOwnersByCarReturn (limit = 10) {
  ensureCarsTable()
  const n = Math.max(1, Math.min(50, Math.floor(Number(limit || 10))))
  return db.prepare(`
    SELECT
      ownerId,
      COALESCE(MAX(ownerName), '') AS ownerName,
      COUNT(*) AS carsOwned,
      COALESCE(SUM(netRaceProfit), COALESCE(SUM(careerEarnings), 0) - COALESCE(SUM(entryFeesPaid), 0)) AS totalCarReturn,
      COALESCE(SUM(wins), 0) AS totalWins,
      COALESCE(SUM(races), 0) AS totalRaces
    FROM cars
    WHERE ownerId IS NOT NULL
      AND ownerId != ''
    GROUP BY ownerId
    ORDER BY totalCarReturn DESC, totalWins DESC, totalRaces DESC, ownerId ASC
    LIMIT ?
  `).all(n)
}

export function setCarWear (id, wear) {
  ensureCarsTable()
  const w = Math.max(0, Math.min(100, Math.floor(Number(wear || 0))))
  return db.prepare('UPDATE cars SET wear = ? WHERE id = ?').run(w, Number(id))
}

export function setCarTeam (id, teamId) {
  ensureCarsTable()
  return db
    .prepare('UPDATE cars SET teamId = ? WHERE id = ?')
    .run(teamId != null ? Number(teamId) : null, Number(id))
}

export function renameCarOwnedByUser (id, ownerId, newName) {
  ensureCarsTable()
  const trimmed = String(newName || '').trim()
  if (!trimmed) return false

  const info = db
    .prepare('UPDATE cars SET name = ? WHERE id = ? AND ownerId = ?')
    .run(trimmed, Number(id), String(ownerId))

  return Number(info?.changes || 0) > 0
}

export function deleteCarOwnedByUser (id, ownerId) {
  ensureCarsTable()
  const info = db
    .prepare('DELETE FROM cars WHERE id = ? AND ownerId = ?')
    .run(Number(id), String(ownerId))
  return Number(info?.changes || 0) > 0
}

// ✅ optional helper if you ever want to change an image later
export function setCarImageUrl (id, imageUrl) {
  ensureCarsTable()
  return db.prepare('UPDATE cars SET imageUrl = ? WHERE id = ?')
    .run(imageUrl ? String(imageUrl) : null, Number(id))
}
