import db from './db.js'
import { getMarchMadnessTournamentGames } from '../utils/API.js'
import {
  getGenericDisplayTeamCode,
  normalizeSportsTeamInput
} from '../utils/sportsTeams.js'

export const MARCH_MADNESS_SOURCE = 'sports_ncaab_madness'
export const MARCH_MADNESS_CORRECT_PICK_POINTS = 1

function normalizeSeasonYear (value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 2020 ? parsed : new Date().getFullYear()
}

export function getMarchMadnessSeasonYear (date = new Date()) {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return new Date().getFullYear()
  return parsed.getFullYear()
}

export function getMarchMadnessSeasonWindow (seasonYear = getMarchMadnessSeasonYear()) {
  const year = normalizeSeasonYear(seasonYear)
  return {
    seasonYear: year,
    startAt: `${year}-03-01 00:00:00`,
    endAt: `${year}-04-16 00:00:00`
  }
}

export function getMarchMadnessWinnerTeam (game = {}) {
  const homeScore = Number(game?.scores?.home)
  const awayScore = Number(game?.scores?.away)

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore === awayScore) {
    return null
  }

  return homeScore > awayScore ? game.homeTeam : game.awayTeam
}

export function didMarchMadnessPickWin (pick = {}, winnerTeamName = '') {
  const normalizedWinner = normalizeSportsTeamInput(winnerTeamName)
  if (!normalizedWinner) return false

  const winnerCode = getGenericDisplayTeamCode(winnerTeamName)
  const normalizedPickName = normalizeSportsTeamInput(pick.teamName)
  const normalizedPickCode = normalizeSportsTeamInput(pick.teamCode)

  return normalizedPickName === normalizedWinner || normalizedPickCode === normalizeSportsTeamInput(winnerCode)
}

export function upsertMarchMadnessPick ({
  seasonYear = getMarchMadnessSeasonYear(),
  userUUID,
  gameId,
  gameIndex = 0,
  teamName,
  awayTeam,
  homeTeam,
  commenceTime = null
} = {}) {
  if (!userUUID || !gameId || !teamName || !awayTeam || !homeTeam) {
    return { ok: false, reason: 'invalid' }
  }

  const normalizedSeason = normalizeSeasonYear(seasonYear)
  const now = Date.now()
  const startsAtTs = Date.parse(commenceTime || '')
  if (Number.isFinite(startsAtTs) && now >= startsAtTs) {
    return { ok: false, reason: 'started' }
  }

  const existing = db.prepare(`
    SELECT id, status, commenceTime
    FROM march_madness_picks
    WHERE seasonYear = ? AND userUUID = ? AND gameId = ?
  `).get(normalizedSeason, String(userUUID), String(gameId))

  const existingStartsAtTs = Date.parse(existing?.commenceTime || '')
  if (existing?.status && existing.status !== 'pending') {
    return { ok: false, reason: 'locked' }
  }
  if (Number.isFinite(existingStartsAtTs) && now >= existingStartsAtTs) {
    return { ok: false, reason: 'started' }
  }

  const teamCode = getGenericDisplayTeamCode(teamName)

  db.prepare(`
    INSERT INTO march_madness_picks (
      seasonYear, userUUID, gameId, gameIndex, teamName, teamCode,
      awayTeam, homeTeam, commenceTime, status, winnerTeam, pointsAwarded,
      createdAt, updatedAt, resolvedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
    ON CONFLICT(seasonYear, userUUID, gameId) DO UPDATE SET
      gameIndex = excluded.gameIndex,
      teamName = excluded.teamName,
      teamCode = excluded.teamCode,
      awayTeam = excluded.awayTeam,
      homeTeam = excluded.homeTeam,
      commenceTime = excluded.commenceTime,
      updatedAt = CURRENT_TIMESTAMP
  `).run(
    normalizedSeason,
    String(userUUID),
    String(gameId),
    Math.max(0, Math.floor(Number(gameIndex || 0))),
    String(teamName),
    String(teamCode),
    String(awayTeam),
    String(homeTeam),
    commenceTime || null
  )

  return {
    ok: true,
    created: !existing,
    updated: !!existing,
    teamCode,
    teamName: String(teamName)
  }
}

export function listMarchMadnessPicksForUser (userUUID, seasonYear = getMarchMadnessSeasonYear()) {
  return db.prepare(`
    SELECT
      userUUID,
      gameId,
      gameIndex,
      teamName,
      teamCode,
      awayTeam,
      homeTeam,
      commenceTime,
      status,
      winnerTeam,
      pointsAwarded,
      createdAt,
      updatedAt,
      resolvedAt
    FROM march_madness_picks
    WHERE seasonYear = ? AND userUUID = ?
    ORDER BY datetime(commenceTime) ASC, gameIndex ASC, id ASC
  `).all(normalizeSeasonYear(seasonYear), String(userUUID)).map(row => ({
    ...row,
    gameIndex: Number(row.gameIndex || 0),
    pointsAwarded: Number(row.pointsAwarded || 0)
  }))
}

