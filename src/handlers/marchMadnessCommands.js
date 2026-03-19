import { postMessage } from '../libs/cometchat.js'
import { getCurrentMonthKey } from '../database/dbwalletmanager.js'
import { getCompactEquippedTitleTag } from '../database/dbprestige.js'
import {
  getMarchMadnessGameboardGames,
  getMarchMadnessLiveScores,
  getMarchMadnessScores,
  getMarchMadnessTournamentGames,
  getUserNicknameByUuid
} from '../utils/API.js'
import { resolveCompletedBets } from '../utils/sportsBet.js'
import { getGenericDisplayTeamCode, normalizeSportsTeamInput, resolveTeamNameFromInput } from '../utils/sportsTeams.js'
import {
  getMarchMadnessBankrollLeaderboard,
  getMarchMadnessPointsLeaderboard,
  getMarchMadnessSeasonYear,
  listMarchMadnessPicksForUser,
  resolveMarchMadnessPicks,
  upsertMarchMadnessPick
} from '../database/dbmarchmadness.js'

function formatDateInTimeZone (date, timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const mapped = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${mapped.year}-${mapped.month}-${mapped.day}`
}

function toTimestamp (value) {
  const ts = Date.parse(String(value || ''))
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER
}

export function sortMadnessGames (games = []) {
  return [...(Array.isArray(games) ? games : [])].sort((a, b) => {
    const timeDiff = toTimestamp(a?.commenceTime) - toTimestamp(b?.commenceTime)
    if (timeDiff !== 0) return timeDiff
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
}

function formatMadnessTipoffTime (commenceTime, timeZone = 'America/New_York') {
  const tip = new Date(commenceTime)
  if (Number.isNaN(tip.getTime())) return 'TBD'
  return tip.toLocaleTimeString('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit'
  })
}

function formatMadnessMatchupLabel ({ awayTeam, awaySeed, homeTeam, homeSeed }) {
  const awayCode = getGenericDisplayTeamCode(awayTeam)
  const homeCode = getGenericDisplayTeamCode(homeTeam)
  const awayPrefix = Number.isFinite(Number(awaySeed)) ? `(${Number(awaySeed)}) ` : ''
  const homePrefix = Number.isFinite(Number(homeSeed)) ? `(${Number(homeSeed)}) ` : ''
  return `${awayPrefix}${awayCode} vs ${homePrefix}${homeCode}`
}

export function buildMadnessPickBoard (games = [], requestedDate = '', now = new Date(), timeZone = 'America/New_York') {
  const entries = (Array.isArray(games) ? games : [])
    .map((game, index) => ({ game, gameIndex: index + 1 }))
    .filter(({ game }) => formatDateInTimeZone(new Date(game?.commenceTime || ''), timeZone) === requestedDate)

  if (!entries.length) return ''

  const lines = entries.map(({ game, gameIndex }) => {
    const tipTs = Date.parse(game?.commenceTime || '')
    const status = Number.isFinite(tipTs) && now.getTime() >= tipTs
      ? '🔒 locked'
      : `🕒 ${formatMadnessTipoffTime(game?.commenceTime, timeZone)}`
    const matchup = String(game?.displayMatchup || '').trim() || `${game?.awayShortName || game?.awayTeam} vs ${game?.homeShortName || game?.homeTeam}`
    return `${gameIndex}. ${matchup} • ${status}`
  })

  return [
    '🎯 Pick Board',
    'Use `/madness pick <gameIndex> <teamCode>`.',
    '',
    ...lines
  ].join('\n')
}

export function resolveMadnessGamesDateToken (rawValue = '', now = new Date(), timeZone = 'America/New_York') {
  const normalized = String(rawValue || '').trim().toLowerCase()
  const current = new Date(now)
  const shifted = new Date(current)

  if (!normalized || normalized === 'today' || normalized === 'tonight') {
    return formatDateInTimeZone(current, timeZone)
  }

  if (normalized === 'yesterday') {
    shifted.setDate(shifted.getDate() - 1)
    return formatDateInTimeZone(shifted, timeZone)
  }

  if (normalized === 'tomorrow') {
    shifted.setDate(shifted.getDate() + 1)
    return formatDateInTimeZone(shifted, timeZone)
  }

  return String(rawValue || '').trim()
}

function formatWholeDollars (value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US')
}

function compactLeaderboardName (name, uuid, maxLen = 14) {
  const raw = String(name || '').trim()
  if (!raw || /^<@uid:[^>]+>$/.test(raw)) return `user-${String(uuid || '').slice(0, 6)}`
  const clean = raw.replace(/^@/, '').trim()
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}.`
}

