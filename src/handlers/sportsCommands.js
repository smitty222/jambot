import { postMessage } from '../libs/cometchat.js'
import {
  getMLBScores,
  getNHLScores,
  getNBAScores,
  getNFLScores,
  getNCAABScores
} from '../utils/API.js'
import { fetchOddsForSport, formatOddsMessage, OddsApiError } from '../utils/sportsBetAPI.js'
import { saveOddsForSport, getOddsForSport } from '../utils/bettingOdds.js'
import {
  placeSportsBet,
  resolveCompletedBets,
  getOpenBetsForUser
} from '../utils/sportsBet.js'
import { getUserWallet } from '../database/dbwalletmanager.js'
import { getSenderNickname } from '../utils/helpers.js'
import {
  createMlbScoresCommandHandler as createMlbScoresCommandHandlerBase,
  createSportsScoresCommandHandler
} from './handlerFactories.js'

const SPORT_ALIASES = {
  mlb: 'baseball_mlb',
  nba: 'basketball_nba',
  ncaab: 'basketball_ncaab',
  nfl: 'americanfootball_nfl',
  nhl: 'icehockey_nhl'
}

const SUPPORTED_SPORTS = Object.keys(SPORT_ALIASES)

const SCORE_HANDLERS = {
  mlb: handleMlbScoresCommand,
  nba: handleNbaScoresCommand,
  ncaab: handleNcaabScoresCommand,
  nhl: handleNhlScoresCommand,
  nfl: handleNflScoresCommand
}

function normalizeUserUuid (value = '') {
  const raw = Array.isArray(value) ? value[0] : value
  return String(raw || '').trim()
}

export function parseSportAlias (value = '') {
  const sportAlias = String(value || '').trim().toLowerCase()
  return {
    sportAlias,
    sport: SPORT_ALIASES[sportAlias] || null
  }
}

export function buildSportsInfoMessage (topic = '') {
  const normalizedTopic = String(topic || '').trim().toLowerCase()

  if (normalizedTopic === 'scores') {
    return [
      '🏈 Sports Scores',
      '',
      'Use `/sports scores <sport> [YYYY-MM-DD]`',
      'Examples:',
      '- `/sports scores nba`',
      '- `/sports scores ncaab 2026-03-18`',
      '',
      `Sports: ${SUPPORTED_SPORTS.join(', ')}`,
      'Shortcuts still work: `/mlb`, `/nba`, `/ncaab`, `/nhl`, `/nfl`'
    ].join('\n')
  }

  if (normalizedTopic === 'odds' || normalizedTopic === 'betting' || normalizedTopic === 'bets') {
    return [
      '🎟️ Sports Betting',
      '',
      'Most common:',
      '- `/sports odds nba`',
      '- `/sports bet nba 1 lakers ml 25`',
      '- `/sports bets`',
      '- `/sports bets <@uid:USER>`',
      '- `/sports resolve [sport]`',
      '',
      'Notes:',
      '- `TYPE` can be `ml` or `spread`',
      `- Sports: ${SUPPORTED_SPORTS.join(', ')}`,
      '',
      'Shortcuts still work: `/odds`, `/sportsbet`, `/mybets`, `/openbets`, `/resolvebets`'
    ].join('\n')
  }

  return [
    '🏈 Sports Commands',
    '',
    'Most common:',
    '- `/sports scores nba`',
    '- `/sports odds ncaab`',
    '- `/sports bet nba 1 lakers ml 25`',
    '- `/sports bets`',
    '- `/sports resolve`',
    '- `/sportsbet SPORT INDEX TEAM TYPE AMOUNT`',
    '',
    'More help:',
    '- `/sportsinfo scores`',
    '- `/sportsinfo betting`',
    '',
    `Sports: ${SUPPORTED_SPORTS.join(', ')}`,
    'Shortcuts still work: `/nba`, `/odds nfl`, `/mybets`'
  ].join('\n')
}

