import { postMessage } from '../libs/cometchat.js'
import {
  getMLBScores,
  getNHLScores,
  getNBAScores,
  getNFLScores,
  getNCAABScores
} from '../utils/API.js'
import { fetchOddsForSport, formatOddsMessage } from '../utils/sportsBetAPI.js'
import { saveOddsForSport, getOddsForSport } from '../utils/bettingOdds.js'
import { placeSportsBet, resolveCompletedBets } from '../utils/sportsBet.js'
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

export function parseSportAlias (value = '') {
  const sportAlias = String(value || '').trim().toLowerCase()
  return {
    sportAlias,
    sport: SPORT_ALIASES[sportAlias] || null
  }
}

export function buildSportsInfoMessage () {
  return [
    '🏈 Sports Commands',
    '',
    '- `/sportsinfo`',
    '',
    'Scores',
    '- `/mlb [YYYY-MM-DD]`',
    '- `/nba [YYYY-MM-DD]`',
    '- `/ncaab [YYYY-MM-DD]`',
    '- `/nhl [YYYY-MM-DD]`',
    '- `/nfl [YYYY-MM-DD]`',
    '',
    'Odds',
    '- `/odds <mlb|nba|ncaab|nhl|nfl>`',
    '- `/mlbodds`',
    '',
    'Betting',
    '- `/sportsbet SPORT INDEX TEAM TYPE AMOUNT`',
    '- `TYPE` can be `ml` or `spread`',
    '- Example: `/sportsbet nba 1 lakers ml 25`',
    '',
    'Resolution',
    '- `/resolvebets [sport]`',
    '- If no sport is provided, all supported sports are checked.'
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

export async function handleMlbScoresCommand ({ payload, room }) {
  return createMlbScoresCommandHandler()({ payload, room })
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
      if (!data) throw new Error('No data returned')

      await saveOddsForSportImpl(sport, data)
      oddsMsg = formatOddsMessageImpl(data, sport)

      await postMessageImpl({ room, message: oddsMsg })
    } catch (error) {
      console.error(`Error fetching or posting ${sportAlias.toUpperCase()} odds:`, error)
      if (oddsMsg) console.log(oddsMsg)
      await postMessageImpl({
        room,
        message: `Sorry, something went wrong fetching ${sportAlias.toUpperCase()} odds.`
      })
    }
  }
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
    const senderUUID = payload?.sender
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
      await postMessageImpl({ room, message: 'Unsupported sport. Try: mlb, nba, nfl, nhl' })
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

export async function handleSportsInfoCommand ({ room }) {
  await postMessage({ room, message: buildSportsInfoMessage() })
}
