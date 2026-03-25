import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createRoomUtilityHandlers } from '../src/handlers/roomUtilityCommands.js'

test('dispatchWithRegistry routes /commands mod through the room utility handler', async () => {
  const posted = []
  const dms = []
  const handlers = createRoomUtilityHandlers({
    postMessage: async (msg) => posted.push(msg),
    sendDirectMessage: async (...args) => dms.push(args),
    isUserAuthorized: async () => true
  })

  const handled = await dispatchWithRegistry({
    txt: '/commands mod',
    payload: { sender: 'mod-1', message: '/commands mod' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { commands: handlers.commands },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['commands'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(posted[0].message.startsWith('🛠️ Moderator Commands'), true)
  assert.deepEqual(dms, [['mod-1', dms[0][1]]])
  assert.equal(posted[1].message, 'Mod Commands sent via DM')
})

test('dispatchWithRegistry routes /commands sports through the room utility handler', async () => {
  const posted = []
  const handlers = createRoomUtilityHandlers({
    postMessage: async (msg) => posted.push(msg),
    sendDirectMessage: async () => {},
    isUserAuthorized: async () => false
  })

  const handled = await dispatchWithRegistry({
    txt: '/commands sports',
    payload: { sender: 'user-1', message: '/commands sports' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { commands: handlers.commands },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['commands'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(posted.length, 1)
  assert.match(posted[0].message, /🏈 Sports Commands/)
  assert.match(posted[0].message, /\/sportsbet SPORT INDEX TEAM TYPE AMOUNT/)
})

test('dispatchWithRegistry routes /commands queue through the room utility handler', async () => {
  const posted = []
  const handlers = createRoomUtilityHandlers({
    postMessage: async (msg) => posted.push(msg),
    sendDirectMessage: async () => {},
    isUserAuthorized: async () => false
  })

  const handled = await dispatchWithRegistry({
    txt: '/commands queue',
    payload: { sender: 'user-1', message: '/commands queue' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { commands: handlers.commands },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['commands'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(posted.length, 1)
  assert.match(posted[0].message, /🎚️ Queue & Playlist Commands/)
  assert.match(posted[0].message, /\/qplaylist <spotifyPlaylistId>/)
})

test('dispatchWithRegistry routes /commands crypto through the room utility handler', async () => {
  const posted = []
  const handlers = createRoomUtilityHandlers({
    postMessage: async (msg) => posted.push(msg),
    sendDirectMessage: async () => {},
    isUserAuthorized: async () => false
  })

  const handled = await dispatchWithRegistry({
    txt: '/commands crypto',
    payload: { sender: 'user-1', message: '/commands crypto' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { commands: handlers.commands },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['commands'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(posted.length, 1)
  assert.match(posted[0].message, /🪙 Crypto Commands/)
  assert.match(posted[0].message, /\/crypto portfolio/)
})

test('default /commands response exposes all major command hubs', async () => {
  const posted = []
  const handlers = createRoomUtilityHandlers({
    postMessage: async (msg) => posted.push(msg),
    sendDirectMessage: async () => {},
    isUserAuthorized: async () => false
  })

  await handlers.commands({
    payload: { sender: 'user-1', message: '/commands' },
    room: 'room-1',
    ttlUserToken: 'token'
  })

  assert.equal(posted.length, 1)
  assert.match(posted[0].message, /\/games/)
  assert.match(posted[0].message, /\/music/)
  assert.match(posted[0].message, /\/commands queue/)
  assert.match(posted[0].message, /\/wallet/)
  assert.match(posted[0].message, /\/commands sports/)
  assert.match(posted[0].message, /\/commands crypto/)
  assert.match(posted[0].message, /\/gifs/)
  assert.match(posted[0].message, /\/commands trivia/)
  assert.match(posted[0].message, /\/avatars/)
})

test('dispatchWithRegistry routes /room through the room utility handler', async () => {
  const posted = []
  const updates = []
  const handlers = createRoomUtilityHandlers({
    postMessage: async (msg) => posted.push(msg),
    isUserAuthorized: async () => true,
    updateRoomInfo: async (payload) => updates.push(payload)
  })

  const handled = await dispatchWithRegistry({
    txt: '/room theater',
    payload: { sender: 'mod-1', message: '/room theater' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { room: handlers.room },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['room'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(updates, [{ design: 'THEATER' }])
  assert.deepEqual(posted, [{ room: 'room-1', message: 'Room design updated to: THEATER' }])
})

test('dispatchWithRegistry routes /addDJ discover through the room utility handler', async () => {
  const posted = []
  const calls = []
  const handlers = createRoomUtilityHandlers({
    postMessage: async (msg) => posted.push(msg)
  })
  const roomBot = {
    lastCommandText: '/addDJ discover',
    enableDiscoverDJ: async (ids) => calls.push(['enableDiscoverDJ', ids]),
    addDJ: async () => calls.push(['addDJ'])
  }

  const handled = await dispatchWithRegistry({
    txt: '/addDJ discover',
    payload: { sender: 'mod-1', message: '/addDJ discover' },
    room: 'room-1',
    context: { roomBot },
    registry: { adddj: handlers.adddj },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['adddj'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(calls[0][0], 'enableDiscoverDJ')
  assert.deepEqual(calls[1], ['addDJ'])
  assert.equal(posted[0].message.includes('Discover DJ added'), true)
})
