import test from 'node:test'
import assert from 'node:assert/strict'

const REQUIRED_KEYS = [
  'CHAT_API_KEY',
  'CHAT_TOKEN',
  'CHAT_USER_ID',
  'ROOM_UUID',
  'TTL_USER_TOKEN',
  'JAMBOT_DISABLE_FLY_ENV'
]

function snapshotEnv () {
  return Object.fromEntries(REQUIRED_KEYS.map((key) => [key, process.env[key]]))
}

function restoreEnv (snapshot) {
  for (const key of REQUIRED_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = snapshot[key]
    }
  }
}

test('config import stays safe without required env vars, but validateConfig throws', async () => {
  const snapshot = snapshotEnv()
  for (const key of REQUIRED_KEYS) process.env[key] = ''
  process.env.JAMBOT_DISABLE_FLY_ENV = '1'

  try {
    const mod = await import(`../src/config.js?case=missing-${Date.now()}`)

    assert.equal(mod.env.chatApiKey, undefined)
    assert.throws(() => mod.validateConfig(), /required env vars CHAT_API_KEY, CHAT_TOKEN, CHAT_USER_ID, ROOM_UUID, TTL_USER_TOKEN are not set/)
  } finally {
    restoreEnv(snapshot)
  }
})
