// src/libs/initDb.js
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
    rating INTEGER,
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
    rating INTEGER NOT NULL,
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
function hasColumn(table, name) {
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

console.log('✅ Database initialized')
