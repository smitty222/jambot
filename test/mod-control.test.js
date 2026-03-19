import test from 'node:test'
import assert from 'node:assert/strict'

import { createModControlHandlers } from '../src/handlers/modControlCommands.js'

test('createModControlHandlers toggles March Madness updates for moderators', async () => {
  const posted = []
  let enabled = false
  const handlers = createModControlHandlers({
    postMessage: async (msg) => posted.push(msg),
    isUserAuthorized: async () => true,
    enableMarchMadnessUpdates: () => { enabled = true },
    disableMarchMadnessUpdates: () => { enabled = false },
    isMarchMadnessUpdatesEnabled: () => enabled
  })

  await handlers.madnessupdates({
    payload: { sender: 'mod-1', message: '/madnessupdates on' },
    room: 'room-1',
    ttlUserToken: 'token'
  })
  await handlers.madnessupdates({
    payload: { sender: 'mod-1', message: '/madnessupdates status' },
    room: 'room-1',
    ttlUserToken: 'token'
  })
  await handlers.madnessupdates({
    payload: { sender: 'mod-1', message: '/madnessupdates off' },
    room: 'room-1',
    ttlUserToken: 'token'
  })

  assert.deepEqual(posted, [
    { room: 'room-1', message: 'March Madness live updates enabled.' },
    { room: 'room-1', message: 'March Madness live updates are currently enabled.\nUsage: /madnessupdates <on|off|status>' },
    { room: 'room-1', message: 'March Madness live updates disabled.' }
  ])
})
