import { logger } from '../utils/logging.js'

export async function routeHorseMessage ({
  txt,
  payload,
  handlers,
  log = logger.debug.bind(logger)
}) {
  const {
    isWaitingForEntries,
    isHorseBettingOpen,
    handleHorseEntryAttempt,
    startHorseRace,
    handleHorseBet,
    handleBuyHorse,
    handleSellHorse,
    handleMyHorsesCommand,
    handleHorseHelpCommand,
    handleHorseStatsCommand,
    handleTopHorsesCommand,
    handleHofPlaqueCommand
  } = handlers

  if (isWaitingForEntries() && !txt.startsWith('/')) {
    log('▶ dispatch → entryAttempt')
    await handleHorseEntryAttempt(payload)
    return true
  }

  if (/^\/horserace\b/i.test(txt)) {
    log('▶ dispatch → startHorseRace')
    startHorseRace().catch(err => logger.error('[horseRoute] startHorseRace failed', { err: err?.message || err }))
    return true
  }

  if (/^\/(?:horse|place|show|exacta|trifecta)\b/i.test(txt)) {
    if (!isHorseBettingOpen()) return false
    log('▶ dispatch → handleHorseBet')
    await handleHorseBet(payload)
    return true
  }

  if (/^\/buyhorse\b/i.test(txt)) {
    await handleBuyHorse(payload)
    return true
  }

  if (/^\/sellhorse\b/i.test(txt) || /^\/sell\s+horse\b/i.test(txt)) {
    await handleSellHorse(payload)
    return true
  }

  if (/^\/myhorses\b/i.test(txt)) {
    await handleMyHorsesCommand(payload)
    return true
  }

  if (/^\/horsehelp\b/i.test(txt) || /^\/horserules\b/i.test(txt) || /^\/horseinfo\b/i.test(txt)) {
    await handleHorseHelpCommand(payload)
    return true
  }

  if (/^\/horsestats\b/i.test(txt) || /^\/horsedetails\b/i.test(txt)) {
    await handleHorseStatsCommand(payload)
    return true
  }

  if (/^\/tophorses\b/i.test(txt)) {
    await handleTopHorsesCommand(payload)
    return true
  }

  if (/^\/hof\b/i.test(txt)) {
    await handleHofPlaqueCommand(payload)
    return true
  }

  return false
}
