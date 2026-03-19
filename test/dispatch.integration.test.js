import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import {
  createSlotsRegistryHandler,
  createMlbScoresCommandHandler,
  createSportsScoresCommandHandler,
  createTipCommandHandler,
  createSongReviewCommandHandler
} from '../src/handlers/handlerFactories.js'
import {
  createSportsCommandHandler,
  createNflScoresCommandHandler,
  createNcaabScoresCommandHandler,
  createOddsCommandHandler,
  createOpenBetsCommandHandler,
  createResolveBetsCommandHandler,
  createSportsBetCommandHandler,
  buildSportsInfoMessage
} from '../src/handlers/sportsCommands.js'
import { OddsApiError } from '../src/utils/sportsBetAPI.js'
import {
  buildMadnessHubMessage,
  handleMadnessPick,
  createMadnessCommandHandler,
  postMadnessPicks,
  resolveMadnessGamesDateToken
} from '../src/handlers/marchMadnessCommands.js'

function createRecorder () {
  const calls = []
  return {
    calls,
    fn: async (...args) => {
      calls.push(args)
    }
  }
}

test('dispatchWithRegistry routes /slots info through the slots handler', async () => {
  const posted = []
  const slotsHandler = createSlotsRegistryHandler({
    postMessage: async (msg) => posted.push(msg),
    buildSlotsInfoMessage: () => 'SLOTS INFO',
    handleSlotsCommand: async () => {
      throw new Error('should not spin for info')
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/slots info',
    payload: { sender: 'user-1', message: '/slots info' },
    room: 'room-1',
    registry: { slots: slotsHandler },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['slots'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(posted, [{ room: 'room-1', message: 'SLOTS INFO' }])
})

test('dispatchWithRegistry routes /mlb to the MLB handler with parsed date', async () => {
  const posted = []
  const seenDates = []
  const mlbHandler = createMlbScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getMLBScores: async (date) => {
      seenDates.push(date)
      return `scores:${date}`
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/mlb 2026-03-10',
    payload: { sender: 'user-1', message: '/mlb 2026-03-10' },
    room: 'room-1',
    registry: { mlb: mlbHandler },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['mlb'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(seenDates, ['2026-03-10'])
  assert.deepEqual(posted, [{ room: 'room-1', message: 'scores:2026-03-10' }])
})

test('createSportsScoresCommandHandler parses and forwards dates for other leagues', async () => {
  const posted = []
  const seenDates = []
  const handler = createSportsScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getScores: async (date) => {
      seenDates.push(date)
      return `nba:${date}`
    },
    commandName: 'NBA',
    errorTag: 'nba'
  })

  await handler({
    payload: { sender: 'user-1', message: '/nba 2026-03-11' },
    room: 'room-1'
  })

  assert.deepEqual(seenDates, ['2026-03-11'])
  assert.deepEqual(posted, [{ room: 'room-1', message: 'nba:2026-03-11' }])
})

test('createNflScoresCommandHandler parses and forwards dates for nfl', async () => {
  const posted = []
  const seenDates = []
  const handler = createNflScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getScores: async (date) => {
      seenDates.push(date)
      return `nfl:${date}`
    }
  })

  await handler({
    payload: { sender: 'user-1', message: '/nfl 2026-09-13' },
    room: 'room-1'
  })

  assert.deepEqual(seenDates, ['2026-09-13'])
  assert.deepEqual(posted, [{ room: 'room-1', message: 'nfl:2026-09-13' }])
})

test('createNcaabScoresCommandHandler parses and forwards dates for ncaab', async () => {
  const posted = []
  const seenDates = []
  const handler = createNcaabScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getScores: async (date) => {
      seenDates.push(date)
      return `ncaab:${date}`
    }
  })

  await handler({
    payload: { sender: 'user-1', message: '/ncaab 2026-03-18' },
    room: 'room-1'
  })

  assert.deepEqual(seenDates, ['2026-03-18'])
  assert.deepEqual(posted, [{ room: 'room-1', message: 'ncaab:2026-03-18' }])
})

test('createNcaabScoresCommandHandler posts the college scoreboard response as-is', async () => {
  const posted = []
  const handler = createNcaabScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getScores: async () => '🏀 NCAAB Gameboard\n\n• Duke 82 vs UNC 77\n  ✅ Final\n'
  })

  await handler({
    payload: { sender: 'user-1', message: '/ncaab' },
    room: 'room-1'
  })

  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '🏀 NCAAB Gameboard\n\n• Duke 82 vs UNC 77\n  ✅ Final\n'
  }])
})