export function parseSportsBetArgs (message = '') {
  const args = String(message || '').trim().split(/\s+/)
  if (args.length < 6) {
    return {
      ok: false,
      reason: 'usage'
    }
  }

  const sportAlias = String(args[1] || '').toLowerCase()
  const sport = SPORT_ALIASES[sportAlias]
  if (!sport) {
    return {
      ok: false,
      reason: 'sport'
    }
  }

  const rawIndex = Number.parseInt(args[2], 10)
  const index = rawIndex - 1
  const team = args[3]
  const betType = String(args[4] || '').toLowerCase()
  const amount = Number.parseFloat(args[5])

  if (!Number.isFinite(index) || !team || !Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      reason: 'args'
    }
  }

  return {
    ok: true,
    sportAlias,
    sport,
    index,
    team,
    betType,
    amount
  }
}

function parseUidFromMentionOrRaw (value = '') {
  const trimmed = String(value || '').trim()
  const mentionMatch = /<@uid:([\w-]+)>/i.exec(trimmed)
  if (mentionMatch?.[1]) return mentionMatch[1]
  return /^[\w-]{6,}$/.test(trimmed) ? trimmed : ''
}

function formatSportLabel (sportKey) {
  const labels = {
    baseball_mlb: 'MLB',
    basketball_nba: 'NBA',
    basketball_ncaab: 'NCAAB',
    americanfootball_nfl: 'NFL',
    icehockey_nhl: 'NHL'
  }

  return labels[sportKey] || sportKey
}

function formatOpenBetLine (bet, game) {
  const matchup = game?.awayTeam && game?.homeTeam
    ? `${game.awayTeam} @ ${game.homeTeam}`
    : `Game ${Number(bet.gameIndex || 0) + 1}`
  const spreadLine = String(bet.type || '').toLowerCase() === 'spread' && Number.isFinite(Number(bet.spreadPoint))
    ? ` ${Number(bet.spreadPoint) > 0 ? '+' : ''}${Number(bet.spreadPoint)}`
    : ''

  return [
    `${formatSportLabel(bet.sport)} · ${matchup}`,
    `Pick: ${String(bet.team || '').toUpperCase()} ${String(bet.type || '').toUpperCase()}${spreadLine} at ${bet.odds > 0 ? `+${bet.odds}` : bet.odds}`,
    `Risk: $${Number(bet.amount || 0)}`
  ].join(' | ')
}

export async function handleMlbScoresCommand ({ payload, room }) {
  return createMlbScoresCommandHandler()({ payload, room })
}

export async function handleSportsCommand ({ payload, room }) {
  return createSportsCommandHandler()({ payload, room })
}

