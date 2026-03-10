import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createMiscCommandHandlers } from '../src/handlers/miscCommandHandlers.js'

test('dispatchWithRegistry routes /theme through the misc command handlers', async () => {
  const themeCalls = []
  const posted = []
  const handlers = createMiscCommandHandlers({
    postMessage: async (msg) => posted.push(msg),
    handleThemeCommand: async (payload) => themeCalls.push(payload)
  })

  const handled = await dispatchWithRegistry({
    txt: '/theme cozy',
    payload: { sender: 'mod-1', message: '/theme cozy' },
    room: 'room-1',
    registry: { theme: handlers.theme },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['theme'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(themeCalls, [{ sender: 'mod-1', room: 'room-1', message: '/theme cozy' }])
  assert.deepEqual(posted, [])
})

test('dispatchWithRegistry routes /a through the trivia submission handler', async () => {
  const submissions = []
  const handlers = createMiscCommandHandlers({
    handleTriviaSubmit: async (...args) => submissions.push(args)
  })

  const payload = { sender: 'user-1', message: '/a' }
  const handled = await dispatchWithRegistry({
    txt: '/a',
    payload,
    room: 'room-1',
    registry: { a: handlers.a },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['a'])),
    handleRouletteBet: async () => {},
    postMessage: async () => {},
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(submissions, [[payload, 'room-1', 'user-1']])
})

test('dispatchWithRegistry routes /store through the misc command handlers', async () => {
  const posted = []
  const handlers = createMiscCommandHandlers({
    postMessage: async (msg) => posted.push(msg),
    storeItems: {
      '/8ball': { cost: 25, desc: 'Ask the ball.' },
      '--- Fun ---': 'Reaction commands'
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/store',
    payload: { sender: 'user-1', message: '/store' },
    room: 'room-1',
    registry: { store: handlers.store },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['store'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(posted[0].message.includes('Welcome to the JamFlow Store'), true)
  assert.equal(posted[0].message.includes('`/8ball`'), true)
})

test('dispatchWithRegistry routes /8ball through the misc command handlers', async () => {
  const posted = []
  const walletCharges = []
  const handlers = createMiscCommandHandlers({
    postMessage: async (msg) => posted.push(msg),
    getUserWallet: async () => 100,
    removeFromUserWallet: async (uuid, cost) => walletCharges.push({ uuid, cost }),
    askMagic8Ball: async () => 'Outlook good.',
    storeItems: {
      '/8ball': { cost: 25, desc: 'Ask the ball.' }
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/8ball Will I win?',
    payload: { sender: 'user-1', message: '/8ball Will I win?' },
    room: 'room-1',
    registry: { '8ball': handlers['8ball'] },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['8ball'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(walletCharges, [{ uuid: 'user-1', cost: 25 }])
  assert.equal(posted[0].message.includes('Magic 8-Ball says: *Outlook good.*'), true)
})
