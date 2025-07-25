// src/handlers/horserace.js
import { postMessage } from './cometchat.js';
import { addToUserWallet, removeFromUserWallet, getUserWallet } from '../database/dbwalletmanager.js';
import { getUserNickname } from '../handlers/message.js';
import {
  getAllHorses,
  getHorseByName,
  updateHorseStats,
  updateHorseOdds
} from '../database/dbhorses.js'

import { fetchCurrentUsers } from '../utils/API.js';

const room = process.env.ROOM_UUID;
const BETTING_DURATION = 45000;
const ENTRY_DURATION = 30000; // 30 seconds for horse entry
const RACE_STEP_DELAY = 5000;

let horses = [];
let horseBets = {};
let isBettingOpen = false;
let waitingForHorseEntries = false;
let enteredHorses = new Set();
let allHorses = []; // keep full horses list loaded here for reference

// Call this from your main message handler to register horse entries
export function isWaitingForEntries() {
  return waitingForHorseEntries;
}

export async function handleHorseEntryAttempt(payload) {
  const userId = payload.sender;
  const rawMessage = payload.message.trim().toLowerCase();

  const allHorses = getAllHorses()


  // Find all valid horses this user owns that aren't retired
  const ownedHorses = allHorses.filter(h =>
    h.ownerId === userId && !h.retired
  );

  // Try to match one of their horse names in the message
  const matchingHorse = ownedHorses.find(h =>
    rawMessage.includes(h.name.toLowerCase())
  );

  if (!matchingHorse) return; // no valid match

  if (!enteredHorses.has(matchingHorse.name)) {
    enteredHorses.add(matchingHorse.name);
    const nickname = await getUserNickname(userId);

    await postMessage({
      room: process.env.ROOM_UUID,
      message: `✅ @${nickname} has entered **${matchingHorse.name}** into the race!`
    });
  }
}



async function startHorseRace() {
  horseBets = {};
  waitingForHorseEntries = true;
  enteredHorses = new Set();
  const allHorses = getAllHorses()


  // Fetch current users in the room by calling your fetchCurrentUsers()
  let activeUserIds = [];
  try {
    activeUserIds = await fetchCurrentUsers();
    console.log('🎯 Current Room Users:', activeUserIds);
  } catch (err) {
    console.error('⚠️ Failed to fetch current room users:', err.message);
  }

  // 🐎 Filter horses owned by people in the room
  const availableUserHorses = allHorses.filter(
    h =>
      h.ownerId &&
      h.ownerId !== 'allen' &&
      !h.retired &&
      activeUserIds.includes(h.ownerId)
  );

    const horseListLines = await Promise.all(
  availableUserHorses.map(async (horse) => {
    const ownerId = horse.ownerId || horse.ownerID; // Handle both casing styles
    if (!ownerId) return null;

    const ownerName = await getUserNickname(ownerId);
    const nicknameText = horse.nickname ? ` (${horse.nickname})` : '';
    const emoji = horse.emoji || '🐎'; // Default emoji if not specified
    return `- ${emoji} ${horse.name}${nicknameText} (owned by @${ownerName})`;
  })
);

// Filter out any `null` results (from horses with no owner)
const filteredHorseList = horseListLines.filter(Boolean);




  // 🕒 Main entry prompt
  await postMessage({
    room,
    message: `🏁 HORSE RACE STARTING SOON!\nType the name of your horse in the next 30 seconds to enter it in the race!`
  });

    // 📢 Post horse list
  if (horseListLines.length > 0) {
    await postMessage({
      room,
      message: `🏇 Horses available for entry:\n` + horseListLines.join('\n')
    });
  } else {
    await postMessage({
      room,
      message: `⚠️ No available horses found for active users. You can bet on one of my horses in this race. If you want to purchase your own horse you can use /buyhorse`
    });
  }

  await new Promise(resolve => setTimeout(resolve, ENTRY_DURATION));
  waitingForHorseEntries = false;

  // Horses entered by users
  const userHorses = allHorses.filter(h =>
    enteredHorses.has(h.name) && !h.retired
  );

  // Bot horses to fill the field
  const botHorses = allHorses
    .filter(h => (!h.owner || h.owner === 'allen') && !h.retired)
    .sort((a, b) => b.baseOdds - a.baseOdds);

  // Fill in with bot horses until we have 6 total
  horses = [...userHorses];
  for (const botHorse of botHorses) {
    if (horses.length >= 6) break;
    horses.push(botHorse);
  }

  if (horses.length === 0) {
    await postMessage({
      room,
      message: `🐴 No horses entered or available for the race. Please buy and enter a horse next time!`
    });
    return;
  }

  // Update odds dynamically
  horses = horses.map(h => ({
    ...h,
    odds: getCurrentOdds(h)
  }));

  await postMessage({
    room,
    message: `Today's racers are:\n${getHorseListMessage()}\n\nPlace your bets with /horse[number] [amount] (e.g. /horse3 50)\nYou have 30 seconds to bet!`
  });

  isBettingOpen = true;
  setTimeout(() => {
    isBettingOpen = false;
    runRace();
  }, BETTING_DURATION);
}





