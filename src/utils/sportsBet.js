import {
  getUserWallet,
  addToUserWallet,
  debitGameBet,
  creditGameWin
} from '../database/dbwalletmanager.js'
import { getOddsForSport } from './bettingOdds.js'
import { promises as fs } from 'fs'
import { getLatestScoresForSport } from './sportsBetAPI.js'
import {
  getGenericDisplayTeamCode,
  resolveTeamNameFromInput
} from './sportsTeams.js'
import { MARCH_MADNESS_SOURCE } from '../database/dbmarchmadness.js'
import {
  getMarchMadnessTournamentMatchups
} from './API.js'
import {
  isMarchMadnessOddsGame
} from './marchMadness.js'

const BETS_FILE = 'src/data/bets.json'
const STALE_BET_GRACE_MS = 36 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_SCORE_LOOKBACK_DAYS = 7

const mlbGamesCache = []

function normalizeUserUuid (value) {
  const raw = Array.isArray(value) ? value[0] : value
  return String(raw || '').trim()
}

function toTimestamp (value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return NaN
}

function getBetExpiryTimestamp (bet) {
  const commenceAt = toTimestamp(bet?.commenceTime)
  if (Number.isFinite(commenceAt)) return commenceAt + STALE_BET_GRACE_MS

  const createdAt = toTimestamp(bet?.createdAt)
  if (Number.isFinite(createdAt)) return createdAt + STALE_BET_GRACE_MS

  return 0
}

function isLegacyPendingBet (bet) {
  return bet?.status === 'pending' && !Number.isFinite(toTimestamp(bet?.commenceTime)) && !Number.isFinite(toTimestamp(bet?.createdAt))
}

function getBetSettledTimestamp (bet) {
  return (
    toTimestamp(bet?.settledAt) ||
    toTimestamp(bet?.resolvedAt) ||
    toTimestamp(bet?.refundedAt) ||
    NaN
  )
}

function getStoredSettlementOutcome (bet) {
  const stored = String(bet?.settlementOutcome || '').trim().toLowerCase()
  if (['win', 'loss', 'push', 'refund'].includes(stored)) return stored

  if (String(bet?.refundReason || '').trim().toLowerCase().startsWith('push_')) return 'push'
  if (bet?.status === 'refunded') return 'refund'
  return ''
}

async function refundStaleBet (bet, reason) {
  const amount = Math.max(0, Math.floor(Number(bet?.amount || 0)))
  if (amount > 0) {
    await addToUserWallet(normalizeUserUuid(bet?.senderUUID), amount, null, buildSportsBetMeta({
      sport: bet?.sport,
      source: bet?.ledgerSource || null,
      category: 'refund',
      teamName: bet?.teamName || null,
      teamCode: bet?.teamCode || bet?.team || null,
      amount,
      gameId: bet?.gameId || null
    }))
  }

  bet.status = 'refunded'
  bet.refundedAt = new Date().toISOString()
  bet.refundReason = reason
  bet.settlementOutcome = 'refund'
  bet.settledAt = bet.refundedAt
}

export async function loadBets () {
  try {
    const data = await fs.readFile(BETS_FILE, 'utf8')
    return JSON.parse(data)
  } catch (err) {
    if (err.code === 'ENOENT') return {} // File doesn't exist yet
    throw err
  }
}

export async function saveBets (betsObj) {
  try {
    await fs.writeFile(BETS_FILE, JSON.stringify(betsObj, null, 2))
    console.log('[saveBets] Bets saved.')
  } catch (err) {
    console.error('[saveBets] Failed to write bets.json:', err)
    throw err
  }
}

// Converts numeric odds to string with + or - prefix for American odds
export function formatOdds (price) {
  return price > 0 ? `+${price}` : `${price}`
}

function getSportsBetSource (sport, ledgerSource = null) {
  if (ledgerSource) return ledgerSource
  return 'sports'
}

function buildSportsBetMeta ({ sport, category, teamName, teamCode, amount, gameId, source = null }) {
  return {
    source: getSportsBetSource(sport, source),
    category,
    note: `${sport}:${teamCode || teamName || gameId || 'game'}`,
    sport,
    gameId: gameId || null,
    teamName: teamName || null,
    teamCode: teamCode || null,
    amount: Number(amount || 0)
  }
}

function formatSpreadPoint (point) {
  return Number(point) > 0 ? `+${point}` : `${point}`
}

function formatSportsBetBoardLabel (sportKey = '') {
  return sportKey === 'basketball_ncaab_madness' ? 'March Madness' : sportKey
}

function getGameWinnerTeamName (game = {}) {
  const homeScore = Number(game?.scores?.home)
  const awayScore = Number(game?.scores?.away)

  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore === awayScore) {
    return null
  }

  return homeScore > awayScore ? game.homeTeam : game.awayTeam
}

