// src/index.js
import 'dotenv/config'
import './database/initdb.js'
import './database/seedavatars.js'
import express from 'express'
import fetch from 'node-fetch'
import db from './database/db.js' // ⬅️ for building snapshots
import { Bot, getCurrentDJUUIDs } from './libs/bot.js'
import { updateCurrentUsers } from './utils/currentUsers.js'
import { fetchCurrentUsers } from './utils/API.js'
import * as themeStorage from './utils/themeManager.js'
import { setThemes } from './utils/roomThemes.js'

const app = express()
const roomBot = new Bot(process.env.JOIN_ROOM)

// ───────────────────────────────────────────────────────────
// Site snapshot publisher (Commands + Stats → Cloudflare KV)
// ───────────────────────────────────────────────────────────
function buildSnapshot () {
  // Show only MAIN entry-point commands (branches live under those)
  const commands = [
    { group: 'Core',  items: ['/commands','/songreview <1-10>','/albumreview <1-10>','/rating','/topsongs','/topalbums'] },
    { group: 'Games', items: ['/games','/blackjack','/craps','/roulette'] },
    { group: 'DJ',    items: ['/tip <amount>','/djbeers','/queue','/autodj on|off'] },
    { group: 'Fun',   items: ['/gifs','/props','/allen'] },
    { group: 'Mods',  items: ['/mod','/theme <name>'] }
  ]

  // Lightweight, read-only stats
  const topSongs = db.prepare(`
    SELECT trackName, artistName, averageReview AS avg, playCount
    FROM room_stats
    WHERE averageReview IS NOT NULL
    ORDER BY averageReview DESC, playCount DESC
    LIMIT 20
  `).all()

  const topAlbums = db.prepare(`
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

  return { commands, stats: { totals, topSongs, topAlbums } }
}

async function publishSiteSnapshot () {
  const url = process.env.SITE_PUBLISH_URL
  const token = process.env.SITE_PUBLISH_TOKEN
  if (!url || !token) {
    console.warn('[site publish] skipped (SITE_PUBLISH_URL or SITE_PUBLISH_TOKEN missing)')
    return
  }
  const payload = buildSnapshot()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status} ${res.statusText} – ${txt}`)
    }
    console.log('[site publish] ok')
  } catch (err) {
    console.warn('[site publish] failed:', err?.message || err)
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

    // Publish a snapshot on boot
    await publishSiteSnapshot()
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
// Site publish timer (keeps KV fresh even without events)
// ───────────────────────────────────────────────────────────
const PUBLISH_INTERVAL_MS = Number(process.env.SITE_PUBLISH_INTERVAL_MS || 90_000)
setInterval(() => {
  publishSiteSnapshot()
}, PUBLISH_INTERVAL_MS)

// If you want to publish right after specific actions (e.g., a review saved),
// call `publishSiteSnapshot()` in those code paths too.

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
