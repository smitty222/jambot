// src/index.js
// Load environment variables from .env and validate required configuration
import 'dotenv/config'
import { env, validateConfig } from './config.js'

let roomBot

function validateNodeVersion () {
  const supportedMajor = 20
  const currentVersion = process.versions.node
  const major = Number(currentVersion.split('.')[0])

  if (major !== supportedMajor) {
    throw new Error(
      `Configuration error: Node ${currentVersion} is not supported for local dev in this repo. Use Node 20.19.2 (.nvmrc), then reinstall dependencies so better-sqlite3 can rebuild cleanly.`
    )
  }

  return true
}

async function main () {
  // Fail fast before importing native modules or opening the database.
  validateNodeVersion()
  validateConfig()

  const { initErrorReporter, captureException } = await import('./utils/errorReporter.js')
  await initErrorReporter()

  const [
    { logger },
    expressModule,
    cronModule,
    childProcessModule,
    { default: db },
    { Bot, getCurrentDJUUIDs },
    { updateCurrentUsers },
    { fetchCurrentUsers },
    { setRoomBot },
    { getHealthStatus },
    { startSportsSettlementCron },
    { startMarchMadnessUpdatesCron }
  ] = await Promise.all([
    import('./utils/logging.js'),
    import('express'),
    import('node-cron'),
    import('node:child_process'),
    import('./database/db.js'),
    import('./libs/bot.js'),
    import('./utils/currentUsers.js'),
    import('./utils/API.js'),
    import('./runtime/roomBot.js'),
    import('./runtime/health.js'),
    import('./scheduler/sportsSettlement.js'),
    import('./scheduler/marchMadnessUpdates.js')
  ])

  const { upsertSpotifyUserAuth } = await import('./database/dbspotifyauth.js')

  const express = expressModule.default
  const cron = cronModule.default
  const { spawn } = childProcessModule

  process.on('unhandledRejection', (reason, p) => {
    logger.error('[fatal] UNHANDLED_REJECTION', { reason, promise: p })
  })

  process.on('uncaughtException', (err) => {
    logger.error('[fatal] UNCAUGHT_EXCEPTION', err)
  })

  function startSitePublisherCron () {
    if (env.enableSitePublishCron !== '1') {
      logger.info('[publish-cron] disabled (set ENABLE_SITE_PUBLISH_CRON=1 to enable)')
      return
    }

    const TZ = env.publishTz || 'America/New_York'
    const CRON = env.publishCron || '0 9,13,17 * * *'
    const SCRIPT = env.publishScript || 'tools/publish-site-data.mjs'
    const RUN_ON_BOOT = env.publishRunOnBoot === '1'

    const PUB_ENV = {
      API_BASE: env.apiBase,
      PUBLISH_TOKEN: env.publishToken,
      DB_PATH: env.dbPath || '/data/app.db',
      PUBLISH_STATE_FILE: env.publishStateFile || '/data/.publish-state.json',
      LOG_LEVEL: env.logLevel || 'info'
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

  const app = express()
  roomBot = new Bot(env.joinRoom)
  setRoomBot(roomBot)

  let botConnected = false
  let lastConnectAttempt = 0
  const RECONNECT_MIN_INTERVAL = 10_000

  async function connectBotOnce (label = 'connect') {
    const now = Date.now()
    if (now - lastConnectAttempt < RECONNECT_MIN_INTERVAL && !botConnected) {
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

  const BASE_MS = env.pollBaseMs
  const STEP_MS = env.pollBackoffStepMs
  const MAX_BACKOFF_STEPS = env.pollMaxBackoffSteps

  function jitter (ms) {
    const delta = Math.floor(ms * 0.15)
    return ms + (Math.floor(Math.random() * (2 * delta + 1)) - delta)
  }

  async function pollLoop () {
    try {
      if (!botConnected) {
        await connectBotOnce('reconnect')
      }

      if (!botConnected) {
        return
      }

      await roomBot.processNewMessages()
    } catch (e) {
      logger.error('[bot] pollLoop error:', e)
      captureException(e, { context: 'pollLoop' })
      botConnected = false
    } finally {
      const empty = roomBot._emptyPolls || 0
      const backoffSteps = Math.min(empty, MAX_BACKOFF_STEPS)
      const delayMs = jitter(BASE_MS + backoffSteps * STEP_MS)
      setTimeout(pollLoop, delayMs)
    }
  }
  pollLoop()

  setInterval(() => {
    logger.info('[heartbeat]', {
      connected: botConnected,
      uptime: Number(process.uptime().toFixed(0))
    })
  }, 60_000)

  app.get('/', (req, res) => {
    res.send('Jamflow bot is alive and running!')
  })

  app.get('/health', (req, res) => {
    try {
      const status = getHealthStatus({
        db,
        connected: botConnected,
        uptime: process.uptime(),
        startupGraceSeconds: env.botStartupGraceS
      })

      if (!status.ok) {
        res.status(503).json(status)
        return
      }

      res.status(200).json(status)
    } catch (e) {
      logger.error('[health] endpoint error:', e)
      res.status(500).json({ ok: false, error: String(e?.message || e) })
    }
  })

  app.get('/heartbeat', (req, res) => {
    res.status(200).send('beat')
  })

  app.get('/auth/spotify', (req, res) => {
    const userUuid = String(req.query.user || '').trim()
    if (!userUuid) {
      res.status(400).send('Missing ?user= parameter')
      return
    }
    const params = new URLSearchParams({
      client_id: env.spotifyClientId,
      response_type: 'code',
      redirect_uri: env.redirectUri,
      scope: 'playlist-modify-public playlist-modify-private',
      state: userUuid
    })
    res.redirect(`https://accounts.spotify.com/authorize?${params}`)
  })

  app.get('/auth/spotify/callback', async (req, res) => {
    const code = String(req.query.code || '').trim()
    const userUuid = String(req.query.state || '').trim()
    const error = req.query.error

    if (error) {
      res.status(400).send(`Spotify authorization denied: ${error}`)
      return
    }
    if (!code || !userUuid) {
      res.status(400).send('Missing code or state')
      return
    }

    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.spotifyClientId}:${env.spotifyClientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: env.redirectUri
        }).toString()
      })

      if (!tokenRes.ok) throw new Error(`Token exchange failed: ${tokenRes.status}`)
      const tokenData = await tokenRes.json()

      const profileRes = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      })
      if (!profileRes.ok) throw new Error(`Profile fetch failed: ${profileRes.status}`)
      const profile = await profileRes.json()

      const expiresAt = Date.now() + (Number(tokenData.expires_in) || 3600) * 1000 - 60_000

      upsertSpotifyUserAuth({
        userUuid,
        spotifyUserId: profile.id,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
        scopes: tokenData.scope || ''
      })

      logger.info('[spotify-auth] user linked', { userUuid, spotifyUserId: profile.id })
      res.send(`✅ Spotify connected! ${profile.display_name || profile.id} is now linked. You can close this tab.`)
    } catch (err) {
      logger.error('[spotify-auth] callback error', { err })
      res.status(500).send('Failed to connect Spotify. Please try again.')
    }
  })

  const port = env.port
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
  startSportsSettlementCron({
    logger,
    sportsSettlementCron: env.sportsSettlementCron,
    ncaabSettlementEnabled: env.ncaabSettlementEnabled !== '0',
    ncaabSettlementCron: env.ncaabSettlementCron,
    sportsSettlementTz: env.sportsSettlementTz,
    sportsSettlementRunOnBoot: env.sportsSettlementRunOnBoot === '1'
  })
  startMarchMadnessUpdatesCron({
    logger,
    marchMadnessUpdatesEnabled: env.marchMadnessUpdatesEnabled !== '0',
    marchMadnessUpdatesCron: env.marchMadnessUpdatesCron,
    marchMadnessUpdatesTz: env.marchMadnessUpdatesTz,
    marchMadnessUpdatesRunOnBoot: env.marchMadnessUpdatesRunOnBoot === '1'
  })

  function shutdown () {
    try {
      roomBot?.socket?.close?.()
    } catch (err) {
      logger.debug('[shutdown] roomBot socket close failed', { err: err?.message || err })
    }
    try {
      import('./database/db.js').then(({ default: database }) => {
        try {
          database?.close?.()
        } catch (err) {
          logger.debug('[shutdown] database close failed', { err: err?.message || err })
        }
      })
    } catch (err) {
      logger.debug('[shutdown] dynamic db import failed', { err: err?.message || err })
    }
    try {
      server?.close?.()
    } catch (err) {
      logger.debug('[shutdown] server close failed', { err: err?.message || err })
    }
    process.exit(0)
  }
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, shutdown)
  }
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})

export { roomBot }
