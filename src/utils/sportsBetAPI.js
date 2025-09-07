import fetch from 'node-fetch'
import { formatOdds } from './sportsBet.js'

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
        commence_time: game.commence_time,
        home_team: game.home_team,
        away_team: game.away_team,
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
  return '🎲 Today\'s MLB Odds:\n\n' + games.slice(0, 5).map((game, i) => {
    const { bookmaker, home_team, away_team, commence_time } = game
    const h2h = bookmaker?.markets?.find(m => m.key === 'h2h')?.outcomes || []
    const spreads = bookmaker?.markets?.find(m => m.key === 'spreads')?.outcomes || []

    // Time formatting
    const gameTime = new Date(commence_time)
    const timeStr = gameTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })

    // Abbreviations
    const awayAbbr = teamAbbreviations[away_team] || away_team.slice(0, 3).toUpperCase()
    const homeAbbr = teamAbbreviations[home_team] || home_team.slice(0, 3).toUpperCase()

    // Moneyline
    const oddsMap = Object.fromEntries(h2h.map(o => [o.name, formatOdds(o.price)]))
    const awayML = oddsMap[away_team] || 'N/A'
    const homeML = oddsMap[home_team] || 'N/A'

    // Spread
    const spreadMap = Object.fromEntries(spreads.map(o => [o.name, { point: o.point, price: formatOdds(o.price) }]))
    const awaySpread = spreadMap[away_team] ? `${formatSpread(spreadMap[away_team].point)} (${spreadMap[away_team].price})` : 'N/A'
    const homeSpread = spreadMap[home_team] ? `${formatSpread(spreadMap[home_team].point)} (${spreadMap[home_team].price})` : 'N/A'

    return `${i + 1}. ${away_team} @ ${home_team}\n` +
             `🕒 ${timeStr}\n` +
             `🧢 ML — ${awayAbbr}: ${awayML} | ${homeAbbr}: ${homeML}\n` +
             `📏 Spread — ${awayAbbr}: ${awaySpread} | ${homeAbbr}: ${homeSpread}`
  }).join('\n\n')
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
          home_team: game.home_team,
          away_team: game.away_team,
          home_score: scoreData.home,
          away_score: scoreData.away
        }
      })

    return completedGames
  } catch (err) {
    console.error('Error fetching or parsing scores:', err)
    return []
  }
}

const teamAbbreviations = {
  'New York Yankees': 'NYY',
  'Colorado Rockies': 'COL',
  'New York Mets': 'NYM',
  'Boston Red Sox': 'BOS',
  'Los Angeles Dodgers': 'LAD',
  'Houston Astros': 'HOU',
  'Chicago Cubs': 'CHC',
  'Atlanta Braves': 'ATL',
  'San Francisco Giants': 'SF',
  'Tampa Bay Rays': 'TB',
  'Toronto Blue Jays': 'TOR',
  'Minnesota Twins': 'MIN',
  'Seattle Mariners': 'SEA',
  'Detroit Tigers': 'DET',
  'Cincinnati Reds': 'CIN',
  'Philadelphia Phillies': 'PHI',
  'St. Louis Cardinals': 'STL',
  'Miami Marlins': 'MIA',
  'Baltimore Orioles': 'BAL',
  'Oakland Athletics': 'OAK',
  'Pittsburgh Pirates': 'PIT',
  'Arizona Dbacks': 'ARI',
  'Los Angeles Angels': 'LAA',
  'Kansas City Royals': 'KC',
  'Washington Nationals': 'WAS',
  'Milwaukee Brewers': 'MIL',
  'Cleveland Guardians': 'CLE',
  'Chicago White Sox': 'CHW',
  'Texas Rangers': 'TEX'
}
