import test from 'node:test'
import assert from 'node:assert'
import { buildUrl } from '../src/utils/networking.js'

test('buildUrl is a function', () => {
  assert.strictEqual(typeof buildUrl, 'function')
})