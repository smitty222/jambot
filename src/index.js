// src/index.js
import 'dotenv/config'
import './database/initdb.js'
import './database/seedavatars.js'
import express from 'express'
import { Bot, getCurrentDJUUIDs } from './libs/bot.js'
import { updateCurrentUsers } from './utils/currentUsers.js'
import { fetchCurrentUsers } from './utils/API.js'
import * as themeStorage from './utils/themeManager.js'
import { setThemes } from './utils/roomThemes.js'
// Import database instance for health check
import db from './database/db.js'

// ──────────────────────────────────────────────────────────────
// Scheduled publisher (cron → runs tools/publish-site-data.mjs)
// ──────────────────────────────────────────────────────────────
import cron from 'node-cron'
import { spawn } from 'node:child_process'

function startSitePublisherCron () {
  if (process.env.ENABLE_SITE_PUBLISH_CRON !== '1') {
    console.log('[publish-cron] disabled (set ENABLE_SITE_PUBLISH_CRON=1 to enable)')
    return
  }

  const TZ = process.env.PUBLISH_TZ || 'America/New_York'
  const CRON = process.env.PUBLISH_CRON || '0 9,13,17 * * *' // 09:00, 13:00, 17:00 (TZ)
  const SCRIPT = process.env.PUBLISH_SCRIPT || 'tools/publish-site-data.mjs'
  const RUN_ON_BOOT = process.env.PUBLISH_RUN_ON_BOOT === '1'

  // Only pass what the script needs; inherits everything else from process.env
  const PUB_ENV = {
    API_BASE: process.env.API_BASE,                 // e.g., https://jamflow-site-api.jamflowbot.workers.dev
    PUBLISH_TOKEN: process.env.PUBLISH_TOKEN,       // set via secrets
    DB_PATH: process.env.DB_PATH || '/data/app.db',
    PUBLISH_STATE_FILE: process.env.PUBLISH_STATE_FILE || '/data/.publish-state.json',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
  }

  // Track whether a run is in progress and the time of the last run. This
  // debounces the cron so overlapping invocations are skipped and a
  // minimum interval is enforced (protects against Fly restarts or
  // scheduling glitches). See suggestions for idempotent publisher.
  let running = false
  let lastRunAt = 0
  const MIN_INTERVAL_MS = 60_000
  const runOnce = () => {
    const now = Date.now()
    if (running || (now - lastRunAt) < MIN_INTERVAL_MS) {
      console.log('[publish-cron] skipped (in progress or too soon)')
      return
    }
    running = true
    lastRunAt = now
    console.log(`[publish-cron] start: node ${SCRIPT}`)
    const child = spawn('node', [SCRIPT], {
      stdio: 'inherit',
      env: { ...process.env, ...PUB_ENV }
    })
    child.on('exit', (code) => {
      console.log(`[publish-cron] finished with code ${code}`)
      running = false
    })
    child.on('error', (err) => {
      console.error('[publish-cron] spawn error:', err)
      running = false
    })
  }

  cron.schedule(CRON, runOnce, { timezone: TZ })
  console.log(`[publish-cron] scheduled "${CRON}" (TZ=${TZ}); script=${SCRIPT}`)

  if (RUN_ON_BOOT) runOnce()
}

// ──────────────────────────────────────────────────────────────
// App / Bot bootstrap
// ──────────────────────────────────────────────────────────────
const app = express()

const roomBot = new Bot(process.env.JOIN_ROOM)

const startupTasks = async () => {
  try {
    await roomBot.connect()
    roomBot.configureListeners()

    const currentUsers = await fetchCurrentUsers()
    console.log('Current Room Users', currentUsers)

    const currentDJs = getCurrentDJUUIDs(roomBot.state)
    console.log('Current DJs', currentDJs)

    updateCurrentUsers(currentUsers)
  } catch (error) {
    console.error('Error during bot startup:', error.message)
  }
}

startupTasks()

const savedThemes = themeStorage.loadThemes()
setThemes(savedThemes)

// --- Adaptive poll loop (replaces setInterval) ---
const BASE_MS = 900
const STEP_MS = 300
const MAX_BACKOFF_STEPS = 4 // up to ~ +1200ms

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

app.get('/', (req, res) => {
  res.send('Jamflow bot is alive and running!')
})

// Health check route — returns 200 when the bot's socket is connected
// and 503 otherwise. Errors during check default to a healthy response.
app.get('/health', (req, res) => {
  try {
    const okSocket = roomBot?.socket?.connected === true
    // Verify that the database can be read with a simple query. If this
    // fails it likely indicates DB corruption or unavailability.
    let okDb = true
    try {
      db.prepare('SELECT 1').get()
    } catch (e) {
      okDb = false
    }
    const ok = okSocket && okDb
    res.status(ok ? 200 : 503).send(ok ? 'OK' : 'DEGRADED')
  } catch (e) {
    res.status(200).send('OK')
  }
})

// Default to 8080 (Fly internal_port); override with PORT if set
const port = Number(process.env.PORT || 8080)
app.listen(port, '0.0.0.0', () => console.log(`Listening on ${port}`))

// Start the scheduled publisher after server boot so logs are visible
startSitePublisherCron()

// ──────────────────────────────────────────────────────────────
// Graceful shutdown
// ──────────────────────────────────────────────────────────────
// Capture SIGINT and SIGTERM to close the socket connection and
// database cleanly. Without this, abrupt process termination could
// corrupt the WAL or leave sockets open. See suggestions for reliability.
function shutdown () {
  try {
    // Close the bot's socket if it exists
    roomBot?.socket?.close?.()
  } catch {}
  try {
    // Dynamically import the db module to avoid circular deps
    import('./database/db.js').then(({ default: database }) => {
      try { database?.close?.() } catch {}
    })
  } catch {}
  process.exit(0)
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, shutdown)
}

export { roomBot }
