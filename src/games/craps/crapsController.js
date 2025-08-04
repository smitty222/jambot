// src/games/craps/crapsController.js

import { table } from './service.js';
import { postMessage } from '../../libs/cometchat.js';
import { addToUserWallet, removeFromUserWallet } from '../../database/dbwalletmanager.js';
import { getUserNickname } from '../../handlers/message.js';
import { crapsState } from './crapsState.js';

const ROOM = process.env.ROOM_UUID;
console.log('[crapsController] Loaded — registering event listeners');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function safeSay(message) {
  try {
    await postMessage({ room: ROOM, message });
  } catch (err) {
    console.error('[crapsController] postMessage failed:', err);
  }
}

async function getShooter() {
  const shooterId = crapsState.tableUsers[crapsState.currentShooter];
  const nick = shooterId ? await getUserNickname(shooterId) : 'Unknown';
  return { shooterId, nick };
}

// ─── Event Listeners ────────────────────────────────────────────

table.on('roundStart', async () => {
  const { nick } = await getShooter();
  await safeSay(
    `🎲 A new game begins. Place your bets.\n` +
    `💺 Sit down with \`/craps join\` (30s)\n` +
    `🪑 Current table: ${nick}`
  );
});

table.on('betsOpen', async ({ phase }) => {
  const { nick } = await getShooter();

  if (phase === 'COME_OUT') {
    await safeSay(
      `💰 Bets are open (30s)\n🎯 Shooter: ${nick}\n` +
      '`/pass <amt>` or `/dontpass <amt>`'
    );
  }
});

table.on('betsClosed', async () => {
  const { nick } = await getShooter();
  await safeSay(`⌛ Bets closed. ${nick}, it's time... \`/roll\``);
});

table.on('rollResult', async ({ d1, d2, total, outcome }) => {
  await safeSay(`🎲 Rolling...`);
  await delay(1000); // Delay before showing dice

  await safeSay(`🎲 🎲 ${d1} + ${d2} = **${total}**`);

  // If the roll ends the round (PASS, DON'T PASS, PUSH), exit
  if (outcome) return;

  // Handle newly established point
  if (crapsState.phase === 'POINT' && crapsState.point === total) {
    await delay(500); // slight dramatic pause before announcing point
    await safeSay(`📍 Point is set to **${total}**. Let’s play.`);
    await safeSay(`🎯 Point is **${total}**. Hit it before 7.`);
    await safeSay(`💰 Bets open (30s): \`/come <amt>\`, \`/place <num> <amt>\``);
    return;
  }

  // In POINT phase, check if any bets hit
  if (crapsState.phase === 'POINT') {
    const totalStr = String(total);

    const didPlaceHit = Object.values(crapsState.placeBets || {}).some(bets =>
      Object.keys(bets).includes(totalStr)
    );

    const didComeHit = Object.values(crapsState.comeBets || {}).some(bets =>
      bets.some(b =>
        (b.status === 'awaiting' && [7, 11, 2, 3, 12].includes(total)) ||
        (b.status === 'active' && (total === b.point || total === 7))
      )
    );

    const hitPoint = total === crapsState.point;
    const hitSeven = total === 7;

    if (!didPlaceHit && !didComeHit && !hitPoint && !hitSeven) {
      await safeSay(`🌀 Nothing hits. Shooter, roll again with \`/roll\`.`);
    }
  }
});

table.on('pointEstablished', async ({ point }) => {
  await safeSay(`📍 Point is set to **${point}**. Let’s play.`);
});

table.on('placeWin', async ({ user, number, amount }) => {
  const payout = amount * 2;
  await addToUserWallet(user, payout);
  const nick = await getUserNickname(user);
  await safeSay(`🎯 **${nick}** hits ${number} and wins $${payout}!`);
});

table.on('placeLoss', async ({ user, number, amount }) => {
  await removeFromUserWallet(user, amount);
  const nick = await getUserNickname(user);
  await safeSay(`💥 **${nick}** loses Place bet on ${number}.`);
});

table.on('roundEnd', async ({
  outcome,
  roll,
  passWinners = [],
  passLosers = [],
  dpWinners = [],
  dpLosers = [],
  pushOn12 = false
}) => {
  await delay(1200);
  await safeSay(`🏁 Final result: **${outcome.toUpperCase()}** (roll: ${roll})`);

  for (const user of passWinners) {
    const amt = crapsState.passBets[user] || 0;
    if (amt > 0) {
      await addToUserWallet(user, amt * 2);
      const nick = await getUserNickname(user);
      await safeSay(`💸 ${nick} wins $${amt} on Pass Line`);
    }
  }

  for (const user of passLosers) {
    const amt = crapsState.passBets[user] || 0;
    if (amt > 0) {
      await removeFromUserWallet(user, amt);
      const nick = await getUserNickname(user);
      await safeSay(`💀 ${nick} loses $${amt} on Pass Line`);
    }
  }

  for (const user of dpWinners) {
    const amt = crapsState.dontPassBets[user] || 0;
    if (amt > 0) {
      await addToUserWallet(user, amt * 2);
      const nick = await getUserNickname(user);
      await safeSay(`🛡️ ${nick} wins $${amt} on Don’t Pass`);
    }
  }

  for (const user of dpLosers) {
    const amt = crapsState.dontPassBets[user] || 0;
    if (amt > 0) {
      await removeFromUserWallet(user, amt);
      const nick = await getUserNickname(user);
      await safeSay(`☠️ ${nick} loses $${amt} on Don’t Pass`);
    }
  }

  if (pushOn12) {
    await safeSay('🔄 Push on 12 — Don’t Pass bets returned.');
  }

  for (const [userId, bets] of Object.entries(crapsState.comeBets || {})) {
    const nick = await getUserNickname(userId);
    for (const bet of bets) {
      if (bet.status === 'won') {
        await addToUserWallet(userId, bet.amount * 2);
        await safeSay(`🎉 ${nick} wins $${bet.amount} from Come bet on ${bet.point}`);
      } else if (bet.status === 'lost') {
        await removeFromUserWallet(userId, bet.amount);
        await safeSay(`💀 ${nick} loses $${bet.amount} Come bet on ${bet.point}`);
      }
    }
  }

  // Wrap-up logic: is the game ending or continuing?
  const shooterSet = crapsState.shooterHistory || new Set();
  const tableUsers = crapsState.tableUsers || [];

  if (tableUsers.length <= 1 || shooterSet.size === tableUsers.length) {
    await safeSay(`💬 Type \`/craps start\` to begin again`);
  } else {
    await safeSay(`🔁 Next shooter coming up...`);
    await delay(1200);
    await safeSay(`💬 Type \`/craps start\` to begin again`);
  }
});

