// src/database/initdb.js
import db from './db.js'

// Users
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uuid TEXT PRIMARY KEY,
    nickname TEXT NOT NULL
  )
`)

// Wallets
db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    uuid TEXT PRIMARY KEY,
    balance REAL DEFAULT 0
  )
`)

// Lottery winners
db.exec(`
  CREATE TABLE IF NOT EXISTS lottery_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    nickname TEXT,
    winningNumber INTEGER,
    amountWon REAL,
    timestamp TEXT
  )
`)

// Recent songs
db.exec(`
  CREATE TABLE IF NOT EXISTS recent_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trackName TEXT,
    artistName TEXT,
    albumName TEXT,
    releaseDate TEXT,
    spotifyUrl TEXT,
    popularity INTEGER,
    dj TEXT,
    djNickname TEXT,
    djUuid TEXT,
    playedAt TEXT,
    similarTracks TEXT
  )
`)

// Room stats
db.exec(`
  CREATE TABLE IF NOT EXISTS room_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trackName TEXT NOT NULL,
    artistName TEXT NOT NULL,
    songId TEXT,
    spotifyTrackId TEXT,
    songDuration TEXT,
    playCount INTEGER DEFAULT 1,
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,
    stars INTEGER DEFAULT 0,
    lastPlayed TEXT,
    averageReview REAL
  )
`)

// Song reviews
db.exec(`
  CREATE TABLE IF NOT EXISTS song_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    songId TEXT NOT NULL,
    userId TEXT NOT NULL,
    rating REAL,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(songId, userId)
  )
`)

// Albums
db.exec(`
  CREATE TABLE IF NOT EXISTS album_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    albumName TEXT NOT NULL,
    albumArt TEXT,
    artistName TEXT NOT NULL,
    trackCount INTEGER,
    averageReview REAL
  )
`)

// Album reviews
db.exec(`
  CREATE TABLE IF NOT EXISTS album_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    albumId INTEGER NOT NULL,
    userId TEXT NOT NULL,
    rating REAL NOT NULL,
    FOREIGN KEY (albumId) REFERENCES album_stats(id)
  )
`)

// Lottery stats
db.exec(`
  CREATE TABLE IF NOT EXISTS lottery_stats (
    number INTEGER PRIMARY KEY,
    count INTEGER DEFAULT 0
  )
`)

// DJ queue
db.exec(`
  CREATE TABLE IF NOT EXISTS dj_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL UNIQUE,
    username TEXT,
    joinedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Themes
db.exec(`
  CREATE TABLE IF NOT EXISTS themes (
    roomId TEXT PRIMARY KEY,
    theme TEXT
  )
`)

// Jackpot (singleton)
db.exec(`
  CREATE TABLE IF NOT EXISTS jackpot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    progressiveJackpot REAL DEFAULT 100
  )
`)
db.exec(`
  INSERT OR IGNORE INTO jackpot (id, progressiveJackpot)
  VALUES (1, 100)
`)

// Horses
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

// Avatars
db.exec(`
  CREATE TABLE IF NOT EXISTS avatars (
    slug TEXT PRIMARY KEY
  )
`)

// Current state (singleton row)
db.exec(`
  CREATE TABLE IF NOT EXISTS current_state (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    -- Song fields
    songId          TEXT,
    trackName       TEXT,
    spotifyTrackId  TEXT,
    spotifyUrl      TEXT,
    artistName      TEXT,
    albumName       TEXT,
    releaseDate     TEXT,
    albumType       TEXT,
    trackNumber     TEXT,
    totalTracks     TEXT,
    songDuration    TEXT,
    albumArt        TEXT,
    popularity      REAL,
    previewUrl      TEXT,
    isrc            TEXT,
    albumID         TEXT,
    -- Album fields
    albumAlbumID    TEXT,
    albumNameField  TEXT,
    albumArtistName TEXT,
    albumReleaseDate TEXT,
    albumArtField   TEXT,
    albumTypeField  TEXT,
    albumIsrc       TEXT
  )
