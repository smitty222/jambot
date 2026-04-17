import test from 'node:test'
import assert from 'node:assert/strict'

import { createPrestigeHandlers } from '../src/handlers/prestigeCommands.js'

test('/allbadges DMs the badge list and acknowledges in room', async () => {
  const posted = []
  const dms = []
  const handlers = createPrestigeHandlers({
    postMessage: async (msg) => posted.push(msg),
    sendDirectMessage: async (...args) => dms.push(args)
  })

  await handlers.allbadges({
    payload: { sender: 'user-1', message: '/allbadges' },
    room: 'room-1'
  })

  assert.equal(dms.length, 1)
  assert.equal(dms[0][0], 'user-1')
  assert.match(dms[0][1], /🏅 All Badges/)
  assert.deepEqual(posted, [{ room: 'room-1', message: 'All Badges sent via DM' }])
})
