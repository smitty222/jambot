import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildMarchMadnessPickReminderMessage,
  createMarchMadnessUpdateRunner,
  decorateMarchMadnessUpdateMessage,
  extractMarchMadnessUpsetAlerts,
  selectMarchMadnessPickReminderGames,
  startMarchMadnessUpdatesCron
} from '../src/scheduler/marchMadnessUpdates.js'

test('createMarchMadnessUpdateRunner posts live updates and suppresses duplicates', async () => {
  const posted = []
  const logs = []
  const responses = [
    '🏀 NCAAB Gameboard\n\n• (11) Drake 28 vs (6) Missouri 31\n  🔴 Live • Q 2',
    '🏀 NCAAB Gameboard\n\n• (11) Drake 28 vs (6) Missouri 31\n  🔴 Live • Q 2',
    'No live NCAAB games right now.',
    '🏀 NCAAB Gameboard\n\n• (11) Drake 34 vs (6) Missouri 39\n  🔴 Live • Q 2'
  ]

  const run = createMarchMadnessUpdateRunner({
    room: 'room-1',
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      error: (...args) => logs.push(['error', ...args])
    },
    postMessage: async (msg) => posted.push(msg),
    getMarchMadnessLiveScores: async () => responses.shift(),
    loadUpcomingMarchMadnessGames: async () => []
  })

  await run()
  await run()
  await run()
  await run()

  assert.deepEqual(posted, [
    {
      room: 'room-1',
      message: '🏀 NCAAB Gameboard\n\n• (11) Drake 28 vs (6) Missouri 31\n  🔴 Live • Q 2'
    },
    {
      room: 'room-1',
      message: '🏀 NCAAB Gameboard\n\n• (11) Drake 34 vs (6) Missouri 39\n  🔴 Live • Q 2'
    }
  ])
  assert.equal(logs.some(entry => entry[1] === '[march-madness-updates] no live games'), true)
  assert.equal(logs.some(entry => entry[1] === '[march-madness-updates] skipped (no score change)'), true)
})

test('startMarchMadnessUpdatesCron schedules the updater with defaults', async () => {
  const calls = []
  const cronModule = {
    schedule: (...args) => calls.push(args)
  }

  const run = startMarchMadnessUpdatesCron({
    cronModule,
    logger: { info () {}, error () {} }
  })

  assert.equal(typeof run, 'function')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], '*/10 * * * *')
  assert.equal(calls[0][2]?.timezone, 'America/New_York')
})

test('createMarchMadnessUpdateRunner skips posting when disabled', async () => {
  const posted = []
  const logs = []

  const run = createMarchMadnessUpdateRunner({
    room: 'room-1',
    logger: {
      info: (...args) => logs.push(['info', ...args]),
      error: (...args) => logs.push(['error', ...args])
    },
    postMessage: async (msg) => posted.push(msg),
    getMarchMadnessLiveScores: async () => '🏀 NCAAB Gameboard\n\n• Test vs Test\n  🔴 Live • Q 1',
    loadUpcomingMarchMadnessGames: async () => [],
    isMarchMadnessUpdatesEnabled: () => false
  })

  await run()

  assert.deepEqual(posted, [])
  assert.equal(logs.some(entry => entry[1] === '[march-madness-updates] skipped (disabled)'), true)
})

test('extractMarchMadnessUpsetAlerts finds lower seeds leading', () => {
  const alerts = extractMarchMadnessUpsetAlerts(
    '🏀 NCAAB Gameboard\n\n• (11) Drake 34 vs (6) Missouri 31\n  🔴 Live • Q 2\n• (3) Baylor 41 vs (14) Akron 22\n  🔴 Live • Q 2'
  )

  assert.deepEqual(alerts, [
    '🚨 Upset Alert: (11) Drake is leading (6) Missouri.'
  ])
})

test('decorateMarchMadnessUpdateMessage prepends upset alerts', () => {
  const message = decorateMarchMadnessUpdateMessage(
    '🏀 NCAAB Gameboard\n\n• (12) VCU 29 vs (5) BYU 24\n  🔴 Live • Q 2'
  )

  assert.match(message, /^🚨 Upset Alert: \(12\) VCU is leading \(5\) BYU\./)
  assert.match(message, /🏀 NCAAB Gameboard/)
})

test('selectMarchMadnessPickReminderGames chooses games tipping soon and skips reminded games', () => {
  const now = new Date('2026-03-20T18:00:00-04:00')
  const selected = selectMarchMadnessPickReminderGames([
    { id: 'g1', awayTeam: 'VCU', homeTeam: 'BYU', commenceTime: '2026-03-20T18:20:00-04:00' },
    { id: 'g2', awayTeam: 'Akron', homeTeam: 'Arizona', commenceTime: '2026-03-20T19:10:00-04:00' },
    { id: 'g3', awayTeam: 'Drake', homeTeam: 'Missouri', commenceTime: '2026-03-20T18:25:00-04:00' }
  ], now, 30, ['g3'])

  assert.deepEqual(selected.map(game => game.id), ['g1'])
})

test('buildMarchMadnessPickReminderMessage formats a concise reminder', () => {
  const now = new Date('2026-03-20T18:00:00-04:00')
  const message = buildMarchMadnessPickReminderMessage([
    { id: 'g1', awayTeam: 'Virginia Commonwealth Rams', homeTeam: 'Brigham Young Cougars', commenceTime: '2026-03-20T22:20:00.000Z' },
    { id: 'g2', awayTeam: 'Drake Bulldogs', homeTeam: 'Missouri Tigers', commenceTime: '2026-03-20T22:25:00.000Z' }
  ], now)

  assert.match(message, /March Madness picks reminder/)
  assert.match(message, /VCR vs BYC • 6:20 PM ET • starts in 20 min/)
  assert.match(message, /DB vs MT • 6:25 PM ET • starts in 25 min/)
  assert.match(message, /\/madness pick <gameIndex> <teamCode>/)
})

test('createMarchMadnessUpdateRunner posts picks reminders before tipoff', async () => {
  const posted = []
  const now = new Date('2026-03-20T18:00:00-04:00')
  const run = createMarchMadnessUpdateRunner({
    room: 'room-1',
    logger: { info () {}, error () {} },
    postMessage: async (msg) => posted.push(msg),
    getMarchMadnessLiveScores: async () => 'No live NCAAB games right now.',
    loadUpcomingMarchMadnessGames: async () => [
      { id: 'g1', awayTeam: 'VCU', homeTeam: 'BYU', commenceTime: '2026-03-20T18:20:00-04:00' }
    ],
    leadMinutes: 30,
    now: () => now
  })

  await run()

  assert.equal(posted.length, 1)
  assert.match(posted[0].message, /March Madness picks reminder/)
  assert.match(posted[0].message, /VCU vs BYU/)
})
