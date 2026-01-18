// src/database/dbhorsehof.js
//
// Horse Hall of Fame (HoF) storage + queries.
// Keeps HoF logic isolated from dbhorses.js to avoid turning it into a grab bag.
//
// Induction criteria (tunable in one place):
// - starts >= 20 AND (wins >= 8 OR winPct >= 35%)
// Default: owner horses only (bots excluded). You can flip INCLUDE_BOTS below.

import db from './db.js'

const INCLUDE_BOTS = false // set true if you ever want "House legends" in HoF

// Induction thresholds
const MIN_STARTS = 20
const MIN_WINS = 8
const MIN_WIN_PCT = 0.35

function ensureTable () {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS horse_hof (
      horse_id INTEGER PRIMARY KEY,
      inducted_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      snapshot_json TEXT NOT NULL
    )
  `).run()
}

function nowIso () {
  return new Date().toISOString()
}

function clampStr (s, max = 200) {
  s = String(s ?? '')
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

function isOwnerHorse (h) {
  const ownerId = h?.ownerId
  if (!ownerId) return false
  if (String(ownerId).toLowerCase() === 'allen') return false
  return true
}

function qualifies (h) {
  const starts = Number(h?.racesParticipated ?? 0)
  const wins = Number(h?.wins ?? 0)
  if (!Number.isFinite(starts) || !Number.isFinite(wins)) return false
  if (starts < MIN_STARTS) return false
  const pct = starts > 0 ? wins / starts : 0
  return (wins >= MIN_WINS) || (pct >= MIN_WIN_PCT)
}

function buildReason (h) {
  const starts = Number(h?.racesParticipated ?? 0)
  const wins = Number(h?.wins ?? 0)
  const pct = starts > 0 ? (wins / starts) : 0
  if (wins >= MIN_WINS) return `Reached ${MIN_WINS}+ wins (${wins}W/${starts}S)`
  return `Win% >= ${(MIN_WIN_PCT * 100).toFixed(0)}% (${Math.round(pct * 100)}% on ${starts} starts)`
}

function snapshot (h) {
  return {
    id: h?.id ?? null,
    name: h?.name ?? null,
    tier: h?.tier ?? null,
    owner: h?.owner ?? null,
    ownerId: h?.ownerId ?? null,
    price: Number(h?.price ?? 0),
    wins: Number(h?.wins ?? 0),
    racesParticipated: Number(h?.racesParticipated ?? 0),
    retired: !!h?.retired
  }
}

// --- Core CRUD ---------------------------------------------------------

export function getHofEntryByHorseId (horseId) {
  ensureTable()
  return db.prepare(`SELECT * FROM horse_hof WHERE horse_id = ?`).get(Number(horseId))
}

export function isHorseInducted (horseId) {
  return !!getHofEntryByHorseId(horseId)
}

export function inductHorse ({ horseId, reason, snapshotObj }) {
  ensureTable()
  const entry = {
    horse_id: Number(horseId),
    inducted_at: nowIso(),
    reason: clampStr(reason || 'Inducted'),
    snapshot_json: JSON.stringify(snapshotObj || {})
  }

  db.prepare(`
    INSERT OR IGNORE INTO horse_hof (horse_id, inducted_at, reason, snapshot_json)
    VALUES (@horse_id, @inducted_at, @reason, @snapshot_json)
  `).run(entry)

  return getHofEntryByHorseId(horseId)
}

/**
 * Check if a horse qualifies and induct it if needed.
 * Returns { inducted:boolean, entry?:row, reason?:string }
 */
export function maybeInductHorse (horseRow) {
  ensureTable()

  if (!horseRow?.id) return { inducted: false }
  if (!INCLUDE_BOTS && !isOwnerHorse(horseRow)) return { inducted: false }

  if (!qualifies(horseRow)) return { inducted: false }

  const existing = getHofEntryByHorseId(horseRow.id)
  if (existing) return { inducted: false, entry: existing }

  const reason = buildReason(horseRow)
  const entry = inductHorse({
    horseId: horseRow.id,
    reason,
    snapshotObj: snapshot(horseRow)
  })

  return { inducted: true, entry, reason }
}

// --- Query helpers for /hof -------------------------------------------

/**
 * Returns a list of HoF horses joined with the current horses table.
 * sort:
 * - 'newest' (default)
 * - 'wins'
 * - 'winpct' (min starts still applies for induction, but winpct is computed live)
 */
export function getHofList ({ limit = 10, sort = 'newest' } = {}) {
  ensureTable()
  const lim = Math.max(1, Math.min(50, Number(limit) || 10))

  let orderBy = `hh.inducted_at DESC`
  if (sort === 'wins') orderBy = `h.wins DESC, hh.inducted_at DESC`
  if (sort === 'winpct') orderBy = `(CAST(h.wins AS REAL) / MAX(1, h.racesParticipated)) DESC, hh.inducted_at DESC`

  return db.prepare(`
    SELECT
      hh.horse_id,
      hh.inducted_at,
      hh.reason,
      hh.snapshot_json,
      h.name,
      h.tier,
      h.owner,
      h.ownerId,
      h.price,
      h.wins,
      h.racesParticipated,
      h.retired
    FROM horse_hof hh
    JOIN horses h ON h.id = hh.horse_id
    ORDER BY ${orderBy}
    LIMIT ?
  `).all(lim)
}

/**
 * Find a HoF entry by horse name (case-insensitive).
 * Returns the join row or null.
 */
export function getHofEntryByHorseName (name) {
  ensureTable()
  const needle = String(name || '').trim().toLowerCase()
  if (!needle) return null

  return db.prepare(`
    SELECT
      hh.horse_id,
      hh.inducted_at,
      hh.reason,
      hh.snapshot_json,
      h.*
    FROM horse_hof hh
    JOIN horses h ON h.id = hh.horse_id
    WHERE LOWER(h.name) = ?
  `).get(needle)
}