function formatCompactLeaderboardLine ({ rank, uuid, name, amount }) {
  const titleTag = getCompactEquippedTitleTag(uuid, 7)
  const compactName = compactLeaderboardName(name, uuid, titleTag ? 10 : 14)
  const numeric = Number(amount || 0)
  const money = `${numeric < 0 ? '-' : ''}$${formatWholeDollars(Math.abs(numeric))}`
  return `${rank}. ${titleTag ? `${titleTag} ` : ''}${compactName} ${money}`
}

async function getDisplayNames (rows = [], getUserNicknameByUuidImpl = getUserNicknameByUuid) {
  return Promise.all(
    rows.map(async ({ uuid }) => {
      try {
        return await getUserNicknameByUuidImpl(uuid)
      } catch {
        return `<@uid:${uuid}>`
      }
    })
  )
}

async function ensureMadnessOdds ({
  requestedDate = 'today',
  now = new Date(),
  timeZone = 'America/New_York',
  getMarchMadnessGameboardGames: getMarchMadnessGameboardGamesImpl = getMarchMadnessGameboardGames
} = {}) {
  const resolvedDate = resolveMadnessGamesDateToken(requestedDate, now, timeZone)
  const games = await getMarchMadnessGameboardGamesImpl(resolvedDate)
  return Array.isArray(games) ? games : []
}

async function getMadnessGamesCommandSlate ({
  requestedDate = 'today',
  now = new Date(),
  timeZone = 'America/New_York',
  getMarchMadnessGameboardGames: getMarchMadnessGameboardGamesImpl = getMarchMadnessGameboardGames
} = {}) {
  const resolvedDate = resolveMadnessGamesDateToken(requestedDate, now, timeZone)
  const games = await getMarchMadnessGameboardGamesImpl(resolvedDate)
  return Array.isArray(games) ? games : []
}

async function enrichMadnessPicks (rows = [], {
  getMarchMadnessGameboardGames: getMarchMadnessGameboardGamesImpl = getMarchMadnessGameboardGames
} = {}) {
  if (!Array.isArray(rows) || !rows.length) return []

  const requestedDates = [...new Set(
    rows
      .map(row => String(row?.commenceTime || '').slice(0, 10).trim())
      .filter(Boolean)
  )]

  if (!requestedDates.length) return rows

  const liveGames = (await Promise.all(
    requestedDates.map(async (date) => ({
      date,
      games: await getMarchMadnessGameboardGamesImpl(date)
    }))
  )).flatMap(({ games }) => games || [])
  const gamesById = new Map()
  const indexById = new Map()

  for (const games of Object.values((liveGames || []).reduce((acc, game) => {
    const gameDate = formatDateInTimeZone(new Date(game?.commenceTime || ''))
    if (!acc[gameDate]) acc[gameDate] = []
    acc[gameDate].push(game)
    return acc
  }, {}))) {
    games.forEach((game, index) => {
      gamesById.set(String(game?.id || ''), game)
      indexById.set(String(game?.id || ''), index)
    })
  }

  return rows.map((row) => {
    const game = gamesById.get(String(row?.gameId || ''))
    const liveIndex = indexById.get(String(row?.gameId || ''))

    return {
      ...row,
      gameIndex: Number.isFinite(liveIndex) ? liveIndex : row.gameIndex,
      awayTeam: game?.awayTeam || row.awayTeam,
      awaySeed: Number.isFinite(Number(game?.awaySeed)) ? Number(game.awaySeed) : row.awaySeed,
      homeTeam: game?.homeTeam || row.homeTeam,
      homeSeed: Number.isFinite(Number(game?.homeSeed)) ? Number(game.homeSeed) : row.homeSeed,
      displayMatchup: game?.displayMatchup || row.displayMatchup
    }
  })
}

