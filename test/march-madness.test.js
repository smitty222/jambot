import test from 'node:test'
import assert from 'node:assert/strict'

import {
  didMarchMadnessPickWin,
  getMarchMadnessSeasonWindow,
  getMarchMadnessWinnerTeam
} from '../src/database/dbmarchmadness.js'
import {
  buildMadnessBoardEntries,
  buildMadnessOddsBoardEntries,
  buildMadnessPickBoard,
  handleMadnessBet,
  handleMadnessPick,
  postMadnessOdds,
  postMadnessPicks
} from '../src/handlers/marchMadnessCommands.js'
import {
  buildMarchMadnessTournamentMatchups,
  findMatchingMarchMadnessMatchup,
  filterMarchMadnessOddsGames,
  isMarchMadnessOddsGame,
  isMarchMadnessEvent
} from '../src/utils/marchMadness.js'
import {
  formatScoreboardLine,
  formatEspnScoreboardTeamName,
  formatEspnTournamentSeed
} from '../src/utils/API.js'

test('getMarchMadnessSeasonWindow returns the tournament date range', () => {
  assert.deepEqual(getMarchMadnessSeasonWindow(2026), {
    seasonYear: 2026,
    startAt: '2026-03-01 00:00:00',
    endAt: '2026-04-16 00:00:00'
  })
})

test('getMarchMadnessWinnerTeam returns the winning school name', () => {
  assert.equal(getMarchMadnessWinnerTeam({
    homeTeam: 'Duke Blue Devils',
    awayTeam: 'North Carolina Tar Heels',
    scores: { home: 82, away: 77 }
  }), 'Duke Blue Devils')
})

test('didMarchMadnessPickWin matches by full school name or team code', () => {
  assert.equal(didMarchMadnessPickWin({
    teamName: 'Duke Blue Devils',
    teamCode: 'DBD'
  }, 'Duke Blue Devils'), true)

  assert.equal(didMarchMadnessPickWin({
    teamName: 'North Carolina Tar Heels',
    teamCode: 'NCTH'
  }, 'Duke Blue Devils'), false)
})

test('formatEspnScoreboardTeamName prefers cleaner college basketball labels', () => {
  assert.equal(formatEspnScoreboardTeamName({
    abbreviation: 'SMU',
    shortDisplayName: 'SMU Mustangs',
    displayName: 'SMU Mustangs',
    location: 'SMU'
  }, 'basketball/mens-college-basketball'), 'SMU')

  assert.equal(formatEspnScoreboardTeamName({
    abbreviation: 'M-OH',
    location: 'Miami (OH)',
    shortDisplayName: 'Miami (OH) RedHawks',
    displayName: 'Miami (OH) RedHawks'
  }, 'basketball/mens-college-basketball'), 'Miami (OH)')

  assert.equal(formatEspnScoreboardTeamName({
    location: 'North Carolina',
    name: 'Tar Heels'
  }, 'basketball/mens-college-basketball'), 'North Carolina')
})

test('formatEspnTournamentSeed formats likely ESPN seed fields', () => {
  assert.equal(formatEspnTournamentSeed({ seed: 11 }), '(11) ')
  assert.equal(formatEspnTournamentSeed({ tournamentSeed: '6' }), '(6) ')
  assert.equal(formatEspnTournamentSeed({ team: { seed: 3 } }), '(3) ')
  assert.equal(formatEspnTournamentSeed({ curatedRank: { current: 22 } }), '')
  assert.equal(formatEspnTournamentSeed({}), '')
})

test('formatScoreboardLine prefers tipoff time for pregame matchups', () => {
  const line = formatScoreboardLine({
    awayName: '(11) Miami (OH)',
    awayScore: 0,
    homeName: '(6) SMU',
    homeScore: 0,
    status: 'Status TBD',
    sportPath: 'basketball/mens-college-basketball',
    startDate: '2026-03-20T23:10:00.000Z',
    period: 0
  })

  assert.match(line, /\(11\) Miami \(OH\) vs \(6\) SMU • 🕒 7:10 PM/)
  assert.doesNotMatch(line, / 0 vs /)
  assert.doesNotMatch(line, /Status TBD/)
})

