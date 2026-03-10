import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeIncomingMessage } from '../src/handlers/messagePayload.js'

test('normalizeIncomingMessage preserves normalized string payloads', () => {
  const payload = {
    message: '/ping',
    sender: 'user-1',
    receiverType: 'group'
  }

  const normalized = normalizeIncomingMessage(payload)

  assert.equal(normalized.receiverType, 'group')
  assert.equal(normalized.text, '/ping')
  assert.equal(normalized.normalizedPayload, payload)
  assert.equal(normalized.isGifMessage, false)
})

test('normalizeIncomingMessage maps CometChat-style text payloads to a string message', () => {
  const payload = {
    sender: 'user-2',
    receiver_type: 'GROUP',
    data: {
      text: '  /buyhorse  ',
      type: 'text'
    }
  }

  const normalized = normalizeIncomingMessage(payload)

  assert.equal(normalized.receiverType, 'group')
  assert.equal(normalized.text, '/buyhorse')
  assert.notEqual(normalized.normalizedPayload, payload)
  assert.equal(normalized.normalizedPayload.message, '/buyhorse')
  assert.equal(normalized.isGifMessage, false)
})

test('normalizeIncomingMessage recognizes ChatGif messages without text', () => {
  const normalized = normalizeIncomingMessage({
    receiverType: 'group',
    message: { type: 'ChatGif' }
  })

  assert.equal(normalized.text, '')
  assert.equal(normalized.isGifMessage, true)
})

test('normalizeIncomingMessage recognizes gif attachments from metadata', () => {
  const normalized = normalizeIncomingMessage({
    receiverType: 'group',
    data: {
      attachments: [
        { mimeType: 'image/gif', extension: 'gif' }
      ]
    }
  })

  assert.equal(normalized.isGifMessage, true)
  assert.equal(normalized.normalizedPayload.message, '')
})
