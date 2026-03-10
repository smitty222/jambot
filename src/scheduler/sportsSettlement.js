import cron from 'node-cron'
import { logger as defaultLogger } from '../utils/logging.js'
import { resolveCompletedBets } from '../utils/sportsBet.js'

export const SPORTS_SETTLEMENT_SPORT_KEYS = [
  'baseball_mlb',
  'basketball_nba',
  'basketball_ncaab',
  'americanfootball_nfl',
  'icehockey_nhl'
]

export function createSportsSettlementRunner (deps = {}) {
  const {
    logger = defaultLogger,
    resolveCompletedBets: resolveCompletedBetsImpl = resolveCompletedBets,
    sportKeys = SPORTS_SETTLEMENT_SPORT_KEYS
  } = deps

  let running = false

  return async function runSportsSettlement () {
    if (running) {
      logger.info('[sports-settlement-cron] skipped (already running)')
      return
    }

    running = true
    try {
      logger.info('[sports-settlement-cron] start')
      for (const sportKey of sportKeys) {
        logger.info('[sports-settlement-cron] resolving sport', { sportKey })
        await resolveCompletedBetsImpl(sportKey)
      }
      logger.info('[sports-settlement-cron] finished')
    } catch (err) {
      logger.error('[sports-settlement-cron] failed', { err: err?.message || err })
    } finally {
      running = false
    }
  }
}

export function startSportsSettlementCron (deps = {}) {
  const {
    cronModule = cron,
    logger = defaultLogger,
    sportsSettlementCron = '0 6 * * *',
    sportsSettlementTz = 'America/New_York',
    sportsSettlementRunOnBoot = false,
    run = createSportsSettlementRunner({ logger, ...deps })
  } = deps

  cronModule.schedule(sportsSettlementCron, run, { timezone: sportsSettlementTz })
  logger.info(`[sports-settlement-cron] scheduled "${sportsSettlementCron}" (TZ=${sportsSettlementTz})`)

  if (sportsSettlementRunOnBoot) {
    run().catch((err) => {
      logger.error('[sports-settlement-cron] run-on-boot failed', { err: err?.message || err })
    })
  }

  return run
}
