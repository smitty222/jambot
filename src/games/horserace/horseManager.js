import { postMessage } from '../../libs/cometchat.js';
import { getUserNickname } from '../../handlers/message.js';
import {
  getUserWallet,
  removeFromUserWallet,
} from '../../database/dbwalletmanager.js';
import {
  getAllHorses,
  getUserHorses,
  insertHorse,
} from '../../database/dbhorses.js';
import { formatOdds } from '../../utils/oddsFormatter.js';

const ROOM = process.env.ROOM_UUID;

const HORSE_TIERS = {
  basic:    { price: 2000, oddsRange: [6.0, 9.0], volatilityRange: [1.5, 2.5], careerLength: [8, 12], emoji: '🐴' },
  elite:    { price: 7000, oddsRange: [4.0, 7.0], volatilityRange: [1.0, 2.0], careerLength: [12, 18], emoji: '🐎' },
  champion: { price:15000, oddsRange: [2.5, 5.0], volatilityRange: [0.5, 1.5], careerLength: [18, 24], emoji: '🐉' },
};

const NAME_PREFIXES = [ /* ... */ ];
const NAME_SUFFIXES = [ /* ... */ ];

function randomInRange(min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateHorseName(existingNames) {
  for (let i = 0; i < 1000; i++) {
    const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
    const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
    if (prefix.toLowerCase() === suffix.toLowerCase()) continue;
    const name = prefix + suffix;
    if (!existingNames.includes(name)) return name;
  }
  throw new Error('Unable to generate unique horse name.');
}

export class HorseManager {
  async handleBuyHorse(ctx) {
    const userId = ctx.sender;
    const text = ctx.message.trim();
    const nick = await getUserNickname(userId);
    const match = text.match(/^\/buyhorse\s*(\w+)?/i);
    if (!match) return;

    const tierKey = match[1]?.toLowerCase();
    if (!tierKey) {
      return postMessage({
        room: ROOM,
        message: [
          '🐎 **Buy a horse – choose tier:**',
          '• `/buyhorse basic` 🐴 $2,000',
          '• `/buyhorse elite` 🐎 $7,000',
          '• `/buyhorse champion` 🐉 $15,000',
        ].join('\n'),
      });
    }

    const tier = HORSE_TIERS[tierKey];
    if (!tier) {
      return postMessage({ room: ROOM, message: `❗ Invalid tier: ${tierKey}` });
    }

    const balance = await getUserWallet(userId);
    if (balance < tier.price) {
      return postMessage({ room: ROOM, message: `❗ ${nick}, need $${tier.price}, you have $${balance}` });
    }

    const paid = await removeFromUserWallet(userId, tier.price);
    if (!paid) {
      return postMessage({ room: ROOM, message: `❗ ${nick}, payment failed.` });
    }

    const allHorses = await getAllHorses();
    const existing = allHorses.map(h => h.name);
    const name = generateHorseName(existing);

    const [minOdd, maxOdd] = tier.oddsRange;
    const baseOdds = randomInt(Math.ceil(minOdd * 2), Math.floor(maxOdd * 2)) / 2;
    const volatility = randomInRange(...tier.volatilityRange);
    const careerLength = randomInt(...tier.careerLength);

    await insertHorse({
      name,
      baseOdds,
      volatility,
      wins: 0,
      racesParticipated: 0,
      careerLength,
      owner: nick,
      ownerId: userId,
      tier: tierKey,
      emoji: tier.emoji,
      price: tier.price,
      retired: false,
    });

    return postMessage({
      room: ROOM,
      message: `${tier.emoji} ${nick} bought **${tierKey.toUpperCase()}** horse: **${name}**! 🎲 Odds: ${formatOdds(baseOdds)}`,
    });
  }

  // TODO: implement handleMyHorses, handleHorseStats, etc.
}

export const horseManager = new HorseManager();
