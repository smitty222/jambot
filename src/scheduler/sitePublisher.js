// src/scheduler/sitePublisher.js (ESM)
import cron from 'node-cron'
import { spawn } from 'node:child_process'

const TZ = process.env.PUBLISH_TZ || 'America/New_York'
const CRON = process.env.PUBLISH_CRON || '0 9,13,17 * * *' // 09:00, 13:00, 17:00 local TZ
const SCRIPT = process.env.PUBLISH_SCRIPT || 'tools/publish-site-data.mjs'

// Pass through env needed by your publisher (adjust as you use)
const PUB_ENV = {
  API_BASE: process.env.API_BASE,
  PUBLISH_TOKEN: process.env.PUBLISH_TOKEN,
  DB_PATH: process.env.DB_PATH,
  // With fixed times, you can disable internal cooldowns (0) or keep small buffers
  PUBLISH_DB_EVERY_MIN: process.env.PUBLISH_DB_EVERY_MIN || '0',
  PUBLISH_CMDS_EVERY_MIN: process.env.PUBLISH_CMDS_EVERY_MIN || '0',
  PUBLISH_STATS_EVERY_MIN: process.env.PUBLISH_STATS_EVERY_MIN || '0',
  PUBLISH_STATE_FILE: process.env.PUBLISH_STATE_FILE || '/data/.publish-state.json',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
}

let running = false
function runOnce () {
  if (running) { console.log('[publish-cron] previous run still in progress, skipping'); return }
  running = true
  console.log(`[publish-cron] start: node ${SCRIPT}`)
  const child = spawn('node', [SCRIPT], { stdio: 'inherit', env: { ...process.env, ...PUB_ENV } })
  child.on('exit', (code) => {
    console.log(`[publish-cron] finished with code ${code}`)
    running = false
  })
}

export function startSitePublishCron () {
  console.log(`[publish-cron] scheduling "${CRON}" TZ=${TZ}`)
  cron.schedule(CRON, runOnce, { timezone: TZ })
  if (process.env.PUBLISH_RUN_ON_BOOT === '1') runOnce()
}
