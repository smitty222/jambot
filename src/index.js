// src/index.js
// Load environment variables from .env and validate required configuration
import 'dotenv/config'
import { validateConfig } from './config.js'
import { logger } from './utils/logging.js'
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
// Global crash guards
// ─────────────────────────────────────────────-

// Early configuration validation.  If any required env vars are missing,
// validateConfig() will throw here and prevent the bot from starting up
// silently with undefined behaviour.
validateConfig()
process.on('unhandledRejection', (reason, p) => {
  logger.error('[fatal] UNHANDLED_REJECTION', { reason, promise: p })
})

process.on('uncaughtException', (err) => {
  logger.error('[fatal] UNCAUGHT_EXCEPTION', err)
})

const delay = (ms) => new Promise(res => setTimeout(res, ms))

// ──────────────────────────────────────────────
// Scheduled publisher (same as you had)
// ─────────────────────────────────────────────-
function startSitePublisherCron () {
  if (process.env.ENABLE_SITE_PUBLISH_CRON !== '1') {
    logger.info('[publish-cron] disabled (set ENABLE_SITE_PUBLISH_CRON=1 to enable)')
    return
  }

  const TZ = process.env.PUBLISH_TZ || 'America/New_York'
  const CRON = process.env.PUBLISH_CRON || '0 9,13,17 * * *'
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
      logger.info('[publish-cron] skipped (in progress or too soon)')
      return
    }
    running = true
    lastRunAt = now
    logger.info(`[publish-cron] start: node ${SCRIPT}`)
    const child = spawn('node', [SCRIPT], {
      stdio: 'inherit',
      env: { ...process.env, ...PUB_ENV }
    })
    child.on('exit', (code) => {
      logger.info(`[publish-cron] finished with code ${code}`)
      running = false
    })
    child.on('error', (err) => {
      logger.error('[publish-cron] spawn error:', err)
      running = false
    })
  }

  cron.schedule(CRON, runOnce, { timezone: TZ })
  logger.info(`[publish-cron] scheduled "${CRON}" (TZ=${TZ}); script=${SCRIPT}`)

  if (RUN_ON_BOOT) runOnce()
}

// ──────────────────────────────────────────────
// App / Bot bootstrap
// ─────────────────────────────────────────────-
const app = express()
const roomBot = new Bot(process.env.JOIN_ROOM)

// We maintain our own idea of "connected"
let botConnected = false
let lastConnectAttempt = 0
const RECONNECT_MIN_INTERVAL = 10_000 // ms

async function connectBotOnce (label = 'connect') {
  const now = Date.now()
  if (now - lastConnectAttempt < RECONNECT_MIN_INTERVAL && !botConnected) {
    // avoid hammering when offline
    return
  }
  lastConnectAttempt = now

  try {
    logger.info(`[bot] ${label}: connecting...`)
    await roomBot.connect()

    botConnected = true
    logger.info('[bot] connect OK, listeners attached')
  } catch (err) {
    botConnected = false
    logger.error('[bot] connect FAILED:', err)
  }
}

// One-time startup tasks that assume bot will (eventually) be connected
;(async () => {
  await connectBotOnce('initial')

  try {
    const currentUsers = await fetchCurrentUsers()
    logger.info('[bot] Current Room Users', currentUsers)
    updateCurrentUsers(currentUsers)

    const currentDJs = getCurrentDJUUIDs(roomBot.state)
    logger.info('[bot] Current DJs', currentDJs)
  } catch (err) {
    logger.error('[bot] startupTasks fetch error (non-fatal):', err)
  }
})()

// Load cached themes
const savedThemes = themeStorage.loadThemes()
setThemes(savedThemes)

// ──────────────────────────────────────────────
// Adaptive poll loop + self-healing reconnect
// ─────────────────────────────────────────────-
const BASE_MS = 900
const STEP_MS = 300
const MAX_BACKOFF_STEPS = 4

function jitter (ms) {
  const delta = Math.floor(ms * 0.15)
  return ms + (Math.floor(Math.random() * (2 * delta + 1)) - delta)
}

async function pollLoop () {
  try {
    if (!botConnected) {
      await connectBotOnce('reconnect')
    }

    // If still not connected, just wait for next tick
    if (!botConnected) {
      return
    }

    await roomBot.processNewMessages()
  } catch (e) {
    logger.error('[bot] pollLoop error:', e)

    // If processNewMessages blows up with something connection-y,
    // mark disconnected so we try to reconnect on next tick.
    botConnected = false
  } finally {
    const empty = roomBot._emptyPolls || 0
    const backoffSteps = Math.min(empty, MAX_BACKOFF_STEPS)
    const delayMs = jitter(BASE_MS + backoffSteps * STEP_MS)
    setTimeout(pollLoop, delayMs)
  }
}
pollLoop()

// ──────────────────────────────────────────────
// Heartbeat (now based on our flag)
// ─────────────────────────────────────────────-
setInterval(() => {
  logger.info('[heartbeat]', {
    connected: botConnected,
    uptime: Number(process.uptime().toFixed(0))
  })
}, 60_000)

// ──────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────-
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
      connected: botConnected,
      uptime: process.uptime()
    }

    if (!okDb) {
      res.status(503).json(status)
      return
    }

    res.status(200).json(status)
  } catch (e) {
    // If an unexpected error bubbles up here, surface it clearly. A
    // 200+degraded status makes it hard for monitoring to detect real
    // failures, so instead return a 500 and include a small error message.
    logger.error('[health] endpoint error:', e)
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

app.get('/heartbeat', (req, res) => {
  res.status(200).send('beat')
})

// ──────────────────────────────────────────────
// HTTP + DB init + cron
// ─────────────────────────────────────────────-
const port = Number(process.env.PORT || 8080)
const server = app.listen(port, '0.0.0.0', () => {
  logger.info(`Listening on ${port}`)
})

;(async () => {
  try {
    await import('./database/initdb.js')
    await import('./database/seedavatars.js')
    logger.info('[db-init] completed')
  } catch (e) {
    logger.error('[db-init] failed (non-fatal):', e?.message || e)
  }
})()

startSitePublisherCron()

// ──────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────-
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
