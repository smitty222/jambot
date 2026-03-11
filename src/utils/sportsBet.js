import { getUserWallet, removeFromUserWallet, addToUserWallet } from '../database/dbwalletmanager.js'
import { getOddsForSport } from './bettingOdds.js'
import { promises as fs } from 'fs'
import { getLatestScoresForSport } from './sportsBetAPI.js'
import {
  getMlbTeamAbbreviation,
  resolveTeamNameFromInput
} from './sportsTeams.js'

const BETS_FILE = 'src/data/bets.json'
const STALE_BET_GRACE_MS = 36 * 60 * 60 * 1000

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

async function refundStaleBet (bet, reason) {
  const amount = Math.max(0, Math.floor(Number(bet?.amount || 0)))
  if (amount > 0) {
    await addToUserWallet(normalizeUserUuid(bet?.senderUUID), amount)
  }

  bet.status = 'refunded'
  bet.refundedAt = new Date().toISOString()
  bet.refundReason = reason
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
  }
}

// Converts numeric odds to string with + or - prefix for American odds
export function formatOdds (price) {
  return price > 0 ? `+${price}` : `${price}`
}

export async function placeSportsBet (senderUUID, index, team, betTypeInput, amount, sport) {
  const normalizedSenderUUID = normalizeUserUuid(senderUUID)
  const games = await getOddsForSport(sport)
  if (!games || index < 0 || index >= games.length) {
    return `Game ${index + 1} not found for ${sport}.`
  }

  const game = games[index]
  const bookmaker = game.bookmaker
  if (!bookmaker) return `Odds unavailable for game ${index + 1}.`

  const h2h = bookmaker.markets.find(m => m.key === 'h2h')?.outcomes || []
  const spreads = bookmaker.markets.find(m => m.key === 'spreads')?.outcomes || []

  const teamAbbrUpper = team.toUpperCase()
  const fullTeamName = resolveTeamNameFromInput(teamAbbrUpper, [game.awayTeam, game.homeTeam])

  if (!fullTeamName) return `Invalid team abbreviation for game ${index + 1}.`

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

  const wallet = await getUserWallet(normalizedSenderUUID)
  if (wallet < amount) return `Insufficient funds. You have $${wallet}.`

  const removeSuccess = await removeFromUserWallet(normalizedSenderUUID, amount)
  if (!removeSuccess) return 'Failed to debit wallet. Try again later.'

  const bets = await loadBets()
  if (!bets[game.id]) bets[game.id] = []

  bets[game.id].push({
    senderUUID: normalizedSenderUUID,
    gameIndex: index,
    gameId: game.id,
    sport,
    team: teamAbbrUpper,
    odds,
    amount,
    createdAt: new Date().toISOString(),
    commenceTime: game.commenceTime || null,
    status: 'pending',
    type: betType
  })

  await saveBets(bets)

  return `✅ Bet placed! $${amount} on ${teamAbbrUpper} (${betType}) at ${formatOdds(odds)} odds (Game ${index + 1}, ${sport}).`
}

export async function resolveCompletedBets (sportKey) {
  const bets = await loadBets()
  const completedGames = await getLatestScoresForSport(sportKey)
  const now = Date.now()
  let updated = false

  for (const game of completedGames) {
    const { id: gameId, homeTeam, awayTeam, scores } = game
    if (!bets[gameId]) continue

    const homeAbbr = getMlbTeamAbbreviation(homeTeam)
    const awayAbbr = getMlbTeamAbbreviation(awayTeam)

    const winner = scores.home > scores.away ? homeAbbr : awayAbbr

    for (const bet of bets[gameId]) {
      if (bet.status !== 'pending') continue

      const betTeam = bet.team
      const isWinner = bet.type === 'ml' && betTeam === winner

      if (isWinner) {
        const payout = calculateWinnings(bet.amount, bet.odds)
        await addToUserWallet(bet.senderUUID, payout)
        console.log(`✅ Paid out $${payout} to ${bet.senderUUID} (ML win on ${betTeam})`)
      }

      bet.status = 'completed'
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

function calculateWinnings (amount, odds) {
  return odds > 0
    ? Math.round((amount * odds) / 100) // +138 -> win $138 on $100
    : Math.round((amount * 100) / Math.abs(odds)) // -150 -> win $66.67 on $100
}

export { mlbGamesCache }