function didSportsBetWin (bet, winnerTeamName, gameTeams = []) {
  const normalizedWinner = String(winnerTeamName || '').trim().toLowerCase()
  if (!normalizedWinner) return false

  const winnerCode = String(getGenericDisplayTeamCode(winnerTeamName) || '').trim().toLowerCase()
  const storedName = String(bet?.teamName || '').trim().toLowerCase()
  const storedCode = String(bet?.teamCode || bet?.team || '').trim().toLowerCase()

  if (storedName && storedName === normalizedWinner) return true
  if (storedCode && winnerCode && storedCode === winnerCode) return true

  const resolvedTeamName = resolveTeamNameFromInput(bet?.team, gameTeams)
  return String(resolvedTeamName || '').trim().toLowerCase() === normalizedWinner
}

function getSelectedTeamName (bet, game = {}) {
  return resolveTeamNameFromInput(
    bet?.teamName || bet?.teamCode || bet?.team,
    [game.awayTeam, game.homeTeam]
  ) || bet?.teamName || null
}

function evaluateMoneylineBet (bet, game) {
  const winnerTeamName = getGameWinnerTeamName(game)
  if (!winnerTeamName) return 'push'
  return didSportsBetWin(bet, winnerTeamName, [game.awayTeam, game.homeTeam]) ? 'win' : 'loss'
}

function evaluateSpreadBet (bet, game) {
  const spreadPoint = Number(bet?.spreadPoint)
  if (!Number.isFinite(spreadPoint)) return 'push'

  const selectedTeamName = getSelectedTeamName(bet, game)
  if (!selectedTeamName) return 'push'
  if (selectedTeamName !== game.homeTeam && selectedTeamName !== game.awayTeam) return 'push'

  const homeScore = Number(game?.scores?.home)
  const awayScore = Number(game?.scores?.away)
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return 'push'

  const isHomeTeam = selectedTeamName === game.homeTeam
  const selectedScore = isHomeTeam ? homeScore : awayScore
  const opponentScore = isHomeTeam ? awayScore : homeScore
  const adjustedMargin = Number((selectedScore + spreadPoint - opponentScore).toFixed(4))

  if (adjustedMargin > 0) return 'win'
  if (adjustedMargin < 0) return 'loss'
  return 'push'
}

function evaluateBetOutcome (bet, game) {
  if (bet?.type === 'ml') return evaluateMoneylineBet(bet, game)
  if (bet?.type === 'spread') return evaluateSpreadBet(bet, game)
  return 'loss'
}

function getSettlementLookbackDays (bets = {}, sportKey, now = Date.now()) {
  let oldestPendingTs = Infinity

  for (const gameBets of Object.values(bets)) {
    for (const bet of gameBets || []) {
      if (bet?.status !== 'pending' || bet?.sport !== sportKey) continue

      const commenceTs = toTimestamp(bet?.commenceTime)
      const createdTs = toTimestamp(bet?.createdAt)
      const candidateTs = Number.isFinite(commenceTs) ? commenceTs : createdTs
      if (Number.isFinite(candidateTs) && candidateTs < oldestPendingTs) oldestPendingTs = candidateTs
    }
  }

  if (!Number.isFinite(oldestPendingTs)) return 1

  const elapsed = Math.max(0, now - oldestPendingTs)
  return Math.max(1, Math.min(MAX_SCORE_LOOKBACK_DAYS, Math.ceil(elapsed / DAY_MS) + 1))
}

