import fetch from 'node-fetch'
import { formatOdds } from './sportsBet.js'
import { getGenericDisplayTeamCode } from './sportsTeams.js'

const SPORTS_TIME_ZONE = 'America/New_York'
const SPORTS_TIME_ZONE_LABEL = 'ET'

/// /////////////////////////////// Odds API ////////////////////////////////////////////
export class OddsApiError extends Error {
  constructor (message, { status = null, sportKey = '', body = '' } = {}) {
    super(message)
    this.name = 'OddsApiError'
    this.status = status
    this.sportKey = sportKey
    this.body = body
  }
}

export async function fetchOddsForSport (sportKey) {
  const ODDS_API_KEY = process.env.ODDS_API_KEY
  const BASE_URL = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`

  if (!ODDS_API_KEY) {
    throw new OddsApiError('ODDS_API_KEY is missing.', { sportKey })
  }

  const response = await fetch(`${BASE_URL}?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads&oddsFormat=american`)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new OddsApiError(`Failed to fetch odds: ${response.status} ${response.statusText}`, {
      status: response.status,
      sportKey,
      body
    })
  }

  const data = await response.json()
  return filterFanDuelOnly(data) // Only return FanDuel odds
}

function filterFanDuelOnly (games) {
  return games
    .map(game => {
      const fanduel = game.bookmakers?.find(b => b.key === 'fanduel')
      if (!fanduel) return null

      return {
        id: game.id,
        commenceTime: game.commence_time,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        bookmaker: {
          key: fanduel.key,
          title: fanduel.title,
          markets: fanduel.markets.map(market => ({
            key: market.key,
            outcomes: market.outcomes.map(outcome => ({
              name: outcome.name,
              price: outcome.price,
              ...(outcome.point !== undefined ? { point: outcome.point } : {})
            }))
          }))
        }
      }
    })
    .filter(Boolean) // Remove nulls
}

export function formatOddsMessage (games, sportKey, now = Date.now()) {
  const title = formatSportTitle(sportKey)
  const normalizedGames = Array.isArray(games)
    ? [...games].sort((a, b) => toTimestamp(a?.commenceTime) - toTimestamp(b?.commenceTime))
    : []

  if (!normalizedGames.length) {
    return `🎲 Today's ${title} Odds:\n\nNo FanDuel lines are posted right now.`
  }

  return `🎲 Today's ${title} Odds:\n\n` + normalizedGames.slice(0, 5).map((game, i) => {
    const { bookmaker, homeTeam, awayTeam, commenceTime } = game
    const h2h = bookmaker?.markets?.find(m => m.key === 'h2h')?.outcomes || []
    const spreads = bookmaker?.markets?.find(m => m.key === 'spreads')?.outcomes || []
    const liveLabel = isGameLikelyLive(game, now) ? ' 🔴 LIVE' : ''

    // Time formatting
    const timeStr = formatOddsGameTime(commenceTime)

    // Labels
    const awayLabel = formatOddsTeamLabel(awayTeam, sportKey)
    const homeLabel = formatOddsTeamLabel(homeTeam, sportKey)

    // Moneyline
    const oddsMap = Object.fromEntries(h2h.map(o => [o.name, formatOdds(o.price)]))
    const awayML = oddsMap[awayTeam] || 'N/A'
    const homeML = oddsMap[homeTeam] || 'N/A'

    // Spread
    const spreadMap = Object.fromEntries(spreads.map(o => [o.name, { point: o.point, price: formatOdds(o.price) }]))
    const awaySpread = spreadMap[awayTeam] ? `${formatSpread(spreadMap[awayTeam].point)} (${spreadMap[awayTeam].price})` : 'N/A'
    const homeSpread = spreadMap[homeTeam] ? `${formatSpread(spreadMap[homeTeam].point)} (${spreadMap[homeTeam].price})` : 'N/A'

    const separator = sportKey === 'basketball_ncaab' ? 'vs' : '@'
    return `${i + 1}. ${awayLabel} ${separator} ${homeLabel} • 🕒 ${timeStr}${liveLabel}\n` +
             `🧢 ML — ${awayLabel}: ${awayML} | ${homeLabel}: ${homeML}\n` +
             `📏 Spread — ${awayLabel}: ${awaySpread} | ${homeLabel}: ${homeSpread}`
  }).join('\n\n')
}

function formatSportTitle (sportKey) {
  const map = {
    baseball_mlb: 'MLB',
    basketball_nba: 'NBA',
    basketball_ncaab: 'NCAAB',
    americanfootball_nfl: 'NFL',
    icehockey_nhl: 'NHL'
  }

  return map[sportKey] || sportKey
}

// Helper to add sign for positive spreads
function formatSpread (point) {
  return point > 0 ? `+${point}` : `${point}`
}

function toTimestamp (value) {
  const ts = Date.parse(String(value || ''))
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER
}

function isGameLikelyLive (game, now = Date.now()) {
  const commenceTs = toTimestamp(game?.commenceTime)
  if (!Number.isFinite(commenceTs) || commenceTs === Number.MAX_SAFE_INTEGER) return false
  return now >= commenceTs
}

export function formatSportsEventTime (commenceTime, { includeDate = false } = {}) {
  const gameTime = new Date(commenceTime)
  if (Number.isNaN(gameTime.getTime())) return 'TBD'

  const options = includeDate
    ? {
        timeZone: SPORTS_TIME_ZONE,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      }
    : {
        timeZone: SPORTS_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit'
      }

  return `${gameTime.toLocaleString('en-US', options)} ${SPORTS_TIME_ZONE_LABEL}`
}

function formatOddsGameTime (commenceTime) {
  return formatSportsEventTime(commenceTime)
}

function formatOddsTeamLabel (teamName, sportKey) {
  const raw = String(teamName || '').trim()
  if (!raw) return 'Unknown Team'

  if (sportKey === 'basketball_ncaab') return getGenericDisplayTeamCode(raw)
  return getGenericDisplayTeamCode(raw)
}

export async function getLatestScoresForSport (sportKey, daysFrom = 1) {
  const ODDS_API_KEY = process.env.ODDS_API_KEY
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=${daysFrom}&dateFormat=iso`

  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.error(`Failed to fetch scores: ${response.status} ${response.statusText}`)
      return []
    }

    const games = await response.json()

    const completedGames = games
      .filter(game => game.completed)
      .map(game => {
        const scoreData = {
          home: 0,
          away: 0
        }

        game.scores.forEach(score => {
          if (score.name === game.home_team) {
            scoreData.home = parseInt(score.score, 10)
          } else if (score.name === game.away_team) {
            scoreData.away = parseInt(score.score, 10)
          }
        })

        return {
          id: game.id,
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          scores: {
            home: scoreData.home,
            away: scoreData.away
          }
        }
      })

    return completedGames
  } catch (err) {
    console.error('Error fetching or parsing scores:', err)
    return []
  }
}
