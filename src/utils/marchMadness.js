import {
  buildGenericTeamAliases,
  normalizeSportsTeamInput
} from './sportsTeams.js'

function collectTeamCandidateValues (team = {}) {
  return [
    team?.displayName,
    team?.shortDisplayName,
    team?.location,
    team?.abbreviation,
    team?.name
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean)
}

export function getMarchMadnessTournamentSeed (competitor = {}) {
  const candidates = [
    competitor?.seed,
    competitor?.tournamentSeed,
    competitor?.team?.seed,
    competitor?.team?.tournamentSeed,
    competitor?.curatedRank?.current
  ]

  for (const candidate of candidates) {
    const seed = Number.parseInt(candidate, 10)
    if (Number.isFinite(seed) && seed > 0 && seed <= 16) return seed
  }

  return null
}

export function hasMarchMadnessTournamentSeed (competitor = {}) {
  return Number.isFinite(getMarchMadnessTournamentSeed(competitor))
}

export function isMarchMadnessEvent (event = {}) {
  const comp = event?.competitions?.[0]
  const competitors = Array.isArray(comp?.competitors) ? comp.competitors : []
  const home = competitors.find(c => c?.homeAway === 'home') || competitors[0]
  const away = competitors.find(c => c?.homeAway === 'away') || competitors[1]

  return hasMarchMadnessTournamentSeed(home) && hasMarchMadnessTournamentSeed(away)
}

export function buildMarchMadnessTournamentAliasSet (events = []) {
  const aliases = new Set()

  for (const event of events || []) {
    const competitors = event?.competitions?.[0]?.competitors || []
    for (const competitor of competitors) {
      for (const value of collectTeamCandidateValues(competitor?.team)) {
        aliases.add(normalizeSportsTeamInput(value))
        for (const alias of buildGenericTeamAliases(value)) aliases.add(alias)
      }
    }
  }

  return aliases
}

export function isMarchMadnessOddsGame (game = {}, tournamentAliases = new Set()) {
  const aliasSet = tournamentAliases instanceof Set ? tournamentAliases : new Set(tournamentAliases || [])
  if (!aliasSet.size) return false

  const awayAliases = buildGenericTeamAliases(game?.awayTeam)
  const homeAliases = buildGenericTeamAliases(game?.homeTeam)

  const awayMatch = [...awayAliases].some(alias => aliasSet.has(alias))
  const homeMatch = [...homeAliases].some(alias => aliasSet.has(alias))

  return awayMatch && homeMatch
}

export function filterMarchMadnessOddsGames (games = [], tournamentAliases = new Set()) {
  return (games || []).filter(game => isMarchMadnessOddsGame(game, tournamentAliases))
}
