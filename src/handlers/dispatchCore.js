export async function dispatchWithRegistry ({
  txt,
  payload,
  room,
  context = {},
  registry,
  resolveDispatchCommand,
  rouletteGameActive = false,
  handleRouletteBet,
  postMessage,
  logger
}) {
  const resolved = resolveDispatchCommand(txt)
  if (!resolved) return false

  if (/^\d+$/.test(resolved.cmd) && rouletteGameActive) {
    try {
      await handleRouletteBet(payload)
    } catch (err) {
      logger?.error?.('[Dispatcher] Error executing numeric roulette bet:', err?.message || err)
      try {
        await postMessage({ room, message: '⚠️ Error processing roulette bet.' })
      } catch {
        /* ignore */
      }
    }
    return true
  }

  const handler = registry?.[resolved.cmd]
  if (!handler) return false

  try {
    await handler({ payload, room, args: resolved.args, ...context })
  } catch (err) {
    logger?.error?.(`[Dispatcher] Error executing /${resolved.cmd}:`, err?.message || err)
    try {
      await postMessage({ room, message: `⚠️ Error processing /${resolved.cmd}.` })
    } catch {
      /* swallow */
    }
  }

  return true
}
