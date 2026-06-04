import { captureException } from '../utils/errorReporter.js'

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

  logger?.info?.(`[Dispatcher] Command received: /${resolved.cmd}${resolved.args ? ' ' + resolved.args : ''}`)

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
  if (!handler) {
    logger?.warn?.(`[Dispatcher] Unknown command: /${resolved.cmd}`)
    return false
  }

  logger?.info?.(`[Dispatcher] Executing /${resolved.cmd}`)
  const t0 = Date.now()
  try {
    await handler({ payload, room, args: resolved.args, ...context })
    logger?.info?.(`[Dispatcher] /${resolved.cmd} completed in ${Date.now() - t0}ms`)
  } catch (err) {
    logger?.error?.(`[Dispatcher] Error executing /${resolved.cmd} after ${Date.now() - t0}ms:`, err?.message || err)
    captureException(err, { command: resolved.cmd, room })
    try {
      await postMessage({ room, message: `⚠️ Error processing /${resolved.cmd}.` })
    } catch {
      /* swallow */
    }
  }

  return true
}
