import { postMessage } from '../libs/cometchat.js'
import {
  getMLBScores,
  getNHLScores,
  getNBAScores
} from '../utils/API.js'
import { fetchOddsForSport, formatOddsMessage } from '../utils/sportsBetAPI.js'
import { saveOddsForSport, getOddsForSport } from '../utils/bettingOdds.js'
import { placeSportsBet, resolveCompletedBets } from '../utils/sportsBet.js'
import { getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js'
import { getSenderNickname } from '../utils/helpers.js'
import { createMlbScoresCommandHandler as createMlbScoresCommandHandlerBase } from './handlerFactories.js'

const SPORT_ALIASES = {
  mlb: 'baseball_mlb',
  nba: 'basketball_nba',
  nfl: 'americanfootball_nfl',
  nhl: 'icehockey_nhl'
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
    getMLBScores,
    ...deps
  })
}

export async function handleNhlScoresCommand ({ payload, room }) {
  const parts = String(payload?.message || '').trim().split(/\s+/)
  const requestedDate = parts[1]

  try {
    const response = await getNHLScores(requestedDate)
    await postMessage({ room, message: response })
  } catch (err) {
    console.error('Error fetching NHL scores:', err)
    await postMessage({
      room,
      message: 'There was an error fetching NHL scores. Please try again later.'
    })
  }
}

export async function handleNbaScoresCommand ({ payload, room }) {
  const parts = String(payload?.message || '').trim().split(/\s+/)
  const requestedDate = parts[1]

  try {
    const response = await getNBAScores(requestedDate)
    await postMessage({ room, message: response })
  } catch (err) {
    console.error('Error fetching NBA scores:', err)
    await postMessage({
      room,
      message: 'There was an error fetching NBA scores. Please try again later.'
    })
  }
}

export async function handleMlbOddsCommand ({ room }) {
  let oddsMsg = null

  try {
    const sport = 'baseball_mlb'
    const data = await fetchOddsForSport(sport)
    if (!data) throw new Error('No data returned')

    saveOddsForSport(sport, data)
    oddsMsg = formatOddsMessage(data, sport)

    await postMessage({ room, message: oddsMsg })
  } catch (error) {
    console.error('Error fetching or posting MLB odds:', error)
    if (oddsMsg) console.log(oddsMsg)
    await postMessage({ room, message: 'Sorry, something went wrong fetching MLB odds.' })
  }
}

export async function handleSportsBetCommand ({ payload, room }) {
  const senderUUID = payload?.sender
  const nickname = await getSenderNickname(senderUUID)
  const parsed = parseSportsBetArgs(payload?.message)

  if (!parsed.ok && parsed.reason === 'usage') {
    await postMessage({
      room,
      message: 'Usage: /sportsbet SPORT INDEX TEAM TYPE AMOUNT\nExample: /sportsbet mlb 2 NYY ml 50'
    })
    return
  }

  if (!parsed.ok && parsed.reason === 'sport') {
    await postMessage({ room, message: 'Unsupported sport. Try: mlb, nba, nfl, nhl' })
    return
  }

  if (!parsed.ok) {
    await postMessage({
      room,
      message: 'Please enter a valid command: /sportsbet SPORT INDEX TEAM TYPE AMOUNT\nExample: /sportsbet mlb 2 NYY ml 50'
    })
    return
  }

  const oddsData = await getOddsForSport(parsed.sport)
  if (!oddsData || parsed.index < 0 || parsed.index >= oddsData.length) {
    await postMessage({
      room,
      message: 'Invalid game index. Use /odds SPORT to see available games.'
    })
    return
  }

  const balance = await getUserWallet(senderUUID)
  if (parsed.amount > balance) {
    await postMessage({
      room,
      message: `Insufficient funds, ${nickname}. Your balance is $${balance}.`
    })
    return
  }

  const result = await placeSportsBet(
    senderUUID,
    parsed.index,
    parsed.team,
    parsed.betType,
    parsed.amount,
    parsed.sport
  )
  if (typeof result === 'string' && result.startsWith('✅')) {
    await removeFromUserWallet(senderUUID, parsed.amount)
  }

  await postMessage({ room, message: result })
}

export async function handleResolveBetsCommand ({ room }) {
  await resolveCompletedBets()
  await postMessage({
    room,
    message: 'Open bets have been resolved'
  })
}