test('formatScoreboardLine falls back to competition date for tipoff time', () => {
  const line = formatScoreboardLine({
    awayName: '(12) VCU',
    awayScore: 0,
    homeName: '(5) BYU',
    homeScore: 0,
    status: 'Scheduled',
    sportPath: 'basketball/mens-college-basketball',
    competitionDate: '2026-03-20T16:15:00.000Z',
    period: 0
  })

  assert.match(line, /\(12\) VCU vs \(5\) BYU • 🕒 12:15 PM/)
  assert.doesNotMatch(line, / 0 vs /)
  assert.doesNotMatch(line, /Scheduled/)
})

test('buildMadnessPickBoard shows numbered games with team codes for picking', () => {
  const board = buildMadnessPickBoard([
    {
      id: 'g1',
      awayTeam: 'Miami (OH) RedHawks',
      homeTeam: 'SMU Mustangs',
      displayMatchup: '(11) Miami (OH) vs (6) SMU',
      commenceTime: '2026-03-20T16:15:00.000Z'
    },
    {
      id: 'g2',
      awayTeam: 'North Carolina Tar Heels',
      homeTeam: 'Duke Blue Devils',
      displayMatchup: '(1) North Carolina vs (8) Duke',
      commenceTime: '2026-03-20T23:10:00.000Z'
    }
  ], '2026-03-20', new Date('2026-03-20T11:00:00-04:00'))

  assert.match(board, /🎯 Pick Board/)
  assert.match(board, /1\. \(11\) Miami \(OH\) vs \(6\) SMU • 🕒 12:15 PM/)
  assert.match(board, /2\. \(1\) North Carolina vs \(8\) Duke • 🕒 7:10 PM/)
  assert.match(board, /\/madness pick <gameIndex> <teamCode>/)
})

test('buildMadnessBoardEntries assigns board indices from chronological order', () => {
  const entries = buildMadnessBoardEntries([
    {
      id: 'late',
      awayTeam: 'North Carolina Tar Heels',
      homeTeam: 'Duke Blue Devils',
      commenceTime: '2026-03-20T23:10:00.000Z'
    },
    {
      id: 'early',
      awayTeam: 'Miami (OH) RedHawks',
      homeTeam: 'SMU Mustangs',
      commenceTime: '2026-03-20T16:15:00.000Z'
    }
  ], '2026-03-20')

  assert.deepEqual(entries.map(({ gameIndex, game }) => ({ gameIndex, id: game.id })), [
    { gameIndex: 1, id: 'early' },
    { gameIndex: 2, id: 'late' }
  ])
})

test('handleMadnessPick resolves the selected team from the board ordering', async () => {
  const messages = []
  const picks = []

  await handleMadnessPick({
    payload: {
      message: '/madness pick 1 SMU',
      sender: 'user-1'
    },
    room: 'room-1'
  }, {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (payload) => { messages.push(payload) },
    getMadnessGamesCommandSlate: async () => ([
      {
        id: 'late',
        awayTeam: 'North Carolina Tar Heels',
        homeTeam: 'Duke Blue Devils',
        awayShortName: 'North Carolina',
        homeShortName: 'Duke',
        commenceTime: '2026-03-20T23:10:00.000Z'
      },
      {
        id: 'early',
        awayTeam: 'Miami (OH) RedHawks',
        homeTeam: 'SMU Mustangs',
        awayShortName: 'Miami (OH)',
        homeShortName: 'SMU',
        commenceTime: '2026-03-20T16:15:00.000Z'
      }
    ]),
    upsertMarchMadnessPick: (pick) => {
      picks.push(pick)
      return { ok: true, created: true, teamCode: 'SMU' }
    },
    getMarchMadnessSeasonYear: () => 2026
  })

  assert.equal(picks.length, 1)
  assert.equal(picks[0].gameId, 'early')
  assert.equal(picks[0].teamName, 'SMU Mustangs')
  assert.match(messages[0].message, /Pick locked in: SMU for Game 1/)
})

