import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createBlackjackHandlers } from '../src/handlers/blackjackCommands.js'

test('dispatchWithRegistry routes /blackjack through the blackjack handler', async () => {
  const calls = []
  const handlers = createBlackjackHandlers({
    getSenderNickname: async () => '@player',
    openBetting: async (ctx) => calls.push(['openBetting', ctx]),
    joinTable: async (...args) => calls.push(['joinTable', ...args])
  })

  const handled = await dispatchWithRegistry({
    txt: '/blackjack',
    payload: { sender: 'user-1', message: '/blackjack' },
    room: 'room-1',
    registry: { blackjack: handlers.blackjack },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['blackjack'])),
    handleRouletteBet: async () => {},
    postMessage: async () => {},
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(calls, [
    ['openBetting', { room: 'room-1', tableId: 'blackjack:room-1' }],
    ['joinTable', 'user-1', '@player', { room: 'room-1', tableId: 'blackjack:room-1' }]
  ])
})

test('dispatchWithRegistry routes /bj bet through the blackjack handler', async () => {
  const calls = []
  const handlers = createBlackjackHandlers({
    getSenderNickname: async () => '@player',
    handleBlackjackBet: async (...args) => calls.push(args)
  })

  const handled = await dispatchWithRegistry({
    txt: '/bj bet 50',
    payload: { sender: 'user-1', message: '/bj bet 50' },
    room: 'room-1',
    registry: { bj: handlers.bj },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['bj'])),
    handleRouletteBet: async () => {},
    postMessage: async () => {},
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(calls, [['user-1', '50', '@player', { room: 'room-1', tableId: 'blackjack:room-1' }]])
})

test('dispatchWithRegistry routes /join only when blackjack is in join phase', async () => {
  const calls = []
  const handlers = createBlackjackHandlers({
    getSenderNickname: async () => '@player',
    getPhase: () => 'join',
    joinTable: async (...args) => calls.push(args)
  })

  const handled = await dispatchWithRegistry({
    txt: '/join',
    payload: { sender: 'user-1', message: '/join' },
    room: 'room-1',
    registry: { join: handlers.join },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['join'])),
    handleRouletteBet: async () => {},
    postMessage: async () => {},
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(calls, [['user-1', '@player', { room: 'room-1', tableId: 'blackjack:room-1' }]])
})

test('dispatchWithRegistry routes acting shortcuts only during blackjack acting phase', async () => {
  const calls = []
  const handlers = createBlackjackHandlers({
    getSenderNickname: async () => '@player',
    getPhase: () => 'acting',
    handleHit: async (...args) => calls.push(args)
  })

  const handled = await dispatchWithRegistry({
    txt: '/hit',
    payload: { sender: 'user-1', message: '/hit' },
    room: 'room-1',
    registry: { hit: handlers.hit },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['hit'])),
    handleRouletteBet: async () => {},
    postMessage: async () => {},
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(calls, [['user-1', '@player', { room: 'room-1', tableId: 'blackjack:room-1' }]])
})
