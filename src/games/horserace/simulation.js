// src/games/horserace/simulation.js

import { postMessage }       from '../../libs/cometchat.js';
import { addToUserWallet }   from '../../database/dbwalletmanager.js';
import { getUserNickname }   from '../../handlers/message.js';
import { updateHorseStats }  from '../../database/dbhorses.js';
import { safeCall }          from './service.js';
import { generateVisualProgress } from './utils/progress.js';

const ROOM = process.env.ROOM_UUID;
const TURNS = 4;
const START_DELAY = 3000;
const TURN_DELAY = 5000;
const FINAL_DELAY = 1500;
const START_GIF = 'https://media.giphy.com/media/f8zTTGjUFf5El00t2E/giphy.gif';

const delay = ms => new Promise(res => setTimeout(res, ms));

// Generate a normally distributed random number via Box–Muller
function randNormal(mean = 0, sd = 1) {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd + mean;
}

/**
 * Generate a quick commentary based on current leaders
 */
function generateCommentary(turn, state) {
  const sorted = [...state].sort((a, b) => b.progress - a.progress);
  const leader = sorted[0];
  const runnerUp = sorted[1];
  const gap = runnerUp ? (leader.progress - runnerUp.progress).toFixed(2) : '0.00';
  if (turn === 1) return `🎤 And they're off! ${leader.name} bursts into the lead.`;
  if (gap > 0.5) return `🎤 ${leader.name} is pulling away by ${gap} units!`;
  return `🎤 Tight contest! ${leader.name} leads by ${gap} units.`;
}

export async function runRace({ horses, horseBets }) {
  try {
    console.log('Starting race with horses:', horses);
    await safeCall(postMessage, [{ room: ROOM, message: `🏇 And they’re off!`, images: [START_GIF] }]);
    await delay(START_DELAY);

    // Initialize race state: compute per-horse parameters
    const raceState = horses.map((h, i) => {
      const oddsWeight = 1 / (h.odds || 1);
      const winRate    = (h.wins || 0) / ((h.racesParticipated || 0) || 1);
      const factor     = oddsWeight * 0.8 + winRate * 0.2;
      const baseMean   = 1 + (factor - 1) * 0.5;
      const baseSd     = 0.1 + (1 - factor) * 0.3;
      const decayRate  = 1 - factor * 0.1;

      console.log(`Horse ${h.name} params:`,
        { oddsWeight: oddsWeight.toFixed(3), winRate: winRate.toFixed(3), factor: factor.toFixed(3), baseMean: baseMean.toFixed(3), baseSd: baseSd.toFixed(3), decayRate: decayRate.toFixed(3) });

      return {
        index: i,
        name: h.name,
        odds: h.odds,
        progress: 0,
        stamina: 1,
        baseMean,
        baseSd,
        decayRate,
      };
    });

    // Run each turn with logs and commentary
    for (let turn = 0; turn < TURNS; turn++) {
      const trackEvent = randNormal(1, 0.03);
      console.log(`Turn ${turn+1} trackEvent=${trackEvent.toFixed(3)}`);

      raceState.forEach(h => {
        const raw   = randNormal(h.baseMean, h.baseSd);
        const moved = Math.max(0, raw * h.stamina * trackEvent);
        console.log(`Horse ${h.name} raw=${raw.toFixed(3)}, stamina=${h.stamina.toFixed(3)}, moved=${moved.toFixed(3)}`);
        h.progress += moved;
        h.stamina  *= h.decayRate;
      });

      // Display bars: clamp visuals to 100% but retain raw progress
      const bars = generateVisualProgress(raceState, false, 10, TURNS).split('\n');
      const message = ['```', `🏁 Turn ${turn + 1}`, ...bars, '```'].join('\n');
      await safeCall(postMessage, [{ room: ROOM, message }]);

      // Post-turn commentary
      const commentary = generateCommentary(turn + 1, raceState);
      await safeCall(postMessage, [{ room: ROOM, message: commentary }]);

      await delay(TURN_DELAY);
    }

    await delay(FINAL_DELAY);

    // Determine close finishes (within threshold)
    const maxProg = Math.max(...raceState.map(h => h.progress));
    console.log('Final progresses:', raceState.map(h => ({ name: h.name, progress: h.progress.toFixed(3) })));    
    const threshold = 0.1; // close finish threshold
    const close = raceState
      .filter(h => maxProg - h.progress <= threshold)
      .map(h => h.index);

    let winnerIdx;
    if (close.length > 1) {
      await safeCall(postMessage, [{ room: ROOM, message: `📸 PHOTO FINISH! Too close to call...` }]);
      console.log('Photo finish candidates:', close);
      const pick = close[Math.floor(Math.random() * close.length)];
      console.log('Picked winner:', pick);
      winnerIdx = pick;
      await safeCall(postMessage, [{ room: ROOM, message: `🎬 After photo review, winner is #${pick+1} **${horses[pick].name}**! 🥇` }]);
    } else {
      winnerIdx = close[0];
    }

    await finalizeStatsAndPayouts(winnerIdx, horses, horseBets, raceState);
  } catch (err) {
    console.error('runRace failed:', err);
    await safeCall(postMessage, [{ room: ROOM, message: `❌ Race simulation error.` }]);
  }
}

async function finalizeStatsAndPayouts(winnerIdx, horses, horseBets, raceState) {
  try {
    // Final display
    const finalBar = generateVisualProgress(raceState, true, 10, TURNS);
    await safeCall(postMessage, [{ room: ROOM, message: finalBar }]);

    // Announce winner
    const winner = horses[winnerIdx];
    await safeCall(postMessage, [{ room: ROOM, message: `🏆 **WINNER!** #${winnerIdx+1} **${winner.name}**! 🎉` }]);

    // Update stats
    await Promise.all(horses.map((h, idx) => safeCall(updateHorseStats, [{
      ...h,
      racesParticipated: (h.racesParticipated || 0) + 1,
      wins: (h.wins || 0) + (idx === winnerIdx ? 1 : 0),
      retired: h.ownerId && ((h.racesParticipated || 0) + 1) >= (h.careerLength || Infinity) && !h.retired
    }])));

    // Payouts: check all user bets
    for (const [userId, bets] of Object.entries(horseBets)) {
      const hitBets = bets.filter(b => b.horseIndex === winnerIdx);
      if (!hitBets.length) continue;
      // sum all wins for this user
      const totalWon = hitBets.reduce((sum, b) => sum + Math.floor(b.amount * winner.odds), 0);
      await safeCall(addToUserWallet, [userId, totalWon]);
      const nick = await safeCall(getUserNickname, [userId]);
      await safeCall(postMessage, [{ room: ROOM, message: `💰 ${nick} won $${totalWon}!` }]);
    }

    // Owner bonus
    if (winner.ownerId && winner.price > 0) {
      const bonus = Math.floor(winner.price * 0.1);
      await safeCall(addToUserWallet, [winner.ownerId, bonus]);
      const ownerNick = await safeCall(getUserNickname, [winner.ownerId]);
      await safeCall(postMessage, [{ room: ROOM, message: `🏇 Owner ${ownerNick} earned $${bonus} bonus!` }]);
    }
  } catch (err) {
    console.error('finalizeStats failed:', err);
    await safeCall(postMessage, [{ room: ROOM, message: `❌ Post-race processing failed.` }]);
  }
}