test('handleMadnessPick accepts a date token before the game index', async () => {
  const messages = []
  const requests = []
  const picks = []

  await handleMadnessPick({
    payload: {
      message: '/madness pick tomorrow 1 DUKE',
      sender: 'user-1'
    },
    room: 'room-1'
  }, {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (payload) => { messages.push(payload) },
    getMadnessGamesCommandSlate: async ({ requestedDate }) => {
      requests.push(requestedDate)
      return [
        {
          id: 'tomorrow-game',
          awayTeam: 'North Carolina Tar Heels',
          homeTeam: 'Duke Blue Devils',
          awayShortName: 'North Carolina',
          homeShortName: 'Duke',
          commenceTime: '2026-03-21T23:10:00.000Z'
        }
      ]
    },
    upsertMarchMadnessPick: (pick) => {
      picks.push(pick)
      return { ok: true, created: true, teamCode: 'DUKE' }
    },
    getMarchMadnessSeasonYear: () => 2026
  })

  assert.deepEqual(requests, ['2026-03-21'])
  assert.equal(picks.length, 1)
  assert.equal(picks[0].gameId, 'tomorrow-game')
  assert.equal(picks[0].teamName, 'Duke Blue Devils')
  assert.match(messages[0].message, /Pick locked in: DUKE for Game 1/)
})

test('handleMadnessPick preserves compact board abbreviations like USF', async () => {
  const messages = []
  const picks = []

  await handleMadnessPick({
    payload: {
      message: '/madness pick 1 USF',
      sender: 'user-1'
    },
    room: 'room-1'
  }, {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (payload) => { messages.push(payload) },
    getMadnessGamesCommandSlate: async () => ([
      {
        id: 'game-1',
        awayTeam: 'South Florida Bulls',
        homeTeam: 'Louisville Cardinals',
        awayShortName: 'USF',
        homeShortName: 'LOU',
        commenceTime: '2026-03-20T16:15:00.000Z'
      }
    ]),
    upsertMarchMadnessPick: (pick) => {
      picks.push(pick)
      return { ok: true, created: false, teamCode: pick.teamCode }
    },
    getMarchMadnessSeasonYear: () => 2026
  })

  assert.equal(picks.length, 1)
  assert.equal(picks[0].teamName, 'South Florida Bulls')
  assert.equal(picks[0].teamCode, 'USF')
  assert.match(messages[0].message, /Pick updated: USF for Game 1/)
})

test('handleMadnessBet uses today-only March Madness board ordering', async () => {
  const messages = []
  const placed = []

  await handleMadnessBet({
    payload: {
      message: '/madness bet 1 DUKE ml 25',
      sender: 'user-1'
    },
    room: 'room-1'
  }, {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (payload) => { messages.push(payload) },
    getSenderNickname: async () => 'Allen',
    getUserWallet: async () => 100,
    ensureMadnessOdds: async () => ([
      {
        id: 'today-game',
        awayTeam: 'Duke Blue Devils',
        homeTeam: 'VCU Rams',
        awayShortName: 'Duke',
        homeShortName: 'VCU',
        commenceTime: '2026-03-20T19:00:00.000Z'
      }
    ]),
    getOddsForSport: async () => ([
      {
        id: 'tomorrow-game',
        awayTeam: 'Houston Cougars',
        homeTeam: 'Gonzaga Bulldogs',
        commenceTime: '2026-03-21T19:00:00.000Z'
      },
      {
        id: 'today-game',
        awayTeam: 'Duke Blue Devils',
        homeTeam: 'VCU Rams',
        commenceTime: '2026-03-20T19:00:00.000Z'
      }
    ]),
    placeSportsBet: async (...args) => {
      placed.push(args)
      return 'bet placed'
    }
  })

  assert.equal(placed.length, 1)
  assert.equal(placed[0][1], 1)
  assert.equal(messages[0].message, 'bet placed')
})

test('buildMadnessOddsBoardEntries keeps board ordering and drops off-board odds games', () => {
  const entries = buildMadnessOddsBoardEntries([
    {
      id: 'late',
      awayTeam: 'North Carolina Tar Heels',
      homeTeam: 'Duke Blue Devils',
      awayShortName: 'North Carolina',
      homeShortName: 'Duke',
      commenceTime: '2026-03-20T23:10:00.000Z'
    },
    {
      id: 'early',
      awayTeam: 'Miami (OH) RedHawks',
      homeTeam: 'SMU Mustangs',
      awayShortName: 'Miami (OH)',
      homeShortName: 'SMU',
      commenceTime: '2026-03-20T16:15:00.000Z'
    }
  ], [
    {
      id: 'other-day',
      awayTeam: 'Houston Cougars',
      homeTeam: 'Gonzaga Bulldogs',
      commenceTime: '2026-03-21T19:00:00.000Z'
    },
    {
      id: 'late-odds',
      awayTeam: 'North Carolina',
      homeTeam: 'Duke',
      commenceTime: '2026-03-20T23:10:00.000Z'
    },
    {
      id: 'early-odds',
      awayTeam: 'Miami (OH)',
      homeTeam: 'SMU',
      commenceTime: '2026-03-20T16:15:00.000Z'
    }
  ], '2026-03-20')

  assert.deepEqual(entries.map(entry => ({
    gameIndex: entry.gameIndex,
    boardId: entry.boardGame.id,
    oddsId: entry.oddsGame.id,
    oddsIndex: entry.oddsIndex
  })), [
    { gameIndex: 1, boardId: 'early', oddsId: 'early-odds', oddsIndex: 2 },
    { gameIndex: 2, boardId: 'late', oddsId: 'late-odds', oddsIndex: 1 }
  ])
})