function getHorseListMessage() {
  return horses
    .map((horse, i) => {
      const odds = decimalToFraction(horse.odds);
      const ownerText = horse.owner ? ` 🏇 owned by @${horse.owner}` : '';
      const nicknameText = horse.nickname ? ` (${horse.nickname})` : '';
      return `#${i + 1} ${horse.name}${nicknameText} (odds: ${odds})${ownerText}`;
    })
    .join('\n');
}

async function handleHorseBet(payload) {
  if (!isBettingOpen) return;

  let match =
    payload.message.match(/^\/horse(\d+)\s+(\d+)/i) ||
    payload.message.match(/^\/horse\s+(\d+)\s+(\d+)/i);

  if (!match) return;

  const horseIndex = parseInt(match[1], 10) - 1;
  const amount = parseInt(match[2], 10);
  const userId = payload.sender;
  const nickname = await getUserNickname(userId);

  if (horseIndex < 0 || horseIndex >= horses.length) return;
  if (amount <= 0) return;

  const balance = await getUserWallet(userId);
  if (balance < amount) {
    await postMessage({
      room,
      message: `@${nickname}, you don't have enough funds to bet $${amount}. Your balance is $${balance}.`
    });
    return;
  }

  const success = await removeFromUserWallet(userId, amount);
  if (!success) return;

  if (!horseBets[userId]) {
    horseBets[userId] = [];
  }

  horseBets[userId].push({ horseIndex, amount });

  const horse = horses[horseIndex];
  const nicknameText = horse.nickname ? ` (${horse.nickname})` : '';
  await postMessage({
    room,
    message: `@${nickname} bets $${amount} on #${horseIndex + 1} ${horse.name}${nicknameText}! 🐎`
  });
}



async function runRace() {
  console.log('🏁 Race is starting...');
  await postMessage({
    room,
    message: `🏇 The race is about to begin! Buckle up!`,
    images: ['https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZW9zYTU2N21wbHk1eWE5MnZocTNnY3Q5NndnOGpodDBscWJwdWd3byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/f8zTTGjUFf5El00t2E/giphy.gif']
  });

  await new Promise(r => setTimeout(r, 3000)); // suspense pause

  const raceState = horses.map((horse, i) => ({
    index: i,
    name: horse.name,
    odds: horse.odds,
    progress: 0,
    segments: [Math.random(), Math.random(), Math.random()]
  }));

  // ⬇️ Restore commentary pool and function
  const commentaryPool = [
    "💥 A strong start from #NAME!",
    "🐎 #NAME bursts forward with fury!",
    "😮 #NAME stumbles but regains pace!",
    "🔥 Blazing speed from #NAME!",
    "🏇 #NAME is pushing through the pack!",
    "🫣 #NAME is trailing behind. Can they recover?",
    "🌀 What a move by #NAME — slicing through the herd!",
    "🚀 #NAME hits turbo mode!",
    "📉 #NAME's losing steam... or are they saving it?",
    "🤯 No one saw that coming from #NAME!",
    "🎯 #NAME locks eyes on the finish line!",
    "💪 #NAME is making a surprising move!",
    "📢 The crowd is roaring for #NAME!",
    "💤 #NAME might be holding back... or just tired?",
    "🌪️ #NAME is storming through the field!",
    "⚡ #NAME just hit another gear!",
    "🧱 #NAME slams into a wall of competition!",
  ];

  function getRandomCommentary(name) {
    const line = commentaryPool[Math.floor(Math.random() * commentaryPool.length)];
    return line.replace('#NAME', name);
  }

  // 🌀 Simulate race
  for (let i = 0; i < 3; i++) {
    raceState.forEach(h => h.progress += h.segments[i]);

    await postMessage({ room, message: `🏁 Turn ${i + 1}:` });

    const sortedByProgress = [...raceState].sort((a, b) => b.progress - a.progress);
    let focusHorse;

    if (Math.random() < 0.7) {
      const top3 = sortedByProgress.slice(0, 3);
      focusHorse = top3[Math.floor(Math.random() * top3.length)];
    } else {
      const underdogs = sortedByProgress.slice(3);
      focusHorse = underdogs.length
        ? underdogs[Math.floor(Math.random() * underdogs.length)]
        : sortedByProgress[Math.floor(Math.random() * sortedByProgress.length)];
    }

    const comment = getRandomCommentary(focusHorse.name);
    await postMessage({ room, message: comment });
    await postMessage({ room, message: generateVisualProgress(raceState, false) });

    await new Promise(r => setTimeout(r, RACE_STEP_DELAY + Math.random() * 1000));
  }

  await postMessage({ room, message: `🎉 It's the final sprint! Who's got the guts?!` });
  await new Promise(r => setTimeout(r, 1500));

  const sortedRace = [...raceState].sort((a, b) => b.progress - a.progress);
  const winner = sortedRace[0];
  console.log('🏆 Winner:', winner.name, `(index: ${winner.index})`);

  await updateHorseStatsAndRetirements(winner.index);
  await postMessage({ room, message: generateVisualProgress(raceState, true) });

  await postMessage({
    room,
    message: `🏆 **VICTORY!** The winner is #${winner.index + 1} **${winner.name}**!!! 🎊`
  });

  // 🎯 Log and handle payouts
  console.log('🎰 Bets placed:', horseBets);

  const totalBetsOnWinner = Object.values(horseBets)
    .filter(bet => bet.horseIndex === winner.index)
    .reduce((sum, bet) => sum + bet.amount, 0);
  console.log(`💰 Total bet pool on winner: $${totalBetsOnWinner}`);

  for (const [userId, bets] of Object.entries(horseBets)) {
  let totalWinnings = 0;

  for (const bet of bets) {
    if (bet.horseIndex === winner.index) {
      const winnings = Math.floor(bet.amount * horses[bet.horseIndex].odds);
      totalWinnings += winnings;

      console.log(`✅ ${userId} matched winning horse with bet of $${bet.amount}, won $${winnings}`);
    } else {
      console.log(`❌ ${userId}'s bet on horse #${bet.horseIndex + 1} did not win.`);
    }
  }

  if (totalWinnings > 0) {
    try {
      await addToUserWallet(userId, totalWinnings);
      const nickname = await getUserNickname(userId);
      await postMessage({
        room,
        message: `💰 @${nickname} won a total of $${totalWinnings} betting on ${winner.name}!`
      });
      console.log(`💸 Paid out $${totalWinnings} to @${nickname}`);
    } catch (err) {
      console.error(`❌ Failed to pay out to ${userId}:`, err);
    }
  }
}


  // 🐎 Owner bonus
  const ownerId = horses[winner.index].ownerId;
  const horsePrice = horses[winner.index].price || 0;

  if (ownerId && horsePrice > 0) {
    const ownerBonus = Math.floor(horsePrice * 0.1);
    console.log(`🏇 Owner ID: ${ownerId}, Horse Price: ${horsePrice}, Bonus: $${ownerBonus}`);

    if (ownerBonus > 0) {
      try {
        await addToUserWallet(ownerId, ownerBonus);
        const ownerName = await getUserNickname(ownerId);
        await postMessage({
          room,
          message: `🏇 Owner @${ownerName} earned $${ownerBonus} (10% of their horse's purchase price) from the big win!`
        });
        console.log(`🎉 Owner bonus paid to @${ownerName}`);
      } catch (err) {
        console.error(`❌ Failed to pay owner bonus to ${ownerId}:`, err);
      }
    }
  }

}




