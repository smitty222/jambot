// src/games/craps/crapsController.js
import { table } from './service.js';
import { crapsState, PHASES } from './crapsState.js';
import { postMessage } from '../../libs/cometchat.js';
import { addToUserWallet } from '../../database/dbwalletmanager.js';
import { getUserNickname } from '../../handlers/message.js';

const ROOM = process.env.ROOM_UUID;

console.log('[crapsController] Loaded — registering event listeners');

async function nick(userId) {
  try { return await getUserNickname(userId); }
  catch { return 'Player'; }
}

function sumMap(m) {
  return Object.values(m || {}).reduce((a,b)=>a + (b||0), 0);
}

function* eachEntry(m) {
  for (const k of Object.keys(m || {})) yield [k, m[k]];
}

async function payLineWinners({ passWinners, dpWinners, dpPushes }) {
  // Winners: pay stake + profit (even money) => add stake * 2
  for (const [uid, amt] of eachEntry(passWinners)) {
    if (amt > 0) await addToUserWallet(uid, amt * 2, 'Pass line win');
  }
  for (const [uid, amt] of eachEntry(dpWinners)) {
    if (amt > 0) await addToUserWallet(uid, amt * 2, 'Don’t Pass win');
  }
  // Pushes: refund stake
  for (const [uid, amt] of eachEntry(dpPushes)) {
    if (amt > 0) await addToUserWallet(uid, amt, 'Don’t Pass push refund');
  }
}

function resetLineBets() {
  crapsState.passBets = Object.create(null);
  crapsState.dontPassBets = Object.create(null);
}

table.on('systemNotice', async (text) => {
  await postMessage({ room: ROOM, message: `ℹ️ ${text}` });
});

table.on('roundStart', async () => {
  const shooterId = table.getShooter();
  const shooterName = shooterId ? await nick(shooterId) : 'Shooter';
  await postMessage({
    room: ROOM,
    message:
`🏁 **New round started!**
- Shooter: **${shooterName}**
- Join with \`/join\`
- When betting opens:
  • Come-out: \`/pass [amt]\`, \`/dontpass [amt]\`
  • Point: \`/come [amt]\`, \`/place [4|5|6|8|9|10] [amt]\``
  });
});

table.on('betsOpen', async ({ phase, durationMs }) => {
  const shooterId = table.getShooter();
  const shooterName = shooterId ? await nick(shooterId) : 'Shooter';
  const label = phase === PHASES.COME_OUT ? 'Come-out' : 'Point';
  await postMessage({
    room: ROOM,
    message:
`🟩 **Bets OPEN** (${label}) — ~${Math.floor(durationMs/1000)}s
- Shooter: **${shooterName}**
- Use commands:
  ${phase === PHASES.COME_OUT ? '• `/pass [amt]`, `/dontpass [amt]`' : '• `/come [amt]`, `/place [num] [amt]`'}`,
  });
});

table.on('betsClosed', async () => {
  const shooterName = await nick(table.getShooter());
  await postMessage({
    room: ROOM,
    message: `🟥 **Bets CLOSED.** ${shooterName}, type \`/roll\` when ready 🎲`,
  });
});

table.on('roll', async ({ d1, d2, total }) => {
  await postMessage({ room: ROOM, message: `🎲 **Roll:** \`${d1}\` + \`${d2}\` = **${total}**` });
});

table.on('pointEstablished', async ({ point }) => {
  await postMessage({ room: ROOM, message: `📍 **Point is ${point}.** Place and Come bets now available.` });
});

table.on('comePlaced', async ({ userId, amount }) => {
  await postMessage({ room: ROOM, message: `🟦 Come bet placed: **${await nick(userId)}** $${amount}` });
});

table.on('placePlaced', async ({ userId, number, amount }) => {
  await postMessage({ room: ROOM, message: `🟨 Place bet: **${await nick(userId)}** $${amount} on **${number}**` });
});

table.on('placeRemoved', async ({ userId, number, amount }) => {
  await postMessage({ room: ROOM, message: `↩️ Place bet removed: **${await nick(userId)}** got $${amount} back from **${number}**` });
});

table.on('comeMove', async ({ userId, number, amount }) => {
  await postMessage({ room: ROOM, message: `➡️ **${await nick(userId)}** moved Come $${amount} to **${number}**` });
});

table.on('comeWin', async (evt) => {
  const who = await nick(evt.userId);
  if (evt.kind === 'instant') {
    await postMessage({ room: ROOM, message: `✅ Come **wins instantly** for **${who}** (+$${evt.amount})` });
  } else {
    await postMessage({ room: ROOM, message: `✅ Come on **${evt.number}** hits for **${who}** (+$${evt.amount})` });
  }
});

table.on('comeLoss', async ({ userId, number, amount, reason }) => {
  const who = await nick(userId);
  const why = reason === 'SEVEN_OUT' ? '7-out' : 'come-out loss';
  await postMessage({ room: ROOM, message: `❌ Come ${why} for **${who}** ($${amount})${number ? ` on ${number}` : ''}` });
});

table.on('placeWin', async ({ userId, number, amount, payout }) => {
  await postMessage({ room: ROOM, message: `✅ Place on **${number}** wins for **${await nick(userId)}** (stake $${amount} → $${payout.toFixed(2)})` });
});

table.on('placeLoss', async ({ userId, number, amount, reason }) => {
  const who = await nick(userId);
  const why = reason === 'SEVEN_OUT' ? '7-out' : 'loss';
  await postMessage({ room: ROOM, message: `❌ Place ${why} for **${who}** on **${number}** ($${amount})` });
});

table.on('lineResult', async (res) => {
  const { stage, outcome, passWinners, passLosers, dpWinners, dpLosers, dpPushes } = res;

  // Pay winners & refund pushes (controller owns Pass/DP wallet ops)
  await payLineWinners({ passWinners, dpWinners, dpPushes });

  const passWinSum = sumMap(passWinners);
  const passLoseSum = sumMap(passLosers);
  const dpWinSum = sumMap(dpWinners);
  const dpLoseSum = sumMap(dpLosers);
  const dpPushSum = sumMap(dpPushes);

  const lines = [
    `🧮 **Line result (${stage} → ${outcome})**`,
    passWinSum ? `• Pass paid: $${passWinSum}` : null,
    passLoseSum ? `• Pass lost: $${passLoseSum}` : null,
    dpWinSum ? `• Don't Pass paid: $${dpWinSum}` : null,
    dpLoseSum ? `• Don't Pass lost: $${dpLoseSum}` : null,
    dpPushSum ? `• Don't Pass push refunded: $${dpPushSum}` : null,
  ].filter(Boolean);

  await postMessage({ room: ROOM, message: lines.join('\n') });

  // Clear line bets after settlement
  resetLineBets();
});

table.on('newRecord', async ({ count, shooterId }) => {
  const who = await nick(shooterId);
  await postMessage({ room: ROOM, message: `🏆 **New record!** ${who} rolled **${count}** times in a single round.` });
});

table.on('roundEnd', async ({ reason, rolls, shooterId }) => {
  const who = await nick(shooterId);
  await postMessage({
    room: ROOM,
    message:
`⛳ **Round over** (${reason})
- Shooter: **${who}**
- Rolls: **${rolls}**

Type \`/craps start\` to begin the next round.`
  });

  // Rotate shooter for next round
  table.nextShooter();
});