test('postMadnessOdds formats only games from today board', async () => {
  const messages = []

  await postMadnessOdds('room-1', {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (payload) => { messages.push(payload) },
    ensureMadnessOdds: async () => ([
      {
        id: 'today-game',
        awayTeam: 'Duke Blue Devils',
        homeTeam: 'VCU Rams',
        awayShortName: 'Duke',
        homeShortName: 'VCU',
        commenceTime: '2026-03-20T19:00:00.000Z'
      }
    ]),
    fetchOddsForSport: async () => ([
      {
        id: 'tomorrow-game',
        awayTeam: 'Houston Cougars',
        homeTeam: 'Gonzaga Bulldogs',
        commenceTime: '2026-03-21T19:00:00.000Z'
      },
      {
        id: 'today-game-odds',
        awayTeam: 'Duke',
        homeTeam: 'VCU',
        commenceTime: '2026-03-20T19:00:00.000Z'
      }
    ]),
    saveOddsForSport: async () => {},
    formatOddsMessage: (games) => games.map(game => `${game.awayTeam} vs ${game.homeTeam}`).join('\n')
  })

  assert.equal(messages[0].message, 'Duke vs VCU')
})

test('postMadnessOdds preserves the /madness games slate order and times', async () => {
  const messages = []

  await postMadnessOdds('room-1', {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (payload) => { messages.push(payload) },
    ensureMadnessOdds: async () => ([
      {
        id: 'early-board',
        awayTeam: 'Miami (OH) RedHawks',
        homeTeam: 'SMU Mustangs',
        awayShortName: 'Miami (OH)',
        homeShortName: 'SMU',
        commenceTime: '2026-03-20T16:15:00.000Z'
      },
      {
        id: 'late-board',
        awayTeam: 'Duke Blue Devils',
        homeTeam: 'VCU Rams',
        awayShortName: 'Duke',
        homeShortName: 'VCU',
        commenceTime: '2026-03-20T19:00:00.000Z'
      }
    ]),
    fetchOddsForSport: async () => ([
      {
        id: 'late-odds',
        awayTeam: 'Duke',
        homeTeam: 'VCU',
        commenceTime: '2026-03-20T23:30:00.000Z'
      },
      {
        id: 'early-odds',
        awayTeam: 'Miami (OH)',
        homeTeam: 'SMU',
        commenceTime: '2026-03-21T01:00:00.000Z'
      }
    ]),
    saveOddsForSport: async () => {},
    formatOddsMessage: (games) => games.map(game => `${game.awayTeam} vs ${game.homeTeam} @ ${game.commenceTime}`).join('\n')
  })

  assert.equal(
    messages[0].message,
    'Miami (OH) vs SMU @ 2026-03-20T16:15:00.000Z\nDuke vs VCU @ 2026-03-20T19:00:00.000Z'
  )
})

test('postMadnessOdds uses the same board display labels as /madness games', async () => {
  const messages = []

  await postMadnessOdds('room-1', {
    now: () => new Date('2026-03-20T11:00:00-04:00'),
    postMessage: async (payload) => { messages.push(payload) },
    ensureMadnessOdds: async () => ([
      {
        id: 'today-game',
        awayTeam: 'North Carolina Tar Heels',
        homeTeam: 'Duke Blue Devils',
        awayShortName: 'North Carolina',
        homeShortName: 'Duke',
        awayDisplayName: '(1) North Carolina',
        homeDisplayName: '(8) Duke',
        commenceTime: '2026-03-20T19:00:00.000Z'
      }
    ]),
    fetchOddsForSport: async () => ([
      {
        id: 'today-game-odds',
        awayTeam: 'North Carolina',
        homeTeam: 'Duke',
        commenceTime: '2026-03-20T19:00:00.000Z'
      }
    ]),
    saveOddsForSport: async () => {},
    formatOddsMessage: (games) => `${games[0].awayDisplayName} vs ${games[0].homeDisplayName}`
  })

  assert.equal(messages[0].message, '(1) North Carolina vs (8) Duke')
})

