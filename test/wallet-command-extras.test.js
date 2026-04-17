import test from 'node:test'
import assert from 'node:assert/strict'

import { formatBankrollLine } from '../src/handlers/walletCommandExtras.js'

test('formatBankrollLine tags the user through the decorated mention formatter', () => {
  const line = formatBankrollLine({
    rank: 1,
    uuid: 'user-1',
    name: 'Ryan',
    amount: 12345.67,
    mentionUser: (uuid) => `🏅 <@uid:${uuid}>`
  })

  assert.equal(line, '1. 🏅 <@uid:user-1> $12,346')
})

test('formatBankrollLine falls back to a compact nickname without a uuid', () => {
  const line = formatBankrollLine({
    rank: 2,
    uuid: '',
    name: 'VeryLongNickname',
    amount: -50
  })

  assert.equal(line, '2. VeryLongNickn. -$50')
})