test('createSportsBetCommandHandler posts the bet result without extra wallet debit', async () => {
  const posted = []
  const betCalls = []
  const handler = createSportsBetCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getSenderNickname: async () => '@bettor',
    getOddsForSport: async () => [{ id: 'game-1' }],
    getUserWallet: async () => 100,
    placeSportsBet: async (...args) => {
      betCalls.push(args)
      return '✅ Bet placed!'
    }
  })

  await handler({
    payload: { sender: 'user-1', message: '/sportsbet mlb 1 NYY ml 50' },
    room: 'room-1'
  })

  assert.equal(betCalls.length, 1)
  assert.deepEqual(betCalls[0], ['user-1', 0, 'NYY', 'ml', 50, 'baseball_mlb'])
  assert.deepEqual(posted, [{ room: 'room-1', message: '✅ Bet placed!' }])
})

test('createOddsCommandHandler fetches and stores odds for the selected sport', async () => {
  const posted = []
  const fetched = []
  const saved = []
  const handler = createOddsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    fetchOddsForSport: async (sport) => {
      fetched.push(sport)
      return [{ id: 'game-1' }]
    },
    saveOddsForSport: async (sport, data) => saved.push([sport, data]),
    formatOddsMessage: (_games, sport) => `odds:${sport}`
  })

  await handler({
    payload: { sender: 'user-1', message: '/odds ncaab' },
    room: 'room-1'
  })

  assert.deepEqual(fetched, ['basketball_ncaab'])
  assert.deepEqual(saved, [['basketball_ncaab', [{ id: 'game-1' }]]])
  assert.deepEqual(posted, [{ room: 'room-1', message: 'odds:basketball_ncaab' }])
})

test('createOddsCommandHandler falls back to saved odds when live refresh fails', async () => {
  const posted = []
  const handler = createOddsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    fetchOddsForSport: async () => {
      throw new OddsApiError('Failed to fetch odds: 401 Unauthorized', { status: 401, sportKey: 'basketball_ncaab' })
    },
    getOddsForSport: async () => [{ id: 'cached-game-1' }],
    saveOddsForSport: async () => {
      throw new Error('should not save fallback odds')
    },
    formatOddsMessage: (games, sport) => `cached:${sport}:${games.length}`
  })

  await handler({
    payload: { sender: 'user-1', message: '/odds ncaab' },
    room: 'room-1'
  })

  assert.deepEqual(posted, [{
    room: 'room-1',
    message: 'cached:basketball_ncaab:1\n\n⚠️ Live odds refresh failed, so this is the last saved board.'
  }])
})

test('createOddsCommandHandler explains unauthorized odds API failures clearly', async () => {
  const posted = []
  const handler = createOddsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    fetchOddsForSport: async () => {
      throw new OddsApiError('Failed to fetch odds: 401 Unauthorized', { status: 401, sportKey: 'basketball_ncaab' })
    },
    getOddsForSport: async () => []
  })

  await handler({
    payload: { sender: 'user-1', message: '/odds ncaab' },
    room: 'room-1'
  })

  assert.deepEqual(posted, [{
    room: 'room-1',
    message: "Couldn't refresh NCAAB odds because the Odds API rejected the request (401 Unauthorized). Check the `ODDS_API_KEY`."
  }])
})

