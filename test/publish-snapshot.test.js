import test from 'node:test'
import assert from 'node:assert/strict'

function createFakeDb () {
  return {
    prepare (sql) {
      if (sql.includes('sqlite_master')) {
        return {
          all () {
            return [{ name: 'users' }]
          }
        }
      }

      if (sql.includes('SELECT * FROM "users"')) {
        return {
          all () {
            return [{ uuid: 'u1', nickname: 'Allen' }]
          }
        }
      }

      throw new Error(`Unexpected SQL: ${sql}`)
    }
  }
}

test('publishDbSnapshot publishes through /api/publishDb as a private table', async () => {
  const { publishDbSnapshot } = await import(`../tools/publishSnapshot.js?test=${Date.now()}`)
  const calls = []

  await publishDbSnapshot({
    db: createFakeDb(),
    havePublishConfig: () => true,
    logger: { log () {}, warn () {} },
    postJson: async (pathname, payload) => {
      calls.push({ pathname, payload })
      return { ok: true }
    }
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].pathname, '/api/publishDb')
  assert.deepEqual(calls[0].payload, {
    tables: {
      db_raw_snapshot: {
        users: [{ uuid: 'u1', nickname: 'Allen' }]
      }
    },
    privateOnly: ['db_raw_snapshot']
  })
})
