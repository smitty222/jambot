import test from 'node:test'
import assert from 'node:assert/strict'

import { getHealthStatus } from '../src/runtime/health.js'

test('getHealthStatus reports unhealthy when the database fallback stub is active', () => {
  const status = getHealthStatus({
    db: { available: false },
    connected: true,
    uptime: 123
  })

  assert.deepEqual(status, {
    ok: false,
    connected: true,
    uptime: 123
  })
})

test('getHealthStatus reports healthy only when the database is available', () => {
  const status = getHealthStatus({
    db: { available: true },
    connected: false,
    uptime: 456
  })

  assert.deepEqual(status, {
    ok: true,
    connected: false,
    uptime: 456
  })
})
