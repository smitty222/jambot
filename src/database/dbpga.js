// src/database/dbpga.js
import db from './db.js'

function safeNum (v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function upsertPgaEvent ({
  eventId,
  eventName,
  status,
  season,
  startDate,
  endDate,
  source = 'espn',
  finalizedAt = null
}) {
  if (!eventId) throw new Error('upsertPgaEvent: eventId required')

  const stmt = db.prepare(`
    INSERT INTO pga_events (
      eventId, eventName, status, season, startDate, endDate, source, lastSeenAt, finalizedAt
    ) VALUES (
      @eventId, @eventName, @status, @season, @startDate, @endDate, @source, CURRENT_TIMESTAMP, @finalizedAt
    )
    ON CONFLICT(eventId) DO UPDATE SET
      eventName   = COALESCE(excluded.eventName, pga_events.eventName),
      status      = COALESCE(excluded.status, pga_events.status),
      season      = COALESCE(excluded.season, pga_events.season),
      startDate   = COALESCE(excluded.startDate, pga_events.startDate),
      endDate     = COALESCE(excluded.endDate, pga_events.endDate),
      source      = COALESCE(excluded.source, pga_events.source),
      lastSeenAt  = CURRENT_TIMESTAMP,
      finalizedAt = COALESCE(excluded.finalizedAt, pga_events.finalizedAt)
  `)

  stmt.run({
    eventId,
    eventName: eventName || null,
    status: status || null,
    season: safeNum(season),
    startDate: startDate || null,
    endDate: endDate || null,
    source,
    finalizedAt
  })
}

export function insertPgaSnapshot ({
  eventId,
  eventName,
  status,
  kind = 'live',
  json
}) {
  if (!eventId) throw new Error('insertPgaSnapshot: eventId required')
  if (!json) throw new Error('insertPgaSnapshot: json required')

  const stmt = db.prepare(`
    INSERT INTO pga_leaderboard_snapshots (
      eventId, eventName, status, kind, json
    ) VALUES (
      @eventId, @eventName, @status, @kind, @json
    )
  `)

  stmt.run({
    eventId,
    eventName: eventName || null,
    status: status || null,
    kind,
    json: typeof json === 'string' ? json : JSON.stringify(json)
  })
}

export function upsertPgaResults (eventId, rows) {
  if (!eventId) throw new Error('upsertPgaResults: eventId required')
  if (!Array.isArray(rows)) throw new Error('upsertPgaResults: rows must be array')

  const stmt = db.prepare(`
    INSERT INTO pga_event_results (
      eventId, athleteId, playerName, pos, toPar, status, thru,
      sortOrder, movement, earnings, cupPoints,
      r1, r2, r3, r4,
      updatedAt
    ) VALUES (
      @eventId, @athleteId, @playerName, @pos, @toPar, @status, @thru,
      @sortOrder, @movement, @earnings, @cupPoints,
      @r1, @r2, @r3, @r4,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(eventId, athleteId) DO UPDATE SET
      playerName = COALESCE(excluded.playerName, pga_event_results.playerName),
      pos        = COALESCE(excluded.pos, pga_event_results.pos),
      toPar      = COALESCE(excluded.toPar, pga_event_results.toPar),
      status     = COALESCE(excluded.status, pga_event_results.status),
      thru       = COALESCE(excluded.thru, pga_event_results.thru),
      sortOrder  = COALESCE(excluded.sortOrder, pga_event_results.sortOrder),
      movement   = COALESCE(excluded.movement, pga_event_results.movement),
      earnings   = COALESCE(excluded.earnings, pga_event_results.earnings),
      cupPoints  = COALESCE(excluded.cupPoints, pga_event_results.cupPoints),
      r1         = COALESCE(excluded.r1, pga_event_results.r1),
      r2         = COALESCE(excluded.r2, pga_event_results.r2),
      r3         = COALESCE(excluded.r3, pga_event_results.r3),
      r4         = COALESCE(excluded.r4, pga_event_results.r4),
      updatedAt  = CURRENT_TIMESTAMP
  `)

  const tx = db.transaction((items) => {
    for (const r of items) {
      if (!r?.athleteId) continue
      stmt.run({
        eventId,
        athleteId: String(r.athleteId),
        playerName: r.playerName || null,
        pos: r.pos || null,
        toPar: r.toPar || null,
        status: r.status || null,
        thru: r.thru || null,
        sortOrder: safeNum(r.sortOrder),
        movement: safeNum(r.movement),
        earnings: safeNum(r.earnings),
        cupPoints: safeNum(r.cupPoints),
        r1: safeNum(r.r1),
        r2: safeNum(r.r2),
        r3: safeNum(r.r3),
        r4: safeNum(r.r4)
      })
    }
  })

  tx(rows)
}
