import { postMessage } from '../../../libs/cometchat.js';
import { getUserWallet, removeFromUserWallet, addToUserWallet } from '../../../database/dbwalletmanager.js';
import { getUserNickname } from '../../../handlers/message.js';
import { getAllHorses } from '../../../database/dbhorses.js';
import { fetchCurrentUsers } from '../../../utils/API.js';
import { bus, safeCall } from '../service.js';
import { runRace } from '../simulation.js';
import { getCurrentOdds } from '../utils/odds.js';
import { decimalToFraction } from '../utils/fraction.js';
import { generateVisualProgress } from '../utils/progress.js';

const ROOM = process.env.ROOM_UUID;
const ENTRY_MS = 30_000;
const BET_MS   = 30_000;

let horses = [];
let horseBets = {};
let entered = new Set();
let isAcceptingEntries = false;
let isBettingOpen = false;

/**
 * Attempt to enter a horse during the entry window.
 */
export async function handleHorseEntryAttempt({ sender, message }) {
  console.log('[ENTRY ATTEMPT]', { isAcceptingEntries, sender, message });
  if (!isAcceptingEntries) return;

  const all = await safeCall(getAllHorses);
  const owned = all.filter(h => h.ownerId === sender && !h.retired);
  const match = owned.find(h => message.toLowerCase().includes(h.name.toLowerCase()));
  if (!match || entered.has(match.name)) return;

  entered.add(match.name);
  const nick = await safeCall(getUserNickname, [sender]);
  await safeCall(postMessage, [{
    room: ROOM,
    message: `✅ @${nick} has entered **${match.name}** into the race!`
  }]);
}

/**
 * Place a bet on one of the numbered horses.
 */
export async function handleHorseBet({ sender, message }) {
  if (!isBettingOpen) return;

  const m = message.match(/^\/horse\s*(\d+)\s+(\d+)/i);
  if (!m) return;

  const idx = parseInt(m[1], 10) - 1;
  const amt = parseInt(m[2], 10);
  if (idx < 0 || idx >= horses.length || amt <= 0) return;

  const balance = await safeCall(getUserWallet, [sender]);
  const nick    = await safeCall(getUserNickname, [sender]);
  if (balance < amt) {
    return safeCall(postMessage, [{
      room: ROOM,
      message: `${nick}, you don't have enough funds to bet $${amt}. Your balance is $${balance}.`
    }]);
  }

  await safeCall(removeFromUserWallet, [sender, amt]);
  horseBets[sender] = horseBets[sender] || [];
  horseBets[sender].push({ horseIndex: idx, amount: amt });

  const horse = horses[idx];
  await safeCall(postMessage, [{
    room: ROOM,
    message: `@${nick} bets $${amt} on #${idx + 1} ${horse.name}! 🐎`
  }]);
}

/**
 * Start a new horse race: open entry window, betting window, then run the race.
 */
export async function startHorseRace() {
  // Reset state
  entered.clear();
  horseBets = {};
  isAcceptingEntries = true;
  isBettingOpen = false;

  // Entry prompt
  await safeCall(postMessage, [{
    room: ROOM,
    message: `🏁 HORSE RACE STARTING! Type your horse's name in the next ${ENTRY_MS/1000}s to enter.`
  }]);

  // List available horses
  const all = await safeCall(getAllHorses);
  const activeIds = await safeCall(fetchCurrentUsers);
  const available = all.filter(h =>
    activeIds.includes(h.ownerId) && !h.retired && h.ownerId !== 'allen'
  );

  if (available.length) {
    const byTier = available.reduce((acc, h) => {
      const tier = h.tier ? `Tier ${h.tier}` : 'Unrated';
      (acc[tier] ||= []).push(h);
      return acc;
    }, {});

    const sortedTiers = Object.keys(byTier).sort((a, b) => {
      const na = parseInt(a.replace('Tier ', ''), 10);
      const nb = parseInt(b.replace('Tier ', ''), 10);
      if (isNaN(na) && !isNaN(nb)) return 1;
      if (!isNaN(na) && isNaN(nb)) return -1;
      if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
      return na - nb;
    });

    const lines = [];
    for (const tier of sortedTiers) {
      lines.push(`**${tier}**`);
      for (const h of byTier[tier]) {
        const owner = await safeCall(getUserNickname, [h.ownerId]);
        lines.push(`- ${h.emoji || '🐎'} ${h.name} (owned by @${owner})`);
      }
      lines.push('');
    }

    await safeCall(postMessage, [{ room: ROOM, message: `🏇 Available horses by tier:
${lines.join('\n')}` }]);
  } else {
    await safeCall(postMessage, [{ room: ROOM, message: `⚠️ No active user horses found — bot horses only.` }]);
  }

  // Wait for entries
  await new Promise(res => setTimeout(res, ENTRY_MS));
  isAcceptingEntries = false;

  // Assemble the field
  const userHorses = all.filter(h => entered.has(h.name) && !h.retired);
  const botHorses = all
    .filter(h => (!h.ownerId || h.ownerId === 'allen') && !h.retired)
    .sort((a, b) => b.baseOdds - a.baseOdds)
    .slice(0, 6 - userHorses.length);

  horses = [...userHorses, ...botHorses];
  if (horses.length === 0) {
    return safeCall(postMessage, [{ room: ROOM, message: `🐴 No horses entered. Buy and enter next time!` }]);
  }

  // Update odds and announce betting
  horses = horses.map(h => ({ ...h, odds: getCurrentOdds(h) }));
  isBettingOpen = true;
  await safeCall(postMessage, [{
    room: ROOM,
    message:
      `🏇 Today's racers:
` +
      horses.map((h, i) => `#${i+1} ${h.name} (odds: ${decimalToFraction(h.odds, 2)})`).join('\n') +
      `

Place your bets with /horse [number] [amount] within ${BET_MS/1000}s!`
  }]);

  setTimeout(() => {
    isBettingOpen = false;
    bus.emit('betsClosed', { horses, horseBets });
  }, BET_MS);
}

