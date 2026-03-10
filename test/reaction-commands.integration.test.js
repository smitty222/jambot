import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createReactionHandlers } from '../src/handlers/reactionCommands.js'

test('dispatchWithRegistry routes /trash through the reaction handlers', async () => {
  const posted = []
  const reactionHandlers = createReactionHandlers({
    postMessage: async (msg) => posted.push(msg),
    chooseRandom: (items) => items[items.length - 1]
  })

  const handled = await dispatchWithRegistry({
    txt: '/trash',
    payload: { sender: 'user-1', message: '/trash' },
    room: 'room-1',
    registry: { trash: ({ room }) => reactionHandlers.trash({ room }) },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['trash'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(posted, [{ room: 'room-1', message: '🗑️🔥💀' }])
})

test('dispatchWithRegistry routes /begonebitch through the reaction handlers', async () => {
  const posted = []
  const removed = []
  const chargeCalls = []
  const reactionHandlers = createReactionHandlers({
    postMessage: async (msg) => posted.push(msg),
    getCurrentDJ: () => 'dj-9',
    getUserWallet: async () => 6000,
    removeFromUserWallet: async (uuid, amount) => {
      chargeCalls.push({ uuid, amount })
      return true
    },
    getSenderNickname: async (uuid) => (uuid === 'caller-1' ? '@caller' : '@dj'),
    isSpotlightProtected: () => false,
    chooseRandom: (items) => items[0],
    delay: async () => {}
  })

  const handled = await dispatchWithRegistry({
    txt: '/begonebitch',
    payload: { sender: 'caller-1', message: '/begonebitch' },
    room: 'room-1',
    context: {
      state: { djs: ['dj-9'] },
      roomBot: {
        removeDJ: async (uuid) => removed.push(uuid)
      }
    },
    registry: {
      begonebitch: ({ payload, room, state, roomBot }) =>
        reactionHandlers.begonebitch({ payload, room, state, roomBot })
    },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['begonebitch'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(chargeCalls, [{ uuid: 'caller-1', amount: 5000 }])
  assert.deepEqual(removed, ['dj-9'])
  assert.deepEqual(posted, [
    { room: 'room-1', message: '💰 @caller just paid $5,000 for @dj to get tf off the stage…' },
    { room: 'room-1', message: '', images: ['https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3c3aDU4MXkyNTNuenkxY2l1dDBrMnBpZ244MjY4MDhzdnB5eWYxdyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/9Rp27Gpwjx1n2/giphy.gif'] },
    { room: 'room-1', message: '@dj… nobody likes you.' },
    { room: 'room-1', message: '👋 BEGONE.' }
  ])
})
