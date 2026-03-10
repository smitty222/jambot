import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createSecretFunHandlers } from '../src/handlers/secretFunCommands.js'

test('dispatchWithRegistry routes /secret through the secret fun handler', async () => {
  const posted = []
  const dms = []
  const handlers = createSecretFunHandlers({
    postMessage: async (msg) => posted.push(msg),
    sendDirectMessage: async (...args) => dms.push(args),
    isUserAuthorized: async () => true
  })

  const handled = await dispatchWithRegistry({
    txt: '/secret',
    payload: { sender: 'mod-1', message: '/secret' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { secret: handlers.secret },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['secret'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(dms.length, 1)
  assert.equal(dms[0][0], 'mod-1')
  assert.deepEqual(posted, [{ room: 'room-1', message: '🕵️‍♂️ Psst… look in your messages.' }])
})

test('dispatchWithRegistry routes /jam through the secret fun handler', async () => {
  const calls = []
  const handlers = createSecretFunHandlers()
  const roomBot = {
    voteOnSong: async (...args) => calls.push(['voteOnSong', ...args]),
    playOneTimeAnimation: async (...args) => calls.push(['playOneTimeAnimation', ...args])
  }

  const handled = await dispatchWithRegistry({
    txt: '/jam',
    payload: { sender: 'user-1', message: '/jam' },
    room: 'room-1',
    context: { roomBot, delay: async () => {} },
    registry: {
      jam: ({ roomBot }) => handlers.jam({ roomBot, delay: async () => {} })
    },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['jam'])),
    handleRouletteBet: async () => {},
    postMessage: async () => {},
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(calls.length, 30)
  assert.deepEqual(calls[0].slice(0, 2), ['voteOnSong', process.env.ROOM_UUID])
})

test('dispatchWithRegistry routes /props through the secret fun handler', async () => {
  const posted = []
  const handlers = createSecretFunHandlers({
    postMessage: async (msg) => posted.push(msg)
  })

  const handled = await dispatchWithRegistry({
    txt: '/props',
    payload: { sender: 'user-1', message: '/props' },
    room: 'room-1',
    registry: { props: handlers.props },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['props'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(posted.length, 1)
  assert.equal(Array.isArray(posted[0].images), true)
})
