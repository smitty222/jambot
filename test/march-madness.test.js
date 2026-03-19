import test from 'node:test'
import assert from 'node:assert/strict'

import {
  didMarchMadnessPickWin,
  getMarchMadnessSeasonWindow,
  getMarchMadnessWinnerTeam
} from '../src/database/dbmarchmadness.js'
import { buildMadnessPickBoard } from '../src/handlers/marchMadnessCommands.js'
import {
  buildMarchMadnessTournamentAliasSet,
  filterMarchMadnessOddsGames,
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
      id: 'g2',
      awayTeam: 'North Carolina Tar Heels',
      homeTeam: 'Duke Blue Devils',
      commenceTime: '2026-03-20T23:10:00.000Z'
    },
    {
      id: 'g1',
      awayTeam: 'Miami (OH) RedHawks',
      homeTeam: 'SMU Mustangs',
      commenceTime: '2026-03-20T16:15:00.000Z'
    }
  ], '2026-03-20', new Date('2026-03-20T11:00:00-04:00'))

  assert.match(board, /🎯 Pick Board/)
  assert.match(board, /1\. MOR vs SMU • 🕒 12:15 PM/)
  assert.match(board, /2\. NCTH vs DBD • 🕒 7:10 PM/)
  assert.match(board, /\/madness pick <gameIndex> <teamCode>/)
})

test('isMarchMadnessEvent only accepts seeded tournament matchups', () => {
  assert.equal(isMarchMadnessEvent({
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
})

test('filterMarchMadnessOddsGames keeps only games between tournament teams', () => {
  const aliases = buildMarchMadnessTournamentAliasSet([{
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
    { id: 'g1', awayTeam: 'Drake Bulldogs', homeTeam: 'Missouri Tigers' },
    { id: 'g2', awayTeam: 'Bradley Braves', homeTeam: 'Loyola Ramblers' }
  ], aliases)

  assert.deepEqual(filtered.map(game => game.id), ['g1'])
})
