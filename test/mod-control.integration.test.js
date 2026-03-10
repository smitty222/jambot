import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createModControlHandlers } from '../src/handlers/modControlCommands.js'

test('dispatchWithRegistry routes /status through the mod control handler', async () => {
  const posted = []
  const handlers = createModControlHandlers({
    postMessage: async (msg) => posted.push(msg),
    isSongStatsEnabled: () => true,
    getGreetingState: () => ({ standardEnabled: false, aiEnabled: true }),
    isNowPlayingInfoBlurbEnabled: () => true,
    getNowPlayingInfoBlurbTone: () => 'vibe'
  })

  const handled = await dispatchWithRegistry({
    txt: '/status',
    payload: { sender: 'mod-1', message: '/status' },
    room: 'room-1',
    context: { roomBot: { autobop: true }, ttlUserToken: 'token' },
    registry: { status: handlers.status },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['status'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(posted, [{
    room: 'room-1',
    message: `Bot Mod Toggles:
      - Autobop: enabled
      - Song stats: enabled
      - Greet users: disabled
      - Info blurb: enabled (tone: vibe)`
  }])
})

test('dispatchWithRegistry routes /infotoggle through the mod control handler', async () => {
  const posted = []
  let enabled = true
  const handlers = createModControlHandlers({
    postMessage: async (msg) => posted.push(msg),
    isUserAuthorized: async () => true,
    isNowPlayingInfoBlurbEnabled: () => enabled,
    disableNowPlayingInfoBlurb: () => { enabled = false },
    enableNowPlayingInfoBlurb: () => { enabled = true }
  })

  const handled = await dispatchWithRegistry({
    txt: '/infotoggle',
    payload: { sender: 'mod-1', message: '/infotoggle' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { infotoggle: handlers.infotoggle },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['infotoggle'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(enabled, false)
  assert.deepEqual(posted, [{ room: 'room-1', message: 'Info blurb disabled.' }])
})
