export const MLB_TEAM_ABBREVIATIONS = {
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
  'Texas Rangers': 'TEX',
  'San Diego Padres': 'SD'
}

export const MLB_TEAM_SHORT_NAMES = {
  ATL: 'Braves',
  BAL: 'Orioles',
  BOS: 'Red Sox',
  CHC: 'Cubs',
  CIN: 'Reds',
  CLE: 'Guardians',
  COL: 'Rockies',
  CWS: 'White Sox',
  DET: 'Tigers',
  HOU: 'Astros',
  KC: 'Royals',
  LAA: 'Angels',
  LAD: 'Dodgers',
  MIA: 'Marlins',
  MIL: 'Brewers',
  MIN: 'Twins',
  NYM: 'Mets',
  NYY: 'Yankees',
  OAK: 'Athletics',
  PHI: 'Phillies',
  PIT: 'Pirates',
  SD: 'Padres',
  SEA: 'Mariners',
  SF: 'Giants',
  STL: 'Cardinals',
  TB: 'Rays',
  TEX: 'Rangers',
  TOR: 'Blue Jays',
  WSH: 'Nationals'
}

export function getMlbTeamAbbreviation (teamName) {
  const fallback = String(teamName || '').slice(0, 3).toUpperCase()
  return MLB_TEAM_ABBREVIATIONS[teamName] || fallback
}

export function resolveMlbTeamNameFromAbbreviation (abbr, gameTeams = []) {
  const shortName = MLB_TEAM_SHORT_NAMES[String(abbr || '').toUpperCase()]
  if (!shortName) return null

  return gameTeams.find(name => String(name || '').toLowerCase().includes(shortName.toLowerCase())) || null
}

export function normalizeSportsTeamInput (value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function buildCityInitials (tokens) {
  if (tokens.length <= 1) return ''
  return tokens.slice(0, -1).map(token => token[0]).join('')
}

export function buildGenericTeamAliases (teamName) {
  const tokens = String(teamName || '')
    .split(/[^A-Za-z0-9]+/)
    .map(token => token.trim().toLowerCase())
    .filter(Boolean)

  if (tokens.length === 0) return new Set()

  const nickname = tokens[tokens.length - 1]
  const cityTokens = tokens.slice(0, -1)
  const cityJoined = cityTokens.join('')
  const cityInitials = buildCityInitials(tokens)
  const fullInitials = tokens.map(token => token[0]).join('')
  const lastTwoTokens = tokens.slice(-2).join('')

  return new Set([
    normalizeSportsTeamInput(teamName),
    nickname,
    lastTwoTokens,
    cityJoined,
    cityInitials,
    fullInitials,
    `${cityInitials}${nickname[0] || ''}`,
    `${cityJoined}${nickname}`,
    `${cityInitials}${nickname}`,
    tokens.join('')
  ].filter(Boolean))
}

export function getGenericDisplayTeamCode (teamName) {
  const mlbAbbr = MLB_TEAM_ABBREVIATIONS[teamName]
  if (mlbAbbr) return mlbAbbr

  const tokens = String(teamName || '')
    .split(/[^A-Za-z0-9]+/)
    .map(token => token.trim())
    .filter(Boolean)

  if (tokens.length === 0) return 'N/A'
  if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase()

  const cityInitials = tokens.slice(0, -1).map(token => token[0]).join('').toUpperCase()
  const nicknameInitial = tokens[tokens.length - 1][0]?.toUpperCase() || ''
  return `${cityInitials}${nicknameInitial}` || tokens[tokens.length - 1].slice(0, 3).toUpperCase()
}

export function resolveTeamNameFromInput (input, gameTeams = []) {
  const normalizedInput = normalizeSportsTeamInput(input)
  if (!normalizedInput) return null

  for (const teamName of gameTeams) {
    const aliases = buildGenericTeamAliases(teamName)
    if (aliases.has(normalizedInput)) return teamName
  }

  return null
}
