// src/handlers/horserace.js
import { EventEmitter } from 'events';
import { postMessage } from '../../libs/cometchat.js';
import {
  addToUserWallet,
  removeFromUserWallet,
  getUserWallet,
} from '../../database/dbwalletmanager.js';
import { getUserNickname } from '../../handlers/message.js';
import {
  getAllHorses,
  updateHorseStats
} from '../../database/dbhorses.js';
import { fetchCurrentUsers } from '../../utils/API.js';

const room = process.env.ROOM_UUID;
const BETTING_DURATION = 30_000;
const ENTRY_DURATION   = 30_000;
const RACE_STEP_DELAY  = 5_000;

export const bus = new EventEmitter();

// ─── Utilities ───────────────────────────────────────────────────────────────
async function safeCall(fn, args = [], retries = 2, delayMs = 500) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn(...args);
    } catch (err) {
      lastErr = err;
      if (i < retries) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function decimalToFraction(dec) {
  dec = Math.round(dec * 100) / 100;
  const limit = 20;
  let bestNum = 1, bestDen = 1, minDiff = Infinity;
  for (let d = 1; d <= limit; d++) {
    const n = Math.round(dec * d);
    const diff = Math.abs(dec - n / d);
    if (diff < minDiff) {
      bestNum = n;
      bestDen = d;
      minDiff = diff;
    }
  }
  return `${bestNum}/${bestDen}`;
}

function generateVisualProgress(raceState, showWinner = false) {
  const MAX_BAR = 10;
  const staticMax = 3;
  const actualMax = Math.max(...raceState.map(h => h.progress));
  const scale = showWinner ? actualMax : staticMax;
  const leaders = raceState.filter(h => h.progress === actualMax).map(h => h.index);

  return raceState.map(h => {
    const filled = Math.round((h.progress / scale) * MAX_BAR);
    const empty  = MAX_BAR - filled;
    const bar    = '🟩'.repeat(filled) + '⬜'.repeat(empty);
    const trophy = showWinner && leaders.includes(h.index) ? ' 🏆' : '';
    return `#${h.index + 1}`.padStart(3) + ` ${bar} |🏁| ${h.name}${trophy}`;
  }).join('\n');
}

function getCurrentOdds(horse) {
  const form = horse.wins / (horse.racesParticipated || 1);
  const factor = 1 + form * 0.5;
  return Math.max(1, horse.baseOdds / factor);
}

function getHorseListMessage() {
  return horses
    .map((h, i) => {
      const frac = decimalToFraction(h.odds);
      const owner = h.ownerId ? ` owned by ${h.ownerId}` : '';
      return `#${i + 1} ${h.name} (odds: ${frac})${owner}`;
    })
    .join('\n');
}

function generateRaceProfile(type = 'balanced') {
  if (type === 'sprinter') return [Math.random() * 0.6, Math.random() * 0.3, Math.random() * 0.2];
  if (type === 'finisher') return [Math.random() * 0.2, Math.random() * 0.3, Math.random() * 0.6];
  return [Math.random(), Math.random(), Math.random()];
}

function getDynamicCommentary(horse, progressRank) {
  const style = horse.raceStyle || 'balanced';
  const flair = {
    sprinter: ["💨 Blazing out early!", "⚡ What a start!", "🚀 Out of the gate FAST!"],
    finisher: ["🧊 Cold start — saving energy?", "🎯 Eyes on the last leg?", "🧱 Slow now, but just wait..."],
    balanced: ["🐎 Steady pace!", "🟰 Holding position.", "📈 Gradual gain."],
  };

  const baseSet = flair[style] || [];
  let text = baseSet[Math.floor(Math.random() * baseSet.length)];
  if (progressRank <= 1) text = "🔥 Leading the pack! " + text;
  if (progressRank >= 4) text = "😬 They're falling behind! " + text;

  return `📣 ${horse.name}: ${text}`;
}

// ─── State ───────────────────────────────────────────────────────────────────
let horses = [];
let horseBets = {};
let isBettingOpen = false;
let waitingForEntries = false;
let enteredHorses = new Set();

// ─── Entry + Bet Handling ─────────────────────────────────────────────────────
export function isWaitingForEntries() {
  return waitingForEntries;
}

export async function handleHorseEntryAttempt({ sender, message }) {
  if (!waitingForEntries) return;
  const all = await safeCall(getAllHorses);
  const owned = all.filter(h => h.ownerId === sender && !h.retired);
  const match = owned.find(h => message.toLowerCase().includes(h.name.toLowerCase()));
  if (!match || enteredHorses.has(match.name)) return;

  enteredHorses.add(match.name);
  const nick = await safeCall(getUserNickname, [sender]);
  await safeCall(postMessage, [{ room, message: `✅ ${nick} entered **${match.name}**!` }]);
}

export async function handleHorseBet({ sender, message }) {
  if (!isBettingOpen) return;
  const m = message.match(/^\/horse\s*(\d+)\s+(\d+)/i);
  if (!m) return;

  const idx = parseInt(m[1], 10) - 1;
  const amount = parseInt(m[2], 10);
  if (idx < 0 || idx >= horses.length || amount <= 0) return;

  const balance = await safeCall(getUserWallet, [sender]);
  const nick    = await safeCall(getUserNickname, [sender]);
  if (balance < amount) {
    return safeCall(postMessage, [{ room, message: `${nick}, insufficient funds ($${balance}).` }]);
  }

  await safeCall(removeFromUserWallet, [sender, amount]);
  horseBets[sender] = horseBets[sender] || [];
  horseBets[sender].push({ horseIndex: idx, amount });

  await safeCall(postMessage, [{
    room,
    message: `${nick} bets $${amount} on #${idx + 1} ${horses[idx].name}! 🐎`
  }]);
}

// ─── Race Lifecycle ──────────────────────────────────────────────────────────
export async function startHorseRace() {
  horseBets = {};
  enteredHorses.clear();
  waitingForEntries = true;

  await safeCall(postMessage, [{
    room,
    message: `🏁 Race starting—enter your horse in ${ENTRY_DURATION / 1000}s!`
  }]);

  const all = await safeCall(getAllHorses);
  const active = await safeCall(fetchCurrentUsers);
  const available = all.filter(h =>
    active.includes(h.ownerId) && !h.retired && h.ownerId !== 'allen'
  );

  if (available.length) {
    const lines = await Promise.all(available.map(async h => {
      const nick = await safeCall(getUserNickname, [h.ownerId]);
      return `- ${h.emoji || '🐎'} ${h.name} (${nick})`;
    }));
    await safeCall(postMessage, [{ room, message: `🏇 Available:\n${lines.join('\n')}` }]);
  } else {
    await safeCall(postMessage, [{
      room,
      message: `⚠️ No active user horses—bot entries only.`
    }]);
  }

  await new Promise(r => setTimeout(r, ENTRY_DURATION));
  waitingForEntries = false;

  const userHorses = all.filter(h => enteredHorses.has(h.name));
  const bots = all.filter(h => (!h.ownerId || h.ownerId === 'allen') && !h.retired)
                  .sort((a, b) => b.baseOdds - a.baseOdds);
  horses = [...userHorses];
  for (const b of bots) {
    if (horses.length >= 6) break;
    horses.push(b);
  }

  if (!horses.length) {
    return safeCall(postMessage, [{
      room,
      message: `🐴 No entries—please buy and enter next time!`
    }]);
  }

  horses = horses.map(h => ({ ...h, odds: getCurrentOdds(h) }));

  await safeCall(postMessage, [{
    room,
    message: `🏇 Racers:\n${getHorseListMessage()}\n\nPlace bets with /horse[number] [amount] in ${BETTING_DURATION / 1000}s!`
  }]);

  isBettingOpen = true;
  setTimeout(() => {
    isBettingOpen = false;
    bus.emit('betsClosed');
  }, BETTING_DURATION);
}

// ─── Race Simulation ─────────────────────────────────────────────────────────
bus.on('betsClosed', runRace);

async function runRace() {
  await safeCall(postMessage, [{
    room,
    message: `🏇 And they’re off!`,
    images: ['https://media.giphy.com/media/f8zTTGjUFf5El00t2E/giphy.gif']
  }]);
  await new Promise(r => setTimeout(r, 3000));

  const raceState = horses.map((h, i) => ({
    index: i,
    name: h.name,
    odds: h.odds,
    progress: 0,
    segments: generateRaceProfile(h.raceStyle || 'balanced')
  }));

  for (let turn = 0; turn < 3; turn++) {
    for (const h of raceState) {
      h.progress += h.segments[turn];

      // random events
      if (Math.random() < 0.05) {
        h.progress += Math.random();
        await safeCall(postMessage, [{
          room, message: `⚡ ${h.name} surges ahead!`
        }]);
      } else if (Math.random() < 0.05) {
        h.progress -= Math.random() * 0.5;
        await safeCall(postMessage, [{
          room, message: `💥 ${h.name} stumbles!`
        }]);
      }
    }

    await safeCall(postMessage, [{ room, message: `🏁 Turn ${turn + 1}` }]);
    const sorted = [...raceState].sort((a, b) => b.progress - a.progress);
    const commentary = getDynamicCommentary(horses[sorted[0].index], 0);
    await safeCall(postMessage, [{ room, message: commentary }]);
    await safeCall(postMessage, [{ room, message: generateVisualProgress(raceState) }]);
    await new Promise(r => setTimeout(r, RACE_STEP_DELAY));
  }

  await safeCall(postMessage, [{ room, message: `🎉 Final sprint!` }]);
  await new Promise(r => setTimeout(r, 1500));

  const finishOrder = [...raceState].sort((a, b) => b.progress - a.progress);
  const winnerState = finishOrder[0];
  const winnerHorse = horses[winnerState.index];

  await finalizeStatsAndPayouts(winnerState.index, raceState);

  await safeCall(postMessage, [{
    room,
    message: generateVisualProgress(raceState, true)
  }]);

  await safeCall(postMessage, [{
    room,
    message: `🏆 **WINNER!** #${winnerState.index + 1} **${winnerHorse.name}**!`
  }]);
}

async function finalizeStatsAndPayouts(winnerIdx, raceState) {
  const allHorses = await safeCall(getAllHorses);
  const winner = horses[winnerIdx];
  const fullWinner = allHorses.find(h => h.name === winner.name);

  let totalEarnings = 0;

  if (fullWinner) {
    fullWinner.wins = (fullWinner.wins || 0) + 1;
    fullWinner.racesParticipated = (fullWinner.racesParticipated || 0) + 1;
  }

  for (const h of horses) {
    const fullHorse = allHorses.find(x => x.name === h.name);
    if (!fullHorse) continue;

    if (h.name !== winner.name) {
      fullHorse.racesParticipated = (fullHorse.racesParticipated || 0) + 1;
    }

    if (
      fullHorse.ownerId &&
      fullHorse.ownerId !== 'allen' &&
      fullHorse.racesParticipated >= (fullHorse.careerLength || Infinity) &&
      !fullHorse.retired
    ) {
      fullHorse.retired = true;
      await safeCall(postMessage, [{
        room,
        message: `🐎 **${fullHorse.name}** has retired after ${fullHorse.careerLength} races! 🏅`
      }]);
    }
  }

  // ─── BETTING PAYOUTS ───────────────────────────────────────────────────
  const winners = Object.entries(horseBets).flatMap(([uid, bets]) =>
    bets.filter(b => b.horseIndex === winnerIdx).map(b => ({ uid, ...b }))
  );

  for (const { uid, amount } of winners) {
    const payout = Math.floor(amount * winner.odds);
    totalEarnings += payout;

    await safeCall(addToUserWallet, [uid, payout]);
    const nick = await safeCall(getUserNickname, [uid]);
    await safeCall(postMessage, [{
      room,
      message: `💰 ${nick} won $${payout}!`
    }]);
  }

  // ─── OWNER BONUS ────────────────────────────────────────────────────────
  if (winner.ownerId && winner.price > 0) {
    const bonus = Math.floor(winner.price * 0.1);
    totalEarnings += bonus;

    await safeCall(addToUserWallet, [winner.ownerId, bonus]);
    const onick = await safeCall(getUserNickname, [winner.ownerId]);
    await safeCall(postMessage, [{
      room,
      message: `🏇 ${onick} earned owner bonus $${bonus}!`
    }]);
  }

  // ─── UPDATE CAREER EARNINGS ─────────────────────────────────────────────
  if (fullWinner) {
    fullWinner.careerEarnings = (fullWinner.careerEarnings || 0) + totalEarnings;
  }

  // ─── PERSIST ALL CHANGES ────────────────────────────────────────────────
  await Promise.all(allHorses.map(h => safeCall(updateHorseStats, [h])));
}