test('createSportsCommandHandler routes score requests through the requested league', async () => {
  const seen = []
  const handler = createSportsCommandHandler({
    postMessage: async () => {},
    scoreHandlers: {
      nba: async ({ payload }) => seen.push(payload.message)
    }
  })

  await handler({
    payload: { sender: 'user-1', message: '/sports scores nba 2026-03-18' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['/nba 2026-03-18'])
})

test('createSportsCommandHandler routes odds and bets subcommands', async () => {
  const seenOdds = []
  const seenBets = []
  const handler = createSportsCommandHandler({
    postMessage: async () => {},
    handleOddsCommand: async ({ payload }) => seenOdds.push(payload.message),
    handleSportsBetCommand: async ({ payload }) => seenBets.push(payload.message)
  })

  await handler({
    payload: { sender: 'user-1', message: '/sports odds nfl' },
    room: 'room-1'
  })
  await handler({
    payload: { sender: 'user-1', message: '/sports bet nba 1 lakers ml 25' },
    room: 'room-1'
  })

  assert.deepEqual(seenOdds, ['/odds nfl'])
  assert.deepEqual(seenBets, ['/sportsbet nba 1 lakers ml 25'])
})

test('createSportsCommandHandler routes bets to self by default', async () => {
  const seen = []
  const handler = createSportsCommandHandler({
    postMessage: async () => {},
    handleMyBetsCommand: async ({ payload }) => seen.push(payload.message)
  })

  await handler({
    payload: { sender: 'user-1', message: '/sports bets' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['/mybets'])
})

test('createResolveBetsCommandHandler resolves all sports by default', async () => {
  const posted = []
  const resolved = []
  const handler = createResolveBetsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    resolveCompletedBets: async (sport) => resolved.push(sport)
  })

  await handler({
    payload: { sender: 'user-1', message: '/resolvebets' },
    room: 'room-1'
  })

  assert.deepEqual(resolved, [
    'baseball_mlb',
    'basketball_nba',
    'basketball_ncaab',
    'americanfootball_nfl',
    'icehockey_nhl'
  ])
  assert.deepEqual(posted, [{
    room: 'room-1',
    message: 'Open bets have been resolved for MLB, NBA, NCAAB, NFL, NHL.'
  }])
})

test('createOpenBetsCommandHandler shows the caller open bets by default', async () => {
  const posted = []
  const handler = createOpenBetsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getSenderNickname: async () => '@bettor',
    getOpenBetsForUser: async () => [{
      sport: 'basketball_nba',
      gameId: 'game-1',
      gameIndex: 0,
      team: 'LAL',
      type: 'ml',
      odds: 120,
      amount: 25,
      commenceTime: '2026-03-19T21:30:00.000Z'
    }],
    getOddsForSport: async () => [{
      id: 'game-1',
      commenceTime: '2026-03-19T21:30:00.000Z',
      awayTeam: 'Boston Celtics',
      homeTeam: 'Los Angeles Lakers'
    }]
  })

  await handler({
    payload: { sender: 'user-1', message: '/mybets' },
    room: 'room-1',
    forceSelf: true
  })

  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '🎟️ Your Open Bets\n\n- NBA · Boston Celtics @ Los Angeles Lakers | Pick: LAL ML at +120 | Risk: $25 | Start: Mar 19, 5:30 PM ET'
  }])
})

test('createOpenBetsCommandHandler supports looking up another users open bets', async () => {
  const posted = []
  const seenUsers = []
  const handler = createOpenBetsCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getSenderNickname: async () => '@otheruser',
    getOpenBetsForUser: async (userId) => {
      seenUsers.push(userId)
      return []
    },
    getOddsForSport: async () => []
  })

  await handler({
    payload: { sender: 'self-1', message: '/openbets <@uid:other-1>' },
    room: 'room-1'
  })

  assert.deepEqual(seenUsers, ['other-1'])
  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '@otheruser has no open sports bets.'
  }])
})

test('buildSportsInfoMessage documents the multi-sport flow', () => {
  const message = buildSportsInfoMessage()

  assert.match(message, /\/sports scores nba/)
  assert.match(message, /\/sports odds ncaab/)
  assert.match(message, /\/sports bet nba 1 lakers ml 25/)
  assert.match(message, /\/sports bets/)
  assert.match(message, /\/sports resolve/)
})

test('buildSportsInfoMessage supports focused betting help', () => {
  const message = buildSportsInfoMessage('betting')

  assert.match(message, /\/sports odds nba/)
  assert.match(message, /\/sports bets <@uid:USER>/)
  assert.match(message, /Shortcuts still work: `\/odds`, `\/sportsbet`, `\/mybets`, `\/openbets`, `\/resolvebets`/)
})

test('createMadnessCommandHandler shows the hub by default', async () => {
  const posted = []
  const handler = createMadnessCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    buildMadnessHubMessage: () => 'MADNESS HUB'
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness' },
    room: 'room-1'
  })

  assert.deepEqual(posted, [{ room: 'room-1', message: 'MADNESS HUB' }])
})

test('createMadnessCommandHandler routes games through the madness gameboard helper', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    postMadnessGames: async (_room, { args }) => seen.push(args)
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness games 2026-03-19' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['2026-03-19'])
})

test('createMadnessCommandHandler routes board through the pick board helper', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    postMadnessPickBoard: async (_room, { args }) => seen.push(args)
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness board tomorrow' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['tomorrow'])
})

