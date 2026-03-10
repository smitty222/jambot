export function normalizeIncomingMessage (payload) {
  const receiverType = String(
    payload?.receiverType ?? payload?.receiver_type ?? ''
  ).toLowerCase()

  const text = String(
    typeof payload?.message === 'string'
      ? payload.message
      : (payload?.data?.text ?? payload?.text ?? '')
  ).trim()

  const normalizedPayload = typeof payload?.message === 'string'
    ? payload
    : { ...payload, message: text }

  const messageType = String(payload?.message?.type ?? payload?.data?.type ?? '')
  const hasGifAttachment = Array.isArray(payload?.data?.attachments) &&
    payload.data.attachments.some((attachment) => {
      const mimeType = String(attachment?.mimeType ?? '').toLowerCase()
      const extension = String(attachment?.extension ?? '').toLowerCase()
      return mimeType === 'image/gif' || extension === 'gif'
    })

  return {
    receiverType,
    text,
    normalizedPayload,
    isGifMessage: messageType === 'ChatGif' || hasGifAttachment
  }
}