test('postMadnessPicks shows the live board index for saved picks', async () => {
  const messages = []

  await postMadnessPicks('room-1', {
    payload: { sender: 'user-1' },
    postMessage: async (payload) => { messages.push(payload) },
    resolveMarchMadnessPicks: async () => {},
    getMarchMadnessSeasonYear: () => 2026,
    listMarchMadnessPicksForUser: () => ([
      {
        gameId: 'late',
        gameIndex: 0,
        teamCode: 'DUKE',
        teamName: 'Duke Blue Devils',
        awayTeam: 'North Carolina Tar Heels',
        awaySeed: 1,
        homeTeam: 'Duke Blue Devils',
        homeSeed: 8,
        commenceTime: '2026-03-20T23:10:00.000Z',
        status: 'pending'
      }
    ]),
    getMarchMadnessTournamentGames: async () => ([
      {
        id: 'late',
        awayTeam: 'North Carolina Tar Heels',
        homeTeam: 'Duke Blue Devils',
        completed: false
      }
    ]),
    getMarchMadnessGameboardGames: async () => ([
      {
        id: 'late',
        awayTeam: 'North Carolina Tar Heels',
        homeTeam: 'Duke Blue Devils',
        awayShortName: 'North Carolina',
        homeShortName: 'Duke',
        awaySeed: 1,
        homeSeed: 8,
        displayMatchup: '(1) North Carolina vs (8) Duke',
        commenceTime: '2026-03-20T23:10:00.000Z'
      },
      {
        id: 'early',
        awayTeam: 'Miami (OH) RedHawks',
        homeTeam: 'SMU Mustangs',
        awayShortName: 'Miami (OH)',
        homeShortName: 'SMU',
        awaySeed: 11,
        homeSeed: 6,
        displayMatchup: '(11) Miami (OH) vs (6) SMU',
        commenceTime: '2026-03-20T16:15:00.000Z'
      }
    ])
  })

  assert.match(messages[0].message, /2\. DUKE \| \(1\) North Carolina vs \(8\) Duke \| ⏳ pending/)
})

test('postMadnessPicks keeps late-night UTC games on the Eastern board date', async () => {
  const messages = []
  const requestedDates = []

  await postMadnessPicks('room-1', {
    payload: { sender: 'user-1' },
    postMessage: async (payload) => { messages.push(payload) },
    resolveMarchMadnessPicks: async () => {},
    getMarchMadnessSeasonYear: () => 2026,
    listMarchMadnessPicksForUser: () => ([
      {
        gameId: 'late-night',
        gameIndex: 0,
        teamCode: 'DUKE',
        teamName: 'Duke Blue Devils',
        awayTeam: 'North Carolina Tar Heels',
        awaySeed: 1,
        homeTeam: 'Duke Blue Devils',
        homeSeed: 8,
        commenceTime: '2026-03-21T00:10:00.000Z',
        status: 'pending'
      }
    ]),
    getMarchMadnessTournamentGames: async (dates) => {
      requestedDates.push(...dates)
      return [
        {
          id: 'late-night',
          awayTeam: 'North Carolina Tar Heels',
          homeTeam: 'Duke Blue Devils',
          completed: false
        }
      ]
    },
    getMarchMadnessGameboardGames: async () => ([
      {
        id: 'late-night',
        awayTeam: 'North Carolina Tar Heels',
        homeTeam: 'Duke Blue Devils',
        awayShortName: 'North Carolina',
        homeShortName: 'Duke',
        awaySeed: 1,
        homeSeed: 8,
        displayMatchup: '(1) North Carolina vs (8) Duke',
        commenceTime: '2026-03-21T00:10:00.000Z'
      }
    ])
  })

  assert.deepEqual(requestedDates, ['2026-03-20'])
  assert.match(messages[0].message, /1\. DUKE \| \(1\) North Carolina vs \(8\) Duke \| ⏳ pending/)
})

