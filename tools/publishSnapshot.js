// src/tools/publishSnapshot.js
// Publishes curated PUBLIC views to /api/db/* and mirrors ALL raw DB tables to MOD-only /api/db_mod/*

/**
 * Configure which curated views are public (names become the table names under /api/db/<name>).
 * Tweak SQL to add/remove fields, limits, or sorting.
 */

const SONGS_LIMIT = Number(process.env.PUBLIC_SONGS_LIMIT || 5000);
export const PUBLIC_VIEWS = {
  // Most-played songs (public, compact)
  top_songs: {
  sql: `
    SELECT
      trackName     AS title,
      artistName    AS artist,
      playCount     AS plays,
      averageReview AS avg,
      lastPlayed,      
      likes,                    
      dislikes,
      stars
    FROM room_stats
    WHERE LOWER(COALESCE(trackName, '')) <> 'unknown'
    ORDER BY playCount DESC, COALESCE(averageReview, 0) DESC, trackName ASC
    LIMIT ${SONGS_LIMIT}
  `
},


  // Highest craps record (1 row)
  craps_records_public: {
    sql: `
      SELECT
        roomId,
        maxRolls,
        shooterNickname,
        shooterId,
        achievedAt
      FROM craps_records
      ORDER BY maxRolls DESC
      LIMIT 1
    `
  },

  // Recent lottery winners (safe columns)
  lottery_winners_public: {
    sql: `
      SELECT
        nickname,
        userId,
        amountWon,
        timestamp
      FROM lottery_winners
      ORDER BY datetime(timestamp) DESC
      LIMIT 50
    `
  },

  // 🔵 Just Balls tab: aggregated counts by ball number (padded 1..99)
lottery_stats_public: {
  sql: `
    WITH RECURSIVE n(x) AS (
      SELECT 1
      UNION ALL
      SELECT x + 1 FROM n WHERE x < 99
    )
    SELECT
      n.x AS number,
      COALESCE(ls.count, 0) AS count
    FROM n
    LEFT JOIN lottery_stats ls ON ls.number = n.x
    ORDER BY n.x ASC
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
      id,
      albumName,
      artistName,
      albumArt,
      averageReview
      FROM album_stats
      ORDER BY averageReview DESC, trackCount DESC, albumName ASC
      LIMIT 200
      `
  },

  album_review_counts_public: {
  sql: `
    SELECT
      albumId AS id,
      COUNT(*) AS reviews
    FROM album_reviews
    GROUP BY albumId
  `
},

  // Themes (very small, safe)
  themes_public: {
    sql: `
      SELECT
        roomId AS room,
        theme
      FROM themes
      ORDER BY room ASC
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
 * Accepts Worker handlers that expect either:
 *   - { tables, public, privateOnly }  (object map)
 *   - { items,  pubList, privateOnly } (array of {name,data})
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

    // 3) Merge and publish (support both payload shapes)
    Object.assign(tables, publicViews)
    const publicList = Object.keys(publicViews) // these appear at /api/db/*
    const privateOnly = rawNames              // raw DB tables are mod-only

    // Also build the array shape for Workers that expect items/pubList
    const items = Object.entries(tables).map(([name, data]) => ({ name, data }))
    const payload = {
      tables,
      public: publicList,
      privateOnly,
      // compatibility extras:
      items,
      pubList: publicList
    }

    await postJson('/api/publishDb', payload)

    logger.log('[site publish] db ok – public:', publicList.join(', '))
  } catch (err) {
    console.warn('[site publish] db failed:', err?.message || err)
  }
}
