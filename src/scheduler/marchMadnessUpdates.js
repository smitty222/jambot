import cron from 'node-cron'
import { env } from '../config.js'
import { logger as defaultLogger } from '../utils/logging.js'
import { postMessage } from '../libs/cometchat.js'
import {
  getMarchMadnessLiveScores,
  getMarchMadnessTournamentAliasSet
} from '../utils/API.js'
import { getGenericDisplayTeamCode } from '../utils/sportsTeams.js'
import db from '../database/db.js'
import { getOddsForSport, saveOddsForSport } from '../utils/bettingOdds.js'
import { fetchOddsForSport } from '../utils/sportsBetAPI.js'
import { filterMarchMadnessOddsGames } from '../utils/marchMadness.js'

const NO_LIVE_GAMES_MESSAGE = 'No live NCAAB games right now.'
const KEY_ENABLED = 'march_madness_updates_enabled'
const KEY_PICK_REMINDERS = 'march_madness_pick_reminders'

try {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run()
} catch (e) {
  console.error('[march-madness-updates] Failed to ensure app_settings table:', e)
}

function readSetting (key) {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)
    return row ? row.value : null
  } catch (e) {
    console.error('[march-madness-updates] readSetting error:', e)
    return null
  }
}

function writeSetting (key, value) {
  try {
    db.prepare(
      'INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
    ).run(key, String(value))
  } catch (e) {
    console.error('[march-madness-updates] writeSetting error:', e)
  }
}

export function enableMarchMadnessUpdates () {
  writeSetting(KEY_ENABLED, '1')
}

export function disableMarchMadnessUpdates () {
  writeSetting(KEY_ENABLED, '0')
}

export function isMarchMadnessUpdatesEnabled () {
  const persisted = readSetting(KEY_ENABLED)
  if (persisted === '1') return true
  if (persisted === '0') return false
  return env.marchMadnessUpdatesEnabled !== '0'
}