test('postMadnessPicks refreshes saved generic codes to compact board abbreviations', async () => {
  const messages = []

  await postMadnessPicks('room-1', {
    payload: { sender: 'user-1' },
    postMessage: async (payload) => { messages.push(payload) },
    resolveMarchMadnessPicks: async () => {},
    getMarchMadnessSeasonYear: () => 2026,
    listMarchMadnessPicksForUser: () => ([
      {
        gameId: 'g1',
        gameIndex: 0,
        teamCode: 'SFB',
        teamName: 'South Florida Bulls',
        awayTeam: 'South Florida Bulls',
        awaySeed: 11,
        homeTeam: 'Louisville Cardinals',
        homeSeed: 6,
        commenceTime: '2026-03-20T16:15:00.000Z',
        status: 'pending'
      }
    ]),
    getMarchMadnessTournamentGames: async () => ([
      {
        id: 'g1',
        awayTeam: 'South Florida Bulls',
        homeTeam: 'Louisville Cardinals',
        completed: false
      }
    ]),
    getMarchMadnessGameboardGames: async () => ([
      {
        id: 'g1',
        awayTeam: 'South Florida Bulls',
        homeTeam: 'Louisville Cardinals',
        awayShortName: 'USF',
        homeShortName: 'LOU',
        awaySeed: 11,
        homeSeed: 6,
        displayMatchup: '(11) USF vs (6) LOU',
        commenceTime: '2026-03-20T16:15:00.000Z'
      }
    ])
  })

  assert.match(messages[0].message, /1\. USF \| \(11\) USF vs \(6\) LOU \| ⏳ pending/)
})

test('isMarchMadnessEvent only accepts seeded tournament matchups', () => {
  assert.equal(isMarchMadnessEvent({
    links: [{
      rel: ['bracket', 'desktop', 'event'],
      href: 'https://www.espn.com/mens-college-basketball/bracket/_/season/2026/2026-ncaa-tournament'
    }],
    competitions: [{
      competitors: [
        { homeAway: 'away', seed: 12, team: { displayName: 'VCU Rams' } },
        { homeAway: 'home', seed: 5, team: { displayName: 'BYU Cougars' } }
      ]
    }]
  }), true)

  assert.equal(isMarchMadnessEvent({
    competitions: [{
      competitors: [
        { homeAway: 'away', team: { displayName: 'Loyola Ramblers' } },
        { homeAway: 'home', team: { displayName: 'Bradley Braves' } }
      ]
    }]
  }), false)

  assert.equal(isMarchMadnessEvent({
    competitions: [{
      competitors: [
        { homeAway: 'away', curatedRank: { current: 13 }, team: { displayName: 'Troy Trojans' } },
        { homeAway: 'home', curatedRank: { current: 4 }, team: { displayName: 'Nebraska Cornhuskers' } }
      ]
    }]
  }), false)
})

test('filterMarchMadnessOddsGames keeps only games between tournament teams', () => {
  const matchups = buildMarchMadnessTournamentMatchups([{
    links: [{
      rel: ['bracket', 'desktop', 'event'],
      href: 'https://www.espn.com/mens-college-basketball/bracket/_/season/2026/2026-ncaa-tournament'
    }],
    date: '2026-03-20T18:20:00-04:00',
    competitions: [{
      competitors: [
        {
          homeAway: 'away',
          seed: 11,
          team: {
            displayName: 'Drake Bulldogs',
            shortDisplayName: 'Drake Bulldogs',
            location: 'Drake',
            abbreviation: 'DRKE'
          }
        },
        {
          homeAway: 'home',
          seed: 6,
          team: {
            displayName: 'Missouri Tigers',
            shortDisplayName: 'Missouri Tigers',
            location: 'Missouri',
            abbreviation: 'MIZ'
          }
        }
      ]
    }]
  }])

  const filtered = filterMarchMadnessOddsGames([
    { id: 'g1', awayTeam: 'Drake Bulldogs', homeTeam: 'Missouri Tigers', commenceTime: '2026-03-20T18:20:00-04:00' },
    { id: 'g2', awayTeam: 'Drake Bulldogs', homeTeam: 'Missouri Tigers', commenceTime: '2026-03-22T18:20:00-04:00' },
    { id: 'g3', awayTeam: 'Bradley Braves', homeTeam: 'Loyola Ramblers', commenceTime: '2026-03-20T18:20:00-04:00' }
  ], matchups)

  assert.deepEqual(filtered.map(game => game.id), ['g1'])
})

