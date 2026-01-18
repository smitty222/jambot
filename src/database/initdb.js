// src/database/initdb.js
import db from './db.js'

// Users
//
// The users table now stores both a human‑friendly nickname and the
// current wallet balance. The nickname column is kept NOT NULL to
// preserve existing constraints; however when inserting a new user
// via persistWallet() we supply the UUID as a fallback nickname.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uuid TEXT PRIMARY KEY,
    nickname TEXT NOT NULL,
    balance REAL DEFAULT 0
  )
`)

// Wallets
//
// Historically balances were stored in a separate wallets table. To
// simplify the schema we merge these values into users.balance and
// provide a backward‑compatible view named "wallets". See the
// migration section at the bottom of this file for details.
// We still create the wallets table here in case a legacy database
// expects it, but its contents will be copied into users and then
// dropped during migration.
db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    uuid TEXT PRIMARY KEY,
    balance REAL DEFAULT 0
  )
`)

// Lottery winners
// The lottery_winners table stores both a mention string (nickname)
// and a sanitised display name for each winner. A separate
// displayName column ensures that the website can show a human
// friendly name while the bot can still mention users via their
// raw UID syntax. See update_nickname_display.mjs for migrations.
db.exec(`
  CREATE TABLE IF NOT EXISTS lottery_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    nickname TEXT NOT NULL,
    displayName TEXT NOT NULL,
    winningNumber INTEGER NOT NULL,
    amountWon INTEGER DEFAULT 100000,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
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
db.exec(`
  CREATE TABLE IF NOT EXISTS song_plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playedAt TEXT DEFAULT CURRENT_TIMESTAMP,

    -- Identity
    trackName TEXT NOT NULL,
    artistName TEXT NOT NULL,
    albumName TEXT,
    songId TEXT,
    spotifyTrackId TEXT,

    -- Who played it
    djUuid TEXT,
    djNickname TEXT
  )
`)

// Helpful indexes for Wrapped queries
try { db.exec('CREATE INDEX IF NOT EXISTS idx_song_plays_playedAt ON song_plays(playedAt)') } catch (e) { console.warn('⚠️ Could not create idx_song_plays_playedAt:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_song_plays_track_artist ON song_plays(trackName, artistName)') } catch (e) { console.warn('⚠️ Could not create idx_song_plays_track_artist:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_song_plays_artist ON song_plays(artistName)') } catch (e) { console.warn('⚠️ Could not create idx_song_plays_artist:', e.message) }
try { db.exec('CREATE INDEX IF NOT EXISTS idx_song_plays_djUuid ON song_plays(djUuid)') } catch (e) { console.warn('⚠️ Could not create idx_song_plays_djUuid:', e.message) }

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

// ───────────────────────────────────────────────────────────────────────
// Lottery winners migration: ensure nickname/displayName columns exist
//
// Legacy databases may lack one or both of these fields. We add them
// here and backfill displayName from nickname if necessary. A more
// thorough sanitisation of names can be performed by running
// update_nickname_display.mjs, but this lightweight migration
// guarantees that the schema is present and the site has a value to
// display. It is idempotent and safe to re-run.
try {
  if (!hasColumn('lottery_winners', 'nickname')) {
    db.exec('ALTER TABLE lottery_winners ADD COLUMN nickname TEXT NOT NULL DEFAULT \"\";')
    console.log('✅ Added lottery_winners.nickname (default empty)')
  }
  if (!hasColumn('lottery_winners', 'displayName')) {
    db.exec('ALTER TABLE lottery_winners ADD COLUMN displayName TEXT NOT NULL DEFAULT \"\";')
    // Copy existing nicknames into displayName as a simple backfill. If
    // nickname is empty the displayName remains empty; update_nickname_display
    // can later normalise this.
    db.exec('UPDATE lottery_winners SET displayName = nickname WHERE displayName = \"\" OR displayName IS NULL;')
    console.log('✅ Added lottery_winners.displayName and backfilled from nickname')
  }
} catch (e) {
  console.warn('⚠️ Could not migrate lottery_winners columns:', e?.message || e)
}

// ───────────────────────────────────────────────────────────────────────
// Wallets → Users migration
//
// Older versions of the database stored wallet balances in a separate
// `wallets` table. Beginning in October 2025 we merge balances into
// the `users` table via the `balance` column. This block copies any
// existing balances into users.balance, drops the wallets table, and
// creates a backward‑compatible view named "wallets" so legacy queries
// continue to work. The operations are idempotent: they run safely
// even if the migration has already been applied.
try {
  // Ensure users.balance column exists. New installs create it above
  // but older databases may lack the column.
  if (!hasColumn('users', 'balance')) {
    db.exec('ALTER TABLE users ADD COLUMN balance REAL DEFAULT 0;')
    console.log('✅ Added users.balance')
  }
  // Check if a real table named wallets exists (type='table'). If so
  // copy its data, drop the table and create a view.
  const walletsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wallets'").get()
  if (walletsTable) {
    // Copy balances into users. Use COALESCE to preserve any
    // existing balances already stored in users.balance
    db.exec(`
      UPDATE users
      SET balance = COALESCE(
        (SELECT balance FROM wallets WHERE wallets.uuid = users.uuid),
        balance
      )
    `)
    // Drop the old wallets table
    db.exec('DROP TABLE IF EXISTS wallets;')
    // Create a view that exposes uuid and balance from users for
    // backward compatibility. View creation fails silently if the
    // view already exists.
    db.exec('CREATE VIEW IF NOT EXISTS wallets AS SELECT uuid, balance FROM users;')
    console.log('✅ Merged wallets into users and created wallets view')
  } else {
    // If wallets is a view or does not exist, ensure the view is present
    const walletsView = db.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name='wallets'").get()
    if (!walletsView) {
      db.exec('CREATE VIEW IF NOT EXISTS wallets AS SELECT uuid, balance FROM users;')
      console.log('✅ Ensured wallets view exists')
    }
  }
} catch (e) {
  console.warn('⚠️ Could not merge wallets into users:', e?.message || e)
}
// ─── Crypto investing tables ──────────────────────────────────────────────
// These tables support a paper crypto investing game. Users maintain a
// separate cash balance for crypto transactions (crypto_accounts), a list of
// positions aggregated by coin (crypto_positions) and a trade ledger
// (crypto_trades). See src/database/dbcrypto.js for helper functions.
db.exec(`
  CREATE TABLE IF NOT EXISTS crypto_accounts (
    userId TEXT PRIMARY KEY,
    cashUsd REAL DEFAULT 0
  )
`)
db.exec(`
  CREATE TABLE IF NOT EXISTS crypto_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    coinId TEXT NOT NULL,
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    avgCostUsd REAL NOT NULL,
    UNIQUE(userId, coinId)
  )
`)
db.exec(`
  CREATE TABLE IF NOT EXISTS crypto_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    coinId TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity REAL NOT NULL,
    priceUsd REAL NOT NULL,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)