async function filterMensMarchMadnessPicks (rows = [], {
  getMarchMadnessTournamentGames: getMarchMadnessTournamentGamesImpl = getMarchMadnessTournamentGames
} = {}) {
  if (!Array.isArray(rows) || !rows.length) return []

  const requestedDates = [...new Set(
    rows
      .map(row => String(row?.commenceTime || '').slice(0, 10).trim())
      .filter(Boolean)
  )]

  if (!requestedDates.length) return []

  const tournamentGames = await getMarchMadnessTournamentGamesImpl(requestedDates)
  const tournamentGameIds = new Set(
    (Array.isArray(tournamentGames) ? tournamentGames : [])
      .map(game => String(game?.id || '').trim())
      .filter(Boolean)
  )

  if (!tournamentGameIds.size) return []

  return rows.filter(row => tournamentGameIds.has(String(row?.gameId || '').trim()))
}

function resolveMadnessPickTeamName (input, game = {}) {
  const canonicalMatch = resolveTeamNameFromInput(input, [game?.awayTeam, game?.homeTeam])
  if (canonicalMatch) return canonicalMatch

  const normalizedInput = normalizeSportsTeamInput(input)
  if (!normalizedInput) return null

  const awayShort = normalizeSportsTeamInput(game?.awayShortName)
  const homeShort = normalizeSportsTeamInput(game?.homeShortName)
  if (normalizedInput === awayShort) return game?.awayTeam || null
  if (normalizedInput === homeShort) return game?.homeTeam || null

  return null
}

export function buildMadnessHubMessage (monthKey = getCurrentMonthKey()) {
  return [
    '🏀 March Madness',
    '',
    `Tournament hub for ${monthKey}. Follow the games, make picks, and track the leaderboard.`,
    '',
    '━━ Games ━━',
    '- `/madness games` — today’s March Madness slate',
    '- `/madness scores` — live games only',
    '- `/madness board` — numbered pick board with team codes',
    '',
    '━━ Pick’em ━━',
    '- `/madness pick <gameIndex> <teamCode>` — submit or update a pick',
    '- `/madness picks` — show your saved picks',
    '',
    '━━ Standings ━━',
    '- `/madness leaderboard` — pick’em points leaderboard',
    '- `/madness bankroll` — March Madness betting leaderboard',
    '',
    '━━ Betting ━━',
    '- `/sports odds ncaab` — current NCAAB betting board',
    '- `/sports bet ncaab <gameIndex> <teamCode> ml <amount>` — place a bet',
    '- `/sports bets` — show your open sports bets'
  ].join('\n')
}

export async function postMadnessLeaderboard (room, {
  args = '',
  postMessage: postMessageImpl = postMessage,
  getMarchMadnessSeasonYear: getMarchMadnessSeasonYearImpl = getMarchMadnessSeasonYear,
  getMarchMadnessPointsLeaderboard: getMarchMadnessPointsLeaderboardImpl = getMarchMadnessPointsLeaderboard,
  resolveMarchMadnessPicks: resolveMarchMadnessPicksImpl = resolveMarchMadnessPicks,
  getUserNicknameByUuid: getUserNicknameByUuidImpl = getUserNicknameByUuid
} = {}) {
  const requested = Number.parseInt(String(args || '').trim(), 10)
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 25)
    : 10

  const seasonYear = getMarchMadnessSeasonYearImpl()
  await resolveMarchMadnessPicksImpl({ seasonYear })
  const rows = getMarchMadnessPointsLeaderboardImpl(limit, seasonYear)

  if (!rows.length) {
    await postMessageImpl({
      room,
      message: `No March Madness picks are recorded yet for ${seasonYear}.`
    })
    return
  }

  const names = await getDisplayNames(rows, getUserNicknameByUuidImpl)
  const lines = rows.map((row, index) => {
    const titleTag = getCompactEquippedTitleTag(row.uuid, 7)
    const compactName = compactLeaderboardName(names[index], row.uuid, titleTag ? 10 : 14)
    return `${index + 1}. ${titleTag ? `${titleTag} ` : ''}${compactName} ${row.points} pt${row.points === 1 ? '' : 's'} (${row.correctPicks}-${row.wrongPicks}${row.pendingPicks ? `, ${row.pendingPicks} pending` : ''})`
  })

  await postMessageImpl({
    room,
    message: [
      `🏆 **March Madness Pick'em Leaderboard** (${seasonYear})`,
      '_1 point per correct winner_',
      '',
      ...lines
    ].join('\n')
  })
}

