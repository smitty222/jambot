import { postMessage } from '../libs/cometchat.js'
import { getCurrentMonthKey } from '../database/dbwalletmanager.js'
import { getCompactEquippedTitleTag } from '../database/dbprestige.js'
import { getNCAABLiveScores, getUserNicknameByUuid } from '../utils/API.js'
import { fetchOddsForSport } from '../utils/sportsBetAPI.js'
import { getOddsForSport, saveOddsForSport } from '../utils/bettingOdds.js'
import { resolveCompletedBets } from '../utils/sportsBet.js'
import { resolveTeamNameFromInput } from '../utils/sportsTeams.js'
import { handleNcaabScoresCommand } from './sportsCommands.js'
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
  getOddsForSport: getOddsForSportImpl = getOddsForSport,
  fetchOddsForSport: fetchOddsForSportImpl = fetchOddsForSport,
  saveOddsForSport: saveOddsForSportImpl = saveOddsForSport
} = {}) {
  let games = await getOddsForSportImpl('basketball_ncaab')
  if (Array.isArray(games) && games.length) return games

  const freshGames = await fetchOddsForSportImpl('basketball_ncaab')
  if (Array.isArray(freshGames) && freshGames.length) {
    await saveOddsForSportImpl('basketball_ncaab', freshGames)
    games = freshGames
  }

  return Array.isArray(games) ? games : []
}

export function buildMadnessHubMessage (monthKey = getCurrentMonthKey()) {
  return [
    '🏀 March Madness',
    '',
    `Tournament hub for ${monthKey}.`,
    '',
    'Try:',
    '- `/madness games`',
    '- `/madness games 2026-03-19`',
    '- `/madness pick 1 duke`',
    '- `/madness picks`',
    '- `/madness leaderboard`',
    '- `/madness bankroll`',
    '',
    'Betting shortcuts:',
    '- `/sports odds ncaab`',
    '- `/sports bet ncaab 1 duke ml 25`',
    '- `/sports bets`'
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
    ensureMadnessOdds: ensureMadnessOddsImpl = ensureMadnessOdds,
    upsertMarchMadnessPick: upsertMarchMadnessPickImpl = upsertMarchMadnessPick,
    getMarchMadnessSeasonYear: getMarchMadnessSeasonYearImpl = getMarchMadnessSeasonYear
  } = deps

  const parts = String(payload?.message || '').trim().split(/\s+/)
  const rawIndex = Number.parseInt(parts[2], 10)
  const teamInput = parts.slice(3).join(' ').trim()

  if (!Number.isFinite(rawIndex) || rawIndex <= 0 || !teamInput) {
    await postMessageImpl({
      room,
      message: 'Usage: /madness pick <gameIndex> <team>\nExample: /madness pick 1 duke'
    })
    return
  }

  const games = await ensureMadnessOddsImpl(deps)
  const game = games[rawIndex - 1]
  if (!game) {
    await postMessageImpl({
      room,
      message: 'Invalid game index. Use `/sports odds ncaab` to see the current board.'
    })
    return
  }

  const pickedTeamName = resolveTeamNameFromInput(teamInput, [game.awayTeam, game.homeTeam])
  if (!pickedTeamName) {
    await postMessageImpl({
      room,
      message: `Couldn't match "${teamInput}" to this game. Try one of: ${game.awayTeam} or ${game.homeTeam}.`
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
    homeTeam: game.homeTeam,
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
      ? `✅ Pick locked in: ${result.teamName} for Game ${rawIndex}.`
      : `🔁 Pick updated: ${result.teamName} for Game ${rawIndex}.`
  })
}

export async function postMadnessPicks (room, {
  payload,
  postMessage: postMessageImpl = postMessage,
  listMarchMadnessPicksForUser: listMarchMadnessPicksForUserImpl = listMarchMadnessPicksForUser,
  resolveMarchMadnessPicks: resolveMarchMadnessPicksImpl = resolveMarchMadnessPicks,
  getMarchMadnessSeasonYear: getMarchMadnessSeasonYearImpl = getMarchMadnessSeasonYear
} = {}) {
  const seasonYear = getMarchMadnessSeasonYearImpl()
  await resolveMarchMadnessPicksImpl({ seasonYear })
  const rows = listMarchMadnessPicksForUserImpl(payload?.sender, seasonYear)

  if (!rows.length) {
    await postMessageImpl({
      room,
      message: 'You have no March Madness picks yet. Try `/madness pick 1 duke`.'
    })
    return
  }

  const correct = rows.filter(row => row.status === 'correct').length
  const wrong = rows.filter(row => row.status === 'wrong').length
  const pending = rows.filter(row => row.status === 'pending').length
  const lines = rows.slice(0, 12).map((row) => {
    const matchup = `${row.awayTeam} @ ${row.homeTeam}`
    const status = row.status === 'correct'
      ? '✅ correct'
      : row.status === 'wrong'
        ? `❌ missed (${row.winnerTeam})`
        : '⏳ pending'
    return `${row.gameIndex + 1}. ${row.teamName} | ${matchup} | ${status}`
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

export async function postMadnessLiveScores (room, {
  args = '',
  postMessage: postMessageImpl = postMessage,
  getNCAABLiveScores: getNCAABLiveScoresImpl = getNCAABLiveScores
} = {}) {
  const requestedDate = resolveMadnessGamesDateToken(args)
  const message = await getNCAABLiveScoresImpl(requestedDate)
  await postMessageImpl({ room, message })
}

export function createMadnessCommandHandler (deps = {}) {
  const {
    postMessage: postMessageImpl = postMessage,
    buildMadnessHubMessage: buildMadnessHubMessageImpl = buildMadnessHubMessage,
    handleNcaabScoresCommand: handleNcaabScoresCommandImpl = handleNcaabScoresCommand,
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
      const requestedDate = ` ${resolveMadnessGamesDateToken(parts[2])}`
      await handleNcaabScoresCommandImpl({
        payload: { ...payload, message: `/ncaab${requestedDate}`.trim() },
        room
      })
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