// Per-turn updates
bus.on('turn', async ({ raceState, turnIndex }) => {
  const header = `🏁 Turn ${turnIndex + 1}`;
  const body = generateVisualProgress(raceState);
  await postMessage({ room: ROOM, message: `${header}
${body}` });
});

// Final results
bus.on('raceFinished', async ({ raceState, payouts }) => {
  const header = `🏆 Final Results`;
  const body = generateVisualProgress(raceState, true);
  const payoutLines = Object.entries(payouts)
    .map(([user, amt]) => `• ${user}: $${amt}`)
    .join('\n');
  await postMessage({ room: ROOM, message: `${header}
${body}

💰 Payouts:
${payoutLines}` });
});

// Wire up race runner
bus.on('betsClosed', runRace);

export function isWaitingForEntries() {
  return isAcceptingEntries;
}

export async function handleHorseHelpCommand(ctx) {
  await postMessage({
    room: ROOM,
    message: [
      '🐴 **Horse Racing Commands**',
      '',
      '• `/buyhorse [tier]` – Purchase a new horse (basic, elite, champion)',
      '• `/myhorses` – List your current horses',
      '• `/horsestats [horse name]` – View stats (wins, races, win rate) for a horse',
      '• `/tophorses [n]` – Show top n horses by wins',
      '• `/race` – Start a new race',
      '• `/horse [number] [amount]` – Place a bet on a horse'
    ].join('\n')
  });
}

/**
 * /horsestats [horse name]
 */
export async function handleHorseStatsCommand(ctx) {
  const parts = ctx.message.trim().split(/\s+/).slice(1);
  if (parts.length === 0) {
    return postMessage({ room: ROOM, message: '❗ Usage: /horsestats [horse name]' });
  }

  const nameQuery = parts.join(' ').toLowerCase();
  const all = await getAllHorses();
  const horse = all.find(h => h.name.toLowerCase() === nameQuery);

  if (!horse) {
    return postMessage({ room: ROOM, message: `❗ No horse found named "${parts.join(' ')}".` });
  }

  const wins = horse.wins || 0;
  const races = horse.racesParticipated || 0;
  const winRate = races ? ((wins / races) * 100).toFixed(1) : '0.0';
  const status = horse.retired ? '🏁 Retired' : '🏇 Active';
  const odds = formatOdds ? formatOdds(horse.baseOdds) : horse.baseOdds;

  return postMessage({
    room: ROOM,
    message:
      `📊 **${horse.name}**\n` +
      `• Owner: @${await getUserNickname(horse.ownerId)}\n` +
      `• Tier: ${horse.tier}\n` +
      `• Odds: ${odds}\n` +
      `• Races: ${races}\n` +
      `• Wins: ${wins}\n` +
      `• Win Rate: ${winRate}%\n` +
      `• Status: ${status}`
  });
}

/**
 * /tophorses [n]
 */
export async function handleTopHorsesCommand(ctx) {
  const parts = ctx.message.trim().split(/\s+/);
  const n = parseInt(parts[1], 10) || 5;

  const all = await getAllHorses();
  // sort by wins desc, then by winRate desc
  const sorted = all
    .map(h => ({
      ...h,
      races: h.racesParticipated || 0,
      wins: h.wins || 0,
      winRate: h.racesParticipated ? h.wins / h.racesParticipated : 0
    }))
    .sort((a, b) => b.wins - a.wins || b.winRate - a.winRate)
    .slice(0, n);

  if (sorted.length === 0) {
    return postMessage({ room: ROOM, message: '❗ No horses found in the database.' });
  }

  const lines = await Promise.all(sorted.map(async (h, i) => {
    const owner = h.ownerId ? ` by @${await getUserNickname(h.ownerId)}` : '';
    const winRatePct = (h.winRate * 100).toFixed(1);
    return (
      `#${i+1} **${h.name}**${owner} — ` +
      `${h.wins} win${h.wins===1?'':'s'} / ${h.races} race${h.races===1?'':'s'} ` +
      `(${winRatePct}%)`
    );
  }));

  return postMessage({
    room: ROOM,
    message:
      `🏆 **Top ${lines.length} Horses**\n\n` +
      lines.join('\n')
  });
}
export async function handleMyHorsesCommand(ctx) {
  const userId = ctx.sender;
  const nick   = await getUserNickname(userId);
  const horses = await getUserHorses(userId);

  if (!horses.length) {
    return postMessage({
      room: ROOM,
      message: `🐎 ${nick}, you don't own any horses yet. Try \`/buyhorse\` to get started!`
    });
  }

  // Build one line per horse: name, tier, odds, record, status
  const lines = horses.map(h => {
    const odds       = formatOdds ? formatOdds(h.baseOdds) : h.baseOdds;
    const races      = h.racesParticipated ?? 0;
    const wins       = h.wins              ?? 0;
    const winRatePct = races ? ((wins / races) * 100).toFixed(1) : '0.0';
    const status     = h.retired ? '🏁 Retired' : '🏇 Active';
    return (
      `${h.emoji || '🐎'} **${h.name}**` +
      ` (Tier: ${h.tier}, Odds: ${odds})\n` +
      `   • Record: ${wins}-${races-wins} (${winRatePct}% win rate)\n` +
      `   • Status: ${status}`
    );
  });

  return postMessage({
    room: ROOM,
    message:
      `🐴 **${nick}’s Horses**\n\n` +
      lines.join('\n\n')
  });
}