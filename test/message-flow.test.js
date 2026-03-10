import test from 'node:test'
import assert from 'node:assert/strict'

import {
  maybeHandleDirectMessage,
  maybeHandleGifMessage,
  maybeHandlePing,
  maybeHandleAiMention,
  maybeHandleLotteryFastPath,
  maybeHandleLotteryFallback,
  maybeDispatchCommand
} from '../src/handlers/messageFlow.js'

test('maybeHandleDirectMessage handles only user receiver types', async () => {
  const seen = []

  const handled = await maybeHandleDirectMessage({
    receiverType: 'user',
    payload: { message: '/help', sender: 'user-1' },
    handleDirectMessage: async (payload) => seen.push(payload)
  })

  const skipped = await maybeHandleDirectMessage({
    receiverType: 'group',
    payload: { message: '/help', sender: 'user-1' },
    handleDirectMessage: async (payload) => seen.push(payload)
  })

  assert.equal(handled, true)
  assert.equal(skipped, false)
  assert.deepEqual(seen, [{ message: '/help', sender: 'user-1' }])
})

test('maybeHandleGifMessage logs gif payloads and returns true', async () => {
  const infoCalls = []

  const handled = await maybeHandleGifMessage({
    isGifMessage: true,
    payload: { data: { attachments: [{ extension: 'gif' }] } },
    logger: { info: (...args) => infoCalls.push(args) }
  })

  assert.equal(handled, true)
  assert.equal(infoCalls.length, 1)
})

test('maybeHandlePing posts pong for /ping', async () => {
  const posted = []

  const handled = await maybeHandlePing({
    txt: '/ping',
    room: 'room-1',
    postMessage: async (payload) => posted.push(payload)
  })

  assert.equal(handled, true)
  assert.deepEqual(posted, [{ room: 'room-1', message: 'pong ✅' }])
})

test('maybeHandleAiMention skips slash commands', async () => {
  let called = false

  const handled = await maybeHandleAiMention({
    txt: '/slots 10',
    payload: { message: '/slots 10' },
    room: 'room-1',
    roomBot: {},
    handleAIMention: async () => {
      called = true
      return true
    },
    startRouletteGame: async () => {},
    handleBotRandomAvatarCommand: async () => {},
    logger: { error () {} }
  })

  assert.equal(handled, false)
  assert.equal(called, false)
})

test('maybeHandleLotteryFastPath handles numeric picks and returns true', async () => {
  const seen = []

  const handled = await maybeHandleLotteryFastPath({
    txt: '42',
    payload: { message: '42', sender: 'user-1' },
    lotteryGameActive: true,
    handleLotteryNumber: async (payload) => seen.push(payload),
    logger: { error () {} }
  })

  assert.equal(handled, true)
  assert.deepEqual(seen, [{ message: '42', sender: 'user-1' }])
})

test('maybeHandleLotteryFallback ignores slash commands and inactive rounds', async () => {
  let called = false

  const slashHandled = await maybeHandleLotteryFallback({
    txt: '/lottery',
    payload: { message: '/lottery' },
    lotteryGameActive: true,
    handleLotteryNumber: async () => { called = true }
  })

  const inactiveHandled = await maybeHandleLotteryFallback({
    txt: '77',
    payload: { message: '77' },
    lotteryGameActive: false,
    handleLotteryNumber: async () => { called = true }
  })

  assert.equal(slashHandled, false)
  assert.equal(inactiveHandled, false)
  assert.equal(called, false)
})

test('maybeDispatchCommand returns dispatcher result and swallows errors', async () => {
  const success = await maybeDispatchCommand({
    txt: '/slots 10',
    payload: { message: '/slots 10' },
    room: 'room-1',
    state: { a: 1 },
    roomBot: { b: 2 },
    queueManager: { c: 3 },
    dispatchCommand: async () => true,
    logger: { error () {} }
  })

  let errorLogged = false
  const failure = await maybeDispatchCommand({
    txt: '/slots 10',
    payload: { message: '/slots 10' },
    room: 'room-1',
    state: {},
    roomBot: {},
    queueManager: {},
    dispatchCommand: async () => {
      throw new Error('boom')
    },
    logger: {
      error () {
        errorLogged = true
      }
    }
  })

  assert.equal(success, true)
  assert.equal(failure, false)
  assert.equal(errorLogged, true)
})