export async function postMadnessBankrollLeaderboard (room, {
  args = '',
  postMessage: postMessageImpl = postMessage,
  getMarchMadnessSeasonYear: getMarchMadnessSeasonYearImpl = getMarchMadnessSeasonYear,
  getMarchMadnessBankrollLeaderboard: getMarchMadnessBankrollLeaderboardImpl = getMarchMadnessBankrollLeaderboard,
  resolveCompletedBets: resolveCompletedBetsImpl = resolveCompletedBets,
  getUserNicknameByUuid: getUserNicknameByUuidImpl = getUserNicknameByUuid
} = {}) {
  const requested = Number.parseInt(String(args || '').trim(), 10)
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 25)
    : 10

  const seasonYear = getMarchMadnessSeasonYearImpl()
  await resolveCompletedBetsImpl('basketball_ncaab')
  const rows = getMarchMadnessBankrollLeaderboardImpl(limit, seasonYear)

  if (!rows.length) {
    await postMessageImpl({
      room,
      message: `No March Madness betting results are recorded yet for ${seasonYear}.`
    })
    return
  }

  const names = await getDisplayNames(rows, getUserNicknameByUuidImpl)
  const lines = rows.map((row, index) => formatCompactLeaderboardLine({
    rank: index + 1,
    uuid: row.uuid,
    name: names[index],
    amount: row.amount
  }))

  await postMessageImpl({
    room,
    message: [
      `💸 **March Madness Bankroll Leaderboard** (${seasonYear})`,
      '_NCAAB tournament betting net_',
      '',
      ...lines
    ].join('\n')
  })
}

export async function handleMadnessPick ({ payload, room }, deps = {}) {
  const {
    postMessage: postMessageImpl = postMessage,
    getMadnessGamesCommandSlate: getMadnessGamesCommandSlateImpl = getMadnessGamesCommandSlate,
    upsertMarchMadnessPick: upsertMarchMadnessPickImpl = upsertMarchMadnessPick,
    getMarchMadnessSeasonYear: getMarchMadnessSeasonYearImpl = getMarchMadnessSeasonYear,
    now: nowImpl = () => new Date(),
    timeZone = 'America/New_York'
  } = deps

  const parts = String(payload?.message || '').trim().split(/\s+/)
  const rawIndex = Number.parseInt(parts[2], 10)
  const teamInput = parts.slice(3).join(' ').trim()

  if (!Number.isFinite(rawIndex) || rawIndex <= 0 || !teamInput) {
    await postMessageImpl({
      room,
      message: 'Usage: /madness pick <gameIndex> <teamCode>\nExample: /madness pick 1 DUKE'
    })
    return
  }

  const now = nowImpl()
  const games = await getMadnessGamesCommandSlateImpl({
    requestedDate: resolveMadnessGamesDateToken('', now, timeZone),
    now,
    timeZone,
    ...deps
  })
  const game = games[rawIndex - 1]
  if (!game) {
    await postMessageImpl({
      room,
      message: 'Invalid game index. You can only pick from the games currently shown in `/madness games`.'
    })
    return
  }

  const pickedTeamName = resolveMadnessPickTeamName(teamInput, game)
  if (!pickedTeamName) {
    const awayCode = getGenericDisplayTeamCode(game.awayTeam)
    const homeCode = getGenericDisplayTeamCode(game.homeTeam)
    await postMessageImpl({
      room,
      message: `Couldn't match "${teamInput}" to this game. Try one of: ${awayCode} or ${homeCode}.`
    })
    return
  }

  const result = upsertMarchMadnessPickImpl({
    seasonYear: getMarchMadnessSeasonYearImpl(),
    userUUID: payload?.sender,
    gameId: game.id,
    gameIndex: rawIndex - 1,
    teamName: pickedTeamName,
    awayTeam: game.awayTeam,
    awaySeed: game.awaySeed,
    homeTeam: game.homeTeam,
    homeSeed: game.homeSeed,
    commenceTime: game.commenceTime || null
  })

  if (!result.ok && result.reason === 'started') {
    await postMessageImpl({
      room,
      message: 'That game has already started, so picks are locked.'
    })
    return
  }

  if (!result.ok && result.reason === 'locked') {
    await postMessageImpl({
      room,
      message: 'That game has already been resolved, so the pick can’t be changed.'
    })
    return
  }

  if (!result.ok) {
    await postMessageImpl({
      room,
      message: 'Could not save that pick right now.'
    })
    return
  }

  await postMessageImpl({
    room,
    message: result.created
      ? `✅ Pick locked in: ${result.teamCode} for Game ${rawIndex}.`
      : `🔁 Pick updated: ${result.teamCode} for Game ${rawIndex}.`
  })
}

