import { logger } from '../utils/logging.js'

export async function routeCrapsChatMessage ({
  txt,
  payload,
  routeCrapsMessage,
  log = logger.debug.bind(logger)
}) {
  if (
    /^\/craps\b/i.test(txt) ||
    /^\/(roll|pass|dontpass|come|dontcome|place|removeplace|press|take|odds|layodds|working|bets|payouts)\b/i.test(txt) ||
    /^\/join\s+(craps|cr)\b/i.test(txt)
  ) {
    log('▶ dispatch → routeCrapsMessage')
    await routeCrapsMessage(payload)
    return true
  }

  return false
}
