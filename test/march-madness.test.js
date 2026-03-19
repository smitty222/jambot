import test from 'node:test'
import assert from 'node:assert/strict'

import {
  didMarchMadnessPickWin,
  getMarchMadnessSeasonWindow,
  getMarchMadnessWinnerTeam
} from '../src/database/dbmarchmadness.js'
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
    startDate: '2026-03-20T19:10:00-04:00',
    period: 0
  })

  assert.match(line, /\(11\) Miami \(OH\) vs \(6\) SMU • 🕒/)
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
    competitionDate: '2026-03-20T16:05:00-04:00',
    period: 0
  })

  assert.match(line, /\(12\) VCU vs \(5\) BYU • 🕒/)
  assert.doesNotMatch(line, / 0 vs /)
  assert.doesNotMatch(line, /Scheduled/)
})
