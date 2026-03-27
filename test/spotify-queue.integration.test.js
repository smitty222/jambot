import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import { createSpotifyQueueHandlers } from '../src/handlers/spotifyQueueCommands.js'

test('dispatchWithRegistry routes /playlistcreate through the Spotify queue handler', async () => {
  const posted = []
  const createCalls = []
  const handlers = createSpotifyQueueHandlers({
    postMessage: async (msg) => posted.push(msg),
    isUserAuthorized: async () => true,
    getSpotifyUserAuth: () => null,
    createSpotifyPlaylist: async (name, options) => {
      createCalls.push([name, options])
      return {
        id: 'playlist-123',
        name,
        public: options.public,
        external_urls: { spotify: 'https://open.spotify.com/playlist/playlist-123' }
      }
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/playlistcreate private Beach Vibes',
    payload: { sender: 'mod-1', message: '/playlistcreate private Beach Vibes' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { playlistcreate: handlers.playlistcreate },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['playlistcreate'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(createCalls.length, 1)
  assert.equal(createCalls[0][0], 'Beach Vibes')
  assert.equal(createCalls[0][1].public, false)
  assert.match(posted[0].message, /Playlist Created/)
  assert.match(posted[0].message, /playlist-123/)
  assert.match(posted[0].message, /shared bot Spotify account/)
})

test('dispatchWithRegistry uses a linked user Spotify token when available', async () => {
  const posted = []
  const refreshCalls = []
  const updateCalls = []
  const handlers = createSpotifyQueueHandlers({
    postMessage: async (msg) => posted.push(msg),
    isUserAuthorized: async () => true,
    getSpotifyUserAuth: () => ({
      userUuid: 'mod-1',
      refreshToken: 'refresh-123',
      accessToken: '',
      expiresAt: 0
    }),
    createSpotifyPlaylistForRefreshToken: async (refreshToken, name, options) => {
      refreshCalls.push([refreshToken, name, options])
      return {
        playlist: {
          id: 'playlist-linked',
          name,
          public: options.public,
          external_urls: { spotify: 'https://open.spotify.com/playlist/playlist-linked' }
        },
        auth: {
          accessToken: 'new-token',
          refreshToken,
          expiresAt: Date.now() + 3600_000
        }
      }
    },
    updateSpotifyUserAuthTokens: async (...args) => updateCalls.push(args)
  })

  const handled = await dispatchWithRegistry({
    txt: '/playlistcreate Friends Mix',
    payload: { sender: 'mod-1', message: '/playlistcreate Friends Mix' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { playlistcreate: handlers.playlistcreate },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['playlistcreate'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.equal(refreshCalls.length, 1)
  assert.equal(refreshCalls[0][0], 'refresh-123')
  assert.equal(updateCalls.length, 1)
  assert.match(posted[0].message, /your linked Spotify account/)
})

test('dispatchWithRegistry rejects /playlistcreate for non-moderators', async () => {
  const posted = []
  const handlers = createSpotifyQueueHandlers({
    postMessage: async (msg) => posted.push(msg),
    isUserAuthorized: async () => false
  })

  const handled = await dispatchWithRegistry({
    txt: '/playlistcreate Summer Set',
    payload: { sender: 'user-1', message: '/playlistcreate Summer Set' },
    room: 'room-1',
    context: { ttlUserToken: 'token' },
    registry: { playlistcreate: handlers.playlistcreate },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['playlistcreate'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(posted, [{ room: 'room-1', message: 'You need to be a moderator to execute this command.' }])
})
