// src/index.js
import 'dotenv/config'
import './database/initdb.js'
import './database/seedavatars.js'
import express from 'express'
import fetch from 'node-fetch'
import db from './database/db.js'
import { Bot, getCurrentDJUUIDs } from './libs/bot.js'
import { updateCurrentUsers } from './utils/currentUsers.js'
import { fetchCurrentUsers } from './utils/API.js'
import * as themeStorage from './utils/themeManager.js'
import { setThemes } from './utils/roomThemes.js'

// File + path utils for reading JSON command lists
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const roomBot = new Bot(process.env.JOIN_ROOM)

// ───────────────────────────────────────────────────────────
// Config for site publishing
// ───────────────────────────────────────────────────────────
const SITE_PUBLISH_BASE =
  process.env.SITE_PUBLISH_BASE || 'https://jamflow-site-api.jamflowbot.workers.dev'
const SITE_PUBLISH_TOKEN = process.env.SITE_PUBLISH_TOKEN

function havePublishConfig() {
  if (!SITE_PUBLISH_BASE || !SITE_PUBLISH_TOKEN) {
    console.warn('[site publish] skipped (SITE_PUBLISH_BASE or SITE_PUBLISH_TOKEN missing)')
    return false
  }
  return true
}

async function postJson(pathname, body) {
  if (!havePublishConfig()) return
  const res = await fetch(`${SITE_PUBLISH_BASE}${pathname}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${SITE_PUBLISH_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`${pathname} ${res.status} ${res.statusText} – ${txt}`)
  }
  return res.json()
}

// ───────────────────────────────────────────────────────────
// Commands publisher (reads JSON → Worker KV)
// ───────────────────────────────────────────────────────────
async function readJsonSafe(p, fallback = []) {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')) } catch { return fallback }
}

async function buildCommandsFromFiles() {
  const publicPath = path.resolve(__dirname, '../site/commands.public.json')
  const modPath    = path.resolve(__dirname, '../site/commands.mod.json')
  const commands     = await readJsonSafe(publicPath, [])
  const commands_mod = await readJsonSafe(modPath, [])
  return { commands, commands_mod }
}

async function publishCommandsFromFiles() {
  try {
    const { commands, commands_mod } = await buildCommandsFromFiles()
    await postJson('/api/publishCommands', { commands, commands_mod })
    console.log('[site publish] commands ok')
  } catch (err) {
    console.warn('[site publish] commands failed:', err?.message || err)
  }
}

// ───────────────────────────────────────────────────────────
// Stats publisher (Totals, Top Songs, Top Albums)
// ───────────────────────────────────────────────────────────
function buildStats() {
  const topSongsRaw = db.prepare(`
    SELECT trackName, artistName, averageReview AS avg, playCount
    FROM room_stats
    WHERE averageReview IS NOT NULL
    ORDER BY averageReview DESC, playCount DESC
    LIMIT 20
  `).all()

  const topAlbumsRaw = db.prepare(`
    SELECT albumName, artistName, averageReview AS avg, trackCount
    FROM album_stats
    WHERE averageReview IS NOT NULL
    ORDER BY averageReview DESC, trackCount DESC
    LIMIT 20
  `).all()

  const totals = {
    songsTracked:  db.prepare('SELECT COUNT(*) AS c FROM room_stats').get().c,
    albumsTracked: db.prepare('SELECT COUNT(*) AS c FROM album_stats').get().c,
    songReviews:   db.prepare('SELECT COUNT(*) AS c FROM song_reviews').get().c,
    albumReviews:  db.prepare('SELECT COUNT(*) AS c FROM album_reviews').get().c,
    updatedAt:     new Date().toISOString()
  }

  const topSongs = topSongsRaw.map(r => ({
    title: r.trackName, artist: r.artistName, avg: r.avg, playCount: r.playCount
  }))
  const topAlbums = topAlbumsRaw.map(r => ({
    title: r.albumName, artist: r.artistName, avg: r.avg, trackCount: r.trackCount
  }))

  return { totals, topSongs, topAlbums }
}

async function publishStats() {
  try {
    const stats = buildStats()
    await postJson('/api/publishStats', stats)
    console.log('[site publish] stats ok')
  } catch (err) {
    console.warn('[site publish] stats failed:', err?.message || err)
  }
}

// ───────────────────────────────────────────────────────────
// DB → KV snapshots (Data Explorer)
// ───────────────────────────────────────────────────────────
function getAllTableNames() {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map(r => r.name)
}

function dumpTable(name) {
  try { return db.prepare(`SELECT * FROM ${name}`).all() }
  catch (e) { console.warn('[site publish] skip table', name, e.message); return null }
}

// Choose which tables are PUBLIC vs MOD-ONLY
// Tweak these two sets to your comfort level
const PUBLIC_TABLES = new Set([
  'room_stats',
  'album_stats',
  'lottery_stats',
  'recent_songs',
  'themes',
  'avatars',
  'current_state',
  'craps_records',
  // 'horses', // uncomment if you want horses public too
])

const PRIVATE_ONLY = new Set([
  'users',
  'wallets',
  'song_reviews',
  'album_reviews',
  'dj_queue',
  'jackpot',
  'lottery_winners',
])

async function publishDbSnapshot() {
  try {
    if (!havePublishConfig()) return

    const names = getAllTableNames()
    const tables = {}
    for (const name of names) {
      const rows = dumpTable(name)
      if (rows) tables[name] = rows
    }

    const publicList = names.filter(n => PUBLIC_TABLES.has(n))
    const privateOnly = names.filter(n => PRIVATE_ONLY.has(n))

    await postJson('/api/publishDb', {
      tables,
      public: publicList,
      privateOnly,
    })
    console.log('[site publish] db ok – tables:', Object.keys(tables).length)
  } catch (err) {
    console.warn('[site publish] db failed:', err?.message || err)
  }
}

// ───────────────────────────────────────────────────────────
// Bot startup
// ───────────────────────────────────────────────────────────
const startupTasks = async () => {
  try {
    await roomBot.connect()
    roomBot.configureListeners()

    const currentUsers = await fetchCurrentUsers()
    console.log('Current Room Users', currentUsers)

    const currentDJs = getCurrentDJUUIDs(roomBot.state)
    console.log('Current DJs', currentDJs)

    updateCurrentUsers(currentUsers)

    // Publish on boot
    await publishCommandsFromFiles()
    await publishStats()
    await publishDbSnapshot()
  } catch (error) {
    console.error('Error during bot startup:', error.message)
  }
}

startupTasks()

// Load & apply saved themes
const savedThemes = themeStorage.loadThemes()
setThemes(savedThemes)

// ───────────────────────────────────────────────────────────
// Adaptive poll loop (unchanged)
// ───────────────────────────────────────────────────────────
const BASE_MS = 900
const STEP_MS = 300
const MAX_BACKOFF_STEPS = 4

function jitter (ms) {
  const delta = Math.floor(ms * 0.15) // ±15%
  return ms + (Math.floor(Math.random() * (2 * delta + 1)) - delta)
}

async function pollLoop () {
  try {
    await roomBot.processNewMessages()
  } catch (e) {
    console.error('pollLoop error:', e)
  } finally {
    const empty = roomBot._emptyPolls || 0
    const backoffSteps = Math.min(empty, MAX_BACKOFF_STEPS)
    const delay = jitter(BASE_MS + backoffSteps * STEP_MS)
    setTimeout(pollLoop, delay)
  }
}

pollLoop() // start

// ───────────────────────────────────────────────────────────
// Timers (keep KV fresh)
// ───────────────────────────────────────────────────────────
const PUBLISH_INTERVAL_MS     = Number(process.env.SITE_PUBLISH_INTERVAL_MS || 90_000)
const DB_PUBLISH_INTERVAL_MS  = Number(process.env.DB_PUBLISH_INTERVAL_MS || 5 * 60 * 1000)
const STATS_PUBLISH_INTERVAL_MS = Number(process.env.STATS_PUBLISH_INTERVAL_MS || 5 * 60 * 1000)

setInterval(() => { publishCommandsFromFiles() }, PUBLISH_INTERVAL_MS)
setInterval(() => { publishDbSnapshot() }, DB_PUBLISH_INTERVAL_MS)
setInterval(() => { publishStats() }, STATS_PUBLISH_INTERVAL_MS)

// If you want instant updates when you edit the JSON files, install chokidar and uncomment:
/*
import chokidar from 'chokidar'
chokidar
  .watch([
    path.resolve(__dirname, '../site/commands.public.json'),
    path.resolve(__dirname, '../site/commands.mod.json')
  ], { ignoreInitial: true })
  .on('change', () => publishCommandsFromFiles())
*/

// ───────────────────────────────────────────────────────────
// Minimal HTTP
// ───────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.send('Jamflow bot is alive and running!')
})

app.get('/health', (_req, res) => {
  res.status(200).send('OK')
})

const port = process.env.PORT || 3000
app.listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`))

export { roomBot }
