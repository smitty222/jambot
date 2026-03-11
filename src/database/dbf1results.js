// src/database/dbf1results.js

import db from './db.js'

function ensureF1RaceResultsTable () {
  db.exec(`
    CREATE TABLE IF NOT EXISTS f1_race_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raceId TEXT NOT NULL,
      roomId TEXT,
      tier TEXT NOT NULL,
      trackName TEXT,
      trackEmoji TEXT,
      entrantCount INTEGER NOT NULL,
      totalEntryFees INTEGER NOT NULL,
      prizePool INTEGER NOT NULL,
      houseCut INTEGER NOT NULL,
      userId TEXT,
      ownerName TEXT,
      carId INTEGER,
      carName TEXT,
      finishPosition INTEGER NOT NULL,
      entryFee INTEGER NOT NULL,
      payout INTEGER NOT NULL,
      netResult INTEGER NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `)

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
  totalEntryFees = 0,
  prizePool = 0,
  houseCut = 0,
  placements = []
} = {}) {
  ensureF1RaceResultsTable()
  if (!raceId || !tier || !Array.isArray(placements) || placements.length === 0) return false

  const insert = db.prepare(`
    INSERT INTO f1_race_results (
      raceId, roomId, tier, trackName, trackEmoji,
      entrantCount, totalEntryFees, prizePool, houseCut,
      userId, ownerName, carId, carName,
      finishPosition, entryFee, payout, netResult
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        Math.max(0, Math.floor(Number(totalEntryFees || 0))),
        Math.max(0, Math.floor(Number(prizePool || 0))),
        Math.max(0, Math.floor(Number(houseCut || 0))),
        row?.userId ? String(row.userId) : null,
        row?.ownerName ? String(row.ownerName) : null,
        row?.carId != null ? Number(row.carId) : null,
        row?.carName ? String(row.carName) : null,
        Math.max(0, Math.floor(Number(row?.finishPosition || 0))),
        Math.max(0, Math.floor(Number(row?.entryFee || 0))),
        Math.max(0, Math.floor(Number(row?.payout || 0))),
        Math.floor(Number(row?.netResult || 0))
      )
    }
  })

  tx(placements)
  return true
}
