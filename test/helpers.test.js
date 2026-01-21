import test from 'node:test'
import assert from 'node:assert'
import { parseTipAmount, naturalJoin, splitEvenly } from '../src/utils/helpers.js'

test('parseTipAmount returns NaN for empty input', () => {
  assert.ok(Number.isNaN(parseTipAmount('')))
  assert.ok(Number.isNaN(parseTipAmount(null)))
  assert.ok(Number.isNaN(parseTipAmount(undefined)))
})

test('parseTipAmount parses whole dollar amounts', () => {
  assert.strictEqual(parseTipAmount('5'), 5)
  assert.strictEqual(parseTipAmount('$10'), 10)
  assert.strictEqual(parseTipAmount('tip 20'), 20)
})

test('parseTipAmount parses decimal amounts with at most two places', () => {
  assert.strictEqual(parseTipAmount('3.5'), 3.5)
  assert.strictEqual(parseTipAmount('$4.25'), 4.25)
  // Extra decimals are truncated after two places
  assert.strictEqual(parseTipAmount('7.333'), 7.33)
})

test('parseTipAmount ignores non-numeric characters before the number', () => {
  assert.strictEqual(parseTipAmount('donate $8 now'), 8)
})

test('naturalJoin joins single elements without punctuation', () => {
  assert.strictEqual(naturalJoin(['Alice']), 'Alice')
})

test('naturalJoin joins two elements with and', () => {
  assert.strictEqual(naturalJoin(['Alice', 'Bob']), 'Alice and Bob')
})

test('naturalJoin joins many elements with commas and and', () => {
  assert.strictEqual(naturalJoin(['Alice', 'Bob', 'Charlie']), 'Alice, Bob, and Charlie')
})

test('splitEvenly splits amounts evenly into n parts', () => {
  assert.deepStrictEqual(splitEvenly(10, 2), [5, 5])
  assert.deepStrictEqual(splitEvenly(10, 3), [3.34, 3.33, 3.33])
})
