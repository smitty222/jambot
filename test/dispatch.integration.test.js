import test from 'node:test'
import assert from 'node:assert/strict'

import { dispatchWithRegistry } from '../src/handlers/dispatchCore.js'
import { resolveDispatchCommand } from '../src/handlers/commandRouting.js'
import {
  createSlotsRegistryHandler,
  createMlbScoresCommandHandler,
  createTipCommandHandler,
  createSongReviewCommandHandler
} from '../src/handlers/handlerFactories.js'

function createRecorder () {
  const calls = []
  return {
    calls,
    fn: async (...args) => {
      calls.push(args)
    }
  }
}

test('dispatchWithRegistry routes /slots info through the slots handler', async () => {
  const posted = []
  const slotsHandler = createSlotsRegistryHandler({
    postMessage: async (msg) => posted.push(msg),
    buildSlotsInfoMessage: () => 'SLOTS INFO',
    handleSlotsCommand: async () => {
      throw new Error('should not spin for info')
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/slots info',
    payload: { sender: 'user-1', message: '/slots info' },
    room: 'room-1',
    registry: { slots: slotsHandler },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['slots'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(posted, [{ room: 'room-1', message: 'SLOTS INFO' }])
})

test('dispatchWithRegistry routes /mlb to the MLB handler with parsed date', async () => {
  const posted = []
  const seenDates = []
  const mlbHandler = createMlbScoresCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getMLBScores: async (date) => {
      seenDates.push(date)
      return `scores:${date}`
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/mlb 2026-03-10',
    payload: { sender: 'user-1', message: '/mlb 2026-03-10' },
    room: 'room-1',
    registry: { mlb: mlbHandler },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['mlb'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(seenDates, ['2026-03-10'])
  assert.deepEqual(posted, [{ room: 'room-1', message: 'scores:2026-03-10' }])
})

test('dispatchWithRegistry routes /tip through the real tip handler logic', async () => {
  const posted = []
  const addUserCalls = []
  const transferCalls = []
  const tipHandler = createTipCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getCurrentDJUUIDs: () => ['dj-1'],
    parseTipAmount: () => 5,
    getUserWallet: async () => 25,
    addOrUpdateUser: async (uuid) => addUserCalls.push(uuid),
    transferTip: (payload) => transferCalls.push(payload),
    getSenderNickname: async () => '@sender',
    randomTipGif: () => 'gif-url'
  })

  const handled = await dispatchWithRegistry({
    txt: '/tip 5',
    payload: { sender: 'sender-1', message: '/tip 5' },
    room: 'room-1',
    context: { state: { any: 'state' } },
    registry: { tip: tipHandler },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['tip'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(addUserCalls, ['dj-1'])
  assert.deepEqual(transferCalls, [{ fromUuid: 'sender-1', toUuid: 'dj-1', amount: 5 }])
  assert.deepEqual(posted, [
    { room: 'room-1', message: '💸 @sender tipped $5.00 to <@uid:dj-1>!' },
    { room: 'room-1', message: '', images: ['gif-url'] }
  ])
})

test('dispatchWithRegistry routes /review through the song review handler with roomBot context', async () => {
  const posted = []
  const reviewCalls = []
  const reviewHandler = createSongReviewCommandHandler({
    postMessage: async (msg) => posted.push(msg),
    getSenderNickname: async () => '@reviewer',
    getActiveSong: (roomBot) => roomBot.currentSong,
    parseReviewRating: () => 7.5,
    mentionForUser: (userId) => `<@uid:${userId}>`,
    saveSongReview: async (payload) => {
      reviewCalls.push(payload)
      return { success: true }
    }
  })

  const handled = await dispatchWithRegistry({
    txt: '/review7.5',
    payload: { sender: 'user-7', message: '/review7.5' },
    room: 'room-1',
    context: {
      roomBot: {
        currentSong: {
          songId: 'song-1',
          trackName: 'Track',
          artistName: 'Artist',
          albumName: 'Album'
        }
      }
    },
    registry: { review: (ctx) => reviewHandler({ ...ctx, commandName: 'review' }) },
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set(['review'])),
    handleRouletteBet: async () => {},
    postMessage: async (msg) => posted.push(msg),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(reviewCalls, [{
    currentSong: {
      songId: 'song-1',
      trackName: 'Track',
      artistName: 'Artist',
      albumName: 'Album'
    },
    rating: 7.5,
    userId: 'user-7'
  }])
  assert.deepEqual(posted, [{
    room: 'room-1',
    message: '@reviewer thanks! Your 7.5/10 song review has been saved.'
  }])
})

test('dispatchWithRegistry returns false when no handler exists', async () => {
  const recorder = createRecorder()

  const handled = await dispatchWithRegistry({
    txt: '/missing',
    payload: { sender: 'user-1', message: '/missing' },
    room: 'room-1',
    registry: {},
    resolveDispatchCommand: (txt) => resolveDispatchCommand(txt, new Set()),
    handleRouletteBet: recorder.fn,
    postMessage: recorder.fn,
    logger: { error () {} }
  })

  assert.equal(handled, false)
  assert.equal(recorder.calls.length, 0)
})
