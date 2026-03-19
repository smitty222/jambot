import {
  buildGenericTeamAliases,
  normalizeSportsTeamInput
} from './sportsTeams.js'

function toTimestamp (value) {
  const ts = Date.parse(String(value || ''))
  return Number.isFinite(ts) ? ts : NaN
}

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

function buildCompetitorAliasSet (competitor = {}) {
  const aliases = new Set()

  for (const value of collectTeamCandidateValues(competitor?.team)) {
    aliases.add(normalizeSportsTeamInput(value))
    for (const alias of buildGenericTeamAliases(value)) aliases.add(alias)
  }

  return aliases
}

export function buildMarchMadnessTournamentMatchups (events = []) {
  return (events || [])
    .filter(event => isMarchMadnessEvent(event))
    .map((event) => {
      const competitors = event?.competitions?.[0]?.competitors || []
      const away = competitors.find(c => c?.homeAway === 'away') || competitors[0]
      const home = competitors.find(c => c?.homeAway === 'home') || competitors[1]

      return {
        id: String(event?.id || ''),
        commenceTime: event?.date || event?.competitions?.[0]?.date || null,
        awayAliases: buildCompetitorAliasSet(away),
        homeAliases: buildCompetitorAliasSet(home)
      }
    })
}

function aliasSetsIntersect (left = new Set(), right = new Set()) {
  for (const alias of left) {
    if (right.has(alias)) return true
  }
  return false
}

export function isMarchMadnessOddsGame (game = {}, tournamentMatchups = [], timeWindowHours = 16) {
  const matchups = Array.isArray(tournamentMatchups) ? tournamentMatchups : []
  if (!matchups.length) return false

  const awayAliases = buildGenericTeamAliases(game?.awayTeam)
  const homeAliases = buildGenericTeamAliases(game?.homeTeam)
  const gameTs = toTimestamp(game?.commenceTime)
  const maxDiffMs = Math.max(1, Number(timeWindowHours || 16)) * 60 * 60 * 1000

  return matchups.some((matchup) => {
    const matchupTs = toTimestamp(matchup?.commenceTime)
    const withinWindow = !Number.isFinite(gameTs) || !Number.isFinite(matchupTs)
      ? true
      : Math.abs(gameTs - matchupTs) <= maxDiffMs

    if (!withinWindow) return false

    const directMatch = aliasSetsIntersect(awayAliases, matchup?.awayAliases) &&
      aliasSetsIntersect(homeAliases, matchup?.homeAliases)
    const swappedMatch = aliasSetsIntersect(awayAliases, matchup?.homeAliases) &&
      aliasSetsIntersect(homeAliases, matchup?.awayAliases)

    return directMatch || swappedMatch
  })
}

export function filterMarchMadnessOddsGames (games = [], tournamentMatchups = [], timeWindowHours = 16) {
  return (games || []).filter(game => isMarchMadnessOddsGame(game, tournamentMatchups, timeWindowHours))
}
