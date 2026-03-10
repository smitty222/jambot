import { logger } from '../utils/logging.js'

export async function routeF1Message ({
  txt,
  payload,
  handlers,
  log = logger.debug.bind(logger)
}) {
  const {
    startF1Race,
    startDragRace,
    handleBuyCar,
    handleMyCars,
    handleCarStats,
    handleF1Stats,
    handleF1Leaderboard,
    handleWearCommand,
    handleCarPics,
    handleCarShow,
    handleRepairCar,
    handleRenameCar,
    handleSellCar,
    handleTeamCommand,
    handleF1Help,
    handleBetCommand,
    handleCarEntryAttempt
  } = handlers

  if (/^\/(gp|f1)\s+start\b/i.test(txt)) {
    const mode = (txt.match(/^\/(?:gp|f1)\s+start(?:\s+(\w+))?\b/i) || [])[1] || 'open'
    log('▶ dispatch → startF1Race')
    startF1Race(mode).catch(err => logger.error('[f1Route] startF1Race failed', { err: err?.message || err, mode }))
    return true
  }

  if (/^\/drag\s+start\b/i.test(txt)) {
    const tier = (txt.match(/^\/drag\s+start(?:\s+(\w+))?\b/i) || [])[1] || 'starter'
    log('▶ dispatch → startDragRace')
    startDragRace(tier).catch(err => logger.error('[f1Route] startDragRace failed', { err: err?.message || err, tier }))
    return true
  }

  if (/^\/buycar\b/i.test(txt) || /^\/buy\s+car\b/i.test(txt)) {
    await handleBuyCar(payload)
    return true
  }

  if (/^\/mycars\b/i.test(txt)) {
    await handleMyCars(payload)
    return true
  }

  if (/^\/carstats\b/i.test(txt) || /^\/car\s+stats\b/i.test(txt)) {
    await handleCarStats(payload)
    return true
  }

  if (/^\/f1stats\b/i.test(txt) || /^\/(f1|gp)\s+stats\b/i.test(txt)) {
    await handleF1Stats(payload)
    return true
  }

  if (/^\/f1leaderboard\b/i.test(txt) || /^\/(f1|gp)\s+leaderboard\b/i.test(txt)) {
    await handleF1Leaderboard(payload)
    return true
  }

  if (/^\/wear\b/i.test(txt)) {
    await handleWearCommand(payload)
    return true
  }

  if (/^\/carpics\b/i.test(txt) || /^\/car\s+pics\b/i.test(txt)) {
    await handleCarPics(payload)
    return true
  }

  if (/^\/car\s+/i.test(txt)) {
    await handleCarShow(payload)
    return true
  }

  if (/^\/repair\s+/i.test(txt)) {
    await handleRepairCar(payload)
    return true
  }

  if (/^\/renamecar\b/i.test(txt) || /^\/carrename\b/i.test(txt) || /^\/rename\s+car\b/i.test(txt)) {
    await handleRenameCar(payload)
    return true
  }

  if (/^\/sellcar\b/i.test(txt) || /^\/sell\s+car\b/i.test(txt)) {
    await handleSellCar(payload)
    return true
  }

  if (/^\/team\b/i.test(txt)) {
    await handleTeamCommand(payload)
    return true
  }

  if (/^\/(f1help|gphelp)\b/i.test(txt) || /^\/(f1|gp)\s+help\b/i.test(txt)) {
    await handleF1Help(payload)
    return true
  }

  if (/^\/bet\s*\d+\s+\d+/i.test(txt)) {
    log('▶ dispatch → handleBetCommand')
    await handleBetCommand(payload)
    return true
  }

  if (!txt.startsWith('/')) {
    await handleCarEntryAttempt(payload)
  }

  return false
}
