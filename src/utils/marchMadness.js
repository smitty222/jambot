import {
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
    team?.abbreviation
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean)
}

function getLeadingShortAbbreviation (value = '') {
  const firstToken = String(value || '')
    .split(/[^A-Za-z0-9.&-]+/)
    .map(token => token.trim())
    .filter(Boolean)[0] || ''

  return /^[A-Z0-9.&-]{2,5}$/.test(firstToken) ? normalizeSportsTeamInput(firstToken) : ''
}

function buildStrongTeamAliases (value = '') {
  const raw = String(value || '').trim()
  const normalized = normalizeSportsTeamInput(raw)
  const tokens = raw
    .split(/[^A-Za-z0-9]+/)
    .map(token => token.trim().toLowerCase())
    .filter(Boolean)

  if (!tokens.length) return new Set()

  const leadingAbbreviation = getLeadingShortAbbreviation(raw)
  const cityTokens = tokens.slice(0, -1)
  const cityJoined = cityTokens.join('')
  const cityInitials = cityTokens.map(token => token[0]).join('')
  const fullInitials = tokens.map(token => token[0]).join('')
  const lastTwoTokens = tokens.slice(-2).join('')

  return new Set([
    normalized,
    tokens.join(''),
    leadingAbbreviation,
    cityJoined,
    cityInitials.length >= 2 ? cityInitials : '',
    fullInitials.length >= 3 ? fullInitials : '',
    lastTwoTokens.length >= 6 ? lastTwoTokens : ''
  ].filter(Boolean))
}

function getPreferredTeamName (team = {}) {
  return String(
    team?.displayName ||
    team?.shortDisplayName ||
    (team?.location && team?.name ? `${team.location} ${team.name}` : '') ||
    team?.location ||
    team?.abbreviation ||
    team?.name ||
    ''
  ).trim()
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
  const links = Array.isArray(event?.links) ? event.links : []
  const hasNcaaBracketLink = links.some((link) => {
    const rel = Array.isArray(link?.rel) ? link.rel : []
    const href = String(link?.href || '')
    return rel.includes('bracket') && /ncaa-tournament/i.test(href)
  })

  return hasNcaaBracketLink && hasMarchMadnessTournamentSeed(home) && hasMarchMadnessTournamentSeed(away)
}

export function buildMarchMadnessTournamentAliasSet (events = []) {
  const aliases = new Set()

  for (const event of events || []) {
    const competitors = event?.competitions?.[0]?.competitors || []
    for (const competitor of competitors) {
      for (const value of collectTeamCandidateValues(competitor?.team)) {
        aliases.add(normalizeSportsTeamInput(value))
        for (const alias of buildStrongTeamAliases(value)) aliases.add(alias)
      }
    }
  }

  return aliases
}

function buildCompetitorAliasSet (competitor = {}) {
  const aliases = new Set()

  for (const value of collectTeamCandidateValues(competitor?.team)) {
    aliases.add(normalizeSportsTeamInput(value))
    for (const alias of buildStrongTeamAliases(value)) aliases.add(alias)
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
        awayName: getPreferredTeamName(away?.team),
        homeName: getPreferredTeamName(home?.team),
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

export function findMatchingMarchMadnessMatchup (game = {}, tournamentMatchups = [], timeWindowHours = 16) {
  const matchups = Array.isArray(tournamentMatchups) ? tournamentMatchups : []
  if (!matchups.length) return null

  const awayAliases = buildStrongTeamAliases(game?.awayTeam)
  const homeAliases = buildStrongTeamAliases(game?.homeTeam)
  const gameTs = toTimestamp(game?.commenceTime)
  const maxDiffMs = Math.max(1, Number(timeWindowHours || 16)) * 60 * 60 * 1000

  return matchups.find((matchup) => {
    const matchupTs = toTimestamp(matchup?.commenceTime)
    const withinWindow = !Number.isFinite(gameTs) || !Number.isFinite(matchupTs)
      ? true
      : Math.abs(gameTs - matchupTs) <= maxDiffMs

    if (!withinWindow) return null

    const directMatch = aliasSetsIntersect(awayAliases, matchup?.awayAliases) &&
      aliasSetsIntersect(homeAliases, matchup?.homeAliases)
    const swappedMatch = aliasSetsIntersect(awayAliases, matchup?.homeAliases) &&
      aliasSetsIntersect(homeAliases, matchup?.awayAliases)

    if (directMatch) return matchup
    if (swappedMatch) {
      return {
        ...matchup,
        awayName: matchup?.homeName,
        homeName: matchup?.awayName,
        awayAliases: matchup?.homeAliases,
        homeAliases: matchup?.awayAliases
      }
    }

    return null
  })
}

export function isMarchMadnessOddsGame (game = {}, tournamentMatchups = [], timeWindowHours = 16) {
  return Boolean(findMatchingMarchMadnessMatchup(game, tournamentMatchups, timeWindowHours))
}

export function filterMarchMadnessOddsGames (games = [], tournamentMatchups = [], timeWindowHours = 16) {
  return (games || [])
    .map((game) => {
      const matchup = findMatchingMarchMadnessMatchup(game, tournamentMatchups, timeWindowHours)
      if (!matchup) return null
      return {
        ...game,
        canonicalAwayTeam: matchup.awayName || game.awayTeam,
        canonicalHomeTeam: matchup.homeName || game.homeTeam
      }
    })
    .filter(Boolean)
}