export function createSportsCommandHandler (deps = {}) {
  const {
    postMessage: postMessageImpl = postMessage,
    buildSportsInfoMessage: buildSportsInfoMessageImpl = buildSportsInfoMessage,
    scoreHandlers = SCORE_HANDLERS,
    handleOddsCommand: handleOddsCommandImpl = handleOddsCommand,
    handleSportsBetCommand: handleSportsBetCommandImpl = handleSportsBetCommand,
    handleMyBetsCommand: handleMyBetsCommandImpl = handleMyBetsCommand,
    handleOpenBetsCommand: handleOpenBetsCommandImpl = handleOpenBetsCommand,
    handleResolveBetsCommand: handleResolveBetsCommandImpl = handleResolveBetsCommand
  } = deps

  return async function handleSportsCommandImpl ({ payload, room }) {
    const parts = String(payload?.message || '').trim().split(/\s+/)
    const subcommand = String(parts[1] || '').toLowerCase()

    if (!subcommand || subcommand === 'help' || subcommand === 'info') {
      await postMessageImpl({ room, message: buildSportsInfoMessageImpl(parts[2]) })
      return
    }

    if (subcommand === 'scores' || subcommand === 'score') {
      const sportAlias = String(parts[2] || '').toLowerCase()
      const handler = scoreHandlers[sportAlias]
      if (!handler) {
        await postMessageImpl({
          room,
          message: `Usage: /sports scores <${SUPPORTED_SPORTS.join('|')}> [YYYY-MM-DD]`
        })
        return
      }
      const requestedDate = parts[3] ? ` ${parts[3]}` : ''
      await handler({
        payload: { ...payload, message: `/${sportAlias}${requestedDate}`.trim() },
        room
      })
      return
    }

    if (subcommand === 'odds') {
      const sportAlias = String(parts[2] || '').toLowerCase()
      await handleOddsCommandImpl({
        payload: { ...payload, message: `/odds ${sportAlias}`.trim() },
        room
      })
      return
    }

    if (subcommand === 'bet') {
      const args = parts.slice(2).join(' ')
      await handleSportsBetCommandImpl({
        payload: { ...payload, message: `/sportsbet ${args}`.trim() },
        room
      })
      return
    }

    if (subcommand === 'bets') {
      if (parts[2]) {
        await handleOpenBetsCommandImpl({
          payload: { ...payload, message: `/openbets ${parts.slice(2).join(' ')}`.trim() },
          room
        })
        return
      }
      await handleMyBetsCommandImpl({
        payload: { ...payload, message: '/mybets' },
        room
      })
      return
    }

    if (subcommand === 'resolve') {
      const sportAlias = parts[2] ? ` ${parts[2]}` : ''
      await handleResolveBetsCommandImpl({
        payload: { ...payload, message: `/resolvebets${sportAlias}` },
        room
      })
      return
    }

    await postMessageImpl({ room, message: buildSportsInfoMessageImpl() })
  }
}

export function createMlbScoresCommandHandler (deps = {}) {
  return createMlbScoresCommandHandlerBase({
    postMessage,
    getScores: getMLBScores,
    ...deps
  })
}

export async function handleNhlScoresCommand ({ payload, room }) {
  return createNhlScoresCommandHandler()({ payload, room })
}

export function createNhlScoresCommandHandler (deps = {}) {
  return createSportsScoresCommandHandler({
    postMessage,
    getScores: getNHLScores,
    commandName: 'NHL',
    errorTag: 'nhl',
    ...deps
  })
}

export async function handleNbaScoresCommand ({ payload, room }) {
  return createNbaScoresCommandHandler()({ payload, room })
}

export function createNbaScoresCommandHandler (deps = {}) {
  return createSportsScoresCommandHandler({
    postMessage,
    getScores: getNBAScores,
    commandName: 'NBA',
    errorTag: 'nba',
    ...deps
  })
}

export async function handleNcaabScoresCommand ({ payload, room }) {
  return createNcaabScoresCommandHandler()({ payload, room })
}

export function createNcaabScoresCommandHandler (deps = {}) {
  return createSportsScoresCommandHandler({
    postMessage,
    getScores: getNCAABScores,
    commandName: 'NCAAB',
    errorTag: 'ncaab',
    ...deps
  })
}

export async function handleNflScoresCommand ({ payload, room }) {
  return createNflScoresCommandHandler()({ payload, room })
}

export function createNflScoresCommandHandler (deps = {}) {
  return createSportsScoresCommandHandler({
    postMessage,
    getScores: getNFLScores,
    commandName: 'NFL',
    errorTag: 'nfl',
    ...deps
  })
}

export async function handleMlbOddsCommand ({ room }) {
  return createOddsCommandHandler({ defaultSportAlias: 'mlb' })({ room })
}

export async function handleOddsCommand ({ payload, room }) {
  return createOddsCommandHandler()({ payload, room })
}

