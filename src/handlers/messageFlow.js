import { logger } from '../utils/logging.js'

export async function maybeHandleDirectMessage ({
  receiverType,
  payload,
  handleDirectMessage,
  logError = (...args) => logger.error(...args)
}) {
  if (receiverType !== 'user') return false

  try {
    await handleDirectMessage(payload)
  } catch (err) {
    logError('DM handler error:', err)
  }

  return true
}

export async function maybeHandleGifMessage ({
  isGifMessage,
  payload,
  logger
}) {
  if (!isGifMessage) return false

  logger.info('Received a GIF message:', payload?.message ?? payload?.data)
  return true
}

export async function maybeHandlePing ({
  txt,
  room,
  postMessage
}) {
  if (!/^\/ping\b/i.test(txt)) return false

  await postMessage({ room, message: 'pong ✅' })
  return true
}

export async function maybeHandleAiMention ({
  txt,
  payload,
  room,
  roomBot,
  handleAIMention,
  startRouletteGame,
  handleBotRandomAvatarCommand,
  logger
}) {
  if (txt.startsWith('/')) return false

  return handleAIMention({
    payload,
    room,
    roomBot,
    startRouletteGame,
    handleBotRandomAvatarCommand,
    logger
  })
}

export async function maybeHandleLotteryFastPath ({
  txt,
  payload,
  lotteryGameActive,
  handleLotteryNumber,
  logger
}) {
  try {
    if (lotteryGameActive && /^\d{1,3}$/.test(txt.trim())) {
      await handleLotteryNumber(payload)
      return true
    }
  } catch (err) {
    logger.error('Error in lottery fast path:', err?.message || err)
  }

  return false
}

export async function maybeHandleLotteryFallback ({
  txt,
  payload,
  lotteryGameActive,
  handleLotteryNumber
}) {
  if (txt.startsWith('/') || !lotteryGameActive) return false

  await handleLotteryNumber(payload)
  return true
}

export async function maybeDispatchCommand ({
  txt,
  payload,
  room,
  state,
  roomBot,
  queueManager,
  dispatchCommand,
  logger
}) {
  try {
    return await dispatchCommand(txt, payload, room, { state, roomBot, queueManager })
  } catch (e) {
    logger.error('[Dispatcher] Error dispatching command:', e?.message || e)
    return false
  }
}
