// src/games/horserace/simulation.js

import { postMessage }           from '../../libs/cometchat.js';
import { addToUserWallet }       from '../../database/dbwalletmanager.js';
import { getUserNickname }       from '../../handlers/message.js';
import { updateHorseStats }      from '../../database/dbhorses.js';
import { safeCall }              from './service.js';
import { generateVisualProgress } from './utils/index.js';

const ROOM = process.env.ROOM_UUID;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const TURNS         = 3;
const START_DELAY   = 3000; // ms before first turn
const TURN_DELAY    = 5000; // ms between turns
const FINAL_DELAY   = 1500; // ms before finalizing

const START_GIF = 'https://media.giphy.com/media/f8zTTGjUFf5El00t2E/giphy.gif';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
/** Simple promise‐based delay */
const delay = ms => new Promise(res => setTimeout(res, ms));

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────
/**
 * Simulate the race: kickoff, TURNS of progress, then finalize.
 *
 * @param {Object} payload
 * @param {Array<Object>} payload.horses     The entrants (with .name, .odds, etc.)
 * @param {Record<string,Array<{horseIndex:number,amount:number}>>} payload.horseBets
 */
export async function runRace({ horses, horseBets }) {
  try {
    // 1) Kickoff 
    await safeCall(postMessage, [{
      room: ROOM,
      message: `🏇 And they’re off!`,
      images: [START_GIF],
    }]);
    await delay(START_DELAY);

    // 2) Initialize race state
    const raceState = horses.map((h, i) => ({
      index:   i,
      name:    h.name,
      odds:    h.odds,
      progress:0,
      segments:Array.from({ length: TURNS }, () => Math.random()),
    }));

    // 3) TURNS of racing
    for (let turn = 0; turn < TURNS; turn++) {
      // advance progress
      raceState.forEach(h => { h.progress += h.segments[turn]; });

      // announce
      await safeCall(postMessage, [{ room: ROOM, message: `🏁 Turn ${turn + 1}` }]);

      // show visual
      const bar = generateVisualProgress(raceState);
      await safeCall(postMessage, [{ room: ROOM, message: bar }]);

      // pause
      await delay(TURN_DELAY);
    }

    // 4) Brief pause before final
    await delay(FINAL_DELAY);

    // 5) Pick winner
    const sorted      = [...raceState].sort((a, b) => b.progress - a.progress);
    const winnerState = sorted[0];

    // 6) Finalize DB + payouts
    await finalizeStatsAndPayouts(winnerState.index, horses, horseBets, raceState);
  }
  catch (err) {
    console.error('runRace failed:', err);
    await safeCall(postMessage, [{
      room: ROOM,
      message: `❌ Oops! Race simulation encountered an error. Admins have been notified.`,
    }]);
  }
}

// ─── FINALIZATION ────────────────────────────────────────────────────────────
/**
 * Persist final visuals, update stats, do payouts & owner bonuses.
 *
 * @param {number} winnerIdx
 * @param {Array<Object>} horses
 * @param {Record<string,Array<{horseIndex:number,amount:number}>>} horseBets
 * @param {Array<{index:number,name:string,progress:number}>} raceState
 */
async function finalizeStatsAndPayouts(winnerIdx, horses, horseBets, raceState) {
  try {
    // 1) Final bar + winner message
    const finalBar = generateVisualProgress(raceState, true);
    await safeCall(postMessage, [{ room: ROOM, message: finalBar }]);

    const winner = horses[winnerIdx];
    await safeCall(postMessage, [{
      room: ROOM,
      message: `🏆 **WINNER!** #${winnerIdx + 1} **${winner.name}**! 🎉`,
    }]);

    // 2) Build & dispatch stat‐update promises
    const updates = horses.map((h, idx) => {
      const record = {
        ...h,
        racesParticipated: (h.racesParticipated || 0) + 1,
        wins:              h.wins + (idx === winnerIdx ? 1 : 0),
      };
      // retire if careerLength reached
      if (
        record.ownerId &&
        record.racesParticipated >= (record.careerLength || Infinity) &&
        !record.retired
      ) {
        record.retired = true;
      }
      return safeCall(updateHorseStats, [record]);
    });
    await Promise.all(updates);

    // 3) Payout bettors
    for (const [userId, bets] of Object.entries(horseBets)) {
      try {
        const total = bets
          .filter(b => b.horseIndex === winnerIdx)
          .reduce((sum, b) => sum + Math.floor(b.amount * winner.odds), 0);
        if (total > 0) {
          await safeCall(addToUserWallet, [userId, total]);
          const nick = await safeCall(getUserNickname, [userId]);
          await safeCall(postMessage, [{
            room: ROOM,
            message: `💰 ${nick} won $${total} betting on ${winner.name}!`,
          }]);
        }
      } catch (pErr) {
        console.error(`Payout for user ${userId} failed:`, pErr);
      }
    }

    // 4) Owner bonus
    if (winner.ownerId && winner.price > 0) {
      try {
        const bonus = Math.floor(winner.price * 0.1);
        await safeCall(addToUserWallet, [winner.ownerId, bonus]);
        const ownerNick = await safeCall(getUserNickname, [winner.ownerId]);
        await safeCall(postMessage, [{
          room: ROOM,
          message: `🏇 Owner ${ownerNick} earned a $${bonus} bonus!`,
        }]);
      } catch (oErr) {
        console.error(`Owner bonus payout failed:`, oErr);
      }
    }
  }
  catch (err) {
    console.error('finalizeStatsAndPayouts failed:', err);
    await safeCall(postMessage, [{
      room: ROOM,
      message: `❌ Oops! Post‐race processing failed—please contact admin.`,
    }]);
  }
}
