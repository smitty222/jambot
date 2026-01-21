// src/database/dbhorsehof.js
//
// Horse Hall of Fame (HoF) storage + queries.
//
// NEW REQUIREMENTS (per your request):
// - NO minimum races
// - Horse MUST be retired
// - Horse must have win% >= threshold
//
// Also includes an automatic one-time sweep:
// - On first HoF usage, we scan existing retired horses and induct
//   any that qualify, so your current retired legends get added.
//
// Bots:
// - Default excludes bots (owner horses only). Flip INCLUDE_BOTS = true
//   if you want "House legends" as well.

import db from './db.js'

const INCLUDE_BOTS = false

// Win% threshold to be inducted (default 35%).
// You can override via env: HORSE_HOF_MIN_WIN_PCT="0.40" (for 40%)
const MIN_WIN_PCT = (() => {
  const raw = Number(process.env.HORSE_HOF_MIN_WIN_PCT ?? 0.35)
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.35
})()

const SWEEP_GUARD_KEY = '__JAMBOT_HORSE_HOF_SWEEP__'

function ensureTable () {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS horse_hof (
      horse_id INTEGER PRIMARY KEY,
      inducted_at TEXT NOT NULL,
      reason TEXT NOT NULL,
      snapshot_json TEXT NOT NULL
    )
  `).run()

  // One-time per process: sweep existing retired horses into HoF.
  // This makes sure your current retired horses get inducted immediately.
  if (!globalThis[SWEEP_GUARD_KEY]) {
    globalThis[SWEEP_GUARD_KEY] = true
    try {
      sweepRetiredHorsesIntoHof()
    } catch (e) {
      // Never crash the bot over HoF
      console.warn('[horse_hof] sweep failed:', e?.message)
    }
  }
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

function winPct (h) {
  const wins = Number(h?.wins ?? 0)
  const starts = Number(h?.racesParticipated ?? 0)
  if (!Number.isFinite(wins) || !Number.isFinite(starts) || starts <= 0) return 0
  return wins / starts
}

function qualifies (h) {
  // Must be retired
  const retired = !!h?.retired || Number(h?.retired) === 1
  if (!retired) return false

  // Bots excluded by default
  if (!INCLUDE_BOTS && !isOwnerHorse(h)) return false

  // Must meet win% threshold (no min races per your request)
  return winPct(h) >= MIN_WIN_PCT
}

function buildReason (h) {
  const starts = Number(h?.racesParticipated ?? 0)
  const wins = Number(h?.wins ?? 0)
  const pct = winPct(h)
  return `Retired with ${Math.round(pct * 100)}% win rate (${wins}W/${starts}S)`
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
  return db.prepare('SELECT * FROM horse_hof WHERE horse_id = ?').get(Number(horseId))
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

// --- One-time sweep -----------------------------------------------------

/**
 * Sweep all currently retired horses and induct qualifying ones.
 * This is called automatically once per process from ensureTable().
 *
 * Returns { scanned, inducted }.
 */
export function sweepRetiredHorsesIntoHof () {
  ensureTable()

  // NOTE: retired stored as 1/0 in your schema
  const retiredHorses = db.prepare('SELECT * FROM horses WHERE retired = 1').all()
  let inducted = 0

  for (const h of retiredHorses) {
    if (!h?.id) continue
    if (getHofEntryByHorseId(h.id)) continue
    if (!qualifies(h)) continue

    inductHorse({
      horseId: h.id,
      reason: buildReason(h),
      snapshotObj: snapshot(h)
    })
    inducted++
  }

  return { scanned: retiredHorses.length, inducted }
}

// --- Query helpers for /hof -------------------------------------------

export function getHofList ({ limit = 10, sort = 'newest' } = {}) {
  ensureTable()
  const lim = Math.max(1, Math.min(50, Number(limit) || 10))

  let orderBy = 'hh.inducted_at DESC'
  if (sort === 'wins') orderBy = 'h.wins DESC, hh.inducted_at DESC'
  if (sort === 'winpct') orderBy = '(CAST(h.wins AS REAL) / MAX(1, h.racesParticipated)) DESC, hh.inducted_at DESC'

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
