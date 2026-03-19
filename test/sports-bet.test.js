import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateBetOutcome,
  getGameWinnerTeamName,
  getSettlementLookbackDays
} from '../src/utils/sportsBet.js'
import { resolveTeamNameFromInput } from '../src/utils/sportsTeams.js'

test('getGameWinnerTeamName returns null for tied completed games', () => {
  assert.equal(getGameWinnerTeamName({
    homeTeam: 'Buffalo Bills',
    awayTeam: 'New York Jets',
    scores: { home: 20, away: 20 }
  }), null)
})

test('evaluateBetOutcome grades moneyline bets with ties as pushes', () => {
  const outcome = evaluateBetOutcome(
    { type: 'ml', team: 'BUF', teamName: 'Buffalo Bills' },
    {
      homeTeam: 'Buffalo Bills',
      awayTeam: 'New York Jets',
      scores: { home: 17, away: 17 }
    }
  )

  assert.equal(outcome, 'push')
})

test('evaluateBetOutcome grades spread bets as win, loss, or push', () => {
  assert.equal(evaluateBetOutcome(
    { type: 'spread', team: 'LAL', teamName: 'Los Angeles Lakers', spreadPoint: -3.5 },
    {
      homeTeam: 'Los Angeles Lakers',
      awayTeam: 'Boston Celtics',
      scores: { home: 110, away: 100 }
    }
  ), 'win')

  assert.equal(evaluateBetOutcome(
    { type: 'spread', team: 'LAL', teamName: 'Los Angeles Lakers', spreadPoint: -7.5 },
    {
      homeTeam: 'Los Angeles Lakers',
      awayTeam: 'Boston Celtics',
      scores: { home: 110, away: 104 }
    }
  ), 'loss')

  assert.equal(evaluateBetOutcome(
    { type: 'spread', team: 'LAL', teamName: 'Los Angeles Lakers', spreadPoint: -6 },
    {
      homeTeam: 'Los Angeles Lakers',
      awayTeam: 'Boston Celtics',
      scores: { home: 110, away: 104 }
    }
  ), 'push')
})

test('getSettlementLookbackDays expands to cover the oldest pending bet for a sport', () => {
  const now = Date.parse('2026-03-19T18:00:00.000Z')
  const bets = {
    game1: [{
      status: 'pending',
      sport: 'basketball_nba',
      commenceTime: '2026-03-17T20:00:00.000Z'
    }],
    game2: [{
      status: 'pending',
      sport: 'baseball_mlb',
      commenceTime: '2026-03-19T17:00:00.000Z'
    }]
  }

  assert.equal(getSettlementLookbackDays(bets, 'basketball_nba', now), 3)
  assert.equal(getSettlementLookbackDays(bets, 'baseball_mlb', now), 2)
  assert.equal(getSettlementLookbackDays({}, 'basketball_nba', now), 1)
})

test('resolveTeamNameFromInput accepts the same generic codes shown on the odds board', () => {
  const teams = ['Miami (OH) RedHawks', 'SMU Mustangs', 'North Carolina Tar Heels', 'Duke Blue Devils']

  assert.equal(resolveTeamNameFromInput('MOR', teams), 'Miami (OH) RedHawks')
  assert.equal(resolveTeamNameFromInput('SMU', teams), 'SMU Mustangs')
  assert.equal(resolveTeamNameFromInput('NCTH', teams), 'North Carolina Tar Heels')
  assert.equal(resolveTeamNameFromInput('DBD', teams), 'Duke Blue Devils')
})
