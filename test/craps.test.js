import test from 'node:test'
import assert from 'node:assert/strict'

import { PHASES } from '../src/games/craps/crapsState.js'
import { crapsTestables } from '../src/games/craps/craps.single.js'

test.afterEach(() => {
  crapsTestables.resetForTests()
})

test('PHASES exposes only active craps phases', () => {
  assert.deepEqual(PHASES, {
    IDLE: 'idle',
    JOIN: 'join',
    BETTING: 'betting',
    COME_OUT: 'come_out',
    POINT: 'point'
  })
})

test('placeProfit pays exact fractional odds rounded to cents', () => {
  assert.equal(crapsTestables.placeProfit(4, 5), 9)
  assert.equal(crapsTestables.placeProfit(5, 5), 7)
  assert.equal(crapsTestables.placeProfit(6, 5), 5.83)
  assert.equal(crapsTestables.placeProfit(8, 12), 14)
  assert.equal(crapsTestables.placeProfit(10, 2.5), 4.5)
})

test('oddsProfit pays true odds for line and come odds', () => {
  assert.equal(crapsTestables.oddsProfit('pass', 4, 10), 20)
  assert.equal(crapsTestables.oddsProfit('pass', 5, 10), 15)
  assert.equal(crapsTestables.oddsProfit('pass', 6, 10), 12)
  assert.equal(crapsTestables.oddsProfit('dont', 4, 10), 5)
  assert.equal(crapsTestables.oddsProfit('dontcome', 6, 12), 10)
})

test('withCrapsRoomLock serializes work for the same room', async () => {
  const events = []

  const first = crapsTestables.withCrapsRoomLock('room-a', async () => {
    events.push('first:start')
    await new Promise(resolve => setTimeout(resolve, 20))
    events.push('first:end')
  })

  const second = crapsTestables.withCrapsRoomLock('room-a', async () => {
    events.push('second:start')
    events.push('second:end')
  })

  await Promise.all([first, second])

  assert.deepEqual(events, [
    'first:start',
    'first:end',
    'second:start',
    'second:end'
  ])
})

test('withCrapsRoomLock allows different rooms to proceed independently', async () => {
  const events = []

  await Promise.all([
    crapsTestables.withCrapsRoomLock('room-a', async () => {
      events.push('a:start')
      await new Promise(resolve => setTimeout(resolve, 20))
      events.push('a:end')
    }),
    crapsTestables.withCrapsRoomLock('room-b', async () => {
      events.push('b:start')
      events.push('b:end')
    })
  ])

  assert.equal(events[0], 'a:start')
  assert.ok(events.includes('b:start'))
  assert.ok(events.includes('b:end'))
  assert.equal(events.at(-1), 'a:end')
})

test('freshState starts with no table users or active bets', () => {
  const state = crapsTestables.freshState()

  assert.equal(state.phase, PHASES.IDLE)
  assert.deepEqual(state.tableUsers, [])
  assert.equal(state.point, null)
  assert.equal(state.rollCount, 0)
  assert.equal(state.pointsMade, 0)
  assert.equal(state.rules.autoRestart, true)
  assert.deepEqual(Object.keys(state.pass), [])
  assert.deepEqual(Object.keys(state.dontPass), [])
  assert.deepEqual(Object.keys(state.passOdds), [])
  assert.deepEqual(Object.keys(state.dontPassOdds), [])
  assert.deepEqual(state.comeWaiting, [])
  assert.deepEqual(state.dontComeWaiting, [])
  assert.deepEqual(state.comePoint, [])
  assert.deepEqual(state.dontComePoint, [])
  assert.deepEqual(Object.keys(state.place[4]), [])
  assert.deepEqual(Object.keys(state.place[10]), [])
})

test('validatePlaceAmount respects the strict-place-units room rule', () => {
  const state = crapsTestables.freshState()

  assert.equal(crapsTestables.validatePlaceAmount(state, 6, 7), true)

  state.rules.strictPlaceUnits = true
  assert.equal(crapsTestables.validatePlaceAmount(state, 6, 12), true)
  assert.equal(crapsTestables.validatePlaceAmount(state, 6, 10), false)
  assert.equal(crapsTestables.validatePlaceAmount(state, 5, 15), true)
  assert.equal(crapsTestables.validatePlaceAmount(state, 5, 12), false)
})
