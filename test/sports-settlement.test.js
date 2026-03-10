import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createSportsSettlementRunner,
  startSportsSettlementCron
} from '../src/scheduler/sportsSettlement.js'

test('createSportsSettlementRunner resolves each supported sport once', async () => {
  const resolved = []
  const logs = []
  const runner = createSportsSettlementRunner({
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      error: (...args) => logs.push(['error', ...args])
    },
    resolveCompletedBets: async (sportKey) => resolved.push(sportKey)
  })

  await runner()

  assert.deepEqual(resolved, [
    'baseball_mlb',
    'basketball_nba',
    'basketball_ncaab',
    'americanfootball_nfl',
    'icehockey_nhl'
  ])
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
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '0 6 * * *')
  assert.equal(calls[0][2]?.timezone, 'America/New_York')
})