test('createMadnessCommandHandler routes scores through the live madness scoreboard', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    postMadnessLiveScores: async (_room, { args }) => seen.push(args)
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness scores' },
    room: 'room-1'
  })

  assert.deepEqual(seen, [''])
})

test('createMadnessCommandHandler defaults games to today', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    postMadnessGames: async (_room, { args }) => seen.push(args)
  })

  const realDateNow = Date.now
  Date.now = () => new Date('2026-03-20T14:00:00-04:00').getTime()

  try {
    await handler({
      payload: { sender: 'user-1', message: '/madness games' },
      room: 'room-1'
    })
  } finally {
    Date.now = realDateNow
  }

  assert.deepEqual(seen, [''])
})

test('createMadnessCommandHandler maps yesterday to an explicit date', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    postMadnessGames: async (_room, { args }) => seen.push(args)
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness games yesterday' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['yesterday'])
})

test('handleMadnessPick accepts team abbreviations and confirms with the team code', async () => {
  const posted = []

  await handleMadnessPick({
    payload: { sender: 'user-1', message: '/madness pick 1 smu' },
    room: 'room-1'
  }, {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (msg) => posted.push(msg),
    getMadnessGamesCommandSlate: async () => [{
      id: 'game-1',
      awayTeam: 'Miami (OH) RedHawks',
      awayShortName: 'Miami (OH)',
      homeTeam: 'SMU Mustangs',
      homeShortName: 'SMU',
      commenceTime: '2026-03-20T19:10:00-04:00'
    }],
    upsertMarchMadnessPick: ({ teamName }) => ({
      ok: true,
      created: true,
      teamName,
      teamCode: 'SMU'
    }),
    getMarchMadnessSeasonYear: () => 2026
  })

  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '✅ Pick locked in: SMU for Game 1.'
  }])
})

test('handleMadnessPick accepts the same ESPN short labels shown on the board', async () => {
  const posted = []

  await handleMadnessPick({
    payload: { sender: 'user-1', message: '/madness pick 1 northcarolina' },
    room: 'room-1'
  }, {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (msg) => posted.push(msg),
    getMadnessGamesCommandSlate: async () => [{
      id: 'game-1',
      awayTeam: 'North Carolina Tar Heels',
      awayShortName: 'North Carolina',
      homeTeam: 'Duke Blue Devils',
      homeShortName: 'Duke',
      commenceTime: '2026-03-20T19:10:00-04:00'
    }],
    upsertMarchMadnessPick: ({ teamName }) => ({
      ok: true,
      created: true,
      teamName,
      teamCode: 'NCTH'
    }),
    getMarchMadnessSeasonYear: () => 2026
  })

  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '✅ Pick locked in: NCTH for Game 1.'
  }])
})

test('handleMadnessPick rejects indexes outside the current /madness games slate', async () => {
  const posted = []

  await handleMadnessPick({
    payload: { sender: 'user-1', message: '/madness pick 2 duke' },
    room: 'room-1'
  }, {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (msg) => posted.push(msg),
    getMadnessGamesCommandSlate: async () => [{
      id: 'game-1',
      awayTeam: 'North Carolina Tar Heels',
      awayShortName: 'North Carolina',
      homeTeam: 'Duke Blue Devils',
      homeShortName: 'Duke',
      commenceTime: '2026-03-20T19:10:00-04:00'
    }],
    getMarchMadnessSeasonYear: () => 2026
  })

  assert.deepEqual(posted, [{
    room: 'room-1',
    message: 'Invalid game index. You can only pick from the games currently shown in `/madness board`.'
  }])
})

