import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createRoomFunHandlers } from '../src/handlers/roomFunCommands.js'

test('dispatchWithRegistry routes /djbeer through the room fun handler', async () => {
  const posted = []
  const handlers = createRoomFunHandlers({
    postMessage: async (msg) => posted.push(msg),
    getCurrentDJUUIDs: () => ['dj-1']
  })

  const handled = await dispatchWithRegistry({
    txt: '/djbeer',
    payload: { sender: 'user-1', message: '/djbeer' },
    room: 'room-1',
    context: { state: {} },
    registry: { djbeer: handlers.djbeer },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['djbeer'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '<@uid:user-1> gives <@uid:dj-1> an ice cold beer! 🍺'
  }])
})

test('dispatchWithRegistry routes /dive through the room fun handler', async () => {
  const posted = []
  const roomBotCalls = []
  const handlers = createRoomFunHandlers({
    postMessage: async (msg) => posted.push(msg),
    getCurrentDJ: () => 'dj-1',
    getMarkedUser: () => null,
    markUser: (uuid) => roomBotCalls.push(['markUser', uuid])
  })

  const handled = await dispatchWithRegistry({
    txt: '/dive',
    payload: { sender: 'dj-1', message: '/dive' },
    room: 'room-1',
    context: {
      state: {},
      roomBot: { removeDJ: async (uuid) => roomBotCalls.push(['removeDJ', uuid]) },
      getSenderNickname: async () => '@dj'
    },
    registry: { dive: handlers.dive },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['dive'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(roomBotCalls, [['markUser', 'dj-1']])
  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '@dj, you\'ll dive off stage after this track. 🌊'
  }])
})

test('dispatchWithRegistry routes /spotlight through the room fun handler', async () => {
  const calls = []
  const handlers = createRoomFunHandlers({
    startPaidSpotlight: async (payload) => calls.push(payload)
  })

  const handled = await dispatchWithRegistry({
    txt: '/spotlight',
    payload: { sender: 'user-1', message: '/spotlight' },
    room: 'room-1',
    context: {
      state: { phase: 'open' },
      roomBot: { any: 'bot' },
      getSenderNickname: async () => '@user'
    },
    registry: { spotlight: handlers.spotlight },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['spotlight'])),
    handleRouletteBet: async () => {},
    postMessage: async () => {},
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].room, 'room-1')
  assert.equal(calls[0].cost, 1)
})
