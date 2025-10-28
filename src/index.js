// src/index.js
import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'
import { spawn } from 'node:child_process'

import db from './database/db.js'
import { Bot, getCurrentDJUUIDs } from './libs/bot.js'
import { updateCurrentUsers } from './utils/currentUsers.js'
import { fetchCurrentUsers } from './utils/API.js'
import * as themeStorage from './utils/themeManager.js'
import { setThemes } from './utils/roomThemes.js'

// ──────────────────────────────────────────────
// Scheduled publisher (cron → runs tools/publish-site-data.mjs)
// ──────────────────────────────────────────────
function startSitePublisherCron () {
  if (process.env.ENABLE_SITE_PUBLISH_CRON !== '1') {
    console.log('[publish-cron] disabled (set ENABLE_SITE_PUBLISH_CRON=1 to enable)')
    return
  }

  const TZ = process.env.PUBLISH_TZ || 'America/New_York'
  const CRON = process.env.PUBLISH_CRON || '0 9,13,17 * * *' // 09:00, 13:00, 17:00 (TZ)
  const SCRIPT = process.env.PUBLISH_SCRIPT || 'tools/publish-site-data.mjs'
  const RUN_ON_BOOT = process.env.PUBLISH_RUN_ON_BOOT === '1'

  const PUB_ENV = {
    API_BASE: process.env.API_BASE,
    PUBLISH_TOKEN: process.env.PUBLISH_TOKEN,
    DB_PATH: process.env.DB_PATH || '/data/app.db',
    PUBLISH_STATE_FILE: process.env.PUBLISH_STATE_FILE || '/data/.publish-state.json',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info'
  }

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

// ──────────────────────────────────────────────
// App / Bot bootstrap
// ──────────────────────────────────────────────
const app = express()

const roomBot = new Bot(process.env.JOIN_ROOM)

// start up the bot (connect websocket, etc.)
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

// load cached themes into memory
const savedThemes = themeStorage.loadThemes()
setThemes(savedThemes)

// adaptive poll loop for chat + DMs
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
pollLoop()

// routes
app.get('/', (req, res) => {
  res.send('Jamflow bot is alive and running!')
})

app.get('/health', (req, res) => {
  try {
    let okDb = true
    try {
      db.prepare('SELECT 1').get()
    } catch (e) {
      okDb = false
    }

    const status = {
      ok: okDb,
      socketConnected: roomBot?.socket?.connected === true,
      uptime: process.uptime()
    }

    if (!okDb) {
      res.status(503).json(status)
      return
    }

    res.status(200).json(status)
  } catch (e) {
    res.status(200).json({ ok: true, degraded: true })
  }
})

app.get('/heartbeat', (req, res) => {
  res.status(200).send('beat')
})

// ⬇️ THIS PART IS IMPORTANT ⬇️
// We MUST define `port` and call `app.listen` BEFORE we run the async IIFE.
// We MUST NOT reassign `app` after this point.
const port = Number(process.env.PORT || 8080)
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Listening on ${port}`)
})

// defer DB init / seeding so a bad migration can't kill boot
;(async () => {
  try {
    await import('./database/initdb.js')
    await import('./database/seedavatars.js')
    console.log('[db-init] completed')
  } catch (e) {
    console.error('[db-init] failed (non-fatal):', e?.message || e)
  }
})()

// start the cron publisher AFTER we're already listening
startSitePublisherCron()

// graceful shutdown
function shutdown () {
  try {
    roomBot?.socket?.close?.()
  } catch {}
  try {
    import('./database/db.js').then(({ default: database }) => {
      try { database?.close?.() } catch {}
    })
  } catch {}
  try {
    server?.close?.()
  } catch {}
  process.exit(0)
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, shutdown)
}

export { roomBot }