export async function placeSportsBet (senderUUID, index, team, betTypeInput, amount, sport, options = {}) {
  const {
    oddsSportKey = sport,
    ledgerSource: forcedLedgerSource = null,
    resolvedTeamName: forcedResolvedTeamName = null,
    preferredTeamCode: forcedPreferredTeamCode = null
  } = options
  const normalizedSenderUUID = normalizeUserUuid(senderUUID)
  const games = await getOddsForSport(oddsSportKey)
  if (!games || index < 0 || index >= games.length) {
    return `Game ${index + 1} not found for ${formatSportsBetBoardLabel(oddsSportKey)}.`
  }

  const game = games[index]
  const bookmaker = game.bookmaker
  if (!bookmaker) return `Odds unavailable for game ${index + 1}.`

  const h2h = bookmaker.markets.find(m => m.key === 'h2h')?.outcomes || []
  const spreads = bookmaker.markets.find(m => m.key === 'spreads')?.outcomes || []
  const ledgerSource = forcedLedgerSource || (sport === 'basketball_ncaab'
    ? (isMarchMadnessOddsGame(game, await getMarchMadnessTournamentMatchups(['yesterday', 'today', 'tomorrow']))
        ? MARCH_MADNESS_SOURCE
        : 'sports')
    : 'sports')

  const teamAbbrUpper = team.toUpperCase()
  const fullTeamName = forcedResolvedTeamName || resolveTeamNameFromInput(teamAbbrUpper, [game.awayTeam, game.homeTeam])

  if (!fullTeamName) return `Invalid team abbreviation for game ${index + 1}.`
  const teamCode = forcedPreferredTeamCode || getGenericDisplayTeamCode(fullTeamName)

  const betType = betTypeInput.toLowerCase()
  let oddsObj

  if (betType === 'ml') {
    oddsObj = h2h.find(o => o.name === fullTeamName)
  } else if (betType === 'spread') {
    oddsObj = spreads.find(o => o.name === fullTeamName)
  } else {
    return `Invalid bet type "${betTypeInput}". Use "ml" or "spread".`
  }

  if (!oddsObj) return `Odds not found for ${teamAbbrUpper} (${betType}) in game ${index + 1}.`

  const odds = oddsObj.price
  const spreadPoint = betType === 'spread' ? Number(oddsObj.point) : null

  const wallet = await getUserWallet(normalizedSenderUUID)
  if (wallet < amount) return `Insufficient funds. You have $${wallet}.`

  const removeSuccess = debitGameBet(normalizedSenderUUID, amount, buildSportsBetMeta({
    sport,
    source: ledgerSource,
    category: 'bet',
    teamName: fullTeamName,
    teamCode,
    amount,
    gameId: game.id
  }))
  if (!removeSuccess) return 'Failed to debit wallet. Try again later.'

  try {
    const bets = await loadBets()
    if (!bets[game.id]) bets[game.id] = []

    bets[game.id].push({
      senderUUID: normalizedSenderUUID,
      gameIndex: index,
      gameId: game.id,
      sport,
      ledgerSource,
      teamName: fullTeamName,
      teamCode,
      team: teamAbbrUpper,
      odds,
      spreadPoint,
      amount,
      createdAt: new Date().toISOString(),
      commenceTime: game.commenceTime || null,
      status: 'pending',
      type: betType
    })

    await saveBets(bets)
  } catch (err) {
    await addToUserWallet(normalizedSenderUUID, amount, null, buildSportsBetMeta({
      sport,
      category: 'refund',
      source: ledgerSource,
      teamName: fullTeamName,
      teamCode,
      amount,
      gameId: game.id
    }))
    return 'Failed to record bet. Your wager was refunded.'
  }

  const betLabel = betType === 'spread'
    ? `${teamCode} (${betType} ${formatSpreadPoint(spreadPoint)})`
    : `${teamCode} (${betType})`

  return `✅ Bet placed! $${amount} on ${betLabel} at ${formatOdds(odds)} odds (Game ${index + 1}, ${formatSportsBetBoardLabel(oddsSportKey)}).`
}

export async function resolveCompletedBets (sportKey) {
  const bets = await loadBets()
  const now = Date.now()
  const scoreLookbackDays = getSettlementLookbackDays(bets, sportKey, now)
  const completedGames = await getLatestScoresForSport(sportKey, scoreLookbackDays)
  let updated = false

  for (const game of completedGames) {
    const { id: gameId, homeTeam, awayTeam, scores } = game
    if (!bets[gameId]) continue

    for (const bet of bets[gameId]) {
      if (bet.status !== 'pending' || bet?.sport !== sportKey) continue

      const outcome = evaluateBetOutcome(bet, { homeTeam, awayTeam, scores })
      const settledAt = new Date().toISOString()

      if (outcome === 'win') {
        const payout = bet.amount + calculateWinnings(bet.amount, bet.odds)
        await creditGameWin(bet.senderUUID, payout, null, buildSportsBetMeta({
          sport: bet.sport,
          source: bet.ledgerSource || null,
          category: 'bet_win',
          teamName: bet.teamName || getSelectedTeamName(bet, { awayTeam, homeTeam }),
          teamCode: bet.teamCode || getGenericDisplayTeamCode(getSelectedTeamName(bet, { awayTeam, homeTeam })),
          amount: payout,
          gameId
        }))
        console.log(`✅ Paid out $${payout} to ${bet.senderUUID} (${String(bet.type || '').toUpperCase()} win on ${bet.teamCode || bet.team})`)
      } else if (outcome === 'push') {
        await addToUserWallet(bet.senderUUID, bet.amount, null, buildSportsBetMeta({
          sport: bet.sport,
          source: bet.ledgerSource || null,
          category: 'refund',
          teamName: bet.teamName || getSelectedTeamName(bet, { awayTeam, homeTeam }),
          teamCode: bet.teamCode || getGenericDisplayTeamCode(getSelectedTeamName(bet, { awayTeam, homeTeam })),
          amount: bet.amount,
          gameId
        }))
        bet.refundedAt = settledAt
        bet.refundReason = bet.type === 'spread' ? 'push_spread' : 'push_ml'
      }

      bet.status = 'completed'
      bet.settlementOutcome = outcome
      bet.settledAt = settledAt
      updated = true
    }
  }

  for (const gameBets of Object.values(bets)) {
    for (const bet of gameBets || []) {
      if (bet?.status !== 'pending' || bet?.sport !== sportKey) continue

      if (isLegacyPendingBet(bet)) {
        await refundStaleBet(bet, 'legacy_pending_cleanup')
        updated = true
        continue
      }

      const expiryTs = getBetExpiryTimestamp(bet)
      if (!expiryTs || now < expiryTs) continue

      await refundStaleBet(bet, 'stale_unresolved')
      updated = true
    }
  }

  if (updated) await saveBets(bets)
}