test('filterMarchMadnessOddsGames preserves canonical tournament team names for display', () => {
  const matchups = buildMarchMadnessTournamentMatchups([{
    links: [{
      rel: ['bracket', 'desktop', 'event'],
      href: 'https://www.espn.com/mens-college-basketball/bracket/_/season/2026/2026-ncaa-tournament'
    }],
    date: '2026-03-20T18:20:00-04:00',
    competitions: [{
      competitors: [
        {
          homeAway: 'away',
          seed: 11,
          team: {
            displayName: 'VCU Rams',
            shortDisplayName: 'VCU Rams',
            location: 'VCU',
            abbreviation: 'VCU'
          }
        },
        {
          homeAway: 'home',
          seed: 6,
          team: {
            displayName: 'Brigham Young Cougars',
            shortDisplayName: 'BYU Cougars',
            location: 'BYU',
            abbreviation: 'BYU'
          }
        }
      ]
    }]
  }])

  const filtered = filterMarchMadnessOddsGames([{
    id: 'g1',
    awayTeam: 'VCU Rams',
    homeTeam: 'Brigham Young Cougars',
    commenceTime: '2026-03-20T18:20:00-04:00'
  }], matchups)

  assert.equal(filtered[0].canonicalAwayTeam, 'VCU Rams')
  assert.equal(filtered[0].canonicalHomeTeam, 'Brigham Young Cougars')
  assert.equal(findMatchingMarchMadnessMatchup(filtered[0], matchups)?.homeName, 'Brigham Young Cougars')
})

test('isMarchMadnessOddsGame rejects unrelated school matchups with overlapping nickname patterns', () => {
  const matchups = buildMarchMadnessTournamentMatchups([{
    links: [{
      rel: ['bracket', 'desktop', 'event'],
      href: 'https://www.espn.com/mens-college-basketball/bracket/_/season/2026/2026-ncaa-tournament'
    }],
    date: '2026-03-20T18:20:00-04:00',
    competitions: [{
      competitors: [
        {
          homeAway: 'away',
          seed: 11,
          team: {
            displayName: 'VCU Rams',
            shortDisplayName: 'VCU Rams',
            location: 'VCU',
            abbreviation: 'VCU'
          }
        },
        {
          homeAway: 'home',
          seed: 6,
          team: {
            displayName: 'North Carolina Tar Heels',
            shortDisplayName: 'North Carolina Tar Heels',
            location: 'North Carolina',
            abbreviation: 'UNC'
          }
        }
      ]
    }]
  }])

  assert.equal(isMarchMadnessOddsGame({
    awayTeam: 'South Florida Bulls',
    homeTeam: 'Louisville Cardinals',
    commenceTime: '2026-03-20T17:30:00Z'
  }, matchups), false)
})

test('isMarchMadnessOddsGame rejects unrelated school matchups with overlapping initials', () => {
  const matchups = buildMarchMadnessTournamentMatchups([{
    links: [{
      rel: ['bracket', 'desktop', 'event'],
      href: 'https://www.espn.com/mens-college-basketball/bracket/_/season/2026/2026-ncaa-tournament'
    }],
    date: '2026-03-20T18:20:00-04:00',
    competitions: [{
      competitors: [
        {
          homeAway: 'away',
          seed: 11,
          team: {
            displayName: 'Northern Colorado Bears',
            shortDisplayName: 'Northern Colorado Bears',
            location: 'Northern Colorado',
            abbreviation: 'UNCB'
          }
        },
        {
          homeAway: 'home',
          seed: 6,
          team: {
            displayName: 'Mississippi State Bulldogs',
            shortDisplayName: 'Mississippi State Bulldogs',
            location: 'Mississippi State',
            abbreviation: 'MSST'
          }
        }
      ]
    }]
  }])

  assert.equal(isMarchMadnessOddsGame({
    awayTeam: 'North Carolina Tar Heels',
    homeTeam: 'Michigan State Spartans',
    commenceTime: '2026-03-20T18:20:00-04:00'
  }, matchups), false)
})
