import test from 'node:test'
import assert from 'node:assert/strict'

import { routeHorseMessage } from '../src/handlers/horseMessageRoutes.js'
import { routeCrapsChatMessage } from '../src/handlers/crapsMessageRoutes.js'
import { routeF1Message } from '../src/handlers/f1MessageRoutes.js'

function createAsyncRecorder () {
  const calls = []
  return {
    calls,
    fn: async (...args) => {
      calls.push(args)
    }
  }
}

test('routeHorseMessage captures non-slash entries during the waiting window', async () => {
  const entryRecorder = createAsyncRecorder()

  const handled = await routeHorseMessage({
    txt: 'midnight thunder',
    payload: { message: 'midnight thunder', sender: 'user-1' },
    handlers: {
      isWaitingForEntries: () => true,
      handleHorseEntryAttempt: entryRecorder.fn,
      startHorseRace: async () => {},
      handleHorseBet: async () => {},
      handleBuyHorse: async () => {},
      handleSellHorse: async () => {},
      handleMyHorsesCommand: async () => {},
      handleHorseHelpCommand: async () => {},
      handleHorseStatsCommand: async () => {},
      handleTopHorsesCommand: async () => {},
      handleHofPlaqueCommand: async () => {}
    },
    log: () => {}
  })

  assert.equal(handled, true)
  assert.deepEqual(entryRecorder.calls, [[{ message: 'midnight thunder', sender: 'user-1' }]])
})

test('routeCrapsChatMessage routes craps slash commands', async () => {
  const routed = []

  const handled = await routeCrapsChatMessage({
    txt: '/roll',
    payload: { message: '/roll', sender: 'user-2' },
    routeCrapsMessage: async (payload) => routed.push(payload),
    log: () => {}
  })

  assert.equal(handled, true)
  assert.deepEqual(routed, [{ message: '/roll', sender: 'user-2' }])
})

test('routeCrapsChatMessage routes new craps bet-management commands', async () => {
  const routed = []

  const handled = await routeCrapsChatMessage({
    txt: '/odds pass 25',
    payload: { message: '/odds pass 25', sender: 'user-2' },
    routeCrapsMessage: async (payload) => routed.push(payload),
    log: () => {}
  })

  assert.equal(handled, true)
  assert.deepEqual(routed, [{ message: '/odds pass 25', sender: 'user-2' }])
})

test('routeHorseMessage does not swallow /place when horse betting is closed', async () => {
  const betRecorder = createAsyncRecorder()

  const handled = await routeHorseMessage({
    txt: '/place 6 25',
    payload: { message: '/place 6 25', sender: 'user-3' },
    handlers: {
      isWaitingForEntries: () => false,
      isHorseBettingOpen: () => false,
      handleHorseEntryAttempt: async () => {},
      startHorseRace: async () => {},
      handleHorseBet: betRecorder.fn,
      handleBuyHorse: async () => {},
      handleSellHorse: async () => {},
      handleMyHorsesCommand: async () => {},
      handleHorseHelpCommand: async () => {},
      handleHorseStatsCommand: async () => {},
      handleTopHorsesCommand: async () => {},
      handleHofPlaqueCommand: async () => {}
    },
    log: () => {}
  })

  assert.equal(handled, false)
  assert.deepEqual(betRecorder.calls, [])
})

test('routeHorseMessage handles /place when horse betting is open', async () => {
  const betRecorder = createAsyncRecorder()

  const handled = await routeHorseMessage({
    txt: '/place 2 25',
    payload: { message: '/place 2 25', sender: 'user-4' },
    handlers: {
      isWaitingForEntries: () => false,
      isHorseBettingOpen: () => true,
      handleHorseEntryAttempt: async () => {},
      startHorseRace: async () => {},
      handleHorseBet: betRecorder.fn,
      handleBuyHorse: async () => {},
      handleSellHorse: async () => {},
      handleMyHorsesCommand: async () => {},
      handleHorseHelpCommand: async () => {},
      handleHorseStatsCommand: async () => {},
      handleTopHorsesCommand: async () => {},
      handleHofPlaqueCommand: async () => {}
    },
    log: () => {}
  })

  assert.equal(handled, true)
  assert.deepEqual(betRecorder.calls, [[{ message: '/place 2 25', sender: 'user-4' }]])
})

test('routeF1Message preserves non-command entry without triggering bet handling', async () => {
  const entryRecorder = createAsyncRecorder()
  const betRecorder = createAsyncRecorder()

  const handled = await routeF1Message({
    txt: 'my car name',
    payload: { message: 'my car name', sender: 'driver-1' },
    handlers: {
      startF1Race: async () => {},
      startDragRace: async () => {},
      handleBuyCar: async () => {},
      handleMyCars: async () => {},
      handleCarStats: async () => {},
      handleF1Stats: async () => {},
      handleF1Leaderboard: async () => {},
      handleWearCommand: async () => {},
      handleCarPics: async () => {},
      handleCarShow: async () => {},
      handleRepairCar: async () => {},
      handleRenameCar: async () => {},
      handleSellCar: async () => {},
      handleTeamCommand: async () => {},
      handleF1Help: async () => {},
      handleBetCommand: betRecorder.fn,
      handleCarEntryAttempt: entryRecorder.fn
    },
    log: () => {}
  })

  assert.equal(handled, false)
  assert.deepEqual(entryRecorder.calls, [[{ message: 'my car name', sender: 'driver-1' }]])
  assert.deepEqual(betRecorder.calls, [])
})