export async function getOpenBetsForUser (userUUID) {
  const normalizedUserUUID = normalizeUserUuid(userUUID)
  const bets = await loadBets()
  const rows = []

  for (const [gameId, gameBets] of Object.entries(bets)) {
    for (const bet of gameBets || []) {
      if (normalizeUserUuid(bet?.senderUUID) !== normalizedUserUUID || bet?.status !== 'pending') continue

      rows.push({
        ...bet,
        gameId
      })
    }
  }

  return rows.sort((a, b) => {
    const sportCompare = String(a.sport || '').localeCompare(String(b.sport || ''))
    if (sportCompare !== 0) return sportCompare
    return Number(a.gameIndex || 0) - Number(b.gameIndex || 0)
  })
}

export async function getBetsForUser (userUUID) {
  const normalizedUserUUID = normalizeUserUuid(userUUID)
  const bets = await loadBets()
  const rows = []
  const unresolvedBySport = new Map()

  for (const [gameId, gameBets] of Object.entries(bets)) {
    for (const bet of gameBets || []) {
      if (normalizeUserUuid(bet?.senderUUID) !== normalizedUserUUID) continue

      const row = {
        ...bet,
        gameId,
        settlementOutcome: getStoredSettlementOutcome(bet) || null,
        settledAt: Number.isFinite(getBetSettledTimestamp(bet))
          ? new Date(getBetSettledTimestamp(bet)).toISOString()
          : null
      }

      rows.push(row)

      if (
        row.status === 'completed' &&
        !row.settlementOutcome &&
        row.sport &&
        !unresolvedBySport.has(row.sport)
      ) {
        unresolvedBySport.set(row.sport, null)
      }
    }
  }

  for (const sport of unresolvedBySport.keys()) {
    try {
      const scores = await getLatestScoresForSport(sport, MAX_SCORE_LOOKBACK_DAYS)
      unresolvedBySport.set(
        sport,
        new Map((scores || []).map(game => [String(game?.id || ''), game]))
      )
    } catch {
      unresolvedBySport.set(sport, new Map())
    }
  }

  return rows.map((bet) => {
    if (bet.settlementOutcome || bet.status !== 'completed') return bet

    const scoreMap = unresolvedBySport.get(bet.sport)
    const game = scoreMap?.get(String(bet.gameId || ''))
    if (!game) return bet

    return {
      ...bet,
      settlementOutcome: evaluateBetOutcome(bet, game)
    }
  }).sort((a, b) => {
    const aSettled = getBetSettledTimestamp(a)
    const bSettled = getBetSettledTimestamp(b)
    if (Number.isFinite(aSettled) || Number.isFinite(bSettled)) {
      if (!Number.isFinite(aSettled)) return 1
      if (!Number.isFinite(bSettled)) return -1
      return bSettled - aSettled
    }

    const aCreated = toTimestamp(a?.createdAt)
    const bCreated = toTimestamp(b?.createdAt)
    if (Number.isFinite(aCreated) || Number.isFinite(bCreated)) {
      if (!Number.isFinite(aCreated)) return 1
      if (!Number.isFinite(bCreated)) return -1
      return bCreated - aCreated
    }

    return String(a.gameId || '').localeCompare(String(b.gameId || ''))
  })
}

function calculateWinnings (amount, odds) {
  return odds > 0
    ? Math.round((amount * odds) / 100) // +138 -> win $138 on $100
    : Math.round((amount * 100) / Math.abs(odds)) // -150 -> win $66.67 on $100
}

export {
  evaluateBetOutcome,
  formatSpreadPoint,
  getGameWinnerTeamName,
  getSettlementLookbackDays,
  mlbGamesCache
}