async function updateHorseStatsAndRetirements(winnerIndex) {
  const allHorses = getAllHorses()


  const winner = horses[winnerIndex];
  const fullWinner = allHorses.find(h => h.name.toLowerCase() === winner.name.toLowerCase());
  if (fullWinner) {
    fullWinner.wins++;
    fullWinner.racesParticipated++;
  }

  for (const racedHorse of horses) {
    const fullHorse = allHorses.find(h => h.name.toLowerCase() === racedHorse.name.toLowerCase());

    if (fullHorse && fullHorse !== fullWinner) {
      fullHorse.racesParticipated++;
    }

    if (
      fullHorse &&
      fullHorse.owner !== 'allen' &&
      !fullHorse.retired &&
      fullHorse.racesParticipated >= fullHorse.careerLength
    ) {
      fullHorse.retired = true;
      await postMessage({
        room,
        message: `${fullHorse.emoji || '🐎'} **${fullHorse.name}** has retired after a glorious career! 🏅`
      });
    }
  }

  for (const horse of allHorses) {
  updateHorseStats(horse)
}

}



function generateVisualProgress(raceState, showWinner = false) {
  const MAX_BAR_LENGTH = 10;
  const blockFull = '🟩';
  const blockEmpty = '⬜';
  const finishLine = ' |🏁|';

  const STATIC_MAX_PROGRESS = 3;
  const actualMaxProgress = Math.max(...raceState.map(h => h.progress));
  const progressScale = showWinner ? actualMaxProgress : STATIC_MAX_PROGRESS;

  const leaders = raceState
    .filter(h => h.progress === actualMaxProgress)
    .map(h => h.index);

  return raceState
    .map(h => {
      const horseNumber = `#${h.index + 1}`.padStart(3) + ' ';
      const ratio = progressScale > 0 ? h.progress / progressScale : 0;
      const barFullCount = Math.min(MAX_BAR_LENGTH, Math.round(ratio * MAX_BAR_LENGTH));
      const barEmptyCount = MAX_BAR_LENGTH - barFullCount;
      const progressBar = blockFull.repeat(barFullCount) + blockEmpty.repeat(barEmptyCount);
      const leaderEmoji = showWinner && leaders.includes(h.index) ? ' 🏆' : '';
      return `${horseNumber}${progressBar}${finishLine} ${h.name}${leaderEmoji}`;
    })
    .join('\n');
}

export { startHorseRace, handleHorseBet };
