// src/games/horserace/simulation.js

import { postMessage } from '../../libs/cometchat.js';
import { addToUserWallet } from '../../database/dbwalletmanager.js';
import { getUserNickname } from '../../handlers/message.js';
import { safeCall } from './service.js';
import { updateHorseStats } from '../../database/dbhorses.js';
import { generateVisualProgress } from './utils.js';

const ROOM = process.env.ROOM_UUID;
const START_GIF = 'https://media.giphy.com/media/f8zTTGjUFf5El00t2E/giphy.gif';

/**
 * Simulate the race: 3 turns of random progress, visual updates, then finalize.
 * @param {{ horses: Array, horseBets: Object }} payload
 */
export async function runRace({ horses, horseBets }) {
  // 1) Kickoff
  await safeCall(postMessage, [{
    room: ROOM,
    message: `🏇 And they’re off!`,
    images: [START_GIF]
  }]);
  await new Promise(r => setTimeout(r, 3000));

  // 2) Initialize race state
  const raceState = horses.map((h, i) => ({
    index: i,
    name: h.name,
    odds: h.odds,
    progress: 0,
    segments: [Math.random(), Math.random(), Math.random()]
  }));

  // 3) Three turns of racing
  for (let turn = 0; turn < 3; turn++) {
    // advance progress
    raceState.forEach(h => h.progress += h.segments[turn]);

    // announce turn
    await safeCall(postMessage, [{ room: ROOM, message: `🏁 Turn ${turn + 1}` }]);

    // show visual progress
    const bar = generateVisualProgress(raceState);
    await safeCall(postMessage, [{ room: ROOM, message: bar }]);

    // pause before next turn
    await new Promise(r => setTimeout(r, 5000));
  }

  // 4) Final sprint
  await new Promise(r => setTimeout(r, 1500));

  // 5) Determine winner (highest progress)
  const sorted = [...raceState].sort((a, b) => b.progress - a.progress);
  const winnerState = sorted[0];

  // 6) Finalize stats, payouts, retirements
  await finalizeStatsAndPayouts(winnerState.index, horses, horseBets, raceState);
}

/**
 * Update DB stats, retire horses if needed, pay out bettors & owners.
 * @param {number} winnerIdx
 * @param {Array} horses
 * @param {Object} horseBets
 * @param {Array} raceState
 */
async function finalizeStatsAndPayouts(winnerIdx, horses, horseBets, raceState) {
  // 1) Persist visual of final positions
  const finalBar = generateVisualProgress(raceState, true);
  await safeCall(postMessage, [{ room: ROOM, message: finalBar }]);

  // 2) Announce winner
  const winner = horses[winnerIdx];
  await safeCall(postMessage, [{
    room: ROOM,
    message: `🏆 **WINNER!** #${winnerIdx + 1} **${winner.name}**! 🎉`
  }]);

  // 3) Update horse stats in DB
  //    - increment winner wins & racesParticipated
  //    - increment racesParticipated for all others
  //    - retire those that reached careerLength
  const allHorses = await safeCall(() => Promise.resolve([])); 
  //    (we assume updateHorseStats will handle both in-memory and DB updates)
  horses.forEach((h, idx) => {
    const record = {
      ...h,
      racesParticipated: (h.racesParticipated || 0) + 1,
      wins: h.wins + (idx === winnerIdx ? 1 : 0),
      retired: h.retired || false
    };
    // retire if owner’s horse reached careerLength
    if (
      record.ownerId &&
      record.racesParticipated >= (record.careerLength || Infinity) &&
      !record.retired
    ) {
      record.retired = true;
    }
    // push update
    safeCall(updateHorseStats, [record]);
  });

  // 4) Payout bettors
  for (const [userId, bets] of Object.entries(horseBets)) {
    let totalWinnings = 0;
    for (const { horseIndex, amount } of bets) {
      if (horseIndex === winnerIdx) {
        totalWinnings += Math.floor(amount * winner.odds);
      }
    }
    if (totalWinnings > 0) {
      await safeCall(addToUserWallet, [userId, totalWinnings]);
      const nick = await safeCall(getUserNickname, [userId]);
      await safeCall(postMessage, [{
        room: ROOM,
        message: `💰 @${nick} won $${totalWinnings} betting on ${winner.name}!`
      }]);
    }
  }

  // 5) Owner bonus (10% of purchase price)
  if (winner.ownerId && winner.price > 0) {
    const bonus = Math.floor(winner.price * 0.1);
    await safeCall(addToUserWallet, [winner.ownerId, bonus]);
    const ownerNick = await safeCall(getUserNickname, [winner.ownerId]);
    await safeCall(postMessage, [{
      room: ROOM,
      message: `🏇 Owner @${ownerNick} earned a $${bonus} bonus!`
    }]);
  }
}
