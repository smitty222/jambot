// Modified version of the original dbhorses.js from the Jambot project.
//
// The original `updateHorseStats` function only accepted a full horse
// object and always performed the update by `name`.  However the horse
// racing simulation calls this function with two arguments – the horse
// identifier (usually the numeric `id` from the database) and an object
// containing only the fields to update.  Because of this mismatch the
// race simulation was silently passing invalid values (the `id` number was
// being treated as a horse object), causing the `wins` and
// `racesParticipated` fields to remain unchanged and making the `/myhorses`
// and `/horsestats` commands display stale data.  This updated module
// implements a flexible `updateHorseStats` function that supports both
// invocation styles.

import db from './db.js'

function columnExists (table, column) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all()
    return cols.some(c => String(c.name).toLowerCase() === String(column).toLowerCase())
  } catch {
    return false
  }
}

function ensureHorsesTable () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS horses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      baseOdds REAL,
      volatility REAL,
      owner TEXT,
      ownerId TEXT,
      tier TEXT,
      emoji TEXT,
      price INTEGER,
      racesParticipated INTEGER DEFAULT 0,
      wins INTEGER DEFAULT 0,
      careerLength INTEGER DEFAULT 0,
      retired BOOLEAN DEFAULT 0,
      nickname TEXT,
      odds REAL
    )
  `)

  if (!columnExists('horses', 'imageUrl')) {
    try {
      db.exec('ALTER TABLE horses ADD COLUMN imageUrl TEXT;')
    } catch (e) {
      console.warn('[dbhorses] imageUrl migration skipped:', e?.message)
    }
  }
}

ensureHorsesTable()

// Fetch all horses from the database
export function getAllHorses () {
  ensureHorsesTable()
  return db.prepare('SELECT * FROM horses').all()
}

// Fetch horses owned by a specific user
export function getUserHorses (ownerId) {
  ensureHorsesTable()
  return db.prepare('SELECT * FROM horses WHERE ownerId = ?').all(ownerId)
}

// Case‑insensitive lookup of a horse by name
export function getHorseByName (name) {
  ensureHorsesTable()
  return db.prepare('SELECT * FROM horses WHERE LOWER(name) = ?').get(name.toLowerCase())
}

// Insert a new horse record
export function insertHorse (horse) {
  ensureHorsesTable()
  const stmt = db.prepare(`
    INSERT INTO horses (
      name, baseOdds, volatility, owner, ownerId, tier,
      emoji, price, careerLength, wins, racesParticipated, retired,
      nickname, odds, imageUrl
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    horse.odds || null,
    horse.imageUrl || null
  )
}

/**
 * Update an existing horse's stats.
 *
 * There are two supported invocation patterns:
 *  1. `updateHorseStats(horseObject)` – update by the horse's name.  The
 *     object must include `name` along with the fields you wish to update
 *     (`wins`, `racesParticipated` and optionally `retired`).  This
 *     behaviour maintains backward compatibility with the original API.
 *  2. `updateHorseStats(idOrName, stats)` – update by a horse's numeric `id`
 *     or `name` string.  `stats` is an object that can include any
 *     combination of the supported fields.  If `stats.retired` is
 *     `undefined` then the existing `retired` value will remain unchanged.
 *
 * The function builds the UPDATE statement dynamically based on the
 * provided fields, ensuring that only the specified columns are updated.
 */
export function updateHorseStats (identifier, stats) {
  ensureHorsesTable()
  // Backwards compatibility: if only one argument is provided and it's an
  // object, treat it as the old signature.
  if (arguments.length === 1 && typeof identifier === 'object' && identifier !== null) {
    const horse = identifier
    if (!horse.name) {
      throw new Error('updateHorseStats(object) requires a name property')
    }
    const updates = {
      wins: horse.wins,
      racesParticipated: horse.racesParticipated,
      // Only include retired if explicitly provided on the object
      ...(Object.prototype.hasOwnProperty.call(horse, 'retired') ? { retired: horse.retired } : {})
    }
    return updateHorseStats(horse.name, updates)
  }

  // Validate input
  if (identifier === undefined || identifier === null) {
    throw new Error('updateHorseStats requires an identifier')
  }
  if (typeof stats !== 'object' || stats === null) {
    throw new Error('updateHorseStats(id, stats) requires a stats object')
  }

  // Build the SET clause based on provided fields
  const fields = []
  const params = []
  if (Object.prototype.hasOwnProperty.call(stats, 'wins')) {
    fields.push('wins = ?')
    params.push(Number(stats.wins))
  }
  if (Object.prototype.hasOwnProperty.call(stats, 'racesParticipated')) {
    fields.push('racesParticipated = ?')
    params.push(Number(stats.racesParticipated))
  }
  if (Object.prototype.hasOwnProperty.call(stats, 'retired')) {
    fields.push('retired = ?')
    params.push(stats.retired ? 1 : 0)
  }
  if (fields.length === 0) {
    // Nothing to update
    return
  }

  let whereClause
  // Determine whether the identifier refers to an id or a name
  if (typeof identifier === 'number' || (typeof identifier === 'string' && /^\d+$/.test(identifier))) {
    whereClause = 'id = ?'
    params.push(Number(identifier))
  } else {
    whereClause = 'name = ?'
    params.push(String(identifier))
  }

  const sql = `UPDATE horses SET ${fields.join(', ')} WHERE ${whereClause}`
  const stmt = db.prepare(sql)
  stmt.run(...params)
}

// Update a horse's odds by name
export function updateHorseOdds (name, odds) {
  ensureHorsesTable()
  db.prepare('UPDATE horses SET odds = ? WHERE name = ?').run(odds, name)
}

export function setHorseImageUrl (id, imageUrl) {
  ensureHorsesTable()
  return db.prepare('UPDATE horses SET imageUrl = ? WHERE id = ?')
    .run(imageUrl ? String(imageUrl) : null, Number(id))
}

export function deleteHorseOwnedByUser (id, ownerId) {
  ensureHorsesTable()
  const info = db.prepare('DELETE FROM horses WHERE id = ? AND ownerId = ?')
    .run(Number(id), String(ownerId))
  return Number(info?.changes || 0) > 0
}
