// src/utils/messageNormalizer.js
//
// Shared utility for normalizing openchat API responses. Consolidates the
// duplicate normalization logic that previously lived in both openchat.js
// and bot.js into a single authoritative implementation.

function toSec (ts) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return 0
  return n > 2e10 ? Math.floor(n / 1000) : Math.floor(n)
}

export const getUid = (x) => {
  if (!x) return null
  if (typeof x === 'string') return x
  return x.uid || x.id || x.user?.uid || x.user || null
}

const getSentAt = (m) => {
  const c =
    m?.sentAt ??
    m?.sent_at ??
    m?.timestamp ??
    m?.sent_at_ms ??
    m?.data?.sentAt ??
    m?.data?.sent_at ??
    0
  return toSec(c)
}

const isMsg = (m) => !!(m && (m.id || m._id || m.guid || m.messageId))

/**
 * Extract a raw messages array from the many response shapes openchat returns.
 * Handles nested envelopes like { data: { data: [...] } }, flat arrays, and
 * single-message objects.
 */
export function toMessageArray (raw) {
  if (!raw) return []
  const body = (raw && typeof raw === 'object' && 'data' in raw && !Array.isArray(raw.data))
    ? raw.data
    : raw
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.data?.data)) return body.data.data
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.messages)) return body.messages
  if (Array.isArray(body?.items)) return body.items
  if (Array.isArray(body?.results)) return body.results
  if (Array.isArray(body?.data?.messages)) return body.data.messages
  if (Array.isArray(body?.data?.items)) return body.data.items
  if (Array.isArray(body?.result?.messages)) return body.result.messages
  if (typeof body === 'object' && (body.id || body.message || body.text)) return [body]
  return []
}

/**
 * Normalize an API response into a clean array of message objects.
 * Each message is guaranteed to have: id, sender, receiver, text, sentAtSec, conversationId.
 */
export function normalizeMessages (raw) {
  return toMessageArray(raw)
    .filter(isMsg)
    .map((m) => {
      const rawId = m.id ?? m._id ?? m.guid ?? m.messageId
      const id = rawId != null ? String(rawId) : null
      const sender = getUid(m.sender) ?? getUid(m.sender?.uid) ?? m.sender ?? null
      const receiver = getUid(m.receiver) ?? m.receiver ?? null
      const textRaw = m?.data?.text ?? m?.text ?? m?.message ?? ''
      const text = typeof textRaw === 'string' ? textRaw.trim() : ''
      return {
        id,
        sender,
        receiver,
        text,
        sentAtSec: getSentAt(m) || 0,
        conversationId: m.conversationId || m.conversation_id || null
      }
    })
}
