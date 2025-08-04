// src/games/craps/commands.js
import { table } from './service.js';
import { getUserWallet, removeFromUserWallet } from '../../database/dbwalletmanager.js';
import { getUserNickname } from '../../handlers/message.js';
import { postMessage } from '../../libs/cometchat.js';
import { crapsState } from './crapsState.js';

const ROOM = process.env.ROOM_UUID;

async function placeBetLine(type, { sender, message }) {
  if (!crapsState.isBetting) {
    return postMessage({ room: ROOM, message: '❌ Betting is closed right now.' });
  }

  const parts = message.trim().split(/\s+/);
  const amt = parseInt(parts[1], 10);
  if (isNaN(amt) || amt <= 0) {
    return postMessage({ room: ROOM, message: '❌ Please specify a valid amount, e.g. `/pass 10`.' });
  }

  const balance = await getUserWallet(sender);
  if (balance < amt) {
    return postMessage({ room: ROOM, message: `❌ You only have $${balance.toFixed(2)}.` });
  }

  await removeFromUserWallet(sender, amt);
  const bucket = type === 'pass' ? crapsState.passBets : crapsState.dontPassBets;
  bucket[sender] = (bucket[sender] || 0) + amt;
  const nick = await getUserNickname(sender);
  await postMessage({ room: ROOM, message: `✅ ${nick} placed $${amt} on ${type === 'pass' ? 'Pass' : "Don't Pass"} line.` });
}

export async function handleCrapsStart(payload) {
  const userId = payload.sender;

  if (crapsState.tableUsers.length > 0 || crapsState.phase !== 'IDLE') {
    return; // Game already in progress
  }

  // Add the user and set as shooter
  crapsState.tableUsers.push(userId);
  crapsState.currentShooter = 0;
  

  // Begin the round
  table.startRound();
}

export async function handleCrapsJoin({ sender }) {
  if (crapsState.phase !== 'JOIN' || !crapsState.canJoinTable) return;
  if (!crapsState.tableUsers.includes(sender)) {
    crapsState.tableUsers.push(sender);
    const nick = await getUserNickname(sender);
    await postMessage({ room: ROOM, message: `🪑 ${nick} has joined the table.` });
  }
}

export async function handleCrapsPass(payload) {
  return placeBetLine('pass', payload);
}

export async function handleCrapsDontPass(payload) {
  return placeBetLine('dontpass', payload);
}

export async function handleCrapsRoll({ sender }) {
  if (!['AWAIT_ROLL', 'POINT'].includes(crapsState.phase)) return;
  if (sender !== crapsState.tableUsers[crapsState.currentShooter]) {
    const shooterNick = await getUserNickname(crapsState.tableUsers[crapsState.currentShooter]);
    return postMessage({ room: ROOM, message: `❌ Only the shooter (${shooterNick}) can roll.` });
  }
  table.doRoll();
}

export async function handleCrapsHelp() {
  await postMessage({
    room: ROOM,
    message: `🎲 **Craps Commands Help**:
• \`/craps start\` — Start a new game.
• \`/craps join\` — Join the current round.
• \`/pass <amt>\` — Bet on the Pass Line.
• \`/dontpass <amt>\` — Bet on the Don't Pass Line.
• \`/roll\` — Shooter rolls the dice.
• \`/come <amt>\` — Bet on the next roll, creates personal point if needed.
• \`/place <number> <amt>\` — Bet a number (4,5,6,8,9,10) during Point phase.`
  });
}

export async function handleCrapsCome({ sender, message }) {
  if (crapsState.phase !== 'POINT' || !crapsState.isBetting) {
    return postMessage({ room: ROOM, message: '❌ Come bets are only allowed during point betting.' });
  }

  const amt = parseInt(message.trim().split(/\s+/)[1], 10);
  if (isNaN(amt) || amt <= 0) {
    return postMessage({ room: ROOM, message: '❌ Please enter a valid amount, e.g. `/come 10`.' });
  }

  const balance = await getUserWallet(sender);
  if (balance < amt) {
    return postMessage({ room: ROOM, message: `❌ You only have $${balance.toFixed(2)}.` });
  }

  await removeFromUserWallet(sender, amt);
  crapsState.comeBets[sender] = crapsState.comeBets[sender] || [];
  crapsState.comeBets[sender].push({ status: 'awaiting', amount: amt });

  const nick = await getUserNickname(sender);
  return postMessage({ room: ROOM, message: `🟢 ${nick} places a $${amt} Come bet.` });
}

export async function handleCrapsPlace({ sender, message }) {
  if (crapsState.phase !== 'POINT' || !crapsState.isBetting) {
    return postMessage({ room: ROOM, message: '❌ Place bets are only allowed during point betting.' });
  }

  const parts = message.trim().split(/\s+/);
  const number = parseInt(parts[1], 10);
  const amount = parseInt(parts[2], 10);
  const validNums = [4, 5, 6, 8, 9, 10];

  if (!validNums.includes(number) || isNaN(amount) || amount <= 0) {
    return postMessage({ room: ROOM, message: '❌ Usage: /place [4,5,6,8,9,10] [amount]' });
  }

  const balance = await getUserWallet(sender);
  if (balance < amount) {
    return postMessage({ room: ROOM, message: `❌ You only have $${balance.toFixed(2)}.` });
  }

  await removeFromUserWallet(sender, amount);
  crapsState.placeBets[sender] = crapsState.placeBets[sender] || {};
  crapsState.placeBets[sender][number] = (crapsState.placeBets[sender][number] || 0) + amount;

  const nick = await getUserNickname(sender);
  return postMessage({ room: ROOM, message: `🎯 ${nick} places $${amount} on number ${number}.` });
}