test('postMadnessPicks refreshes matchup seeds and game indexes from the live slate', async () => {
  const posted = []

  await postMadnessPicks('room-1', {
    payload: { sender: 'user-1' },
    postMessage: async (msg) => posted.push(msg),
    resolveMarchMadnessPicks: async () => {},
    getMarchMadnessSeasonYear: () => 2026,
    listMarchMadnessPicksForUser: () => [{
      gameId: 'game-2',
      gameIndex: 7,
      teamCode: 'DUKE',
      awayTeam: 'Old Away',
      awaySeed: null,
      homeTeam: 'Old Home',
      homeSeed: null,
      commenceTime: '2026-03-20T23:10:00.000Z',
      status: 'pending'
    }],
    getMarchMadnessTournamentGames: async () => [{
      id: 'game-2',
      awayTeam: 'North Carolina Tar Heels',
      awaySeed: 1,
      homeTeam: 'Duke Blue Devils',
      homeSeed: 8,
      commenceTime: '2026-03-20T23:10:00.000Z'
    }],
    getMarchMadnessGameboardGames: async () => [
      {
        id: 'game-1',
        awayTeam: 'Miami (OH) RedHawks',
        awaySeed: 11,
        homeTeam: 'SMU Mustangs',
        homeSeed: 6,
        displayMatchup: '(11) Miami (OH) vs (6) SMU',
        commenceTime: '2026-03-20T16:15:00.000Z'
      },
      {
        id: 'game-2',
        awayTeam: 'North Carolina Tar Heels',
        awaySeed: 1,
        homeTeam: 'Duke Blue Devils',
        homeSeed: 8,
        displayMatchup: '(1) North Carolina vs (8) Duke',
        commenceTime: '2026-03-20T23:10:00.000Z'
      }
    ]
  })

  assert.equal(posted.length, 1)
  assert.match(posted[0].message, /🧾 \*\*Your March Madness Picks\*\* \(2026\)/)
  assert.match(posted[0].message, /2\. DUKE \| \(1\) North Carolina vs \(8\) Duke \| ⏳ pending/)
})

test('postMadnessPicks only shows picks from the men’s March Madness bracket', async () => {
  const posted = []

  await postMadnessPicks('room-1', {
    payload: { sender: 'user-1' },
    postMessage: async (msg) => posted.push(msg),
    resolveMarchMadnessPicks: async () => {},
    getMarchMadnessSeasonYear: () => 2026,
    listMarchMadnessPicksForUser: () => [
      {
        gameId: 'tourney-1',
        gameIndex: 0,
        teamCode: 'DUKE',
        awayTeam: 'North Carolina Tar Heels',
        awaySeed: 1,
        homeTeam: 'Duke Blue Devils',
        homeSeed: 8,
        commenceTime: '2026-03-20T23:10:00.000Z',
        status: 'pending'
      },
      {
        gameId: 'not-madness-1',
        gameIndex: 1,
        teamCode: 'KU',
        awayTeam: 'Kansas Jayhawks',
        awaySeed: null,
        homeTeam: 'Houston Cougars',
        homeSeed: null,
        commenceTime: '2026-03-20T19:00:00.000Z',
        status: 'pending'
      }
    ],
    getMarchMadnessTournamentGames: async () => [{
      id: 'tourney-1',
      awayTeam: 'North Carolina Tar Heels',
      awaySeed: 1,
      homeTeam: 'Duke Blue Devils',
      homeSeed: 8,
      commenceTime: '2026-03-20T23:10:00.000Z'
    }],
    getMarchMadnessGameboardGames: async () => [{
      id: 'tourney-1',
      awayTeam: 'North Carolina Tar Heels',
      awaySeed: 1,
      homeTeam: 'Duke Blue Devils',
      homeSeed: 8,
      displayMatchup: '(1) North Carolina vs (8) Duke',
      commenceTime: '2026-03-20T23:10:00.000Z'
    }]
  })

  assert.equal(posted.length, 1)
  assert.match(posted[0].message, /DUKE \| \(1\) North Carolina vs \(8\) Duke \| ⏳ pending/)
  assert.doesNotMatch(posted[0].message, /Kansas|Houston|KU/)
})

test('createMadnessCommandHandler routes leaderboard requests', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    postMadnessLeaderboard: async (_room, { args }) => seen.push(args)
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness leaderboard 15' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['15'])
})

test('createMadnessCommandHandler routes bankroll requests', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    postMadnessBankrollLeaderboard: async (_room, { args }) => seen.push(args)
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness bankroll 12' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['12'])
})

test('createMadnessCommandHandler routes pick requests', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    handleMadnessPick: async ({ payload }) => seen.push(payload.message)
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness pick 1 duke' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['/madness pick 1 duke'])
})

test('createMadnessCommandHandler routes picks requests', async () => {
  const seen = []
  const handler = createMadnessCommandHandler({
    postMessage: async () => {},
    postMadnessPicks: async (_room, { payload }) => seen.push(payload.message)
  })

  await handler({
    payload: { sender: 'user-1', message: '/madness picks' },
    room: 'room-1'
  })

  assert.deepEqual(seen, ['/madness picks'])
})

