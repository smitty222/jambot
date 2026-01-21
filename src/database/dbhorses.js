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

// Fetch all horses from the database
export function getAllHorses () {
  return db.prepare('SELECT * FROM horses').all()
}

// Fetch horses owned by a specific user
export function getUserHorses (ownerId) {
  return db.prepare('SELECT * FROM horses WHERE ownerId = ?').all(ownerId)
}

// Case‑insensitive lookup of a horse by name
export function getHorseByName (name) {
  return db.prepare('SELECT * FROM horses WHERE LOWER(name) = ?').get(name.toLowerCase())
}

// Insert a new horse record
export function insertHorse (horse) {
  const stmt = db.prepare(`
    INSERT INTO horses (
      name, baseOdds, volatility, owner, ownerId, tier,
      emoji, price, careerLength, wins, racesParticipated, retired,
      nickname, odds
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
      ...(horse.hasOwnProperty('retired') ? { retired: horse.retired } : {})
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
  if (stats.hasOwnProperty('wins')) {
    fields.push('wins = ?')
    params.push(Number(stats.wins))
  }
  if (stats.hasOwnProperty('racesParticipated')) {
    fields.push('racesParticipated = ?')
    params.push(Number(stats.racesParticipated))
  }
  if (stats.hasOwnProperty('retired')) {
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
  db.prepare('UPDATE horses SET odds = ? WHERE name = ?').run(odds, name)
}