`)
// Ensure singleton row exists
db.exec(`INSERT OR IGNORE INTO current_state (id) VALUES (1)`)

// Craps records (per room)
db.exec(`
  CREATE TABLE IF NOT EXISTS craps_records (
    roomId TEXT PRIMARY KEY,
    maxRolls INTEGER DEFAULT 0,
    shooterId TEXT,
    shooterNickname TEXT,
    achievedAt TEXT
  )
`)

// ───────────────────────────────────────────────────────────────
// Lightweight migrations for existing DBs (idempotent)
// ───────────────────────────────────────────────────────────────
function hasColumn (table, name) {
  const cols = db.prepare('PRAGMA table_info(' + table + ')').all()
  return cols.some(c => c.name === name)
}

// room_stats.averageReview
try {
  if (!hasColumn('room_stats', 'averageReview')) {
    db.exec('ALTER TABLE room_stats ADD COLUMN averageReview REAL;')
    console.log('✅ Added room_stats.averageReview')
  }
} catch (e) {
  console.warn('⚠️ Could not add room_stats.averageReview:', e.message)
}

// song_reviews.createdAt (older DBs can’t add with default; add without)
// fresh installs already have DEFAULT CURRENT_TIMESTAMP from CREATE TABLE above
try {
  if (!hasColumn('song_reviews', 'createdAt')) {
    db.exec('ALTER TABLE song_reviews ADD COLUMN createdAt TEXT;')
    console.log('✅ Added song_reviews.createdAt (no default)')
  }
} catch (e) {
  console.warn('⚠️ Could not add song_reviews.createdAt:', e.message)
}

// Ensure unique index (for older DBs created without named index)
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_song_reviews ON song_reviews(songId, userId);')
} catch (e) {
  console.warn('⚠️ Could not create ux_song_reviews index:', e.message)
}

// ─────────────────────────────────────────────────────────────
// Additional index creation and canonSongKey migration
// These indexes improve performance on frequent lookup queries and
// provide a canonical key to avoid OR conditions on room_stats
// lookups. They are idempotent and safe to execute on existing
// databases.
try {
  // Add canonSongKey column for deduplicated song lookups
  if (!hasColumn('room_stats', 'canonSongKey')) {
    db.exec('ALTER TABLE room_stats ADD COLUMN canonSongKey TEXT;')
    console.log('✅ Added room_stats.canonSongKey')
    // Backfill canonSongKey for existing rows. Use songId if present
    // otherwise fall back to lower-cased trackName|artistName. This
    // ensures consistent key generation for future queries.
    db.exec(`UPDATE room_stats
      SET canonSongKey = COALESCE(songId, LOWER(trackName || '|' || artistName))
      WHERE canonSongKey IS NULL OR canonSongKey = ''`)
  }

  // ────────────── Normalisation columns for fuzzy matching ────────────
  // To support fuzzy deduplication across different platforms, we
  // introduce fields that store normalised forms of the track and
  // artist names. These fields are populated by a one-time script
  // (see dedupe-room-stats.js) and maintained on insert/update
  // thereafter. They can exist on older databases without harm.
  if (!hasColumn('room_stats', 'normTrack')) {
    db.exec('ALTER TABLE room_stats ADD COLUMN normTrack TEXT;')
    console.log('✅ Added room_stats.normTrack')
  }
  if (!hasColumn('room_stats', 'normArtist')) {
    db.exec('ALTER TABLE room_stats ADD COLUMN normArtist TEXT;')
    console.log('✅ Added room_stats.normArtist')
  }
  if (!hasColumn('room_stats', 'normSongKey')) {
    db.exec('ALTER TABLE room_stats ADD COLUMN normSongKey TEXT;')
    console.log('✅ Added room_stats.normSongKey')
  }
} catch (e) {
  console.warn('⚠️ Could not add canonSongKey or backfill:', e.message)
}

// Create indexes to speed up common queries. These calls are wrapped
// in try/catch so they fail gracefully on older SQLite versions.
try { db.exec('CREATE INDEX IF NOT EXISTS idx_room_stats_songId ON room_stats(songId)') } catch (e) { console.warn('⚠️ Could not create idx_room_stats_songId:', e.message) }
// The track\_artist index is no longer needed now that canonSongKey provides a
// single lookup key. Remove the idx_room_stats_track_artist index if it exists
// and avoid creating a duplicate index on writes. Extra indexes slow down
// writes and provide little benefit once canonSongKey is in place.
try {
  // Drop the old compound index if present to reduce write overhead
  db.exec('DROP INDEX IF EXISTS idx_room_stats_track_artist')
} catch (e) {
  console.warn('⚠️ Could not drop idx_room_stats_track_artist:', e.message)
}
// Note: we intentionally omit recreating idx_room_stats_track_artist.
try { db.exec('CREATE INDEX IF NOT EXISTS idx_room_stats_lastPlayed ON room_stats(lastPlayed)') } catch (e) { console.warn('⚠️ Could not create idx_room_stats_lastPlayed:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_song_reviews_song_user ON song_reviews(songId, userId)') } catch (e) { console.warn('⚠️ Could not create idx_song_reviews_song_user:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_album_reviews_album ON album_reviews(albumId)') } catch (e) { console.warn('⚠️ Could not create idx_album_reviews_album:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_themes_room ON themes(roomId)') } catch (e) { console.warn('⚠️ Could not create idx_themes_room:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_wallets_uuid ON wallets(uuid)') } catch (e) { console.warn('⚠️ Could not create idx_wallets_uuid:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_room_stats_canon ON room_stats(canonSongKey)') } catch (e) { console.warn('⚠️ Could not create idx_room_stats_canon:', e.message) }

// Create indexes on the new normalisation fields. These indexes
// improve lookups by normalised key and artist, which are used by
// dbroomstatsmanager.js when performing fuzzy deduplication.
try { db.exec('CREATE INDEX IF NOT EXISTS idx_room_stats_normSongKey ON room_stats(normSongKey)') } catch (e) { console.warn('⚠️ Could not create idx_room_stats_normSongKey:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_room_stats_normArtist ON room_stats(normArtist)') } catch (e) { console.warn('⚠️ Could not create idx_room_stats_normArtist:', e.message) }

console.log('✅ Database initialized')


// --- Ratings migration: ensure rating columns are REAL and scale is 1–10 ---
try {
  const srCols = db.prepare("PRAGMA table_info(song_reviews)").all();
  const srRating = srCols.find(c => c.name === 'rating');
  if (srRating && srRating.type && srRating.type.toUpperCase() !== 'REAL') {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS song_reviews_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        songId TEXT NOT NULL,
        userId TEXT NOT NULL,
        rating REAL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(songId, userId)
      );
      INSERT INTO song_reviews_new (id, songId, userId, rating, createdAt)
      SELECT id, songId, userId, CAST(rating AS REAL), createdAt FROM song_reviews;
      DROP TABLE song_reviews;
      ALTER TABLE song_reviews_new RENAME TO song_reviews;
      COMMIT;
    `);
  }

  const arCols = db.prepare("PRAGMA table_info(album_reviews)").all();
  const arRating = arCols.find(c => c.name === 'rating');
  if (arRating && arRating.type && arRating.type.toUpperCase() !== 'REAL') {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE IF NOT EXISTS album_reviews_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        albumId INTEGER NOT NULL,
        userId TEXT NOT NULL,
        rating REAL NOT NULL,
        FOREIGN KEY (albumId) REFERENCES album_stats(id)
      );
      INSERT INTO album_reviews_new (id, albumId, userId, rating)
      SELECT id, albumId, userId, CAST(rating AS REAL) FROM album_reviews;
      DROP TABLE album_reviews;
      ALTER TABLE album_reviews_new RENAME TO album_reviews;
      COMMIT;
    `);
  }
} catch (e) {
  // Non-fatal: log and continue
  console.error('[initdb] ratings migration check failed:', e?.message || e);
}
