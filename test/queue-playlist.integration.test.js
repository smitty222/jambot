import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createQueuePlaylistHandlers } from '../src/handlers/queuePlaylistCommands.js'

test('dispatchWithRegistry routes /q+ through the queue handler', async () => {
  const posted = []
  const handlers = createQueuePlaylistHandlers({
    postMessage: async (msg) => posted.push(msg)
  })
  const queueManager = {
    joinQueue: async () => ({ success: true })
  }

  const handled = await dispatchWithRegistry({
    txt: '/q+',
    payload: { sender: 'user-1', message: '/q+' },
    room: 'room-1',
    context: { queueManager },
    registry: { 'q+': handlers['q+'] },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['q+'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(posted, [{ room: 'room-1', message: '<@uid:user-1>; you joined the queue.' }])
})

test('dispatchWithRegistry routes /addsong through the playlist handler', async () => {
  const posted = []
  const handlers = createQueuePlaylistHandlers({
    postMessage: async (msg) => posted.push(msg)
  })

  const handled = await dispatchWithRegistry({
    txt: '/addsong',
    payload: { sender: 'user-1', message: '/addsong' },
    room: 'room-1',
    context: {
      roomBot: { currentSong: { spotifyTrackId: 'track-1' } }
    },
    registry: { addsong: handlers.addsong },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['addsong'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.match(posted[0]?.message, /addsong <1-9>/)
})

test('dispatchWithRegistry routes /blacklist+ through the utility handler', async () => {
  const posted = []
  let saved = null
  const handlers = createQueuePlaylistHandlers({
    postMessage: async (msg) => posted.push(msg),
    readBlacklistFile: async () => [],
    writeBlacklistFile: async (items) => { saved = items }
  })

  const handled = await dispatchWithRegistry({
    txt: '/blacklist+',
    payload: { sender: 'mod-1', message: '/blacklist+' },
    room: 'room-1',
    context: {
      roomBot: { currentSong: { artistName: 'Artist', trackName: 'Track' } }
    },
    registry: { 'blacklist+': handlers['blacklist+'] },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['blacklist+'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(saved, ['Artist - Track'])
  assert.deepEqual(posted, [{ room: 'room-1', message: '✅ Added "Artist - Track" to the blacklist.' }])
})