test('buildMadnessHubMessage documents the March Madness flow', () => {
  const message = buildMadnessHubMessage('2026-03')

  assert.match(message, /March Madness/)
  assert.match(message, /Follow the games, make picks, and track the leaderboard/)
  assert.match(message, /Games/)
  assert.match(message, /\/madness games/)
  assert.match(message, /\/madness scores/)
  assert.match(message, /\/madness board/)
  assert.match(message, /Pick’em/)
  assert.match(message, /\/madness pick <gameIndex> <teamCode>/)
  assert.match(message, /\/madness picks/)
  assert.match(message, /Standings/)
  assert.match(message, /\/madness leaderboard/)
  assert.match(message, /\/madness bankroll/)
  assert.match(message, /Betting/)
  assert.match(message, /\/madness odds/)
  assert.match(message, /\/madness bet <gameIndex> <teamCode> <ml\|spread> <amount>/)
  assert.match(message, /\/madness bets/)
})

test('resolveMadnessGamesDateToken maps relative date shortcuts', () => {
  const base = new Date('2026-03-20T14:00:00-04:00')

  assert.equal(resolveMadnessGamesDateToken('', base), '2026-03-20')
  assert.equal(resolveMadnessGamesDateToken('today', base), '2026-03-20')
  assert.equal(resolveMadnessGamesDateToken('yesterday', base), '2026-03-19')
  assert.equal(resolveMadnessGamesDateToken('tomorrow', base), '2026-03-21')
  assert.equal(resolveMadnessGamesDateToken('2026-03-22', base), '2026-03-22')
})

test('dispatchWithRegistry routes /tip through the real tip handler logic', async () => {
  const posted = []
  const addUserCalls = []
  const transferCalls = []
  const tipHandler = createTipCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getCurrentDJUUIDs: () => ['dj-1'],
    parseTipAmount: () => 5,
    getUserWallet: async () => 25,
    addOrUpdateUser: async (uuid) => addUserCalls.push(uuid),
    transferTip: (payload) => transferCalls.push(payload),
    getSenderNickname: async () => '@sender',
    randomTipGif: () => 'gif-url'
  })

  const handled = await dispatchWithRegistry({
    txt: '/tip 5',
    payload: { sender: 'sender-1', message: '/tip 5' },
    room: 'room-1',
    context: { state: { any: 'state' } },
    registry: { tip: tipHandler },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['tip'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(addUserCalls, ['dj-1'])
  assert.deepEqual(transferCalls, [{ fromUuid: 'sender-1', toUuid: 'dj-1', amount: 5 }])
  assert.deepEqual(posted, [
    { room: 'room-1', message: '💸 @sender tipped $5.00 to <@uid:dj-1>!' },
    { room: 'room-1', message: '', images: ['gif-url'] }
  ])
})

test('dispatchWithRegistry routes /review through the song review handler with roomBot context', async () => {
  const posted = []
  const reviewCalls = []
  const reviewHandler = createSongReviewCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getSenderNickname: async () => '@reviewer',
    getActiveSong: (roomBot) => roomBot.currentSong,
    parseReviewRating: () => 7.5,
    mentionForUser: (userId) => `<@uid:${userId}>`,
    saveSongReview: async (payload) => {
      reviewCalls.push(payload)
      return { success: true }
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/review7.5',
    payload: { sender: 'user-7', message: '/review7.5' },
    room: 'room-1',
    context: {
      roomBot: {
        currentSong: {
          songId: 'song-1',
          trackName: 'Track',
          artistName: 'Artist',
          albumName: 'Album'
        }
      }
    },
    registry: { review: (ctx) => reviewHandler({ ...ctx, commandName: 'review' }) },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['review'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(reviewCalls, [{
    currentSong: {
      songId: 'song-1',
      trackName: 'Track',
      artistName: 'Artist',
      albumName: 'Album'
    },
    rating: 7.5,
    userId: 'user-7'
  }])
  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '@reviewer thanks! Your 7.5/10 song review has been saved.'
  }])
})

test('dispatchWithRegistry returns false when no handler exists', async () => {
  const recorder = createRecorder()

  const handled = await dispatchWithRegistry({
    txt: '/missing',
    payload: { sender: 'user-1', message: '/missing' },
    room: 'room-1',
    registry: {},
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set()),
    handleRouletteBet: recorder.fn,
    postMessage: recorder.fn,
    logger: { error () {} }
  })

  assert.equal(handled, false)
  assert.equal(recorder.calls.length, 0)
})
