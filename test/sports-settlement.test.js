import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createSportsSettlementRunner,
  startSportsSettlementCron
} from '../src/scheduler/sportsSettlement.js'

test('createSportsSettlementRunner resolves each supported sport once', async () => {
  const resolved = []
  let resolvedPicks = 0
  const logs = []
  const runner = createSportsSettlementRunner({
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      error: (...args) => logs.push(['error', ...args])
    },
    resolveCompletedBets: async (sportKey) => resolved.push(sportKey),
    resolveMarchMadnessPicks: async () => { resolvedPicks += 1 }
  })

  await runner()

  assert.deepEqual(resolved, [
    'baseball_mlb',
    'basketball_nba',
    'basketball_ncaab',
    'americanfootball_nfl',
    'icehockey_nhl'
  ])
  assert.equal(resolvedPicks, 1)
  assert.equal(logs.some(entry => entry[1] === '[sports-settlement-cron] start'), true)
  assert.equal(logs.some(entry => entry[1] === '[sports-settlement-cron] finished'), true)
})

test('startSportsSettlementCron schedules the job for 6 AM Eastern by default', async () => {
  const calls = []
  const cronModule = {
    schedule: (...args) => calls.push(args)
  }

  const run = startSportsSettlementCron({
    cronModule,
    logger: { info () {}, error () {} }
  })

  assert.equal(typeof run, 'function')
  assert.equal(calls.length, 2)
  assert.equal(calls[0][0], '0 6 * * *')
  assert.equal(calls[0][2]?.timezone, 'America/New_York')
  assert.equal(calls[1][0], '*/10 * * * *')
  assert.equal(calls[1][2]?.timezone, 'America/New_York')
})

test('createSportsSettlementRunner shares a lock across runners when given the same state', async () => {
  const resolved = []
  const logs = []
  const state = { running: false }

  const slowResolveCompletedBets = async (sportKey) => {
    resolved.push(sportKey)
    await new Promise(resolve => setTimeout(resolve, 25))
  }

  const fullRunner = createSportsSettlementRunner({
    state,
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      error: (...args) => logs.push(['error', ...args])
    },
    resolveCompletedBets: slowResolveCompletedBets,
    resolveMarchMadnessPicks: async () => {},
    sportKeys: ['basketball_ncaab'],
    logPrefix: '[full]'
  })

  const ncaabRunner = createSportsSettlementRunner({
    state,
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      error: (...args) => logs.push(['error', ...args])
    },
    resolveCompletedBets: slowResolveCompletedBets,
    resolveMarchMadnessPicks: async () => {},
    sportKeys: ['basketball_ncaab'],
    logPrefix: '[ncaab]'
  })

  await Promise.all([fullRunner(), ncaabRunner()])

  assert.deepEqual(resolved, ['basketball_ncaab'])
  assert.equal(logs.some(entry => entry[1] === '[ncaab] skipped (already running)' || entry[1] === '[full] skipped (already running)'), true)
})
