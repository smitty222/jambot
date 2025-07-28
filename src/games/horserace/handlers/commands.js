// src/games/horserace/commands.js

import { postMessage } from '../../../libs/cometchat.js';
import {
  getUserWallet,
  removeFromUserWallet,
  addToUserWallet
} from '../../../database/dbwalletmanager.js';
import { getUserNickname } from '../../../handlers/message.js';
import { getAllHorses } from '../../../database/dbhorses.js';
import { fetchCurrentUsers } from '../../../utils/API.js';
import { bus, safeCall } from '../service.js';
import { getCurrentOdds, decimalToFraction } from '../utils.js';
import { runRace } from '../simulation.js';

const ROOM     = process.env.ROOM_UUID;
const ENTRY_MS = 30_000;   // 30s to enter
const BET_MS   = 30_000;   // 30s to bet

// shared state
let horses = [];
let horseBets = {};
let waitingForEntries = false;
let isBettingOpen = false;
let entered = new Set();

export function isWaitingForEntries() {
  return waitingForEntries;
}

/**
 * Attempt to enter a horse during the entry window.
 */
export async function handleHorseEntryAttempt({ sender, message }) {
  console.log('[ENTRY ATTEMPT]', { waitingForEntries, sender, message });
  if (!waitingForEntries) return;

  // fetch all horses
  const all = await safeCall(getAllHorses);
  // find horses owned by this user and not retired
  const owned = all.filter(h => h.ownerId === sender && !h.retired);
  // match on name (case-insensitive substring)
  const match = owned.find(h =>
    message.toLowerCase().includes(h.name.toLowerCase())
  );
  // no match or already entered?
  if (!match || entered.has(match.name)) return;

  // record entry & notify
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
      message: `@${nick}, you don't have enough funds to bet $${amt}. Your balance is $${balance}.`
    }]);
  }

  // deduct and record bet
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
 * Start a new horse race: open entry window, then betting window, then emit to run.
 */
export async function startHorseRace() {
  // reset state
  waitingForEntries = true;
  isBettingOpen      = false;
  horseBets          = {};
  entered.clear();
  console.log('▶ startHorseRace: waitingForEntries =', waitingForEntries);

  // 1️⃣ Entry prompt
  await safeCall(postMessage, [{
    room: ROOM,
    message: `🏁 HORSE RACE STARTING! Type your horse's name in the next ${ENTRY_MS/1000}s to enter.`
  }]);

  // list available horses, grouped by tier
  const all       = await safeCall(getAllHorses);
  const activeIds = await safeCall(fetchCurrentUsers);
  const available = all.filter(h =>
    activeIds.includes(h.ownerId) &&
    !h.retired &&
    h.ownerId !== 'allen'
  );

  if (available.length) {
    // group by tier
    const byTier = available.reduce((acc, h) => {
      const tierKey = h.tier != null ? `Tier ${h.tier}` : 'Unrated';
      (acc[tierKey] ||= []).push(h);
      return acc;
    }, {});

    // sort tiers: numeric ascending, then Unrated
    const sortedTiers = Object.keys(byTier).sort((a, b) => {
      const na = parseInt(a.replace('Tier ', ''), 10);
      const nb = parseInt(b.replace('Tier ', ''), 10);
      if (isNaN(na) && !isNaN(nb)) return 1;
      if (!isNaN(na) && isNaN(nb)) return -1;
      if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
      return na - nb;
    });

    // build message
    const lines = [];
    for (const tier of sortedTiers) {
      lines.push(`**${tier}**`);
      for (const h of byTier[tier]) {
        const ownerNick = await safeCall(getUserNickname, [h.ownerId]);
        const emoji     = h.emoji || '🐎';
        lines.push(`- ${emoji} ${h.name} (owned by @${ownerNick})`);
      }
      lines.push(''); // blank line between tiers
    }

    await safeCall(postMessage, [{
      room: ROOM,
      message: `🏇 Available horses by tier:\n${lines.join('\n')}`
    }]);
  } else {
    await safeCall(postMessage, [{
      room: ROOM,
      message: `⚠️ No active user horses found — bot horses only.`
    }]);
  }

  // wait for entries
  await new Promise(res => setTimeout(res, ENTRY_MS));
  waitingForEntries = false;

  // 2️⃣ Assemble the field
  const userHorses = all.filter(h => entered.has(h.name) && !h.retired);
  const botHorses  = all
    .filter(h => (!h.ownerId || h.ownerId === 'allen') && !h.retired)
    .sort((a, b) => b.baseOdds - a.baseOdds);

  horses = [...userHorses];
  for (const b of botHorses) {
    if (horses.length >= 6) break;
    horses.push(b);
  }

  if (horses.length === 0) {
    return safeCall(postMessage, [{
      room: ROOM,
      message: `🐴 No horses entered. Please buy and enter a horse next time!`
    }]);
  }

  // 3️⃣ Update odds & announce betting window
  horses = horses.map(h => ({ ...h, odds: getCurrentOdds(h) }));
  const listMsg = horses
    .map((h, i) => `#${i + 1} ${h.name} (odds: ${decimalToFraction(h.odds)})`)
    .join('\n');

  await safeCall(postMessage, [{
    room: ROOM,
    message: `🏇 Today's racers:\n${listMsg}\n\nPlace your bets with /horse[number] [amount] within ${BET_MS/1000}s!`
  }]);

  isBettingOpen = true;
  setTimeout(() => {
    isBettingOpen = false;
    bus.emit('betsClosed', { horses, horseBets });
  }, BET_MS);
}

// When bets close, automatically start the race simulation
bus.on('betsClosed', runRace);
