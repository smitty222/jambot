import test from 'node:test'
import assert from 'node:assert/strict'

import { formatOddsMessage } from '../src/utils/sportsBetAPI.js'

test('formatOddsMessage returns a friendly empty state when no odds are available', () => {
  const message = formatOddsMessage([], 'basketball_ncaab')

  assert.match(message, /Today's NCAAB Odds/)
  assert.match(message, /No FanDuel lines are posted right now\./)
})

test('formatOddsMessage formats NCAAB odds with readable team labels and sorted tip times', () => {
  const message = formatOddsMessage([
    {
      commenceTime: '2026-03-19T21:30:00.000Z',
      awayTeam: 'North Carolina Tar Heels',
      homeTeam: 'Duke Blue Devils',
      bookmaker: {
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'North Carolina Tar Heels', price: 155 },
              { name: 'Duke Blue Devils', price: -190 }
            ]
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'North Carolina Tar Heels', point: 4.5, price: -110 },
              { name: 'Duke Blue Devils', point: -4.5, price: -110 }
            ]
          }
        ]
      }
    },
    {
      commenceTime: '2026-03-19T19:10:00.000Z',
      awayTeam: 'Miami (OH) RedHawks',
      homeTeam: 'SMU Mustangs',
      bookmaker: {
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Miami (OH) RedHawks', price: 180 },
              { name: 'SMU Mustangs', price: -220 }
            ]
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'Miami (OH) RedHawks', point: 5.5, price: -105 },
              { name: 'SMU Mustangs', point: -5.5, price: -115 }
            ]
          }
        ]
      }
    }
  ], 'basketball_ncaab')

  const lines = message.split('\n')

  assert.equal(lines[2].startsWith('1. MOR vs SMU'), true)
  assert.equal(lines[6].startsWith('2. NCTH vs DBD'), true)
  assert.match(message, /ML — MOR: \+180 \| SMU: -220/)
  assert.match(message, /Spread — NCTH: \+4.5 \(-110\) \| DBD: -4.5 \(-110\)/)
})
