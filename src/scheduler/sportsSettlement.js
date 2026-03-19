import cron from 'node-cron'
import { logger as defaultLogger } from '../utils/logging.js'
import { resolveCompletedBets } from '../utils/sportsBet.js'
import { resolveMarchMadnessPicks } from '../database/dbmarchmadness.js'

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
    resolveMarchMadnessPicks: resolveMarchMadnessPicksImpl = resolveMarchMadnessPicks,
    sportKeys = SPORTS_SETTLEMENT_SPORT_KEYS,
    state = { running: false },
    logPrefix = '[sports-settlement-cron]'
  } = deps

  return async function runSportsSettlement () {
    if (state.running) {
      logger.info(`${logPrefix} skipped (already running)`)
      return
    }

    state.running = true
    try {
      logger.info(`${logPrefix} start`)
      for (const sportKey of sportKeys) {
        logger.info(`${logPrefix} resolving sport`, { sportKey })
        await resolveCompletedBetsImpl(sportKey)
      }
      await resolveMarchMadnessPicksImpl()
      logger.info(`${logPrefix} finished`)
    } catch (err) {
      logger.error(`${logPrefix} failed`, { err: err?.message || err })
    } finally {
      state.running = false
    }
  }
}

export function startSportsSettlementCron (deps = {}) {
  const {
    cronModule = cron,
    logger = defaultLogger,
    sportsSettlementCron = '0 6 * * *',
    ncaabSettlementEnabled = true,
    ncaabSettlementCron = '*/10 * * * *',
    sportsSettlementTz = 'America/New_York',
    sportsSettlementRunOnBoot = false,
    state = { running: false },
    run = createSportsSettlementRunner({ logger, state, ...deps })
  } = deps

  cronModule.schedule(sportsSettlementCron, run, { timezone: sportsSettlementTz })
  logger.info(`[sports-settlement-cron] scheduled "${sportsSettlementCron}" (TZ=${sportsSettlementTz})`)

  if (ncaabSettlementEnabled) {
    const runNcaab = createSportsSettlementRunner({
      logger,
      state,
      sportKeys: ['basketball_ncaab'],
      logPrefix: '[ncaab-settlement-cron]',
      ...deps
    })
    cronModule.schedule(ncaabSettlementCron, runNcaab, { timezone: sportsSettlementTz })
    logger.info(`[ncaab-settlement-cron] scheduled "${ncaabSettlementCron}" (TZ=${sportsSettlementTz})`)
  }

  if (sportsSettlementRunOnBoot) {
    run().catch((err) => {
      logger.error('[sports-settlement-cron] run-on-boot failed', { err: err?.message || err })
    })
  }

  return run
}
