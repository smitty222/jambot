import { getUserWallet, removeFromUserWallet, addToUserWallet } from '../database/dbwalletmanager.js'
import { getOddsForSport } from './bettingOdds.js';
import { promises as fs } from 'fs'
import { getLatestScoresForSport } from './sportsBetAPI.js';



const BETS_FILE = 'src/data/bets.json';

let mlbGamesCache = [];

export async function loadBets() {
    try {
      const data = await fs.readFile(BETS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') return {}; // File doesn't exist yet
      throw err;
    }
  }
  
  export async function saveBets(betsObj) {
    try {
      await fs.writeFile(BETS_FILE, JSON.stringify(betsObj, null, 2));
      console.log('[saveBets] Bets saved.');
    } catch (err) {
      console.error('[saveBets] Failed to write bets.json:', err);
    }
  }


// Converts numeric odds to string with + or - prefix for American odds
export function formatOdds(price) {
    return price > 0 ? `+${price}` : `${price}`;
  }
  

  export async function placeSportsBet(senderUUID, index, team, betTypeInput, amount, sport) {
    const games = await getOddsForSport(sport);
    if (!games || index < 0 || index >= games.length) {
      return `Game ${index + 1} not found for ${sport}.`;
    }
  
    const game = games[index];
    const bookmaker = game.bookmaker;
    if (!bookmaker) return `Odds unavailable for game ${index + 1}.`;
  
    const h2h = bookmaker.markets.find(m => m.key === 'h2h')?.outcomes || [];
    const spreads = bookmaker.markets.find(m => m.key === 'spreads')?.outcomes || [];
  
    const teamAbbrUpper = team.toUpperCase();
    const fullTeamName = [game.away_team, game.home_team].find(name =>
        name.toLowerCase().includes(teamShortNames[teamAbbrUpper]?.toLowerCase() || '')
      );
      
  
    if (!fullTeamName) return `Invalid team abbreviation for game ${index + 1}.`;
  
    const betType = betTypeInput.toLowerCase();
    let oddsObj;
  
    if (betType === 'ml') {
      oddsObj = h2h.find(o => o.name === fullTeamName);
    } else if (betType === 'spread') {
      oddsObj = spreads.find(o => o.name === fullTeamName);
    } else {
      return `Invalid bet type "${betTypeInput}". Use "ml" or "spread".`;
    }
  
    if (!oddsObj) return `Odds not found for ${teamAbbrUpper} (${betType}) in game ${index + 1}.`;
  
    const odds = oddsObj.price;
  
    const wallet = await getUserWallet(senderUUID);
    if (wallet < amount) return `Insufficient funds. You have $${wallet}.`;
  
    const removeSuccess = await removeFromUserWallet(senderUUID, amount);
    if (!removeSuccess) return `Failed to debit wallet. Try again later.`;
  
    const bets = await loadBets();
    if (!bets[game.id]) bets[game.id] = [];
  
    bets[game.id].push({
      senderUUID,
      gameIndex: index,
      gameId: game.id,
      sport,
      team: teamAbbrUpper,
      odds,
      amount,
      status: 'pending',
      type: betType,
    });
  
    await saveBets(bets);
  
    return `✅ Bet placed! $${amount} on ${teamAbbrUpper} (${betType}) at ${formatOdds(odds)} odds (Game ${index + 1}, ${sport}).`;
  }

  export async function resolveCompletedBets(sportKey) {
    const bets = await loadBets();
    const completedGames = await getLatestScoresForSport(sportKey);
    let updated = false;
  
    for (const game of completedGames) {
      const { id: gameId, home_team, away_team, scores } = game;
      if (!bets[gameId]) continue;
  
      const homeAbbr = teamAbbreviations[home_team] || home_team.slice(0, 3).toUpperCase();
      const awayAbbr = teamAbbreviations[away_team] || away_team.slice(0, 3).toUpperCase();
  
      const winner = scores.home > scores.away ? homeAbbr : awayAbbr;
  
      for (const bet of bets[gameId]) {
        if (bet.status !== 'pending') continue;
  
        const betTeam = bet.team;
        const isWinner = bet.type === 'ml' && betTeam === winner;
  
        if (isWinner) {
          const payout = calculateWinnings(bet.amount, bet.odds);
          await addToUserWallet(bet.senderUUID, payout);
          console.log(`✅ Paid out $${payout} to ${bet.senderUUID} (ML win on ${betTeam})`);
        }
  
        bet.status = 'completed';
        updated = true;
      }
    }
  
    if (updated) await saveBets(bets);
  }

  function calculateWinnings(amount, odds) {
    return odds > 0
      ? Math.round((amount * odds) / 100) // +138 -> win $138 on $100
      : Math.round((amount * 100) / Math.abs(odds)); // -150 -> win $66.67 on $100
  }
  
  const teamShortNames = {
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
  };
  

export { mlbGamesCache }