export function getMarchMadnessPointsLeaderboard (limit = 10, seasonYear = getMarchMadnessSeasonYear()) {
  const maxRows = Math.max(1, Math.min(25, Math.floor(Number(limit || 10))))

  return db.prepare(`
    SELECT
      userUUID,
      SUM(pointsAwarded) AS totalPoints,
      SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) AS correctPicks,
      SUM(CASE WHEN status = 'wrong' THEN 1 ELSE 0 END) AS wrongPicks,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingPicks,
      COUNT(*) AS totalPicks
    FROM march_madness_picks
    WHERE seasonYear = ?
    GROUP BY userUUID
    HAVING COUNT(*) > 0
    ORDER BY totalPoints DESC, correctPicks DESC, pendingPicks DESC, userUUID ASC
    LIMIT ?
  `).all(normalizeSeasonYear(seasonYear), maxRows).map(row => ({
    uuid: String(row.userUUID),
    points: Number(row.totalPoints || 0),
    correctPicks: Number(row.correctPicks || 0),
    wrongPicks: Number(row.wrongPicks || 0),
    pendingPicks: Number(row.pendingPicks || 0),
    totalPicks: Number(row.totalPicks || 0)
  }))
}

export function getMarchMadnessBankrollLeaderboard (limit = 10, seasonYear = getMarchMadnessSeasonYear()) {
  const maxRows = Math.max(1, Math.min(25, Math.floor(Number(limit || 10))))
  const window = getMarchMadnessSeasonWindow(seasonYear)

  return db.prepare(`
    SELECT
      userUUID,
      SUM(amount) AS total,
      COUNT(*) AS eventCount
    FROM economy_events
    WHERE createdAt >= ?
      AND createdAt < ?
      AND source = ?
    GROUP BY userUUID
    HAVING ABS(total) > 0
    ORDER BY total DESC, eventCount DESC, userUUID ASC
    LIMIT ?
  `).all(window.startAt, window.endAt, MARCH_MADNESS_SOURCE, maxRows).map((row, index) => ({
    rank: index + 1,
    uuid: String(row.userUUID),
    amount: Number(row.total || 0),
    eventCount: Number(row.eventCount || 0),
    seasonYear: window.seasonYear
  }))
}

export async function resolveMarchMadnessPicks (deps = {}) {
  const {
    seasonYear = getMarchMadnessSeasonYear(),
    getMarchMadnessTournamentGames: getMarchMadnessTournamentGamesImpl = getMarchMadnessTournamentGames
  } = deps

  const normalizedSeason = normalizeSeasonYear(seasonYear)
  const pendingRows = db.prepare(`
    SELECT DISTINCT substr(commenceTime, 1, 10) AS gameDate
    FROM march_madness_picks
    WHERE seasonYear = ? AND status = 'pending' AND commenceTime IS NOT NULL
  `).all(normalizedSeason)

  const requestedDates = pendingRows
    .map(row => String(row?.gameDate || '').trim())
    .filter(Boolean)

  if (!requestedDates.length) {
    return { resolvedGames: 0, resolvedPicks: 0 }
  }

  const completedGames = (await getMarchMadnessTournamentGamesImpl(requestedDates))
    .filter(game => game?.completed)

  if (!completedGames.length) return { resolvedGames: 0, resolvedPicks: 0 }

  let resolvedGames = 0
  let resolvedPicks = 0
  const update = db.prepare(`
    UPDATE march_madness_picks
    SET status = ?, winnerTeam = ?, pointsAwarded = ?, resolvedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP
    WHERE seasonYear = ? AND gameId = ? AND userUUID = ?
  `)

  for (const game of completedGames) {
    const winnerTeam = getMarchMadnessWinnerTeam(game)
    if (!winnerTeam) continue

    const picks = db.prepare(`
      SELECT userUUID, gameId, teamName, teamCode
      FROM march_madness_picks
      WHERE seasonYear = ? AND gameId = ? AND status = 'pending'
    `).all(normalizedSeason, String(game.id))

    if (!picks.length) continue
    resolvedGames += 1

    for (const pick of picks) {
      const won = didMarchMadnessPickWin(pick, winnerTeam)
      update.run(
        won ? 'correct' : 'wrong',
        winnerTeam,
        won ? MARCH_MADNESS_CORRECT_PICK_POINTS : 0,
        normalizedSeason,
        String(game.id),
        String(pick.userUUID)
      )
      resolvedPicks += 1
    }
  }

  return { resolvedGames, resolvedPicks }
}