export async function postMadnessPicks (room, {
  payload,
  postMessage: postMessageImpl = postMessage,
  listMarchMadnessPicksForUser: listMarchMadnessPicksForUserImpl = listMarchMadnessPicksForUser,
  resolveMarchMadnessPicks: resolveMarchMadnessPicksImpl = resolveMarchMadnessPicks,
  getMarchMadnessSeasonYear: getMarchMadnessSeasonYearImpl = getMarchMadnessSeasonYear,
  getMarchMadnessGameboardGames: getMarchMadnessGameboardGamesImpl = getMarchMadnessGameboardGames,
  getMarchMadnessTournamentGames: getMarchMadnessTournamentGamesImpl = getMarchMadnessTournamentGames
} = {}) {
  const seasonYear = getMarchMadnessSeasonYearImpl()
  await resolveMarchMadnessPicksImpl({ seasonYear })
  const savedRows = listMarchMadnessPicksForUserImpl(payload?.sender, seasonYear)
  const tournamentRows = await filterMensMarchMadnessPicks(savedRows, {
    getMarchMadnessTournamentGames: getMarchMadnessTournamentGamesImpl
  })
  const rows = await enrichMadnessPicks(tournamentRows, {
    getMarchMadnessGameboardGames: getMarchMadnessGameboardGamesImpl
  })

  if (!rows.length) {
    await postMessageImpl({
      room,
      message: 'You have no March Madness picks yet. Try `/madness board` and then `/madness pick 1 DUKE`.'
    })
    return
  }

  const correct = rows.filter(row => row.status === 'correct').length
  const wrong = rows.filter(row => row.status === 'wrong').length
  const pending = rows.filter(row => row.status === 'pending').length
  const lines = rows.slice(0, 12).map((row) => {
    const matchup = formatMadnessMatchupLabel(row)
    const status = row.status === 'correct'
      ? '✅ correct'
      : row.status === 'wrong'
        ? `❌ missed (${row.winnerTeam})`
        : '⏳ pending'
    return `${row.gameIndex + 1}. ${row.teamCode} | ${matchup} | ${status}`
  })

  await postMessageImpl({
    room,
    message: [
      `🧾 **Your March Madness Picks** (${seasonYear})`,
      `${correct} correct, ${wrong} wrong, ${pending} pending`,
      '',
      ...lines
    ].join('\n')
  })
}

export async function postMadnessGames (room, {
  args = '',
  postMessage: postMessageImpl = postMessage,
  getMarchMadnessScores: getMarchMadnessScoresImpl = getMarchMadnessScores
} = {}) {
  const requestedDate = resolveMadnessGamesDateToken(args)
  const scoreboard = String(await getMarchMadnessScoresImpl(requestedDate) || '').trim()
  await postMessageImpl({ room, message: scoreboard })
}

