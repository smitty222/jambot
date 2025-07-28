// src/libs/initDb.js
import db from './db.js'


// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uuid TEXT PRIMARY KEY,
    nickname TEXT NOT NULL
  )
`)

// Wallets table
db.exec(`
  CREATE TABLE IF NOT EXISTS wallets (
    uuid TEXT PRIMARY KEY,
    balance REAL DEFAULT 0
  )
`)

// Lottery winners table
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

// Recent songs table
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

// Room Stats Table
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
    lastPlayed TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS song_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    songId TEXT NOT NULL,
    userId TEXT NOT NULL,
    rating INTEGER,
    UNIQUE(songId, userId)
  )
`);

// Albums table
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

// Album Reviews table
db.exec(`
  CREATE TABLE IF NOT EXISTS album_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    albumId INTEGER NOT NULL,
    userId TEXT NOT NULL,
    rating INTEGER NOT NULL,
    FOREIGN KEY (albumId) REFERENCES album_stats(id)
  )
`)

// Lottery winners table
db.exec(`
  CREATE TABLE IF NOT EXISTS lottery_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    nickname TEXT,
    winningNumber INTEGER,
    amountWon REAL,
    timestamp TEXT
  )
`);
// Lottery stats table
db.exec(`
  CREATE TABLE IF NOT EXISTS lottery_stats (
  number INTEGER PRIMARY KEY,
  count INTEGER DEFAULT 0
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS dj_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL UNIQUE,
    username TEXT,
    joinedAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// Themes table
db.exec(`
  CREATE TABLE IF NOT EXISTS themes (
    roomId TEXT PRIMARY KEY,
    theme TEXT
  )
`)
// Jackpot Table (singleton row)
db.exec(`
  CREATE TABLE IF NOT EXISTS jackpot (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    progressiveJackpot REAL DEFAULT 100
  )
`)

// Ensure row exists with id=1
db.exec(`
  INSERT OR IGNORE INTO jackpot (id, progressiveJackpot)
  VALUES (1, 100)
`)

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

db.exec(`
  CREATE TABLE IF NOT EXISTS avatars (
    slug TEXT PRIMARY KEY
  );
`)
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
);
`)


console.log('✅ Database initialized')
