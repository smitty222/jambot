import fetch from 'node-fetch'
import { formatOdds } from './sportsBet.js'
import { getGenericDisplayTeamCode } from './sportsTeams.js'

/// /////////////////////////////// Odds API ////////////////////////////////////////////
export async function fetchOddsForSport (sportKey) {
  const ODDS_API_KEY = process.env.ODDS_API_KEY
  const BASE_URL = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds`

  try {
    const response = await fetch(`${BASE_URL}?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads&oddsFormat=american`)
    if (!response.ok) throw new Error(`Failed to fetch odds: ${response.statusText}`)

    const data = await response.json()
    return filterFanDuelOnly(data) // Only return FanDuel odds
  } catch (error) {
    console.error(`Error fetching odds for ${sportKey}:`, error)
    return null
  }
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

export function formatOddsMessage (games, sportKey) {
  const title = formatSportTitle(sportKey)

  return `🎲 Today's ${title} Odds:\n\n` + games.slice(0, 5).map((game, i) => {
    const { bookmaker, homeTeam, awayTeam, commenceTime } = game
    const h2h = bookmaker?.markets?.find(m => m.key === 'h2h')?.outcomes || []
    const spreads = bookmaker?.markets?.find(m => m.key === 'spreads')?.outcomes || []

    // Time formatting
    const gameTime = new Date(commenceTime)
    const timeStr = gameTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })

    // Abbreviations
    const awayAbbr = getGenericDisplayTeamCode(awayTeam)
    const homeAbbr = getGenericDisplayTeamCode(homeTeam)

    // Moneyline
    const oddsMap = Object.fromEntries(h2h.map(o => [o.name, formatOdds(o.price)]))
    const awayML = oddsMap[awayTeam] || 'N/A'
    const homeML = oddsMap[homeTeam] || 'N/A'

    // Spread
    const spreadMap = Object.fromEntries(spreads.map(o => [o.name, { point: o.point, price: formatOdds(o.price) }]))
    const awaySpread = spreadMap[awayTeam] ? `${formatSpread(spreadMap[awayTeam].point)} (${spreadMap[awayTeam].price})` : 'N/A'
    const homeSpread = spreadMap[homeTeam] ? `${formatSpread(spreadMap[homeTeam].point)} (${spreadMap[homeTeam].price})` : 'N/A'

    return `${i + 1}. ${awayTeam} @ ${homeTeam}\n` +
             `🕒 ${timeStr}\n` +
             `🧢 ML — ${awayAbbr}: ${awayML} | ${homeAbbr}: ${homeML}\n` +
             `📏 Spread — ${awayAbbr}: ${awaySpread} | ${homeAbbr}: ${homeSpread}`
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