export async function postMadnessPickBoard (room, {
  args = '',
  postMessage: postMessageImpl = postMessage,
  ensureMadnessOdds: ensureMadnessOddsImpl = ensureMadnessOdds,
  now: nowImpl = () => new Date(),
  timeZone = 'America/New_York'
} = {}) {
  const now = nowImpl()
  const requestedDate = resolveMadnessGamesDateToken(args, now, timeZone)
  const games = await ensureMadnessOddsImpl({ requestedDate, now, timeZone })
  const pickBoard = buildMadnessPickBoard(games, requestedDate, now, timeZone)

  await postMessageImpl({
    room,
    message: pickBoard || 'No pickable March Madness games are on the board for that date right now.'
  })
}

export async function postMadnessLiveScores (room, {
  args = '',
  postMessage: postMessageImpl = postMessage,
  getMarchMadnessLiveScores: getMarchMadnessLiveScoresImpl = getMarchMadnessLiveScores
} = {}) {
  const requestedDate = resolveMadnessGamesDateToken(args)
  const message = await getMarchMadnessLiveScoresImpl(requestedDate)
  await postMessageImpl({ room, message })
}

export function createMadnessCommandHandler (deps = {}) {
  const {
    postMessage: postMessageImpl = postMessage,
    buildMadnessHubMessage: buildMadnessHubMessageImpl = buildMadnessHubMessage,
    postMadnessGames: postMadnessGamesImpl = postMadnessGames,
    postMadnessPickBoard: postMadnessPickBoardImpl = postMadnessPickBoard,
    postMadnessLiveScores: postMadnessLiveScoresImpl = postMadnessLiveScores,
    postMadnessLeaderboard: postMadnessLeaderboardImpl = postMadnessLeaderboard,
    postMadnessBankrollLeaderboard: postMadnessBankrollLeaderboardImpl = postMadnessBankrollLeaderboard,
    handleMadnessPick: handleMadnessPickImpl = handleMadnessPick,
    postMadnessPicks: postMadnessPicksImpl = postMadnessPicks
  } = deps

  return async function handleMadnessCommand ({ payload, room }) {
    const parts = String(payload?.message || '').trim().split(/\s+/)
    const subcommand = String(parts[1] || '').toLowerCase()

    if (!subcommand || subcommand === 'help' || subcommand === 'info') {
      await postMessageImpl({
        room,
        message: buildMadnessHubMessageImpl()
      })
      return
    }

    if (subcommand === 'games') {
      await postMadnessGamesImpl(room, { args: parts.slice(2).join(' '), ...deps })
      return
    }

    if (subcommand === 'board' || subcommand === 'pickboard' || subcommand === 'pickgames') {
      await postMadnessPickBoardImpl(room, { args: parts.slice(2).join(' '), ...deps })
      return
    }

    if (subcommand === 'scores') {
      await postMadnessLiveScoresImpl(room, { args: parts.slice(2).join(' ') })
      return
    }

    if (subcommand === 'leaderboard' || subcommand === 'leaders' || subcommand === 'top') {
      await postMadnessLeaderboardImpl(room, { args: parts.slice(2).join(' ') })
      return
    }

    if (subcommand === 'bankroll' || subcommand === 'money' || subcommand === 'bets') {
      await postMadnessBankrollLeaderboardImpl(room, { args: parts.slice(2).join(' ') })
      return
    }

    if (subcommand === 'pick' || subcommand === 'picksubmit') {
      await handleMadnessPickImpl({ payload, room }, deps)
      return
    }

    if (subcommand === 'picks' || subcommand === 'mypicks') {
      await postMadnessPicksImpl(room, { payload, ...deps })
      return
    }

    await postMessageImpl({
      room,
      message: buildMadnessHubMessageImpl()
    })
  }
}

export async function handleMadnessCommand ({ payload, room }) {
  return createMadnessCommandHandler()({ payload, room })
}