function readJsonSetting (key, fallback) {
  const raw = readSetting(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function writeJsonSetting (key, value) {
  writeSetting(key, JSON.stringify(value))
}

function formatTimeUntilTip (commenceTime, now = new Date()) {
  const tipTs = Date.parse(commenceTime || '')
  const nowTs = now.getTime()
  const minutes = Math.max(0, Math.round((tipTs - nowTs) / 60000))

  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`
}

function formatTipoffTimeEt (commenceTime, timeZone = 'America/New_York') {
  const tip = new Date(commenceTime || '')
  if (Number.isNaN(tip.getTime())) return 'TBD ET'
  return `${tip.toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit'
  })} ET`
}

export function selectMarchMadnessPickReminderGames (games = [], now = new Date(), leadMinutes = 30, remindedGameIds = []) {
  const nowTs = now.getTime()
  const leadMs = Math.max(1, Math.floor(Number(leadMinutes || 30))) * 60 * 1000
  const reminded = new Set((remindedGameIds || []).map(String))

  return (games || [])
    .filter((game) => {
      const gameId = String(game?.id || '')
      const tipTs = Date.parse(game?.commenceTime || '')
      return gameId &&
        Number.isFinite(tipTs) &&
        tipTs > nowTs &&
        tipTs <= (nowTs + leadMs) &&
        !reminded.has(gameId)
    })
    .sort((a, b) => Date.parse(a?.commenceTime || '') - Date.parse(b?.commenceTime || ''))
}

export function buildMarchMadnessPickReminderMessage (games = [], now = new Date(), timeZone = 'America/New_York') {
  const upcoming = (games || []).slice(0, 3)
  if (!upcoming.length) return ''

  const lines = upcoming.map((game, index) => {
    const tipText = formatTimeUntilTip(game?.commenceTime, now)
    const tipClock = formatTipoffTimeEt(game?.commenceTime, timeZone)
    const awayCode = getGenericDisplayTeamCode(game?.awayTeam)
    const homeCode = getGenericDisplayTeamCode(game?.homeTeam)
    return `${index + 1}. ${awayCode} vs ${homeCode} • ${tipClock} • starts in ${tipText}`
  })

  const moreCount = Math.max(0, (games?.length || 0) - upcoming.length)
  const moreLine = moreCount > 0 ? `+ ${moreCount} more game${moreCount === 1 ? '' : 's'} coming up soon` : null

  return [
    '📝 March Madness picks reminder',
    'Games are about to tip. Get your winners in with `/madness pick <gameIndex> <teamCode>`.',
    '',
    ...lines,
    ...(moreLine ? ['', moreLine] : [])
  ].join('\n')
}

async function loadUpcomingMarchMadnessGames ({
  getOddsForSport: getOddsForSportImpl = getOddsForSport,
  fetchOddsForSport: fetchOddsForSportImpl = fetchOddsForSport,
  saveOddsForSport: saveOddsForSportImpl = saveOddsForSport,
  getMarchMadnessTournamentAliasSet: getMarchMadnessTournamentAliasSetImpl = getMarchMadnessTournamentAliasSet
} = {}) {
  const tournamentAliases = await getMarchMadnessTournamentAliasSetImpl(['yesterday', 'today', 'tomorrow'])
  let games = await getOddsForSportImpl('basketball_ncaab')
  if (Array.isArray(games) && games.length) return filterMarchMadnessOddsGames(games, tournamentAliases)

  const freshGames = await fetchOddsForSportImpl('basketball_ncaab')
  if (Array.isArray(freshGames) && freshGames.length) {
    await saveOddsForSportImpl('basketball_ncaab', freshGames)
    games = freshGames
  }

  return Array.isArray(games) ? filterMarchMadnessOddsGames(games, tournamentAliases) : []
}

export function extractMarchMadnessUpsetAlerts (message = '') {
  const text = String(message || '')
  const alerts = []
  const linePattern = /^• \((\d+)\)\s+(.+?)\s+(\d+)\s+vs\s+\((\d+)\)\s+(.+?)\s+(\d+)$/gm

  for (const match of text.matchAll(linePattern)) {
    const awaySeed = Number.parseInt(match[1], 10)
    const awayTeam = String(match[2] || '').trim()
    const awayScore = Number.parseInt(match[3], 10)
    const homeSeed = Number.parseInt(match[4], 10)
    const homeTeam = String(match[5] || '').trim()
    const homeScore = Number.parseInt(match[6], 10)

    if (!Number.isFinite(awaySeed) || !Number.isFinite(homeSeed)) continue
    if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore) || awayScore === homeScore) continue

    if (awaySeed > homeSeed && awayScore > homeScore) {
      alerts.push(`🚨 Upset Alert: (${awaySeed}) ${awayTeam} is leading (${homeSeed}) ${homeTeam}.`)
      continue
    }

    if (homeSeed > awaySeed && homeScore > awayScore) {
      alerts.push(`🚨 Upset Alert: (${homeSeed}) ${homeTeam} is leading (${awaySeed}) ${awayTeam}.`)
    }
  }

  return alerts
}

export function decorateMarchMadnessUpdateMessage (message = '') {
  const trimmed = String(message || '').trim()
  if (!trimmed || trimmed === NO_LIVE_GAMES_MESSAGE) return trimmed

  const alerts = extractMarchMadnessUpsetAlerts(trimmed)
  if (!alerts.length) return trimmed

  return `${alerts.join('\n')}\n\n${trimmed}`
}

export function createMarchMadnessUpdateRunner (deps = {}) {
  const {
    logger = defaultLogger,
    room = env.roomUuid,
    postMessage: postMessageImpl = postMessage,
    getMarchMadnessLiveScores: getMarchMadnessLiveScoresImpl = getMarchMadnessLiveScores,
    isMarchMadnessUpdatesEnabled: isMarchMadnessUpdatesEnabledImpl = isMarchMadnessUpdatesEnabled,
    loadUpcomingMarchMadnessGames: loadUpcomingMarchMadnessGamesImpl = loadUpcomingMarchMadnessGames,
    leadMinutes = 30,
    now: nowImpl = () => new Date()
  } = deps

  let running = false
  let lastPostedSnapshot = ''

  return async function runMarchMadnessUpdates () {
    if (running) {
      logger.info('[march-madness-updates] skipped (already running)')
      return
    }

    if (!room) {
      logger.info('[march-madness-updates] skipped (room not configured)')
      return
    }

    if (!isMarchMadnessUpdatesEnabledImpl()) {
      logger.info('[march-madness-updates] skipped (disabled)')
      return
    }

    running = true
    try {
      const now = nowImpl()
      const upcomingGames = await loadUpcomingMarchMadnessGamesImpl(deps)
      const reminderState = readJsonSetting(KEY_PICK_REMINDERS, {})
      const activeReminderIds = Object.entries(reminderState)
        .filter(([, tipTs]) => Number.isFinite(Number(tipTs)) && Number(tipTs) > now.getTime())
        .map(([gameId]) => gameId)
      const reminderCandidates = selectMarchMadnessPickReminderGames(upcomingGames, now, leadMinutes, activeReminderIds)

      if (reminderCandidates.length) {
        const reminderMessage = buildMarchMadnessPickReminderMessage(reminderCandidates, now)
        await postMessageImpl({ room, message: reminderMessage })
        const nextState = { ...reminderState }
        for (const game of reminderCandidates) {
          nextState[String(game.id)] = Date.parse(game.commenceTime || '') || now.getTime()
        }
        writeJsonSetting(KEY_PICK_REMINDERS, nextState)
        logger.info('[march-madness-updates] posted picks reminder')
      }

      const rawMessage = String(await getMarchMadnessLiveScoresImpl('today') || '').trim()
      if (!rawMessage || rawMessage === NO_LIVE_GAMES_MESSAGE) {
        lastPostedSnapshot = ''
        logger.info('[march-madness-updates] no live games')
        return
      }

      const message = decorateMarchMadnessUpdateMessage(rawMessage)

      if (message === lastPostedSnapshot) {
        logger.info('[march-madness-updates] skipped (no score change)')
        return
      }

      await postMessageImpl({ room, message })
      lastPostedSnapshot = message
      logger.info('[march-madness-updates] posted update')
    } catch (err) {
      logger.error('[march-madness-updates] failed', { err: err?.message || err })
    } finally {
      running = false
    }
  }
}

export function startMarchMadnessUpdatesCron (deps = {}) {
  const {
    cronModule = cron,
    logger = defaultLogger,
    marchMadnessUpdatesCron = env.marchMadnessUpdatesCron,
    marchMadnessUpdatesTz = env.marchMadnessUpdatesTz,
    marchMadnessUpdatesRunOnBoot = env.marchMadnessUpdatesRunOnBoot === '1',
    run = createMarchMadnessUpdateRunner({ logger, ...deps })
  } = deps

  cronModule.schedule(marchMadnessUpdatesCron, run, { timezone: marchMadnessUpdatesTz })
  logger.info(`[march-madness-updates] scheduled "${marchMadnessUpdatesCron}" (TZ=${marchMadnessUpdatesTz})`)

  if (marchMadnessUpdatesRunOnBoot) {
    run().catch((err) => {
      logger.error('[march-madness-updates] run-on-boot failed', { err: err?.message || err })
    })
  }

  return run
}