export function createOddsCommandHandler (deps = {}) {
  const {
    postMessage: postMessageImpl = postMessage,
    fetchOddsForSport: fetchOddsForSportImpl = fetchOddsForSport,
    saveOddsForSport: saveOddsForSportImpl = saveOddsForSport,
    getOddsForSport: getOddsForSportImpl = getOddsForSport,
    formatOddsMessage: formatOddsMessageImpl = formatOddsMessage,
    defaultSportAlias = null
  } = deps

  return async function handleOddsCommandImpl ({ payload, room }) {
    let oddsMsg = null
    const parts = String(payload?.message || '').trim().split(/\s+/)
    const requestedAlias = defaultSportAlias || String(parts[1] || '').toLowerCase()
    const { sportAlias, sport } = parseSportAlias(requestedAlias)

    if (!sport) {
      await postMessageImpl({
        room,
        message: `Usage: /odds <${SUPPORTED_SPORTS.join('|')}>\nExample: /odds mlb`
      })
      return
    }

    try {
      const data = await fetchOddsForSportImpl(sport)
      if (!Array.isArray(data)) throw new Error('No data returned')

      await saveOddsForSportImpl(sport, data)
      oddsMsg = formatOddsMessageImpl(data, sport)

      await postMessageImpl({ room, message: oddsMsg })
    } catch (error) {
      const cachedOdds = await getOddsForSportImpl(sport).catch(() => [])

      if (Array.isArray(cachedOdds) && cachedOdds.length) {
        oddsMsg = `${formatOddsMessageImpl(cachedOdds, sport)}\n\n⚠️ Live odds refresh failed, so this is the last saved board.`
        await postMessageImpl({ room, message: oddsMsg })
        return
      }

      console.error(`Error fetching or posting ${sportAlias.toUpperCase()} odds:`, error)
      await postMessageImpl({
        room,
        message: buildOddsErrorMessage(sportAlias, error)
      })
    }
  }
}

function buildOddsErrorMessage (sportAlias, error) {
  const label = String(sportAlias || '').toUpperCase()

  if (error instanceof OddsApiError) {
    if (error.status === 401) {
      return `Couldn't refresh ${label} odds because the Odds API rejected the request (401 Unauthorized). Check the \`ODDS_API_KEY\`.`
    }

    if (error.message === 'ODDS_API_KEY is missing.') {
      return `Couldn't refresh ${label} odds because \`ODDS_API_KEY\` is not configured.`
    }

    return `Couldn't refresh ${label} odds right now (${error.message}).`
  }

  return `Sorry, something went wrong fetching ${label} odds.`
}

export async function handleSportsBetCommand ({ payload, room }) {
  return createSportsBetCommandHandler()({ payload, room })
}

export function createSportsBetCommandHandler (deps = {}) {
  const {
    postMessage: postMessageImpl = postMessage,
    getSenderNickname: getSenderNicknameImpl = getSenderNickname,
    getOddsForSport: getOddsForSportImpl = getOddsForSport,
    getUserWallet: getUserWalletImpl = getUserWallet,
    placeSportsBet: placeSportsBetImpl = placeSportsBet
  } = deps

  return async function handleSportsBetCommandImpl ({ payload, room }) {
    const senderUUID = normalizeUserUuid(payload?.sender)
    const nickname = await getSenderNicknameImpl(senderUUID)
    const parsed = parseSportsBetArgs(payload?.message)

    if (!parsed.ok && parsed.reason === 'usage') {
      await postMessageImpl({
        room,
        message: 'Usage: /sportsbet SPORT INDEX TEAM TYPE AMOUNT\nExample: /sportsbet mlb 2 NYY ml 50'
      })
      return
    }

    if (!parsed.ok && parsed.reason === 'sport') {
      await postMessageImpl({ room, message: 'Unsupported sport. Try: mlb, nba, ncaab, nfl, nhl' })
      return
    }

    if (!parsed.ok) {
      await postMessageImpl({
        room,
        message: 'Please enter a valid command: /sportsbet SPORT INDEX TEAM TYPE AMOUNT\nExample: /sportsbet mlb 2 NYY ml 50'
      })
      return
    }

    const oddsData = await getOddsForSportImpl(parsed.sport)
    if (!oddsData || parsed.index < 0 || parsed.index >= oddsData.length) {
      await postMessageImpl({
        room,
        message: 'Invalid game index. Use /odds SPORT to see available games.'
      })
      return
    }

    const balance = await getUserWalletImpl(senderUUID)
    if (parsed.amount > balance) {
      await postMessageImpl({
        room,
        message: `Insufficient funds, ${nickname}. Your balance is $${balance}.`
      })
      return
    }

    const result = await placeSportsBetImpl(
      senderUUID,
      parsed.index,
      parsed.team,
      parsed.betType,
      parsed.amount,
      parsed.sport
    )

    await postMessageImpl({ room, message: result })
  }
}

