// src/publish/publishDbSnapshot.js
// Publishes curated PUBLIC views to /api/db/* and mirrors ALL raw DB tables to MOD-only /api/db_mod/*

/**
 * Configure which curated views are public (names become the table names under /api/db/<name>).
 * Tweak SQL to add/remove fields, limits, or sorting.
 */
export const PUBLIC_VIEWS = {
  // Most-played songs (public, compact)
  top_songs: {
    sql: `
      SELECT
        trackName  AS title,
        artistName AS artist,
        playCount  AS plays,
        averageReview AS avg
      FROM room_stats
      ORDER BY playCount DESC, COALESCE(averageReview, 0) DESC, trackName ASC
      LIMIT 200
    `
  },

  // Room stats (safe columns only)
  room_stats_public: {
    sql: `
      SELECT
        trackName  AS title,
        artistName AS artist,
        playCount  AS plays,
        averageReview AS avg
      FROM room_stats
      ORDER BY playCount DESC, COALESCE(averageReview, 0) DESC, trackName ASC
      LIMIT 500
    `
  },

  // Album stats (safe columns)
  album_stats_public: {
    sql: `
      SELECT
        albumName  AS title,
        artistName AS artist,
        trackCount AS tracks,
        averageReview AS avg
      FROM album_stats
      ORDER BY avg DESC, tracks DESC, title ASC
      LIMIT 200
    `
  },

  // Themes (very small, safe)
  themes_public: {
    sql: `
      SELECT key AS theme, active
      FROM themes
      ORDER BY active DESC, key ASC
      LIMIT 100
    `
  },

  // Example: enable if you have a plays table
  // latest_plays_public: {
  //   sql: `
  //     SELECT title, artist, played_at
  //     FROM song_plays
  //     ORDER BY played_at DESC
  //     LIMIT 200
  //   `
  // },
}

/**
 * Utility: list all raw table names in SQLite
 */
function getAllTableNames (db) {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map(r => r.name)
}

/**
 * Utility: dump a whole table (use only for mod-only mirrors)
 */
function dumpTable (db, name) {
  try { return db.prepare(`SELECT * FROM "${name}"`).all() } // quote name in case of reserved words
  catch (e) { console.warn('[site publish] skip table', name, e.message); return null }
}

function runSqlSafe (db, sql) {
  try { return db.prepare(sql).all() }
  catch (e) { console.warn('[site publish] view build failed:', e.message); return [] }
}

/**
 * Publish curated views to public (`db:`) and raw tables to mod-only (`dbmod:`).
 * @param {{ db:any, postJson:Function, havePublishConfig:Function, logger?:Console }} opts
 */
export default async function publishDbSnapshot (opts) {
  const { db, postJson, havePublishConfig, logger = console } = opts || {}
  try {
    if (!havePublishConfig || !havePublishConfig()) return

    // 1) Dump ALL raw tables → mod-only
    const rawNames = getAllTableNames(db)
    const tables = {}
    for (const name of rawNames) {
      const rows = dumpTable(db, name)
      if (rows) tables[name] = rows // will be tagged as privateOnly
    }

    // 2) Build curated public views
    const publicViews = {}
    for (const [viewName, cfg] of Object.entries(PUBLIC_VIEWS)) {
      publicViews[viewName] = runSqlSafe(db, cfg.sql)
    }

    // 3) Merge and publish
    Object.assign(tables, publicViews)
    const publicList = Object.keys(publicViews)          // only these appear in the site's Data tab
    const privateOnly = rawNames                         // raw DB tables are mod-only

    await postJson('/api/publishDb', {
      tables,
      public: publicList,
      privateOnly
    })

    logger.log('[site publish] db ok – public:', publicList.join(', '))
  } catch (err) {
    console.warn('[site publish] db failed:', err?.message || err)
  }
}
