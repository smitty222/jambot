// src/database/dbf1results.js

import db from './db.js'

function tableHasColumn (tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all()
  return rows.some((row) => String(row.name) === String(columnName))
}

function ensureColumn (tableName, columnName, definition) {
  if (tableHasColumn(tableName, columnName)) return
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
}

function ensureF1RaceResultsTable () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS f1_race_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raceId TEXT NOT NULL,
      roomId TEXT,
      tier TEXT NOT NULL,
      trackName TEXT,
      trackEmoji TEXT,
      entrantCount INTEGER NOT NULL DEFAULT 0,
      fieldSize INTEGER NOT NULL DEFAULT 0,
      entryFee INTEGER NOT NULL DEFAULT 0,
      totalPurse INTEGER NOT NULL DEFAULT 0,
      baseEntryPool INTEGER NOT NULL DEFAULT 0,
      houseContribution INTEGER NOT NULL DEFAULT 0,
      userId TEXT,
      ownerName TEXT,
      carId INTEGER,
      carName TEXT,
      isBot INTEGER NOT NULL DEFAULT 0,
      finishPosition INTEGER NOT NULL,
      payout INTEGER NOT NULL DEFAULT 0,
      creditedAmount INTEGER NOT NULL DEFAULT 0,
      entryFeePaid INTEGER NOT NULL DEFAULT 0,
      netResult INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `)

  ensureColumn('f1_race_results', 'fieldSize', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('f1_race_results', 'entryFee', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('f1_race_results', 'totalPurse', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('f1_race_results', 'baseEntryPool', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('f1_race_results', 'houseContribution', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('f1_race_results', 'isBot', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('f1_race_results', 'creditedAmount', 'INTEGER NOT NULL DEFAULT 0')
  ensureColumn('f1_race_results', 'entryFeePaid', 'INTEGER NOT NULL DEFAULT 0')

  db.exec('CREATE INDEX IF NOT EXISTS idx_f1_race_results_race ON f1_race_results(raceId);')
  db.exec('CREATE INDEX IF NOT EXISTS idx_f1_race_results_user ON f1_race_results(userId);')
  db.exec('CREATE INDEX IF NOT EXISTS idx_f1_race_results_car ON f1_race_results(carId);')
}

ensureF1RaceResultsTable()

export function logF1RaceResults ({
  raceId,
  roomId = null,
  tier,
  track = null,
  entrantCount = 0,
  fieldSize = 0,
  entryFee = 0,
  totalPurse = 0,
  baseEntryPool = 0,
  houseContribution = 0,
  placements = []
} = {}) {
  ensureF1RaceResultsTable()
  if (!raceId || !tier || !Array.isArray(placements) || placements.length === 0) return false

  const insert = db.prepare(`
    INSERT INTO f1_race_results (
      raceId, roomId, tier, trackName, trackEmoji,
      entrantCount, fieldSize, entryFee, totalPurse, baseEntryPool, houseContribution,
      userId, ownerName, carId, carName, isBot,
      finishPosition, payout, creditedAmount, entryFeePaid, netResult
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const tx = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(
        String(raceId),
        roomId ? String(roomId) : null,
        String(tier),
        track?.name ? String(track.name) : null,
        track?.emoji ? String(track.emoji) : null,
        Math.max(0, Math.floor(Number(entrantCount || 0))),
        Math.max(0, Math.floor(Number(fieldSize || 0))),
        Math.max(0, Math.floor(Number(entryFee || 0))),
        Math.max(0, Math.floor(Number(totalPurse || 0))),
        Math.max(0, Math.floor(Number(baseEntryPool || 0))),
        Math.max(0, Math.floor(Number(houseContribution || 0))),
        row?.userId ? String(row.userId) : null,
        row?.ownerName ? String(row.ownerName) : null,
        row?.carId != null ? Number(row.carId) : null,
        row?.carName ? String(row.carName) : null,
        row?.isBot ? 1 : 0,
        Math.max(0, Math.floor(Number(row?.finishPosition || 0))),
        Math.max(0, Math.floor(Number(row?.payout || 0))),
        Math.max(0, Math.floor(Number(row?.creditedAmount || 0))),
        Math.max(0, Math.floor(Number(row?.entryFee || 0))),
        Math.floor(Number(row?.netResult || 0))
      )
    }
  })

  tx(placements)
  return true
}