export async function handleMyBetsCommand ({ payload, room }) {
  return createOpenBetsCommandHandler()({ payload, room, forceSelf: true })
}

export async function handleOpenBetsCommand ({ payload, room }) {
  return createOpenBetsCommandHandler()({ payload, room })
}

export function createOpenBetsCommandHandler (deps = {}) {
  const {
    postMessage: postMessageImpl = postMessage,
    getSenderNickname: getSenderNicknameImpl = getSenderNickname,
    getOpenBetsForUser: getOpenBetsForUserImpl = getOpenBetsForUser,
    getOddsForSport: getOddsForSportImpl = getOddsForSport
  } = deps

  return async function handleOpenBetsCommandImpl ({ payload, room, forceSelf = false }) {
    const senderUUID = normalizeUserUuid(payload?.sender)
    const parts = String(payload?.message || '').trim().split(/\s+/)
    const targetUUID = normalizeUserUuid(forceSelf ? senderUUID : (parseUidFromMentionOrRaw(parts[1]) || senderUUID))
    const openBets = await getOpenBetsForUserImpl(targetUUID)

    if (!openBets.length) {
      const nick = targetUUID === senderUUID
        ? 'You'
        : await getSenderNicknameImpl(targetUUID).catch(() => `<@uid:${targetUUID}>`)
      await postMessageImpl({
        room,
        message: targetUUID === senderUUID
          ? 'You have no open sports bets.'
          : `${nick} has no open sports bets.`
      })
      return
    }

    const oddsBySport = new Map()
    const lines = []

    for (const bet of openBets) {
      if (!oddsBySport.has(bet.sport)) {
        oddsBySport.set(bet.sport, await getOddsForSportImpl(bet.sport))
      }
      const games = oddsBySport.get(bet.sport) || []
      const game = games.find(entry => entry.id === bet.gameId) || games[bet.gameIndex] || null
      lines.push(`- ${formatOpenBetLine(bet, game)}`)
    }

    const headerName = targetUUID === senderUUID
      ? 'Your'
      : `${await getSenderNicknameImpl(targetUUID).catch(() => `<@uid:${targetUUID}>`)}'s`

    await postMessageImpl({
      room,
      message: [`🎟️ ${headerName} Open Bets`, '', ...lines].join('\n')
    })
  }
}

export async function handleResolveBetsCommand ({ room }) {
  return createResolveBetsCommandHandler()({ room })
}

export function createResolveBetsCommandHandler (deps = {}) {
  const {
    postMessage: postMessageImpl = postMessage,
    resolveCompletedBets: resolveCompletedBetsImpl = resolveCompletedBets
  } = deps

  return async function handleResolveBetsCommandImpl ({ payload, room }) {
    const parts = String(payload?.message || '').trim().split(/\s+/)
    const requestedAlias = String(parts[1] || '').toLowerCase()
    const { sport } = parseSportAlias(requestedAlias)
    const sportsToResolve = sport ? [sport] : Object.values(SPORT_ALIASES)

    for (const sportKey of sportsToResolve) {
      await resolveCompletedBetsImpl(sportKey)
    }

    await postMessageImpl({
      room,
      message: sport
        ? `Open bets have been resolved for ${requestedAlias.toUpperCase()}.`
        : `Open bets have been resolved for ${SUPPORTED_SPORTS.map(s => s.toUpperCase()).join(', ')}.`
    })
  }
}

export async function handleSportsInfoCommand ({ payload, room }) {
  const parts = String(payload?.message || '').trim().split(/\s+/)
  await postMessage({ room, message: buildSportsInfoMessage(parts[1]) })
}
