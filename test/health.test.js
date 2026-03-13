import test from 'node:test'
import assert from 'node:assert/strict'

import { getHealthStatus } from '../src/runtime/health.js'

test('getHealthStatus reports unhealthy when the database fallback stub is active', () => {
  const status = getHealthStatus({
    db: { available: false },
    connected: true,
    uptime: 123,
    startupGraceSeconds: 60
  })

  assert.deepEqual(status, {
    ok: false,
    db: false,
    connected: true,
    uptime: 123,
    startupGraceSeconds: 60
  })
})

test('getHealthStatus reports healthy during startup grace even before chat connectivity is ready', () => {
  const status = getHealthStatus({
    db: { available: true },
    connected: false,
    uptime: 15,
    startupGraceSeconds: 60
  })

  assert.deepEqual(status, {
    ok: true,
    db: true,
    connected: false,
    uptime: 15,
    startupGraceSeconds: 60
  })
})

test('getHealthStatus reports unhealthy after startup grace if chat connectivity is down', () => {
  const status = getHealthStatus({
    db: { available: true },
    connected: false,
    uptime: 456,
    startupGraceSeconds: 60
  })

  assert.deepEqual(status, {
    ok: false,
    db: true,
    connected: false,
    uptime: 456,
    startupGraceSeconds: 60
  })
})

test('getHealthStatus reports healthy when both db and chat are ready', () => {
  const status = getHealthStatus({
    db: { available: true },
    connected: true,
    uptime: 456,
    startupGraceSeconds: 60
  })

  assert.deepEqual(status, {
    ok: true,
    db: true,
    connected: true,
    uptime: 456,
    startupGraceSeconds: 60
  })
})
