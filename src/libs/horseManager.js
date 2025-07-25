import fs from 'fs/promises';
import path from 'path';
import { postMessage } from './cometchat.js';
import { getUserNickname } from '../handlers/message.js';
import { getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js';
import { getAllHorses, getUserHorses, getHorseByName, insertHorse } from '../database/dbhorses.js'
const room = process.env.ROOM_UUID

const HORSE_TIERS = {
  basic: {
    price: 2000,
    oddsRange: [6.0, 9.0],
    volatilityRange: [1.5, 2.5],
    careerLengthRange: [8, 12],  // basic horses race 8-12 times
    emoji: '🐴'
  },
  elite: {
    price: 7000,
    oddsRange: [4.0, 7.0],
    volatilityRange: [1.0, 2.0],
    careerLengthRange: [12, 18],  // elite horses race 12-18 times
    emoji: '🐎'
  },
  champion: {
    price: 15000,
    oddsRange: [2.5, 5.0],
    volatilityRange: [0.5, 1.5],
    careerLengthRange: [18, 24],  // champion horses race 18-24 times
    emoji: '🐉'
  }
};


const horseNamePrefixes = [
  'Shadow', 'Storm', 'Midnight', 'Blaze', 'Iron', 'Lunar', 'Wild', 'Thunder',
  'Crimson', 'Silver', 'Phantom', 'Frost', 'Golden', 'Fire', 'Night', 'Jet',
  'Echo', 'Ghost', 'Obsidian', 'Savage', 'Cosmic', 'Rogue', 'Ashen', 'Rapid'
];

const horseNameSuffixes = [
  'Streak', 'Dust', 'King', 'Runner', 'Bolt', 'Whirl', 'Spirit', 'Strike',
  'Fury', 'Reign', 'Chaser', 'Warden', 'Dash', 'Glide', 'Vortex', 'Drift',
  'Flare', 'Claw', 'Knight', 'Echo', 'Surge', 'Wind', 'Rider', 'Tempest'
];


function generateHorseName(existingNames = []) {
  let name;
  const maxAttempts = 1000;
  let attempts = 0;

  do {
    const prefix = horseNamePrefixes[Math.floor(Math.random() * horseNamePrefixes.length)];
    const suffix = horseNameSuffixes[Math.floor(Math.random() * horseNameSuffixes.length)];

    // Skip if prefix and suffix are the same (like EchoEcho)
    if (prefix.toLowerCase() === suffix.toLowerCase()) continue;

    name = prefix + suffix;
    attempts++;
  } while ((existingNames.includes(name) || !name) && attempts < maxAttempts);

  // Fallback in case no valid name is found
  if (!name || attempts >= maxAttempts) {
    throw new Error('Unable to generate a unique horse name. Consider expanding the name list.');
  }

  return name;
}


async function loadHorses() {
  const data = await fs.readFile(horsesFile, 'utf-8');
  return JSON.parse(data);
}

async function saveHorses(horses) {
  await fs.writeFile(horsesFile, JSON.stringify(horses, null, 2), 'utf-8');
}

function decimalToFraction(decimal) {
  return `${decimal - 1}/1`;
}


function getCurrentOdds(horse) {
  const { baseOdds, volatility, wins, racesParticipated } = horse;

  let adjustedOdds = baseOdds;

  if (racesParticipated >= 5) {
    const winRate = wins / racesParticipated;
    const adjustment = (0.5 - winRate) * 6; // range: -3 to +3
    adjustedOdds += adjustment;
  }

  // Add volatility-based randomness
  const fluctuation = (Math.random() - 0.5) * volatility;
  adjustedOdds += fluctuation;

  // Clamp to minimum 2, round to whole number
  return Math.max(2, Math.round(adjustedOdds));
}

function randomInRange(min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

async function handleBuyHorse(payload) {
  const message = payload.message.trim();
  const userId = payload.sender;
  const nickname = await getUserNickname(userId);

  const match = message.match(/^\/buyhorse\s*(\w+)?/i);
  if (!match) return;

  const tierName = match[1]?.toLowerCase();

  if (!tierName) {
  return postMessage({
    room,
    message: `🐎 **Want to buy a horse?** Choose your tier below:\n\n` +
      `__**/buyhorse basic**__   🐴 $2,000 – Balanced starter horses\n` +
      `• Odds: 6.0–9.0\n` +
      `• Volatility: 1.5–2.5\n` +
      `• Career: 8–12 races\n\n` +
      `__**/buyhorse elite**__   🐎 $7,000 – Faster with better consistency\n` +
      `• Odds: 4.0–7.0\n` +
      `• Volatility: 1.0–2.0\n` +
      `• Career: 12–18 races\n\n` +
      `__**/buyhorse champion**__ 🐉 $15,000 – Top-tier racers with elite stats\n` +
      `• Odds: 2.5–5.0\n` +
      `• Volatility: 0.5–1.5\n` +
      `• Career: 18–24 races\n\n` +
      `Type one of the commands above to buy a horse.\n\n🏁 Horses have unique stats and retire after a fixed number of races.`
  });
}


  const tier = HORSE_TIERS[tierName];
  if (!tier) return;

  const careerLength = Math.floor(randomInRange(...tier.careerLengthRange, 0));
  const balance = getUserWallet(userId);

  if (balance < tier.price) {
    return postMessage({
      room,
      message: `@${nickname}, you need $${tier.price} to buy a ${tierName} horse. You have $${balance}.`
    });
  }

  const success = removeFromUserWallet(userId, tier.price);
  if (!success) return;

  const existingHorses = getAllHorses();
  const existingNames = existingHorses.map(h => h.name);
  const name = generateHorseName(existingNames);
  const baseOdds = Math.round(randomInRange(...tier.oddsRange));
  const volatility = parseFloat(randomInRange(...tier.volatilityRange).toFixed(1));

   insertHorse({
    name,
    baseOdds,
    volatility,
    wins: 0,
    racesParticipated: 0,
    careerLength,
    owner: nickname,
    ownerId: userId,
    tier: tierName,
    emoji: tier.emoji,
    price: tier.price,
    retired: false
  });

  await postMessage({
    room,
    message: `${tier.emoji} @${nickname} just bought a *${tierName.toUpperCase()}* horse: **${name}**!\n🎲 Stats — Odds: ${baseOdds}/1, Volatility: ${volatility}`
  });
}

export async function handleMyHorsesCommand(payload) {
  const userId = payload.sender;
  const nickname = await getUserNickname(userId);
  const userHorses = getUserHorses(userId)


  if (userHorses.length === 0) {
    await postMessage({
      room: payload.room || process.env.ROOM_UUID,
      message: `@${nickname}, you don't own any horses yet! Use /buyhorse to get started 🐴`
    });
    return;
  }

  const active = userHorses.filter(h => !h.retired);
  const retired = userHorses.filter(h => h.retired);

  const formatActiveHorse = (horse, i) => {
    const losses = (horse.racesParticipated || 0) - (horse.wins || 0);
    const remainingRaces = Math.max((horse.careerLength || 0) - (horse.racesParticipated || 0), 0);
    const nicknameText = horse.nickname ? ` (${horse.nickname})` : '';
    return `${i + 1}. ${horse.emoji || '🐎'} ${horse.name}${nicknameText} — Wins: ${horse.wins || 0}, Losses: ${losses}, Remaining Races: ${remainingRaces}`;
  };

  const formatRetiredHorse = (horse, i) => {
    const losses = (horse.racesParticipated || 0) - (horse.wins || 0);
    const nicknameText = horse.nickname ? ` (${horse.nickname})` : '';
    return `${i + 1}. ${horse.emoji || '🐎'} ${horse.name}${nicknameText} — Total Record: ${horse.wins || 0} Wins - ${losses} Losses`;
  };

  let message = `@${nickname}'s Stable:\n`;

  if (active.length > 0) {
    message += `\n🏇 **Active Horses:**\n` + active.map(formatActiveHorse).join('\n');
  }

  if (retired.length > 0) {
    message += `\n\n🏁 **Retired Horses:**\n` + retired.map(formatRetiredHorse).join('\n');
  }

  await postMessage({
    room: payload.room || process.env.ROOM_UUID,
    message
  });
}


export async function handleHorseStatsCommand(payload) {
  const room = payload.room || process.env.ROOM_UUID;

  const message = `
📊 **Horse Stats & Tiers Explained** 🐎

Each horse comes with unique stats that determine how they perform in races.

---

**🎯 Key Stats:**

- **Base Odds:**  
  Lower odds = stronger horse. Base odds get adjusted with some randomness before each race.

- **Volatility:**  
  Determines how unpredictable the horse is.  
  - High volatility = more boom-or-bust  
  - Low volatility = more consistent results

- **Career Length:**  
  Total number of races the horse can run before retiring. After retirement, the horse is saved in your stable history.

---

**🏆 Available Tiers:**

- **Basic** 🐴  
  - Base Odds: 5–10  
  - Volatility: 1.5–3.0  
  - Career: 5–8 races  
  - Affordable starter horses

- **Elite** 🐎  
  - Base Odds: 4–8  
  - Volatility: 1.0–2.5  
  - Career: 10–15 races  
  - Stronger and more consistent

- **Champion** 🐉  
  - Base Odds: 2–6  
  - Volatility: 0.5–2.0  
  - Career: 15–25 races  
  - High cost, but legendary potential

---

Use \`/buyhorse\` to get one and \`/myhorses\` to see your stable!

Good luck on the track 🏇💨
`;

  await postMessage({ room, message });
}

export async function handleHorseHelpCommand(payload) {
  const room = payload.room || process.env.ROOM_UUID;

  const message = `
🐎 **Welcome to the Horse Racing Game!** 🐎

Here's how it works:

1. **Start a Race**  
   Use \`/horserace\` to start a race. Anybody can bet on any horse to win.

1. **Buy a Horse**  
   Use \`/buyhorse\` to purchase a racehorse with unique stats, odds, and a limited career. Horses are stored in your personal stable.

2. **View Your Stable**  
   Use \`/myhorses\` to see all your active and retired horses.

3. **Enter a Race**  
   When someone starts a race with \`/horserace\`, you'll get **30 seconds** to enter one of your horses. Just type your active horse's name in chat!

4. **Place Bets**  
   Once the horses are locked in, you can bet with \`/horse[number] [amount]\`.  
   Example: \`/horse2 50\` bets $50 on horse #2.

5. **Win Prizes**  
   - If your bet wins, you earn based on the horse's odds! 💰  
   - If **your horse** wins, you also get a 10% **owner bonus**, even if you didn’t bet!

6. **Horses Retire**  
   Each horse has a career length. Once they've run their races, they retire

---

Want to get started? Type \`/buyhorse\` and let’s race!

🐴 Good luck, jockey.
`;

  await postMessage({ room, message });
}

export async function handleTopHorsesCommand(payload) {
  const horses = await loadHorses();
  const room = payload.room || process.env.ROOM_UUID;

  const validHorses = horses.filter(h =>
    h.owner &&
    typeof h.owner === 'string' &&
    h.owner.toLowerCase() !== 'allen'
  );

  if (validHorses.length === 0) {
    await postMessage({
      room,
      message: `📉 No valid horses found (excluding unowned or Allen’s horses).`
    });
    return;
  }

  const sorted = validHorses.sort((a, b) => {
    // Sort by wins descending, then by fewest losses
    const aLosses = (a.racesParticipated || 0) - (a.wins || 0);
    const bLosses = (b.racesParticipated || 0) - (b.wins || 0);
    if ((b.wins || 0) !== (a.wins || 0)) {
      return (b.wins || 0) - (a.wins || 0);
    }
    return aLosses - bLosses;
  });

  const lines = sorted.slice(0, 10).map((horse, i) => {
    const wins = horse.wins || 0;
    const losses = (horse.racesParticipated || 0) - wins;
    const status = horse.retired ? '🏁 Retired' : '🏇 Active';
    return `${i + 1}. ${horse.emoji || '🐎'} **${horse.name}** (${status}) — ${wins}W-${losses}L | Owned by @${horse.owner}`;
  });

  await postMessage({
    room,
    message: `🏆 **Top Horses of All Time** (by wins)\n\n${lines.join('\n')}`
  });
}



export {
  loadHorses,
  saveHorses,
  decimalToFraction,
  getCurrentOdds,
  handleBuyHorse
};
