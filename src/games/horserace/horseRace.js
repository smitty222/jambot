import { EventEmitter } from 'events';
import { safeCall } from '../games/horserace/service.js';
import { postMessage } from '../../libs/cometchat.js';
import {
  addToUserWallet,
  removeFromUserWallet,
  getUserWallet,
} from '../../database/dbwalletmanager.js';
import { getUserNickname } from '../../handlers/message.js';
import { getAllHorses, updateHorseStats } from '../../database/dbhorses.js';
import { fetchCurrentUsers } from '../../utils/API.js';
import { getCurrentOdds, formatOdds } from '../games/horserace/utils/odds.js';

const ROOM = process.env.ROOM_UUID;
const CONFIG = {
  ENTRY_DURATION:   1_000,
  BETTING_DURATION: 30_000,
};

function cleanNick(nick) {
  return nick.startsWith('@') ? nick.slice(1) : nick;
}

export class Race extends EventEmitter {
  constructor(deps) {
    super();
    Object.assign(this, deps);
    this.timers = [];
    this.reset();
  }

  reset() {
    this.horses = [];
    this.bets = new Map();
    this.entries = new Set();
    this.isBettingOpen = false;
    this.isAcceptingEntries = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  async openEntries() {
    try {
      this.reset();
      this.isAcceptingEntries = true;

      await safeCall(this.postMessage, [{
        room: ROOM,
        message: `🏁 HORSE RACE STARTING! Type EXACT horse name in ${CONFIG.ENTRY_DURATION/1000}s to enter.`
      }]);

      const allHorses = await safeCall(this.getAllHorses);
      const activeUsers = await safeCall(this.fetchCurrentUsers);
      const available = allHorses.filter(h =>
        activeUsers.includes(h.ownerId) && !h.retired && h.ownerId !== 'allen'
      );

      const lines = await Promise.all(available.map(async h => {
        const nick = await safeCall(this.getUserNickname, [h.ownerId]);
        return `- ${h.emoji || '🐎'} ${h.name} (by ${cleanNick(nick)})`;
      }));

      await safeCall(this.postMessage, [{
        room: ROOM,
        message: available.length
          ? `🏇 Available horses by tier:\n**Tier champion**\n${lines.join('\n')}`
          : `⚠️ No user horses—bot entries only.`
      }]);

      this.timers.push(setTimeout(() => {
        this.isAcceptingEntries = false;
        this.emit('entriesClosed');
      }, CONFIG.ENTRY_DURATION));

    } catch (err) {
      await safeCall(this.postMessage, [{
        room: ROOM,
        message: `❌ Race aborted during entry: ${err.message}`
      }]);
      this.emit('raceAborted');
    }
  }

  async handleHorseEntry({ sender, message }) {
    if (!this.isAcceptingEntries) return;

    const allHorses = await safeCall(this.getAllHorses);
    const matched = allHorses.find(h =>
      h.ownerId === sender && !h.retired &&
      message.trim().toLowerCase() === h.name.toLowerCase()
    );
    if (!matched || this.entries.has(matched.name)) return;

    this.entries.add(matched.name);
    const nick = await safeCall(this.getUserNickname, [sender]);
    await safeCall(this.postMessage, [{
      room: ROOM,
      message: `✅ ${cleanNick(nick)} entered **${matched.name}**!`
    }]);
  }

  async openBets() {
    try {
      const allHorses = await safeCall(this.getAllHorses);
      const userHorses = allHorses.filter(h => this.entries.has(h.name));
      const botSlots = 6 - userHorses.length;

      const botHorses = allHorses
        .filter(h => (!h.ownerId || h.ownerId === 'allen') && !h.retired)
        .sort((a, b) => b.baseOdds - a.baseOdds)
        .slice(0, botSlots);

      this.horses = [...userHorses, ...botHorses].map(h => ({
        ...h,
        odds: getCurrentOdds(h)
      }));

      if (!this.horses.length) throw new Error('No racers');

      const lines = await Promise.all(this.horses.map(async (h, i) => {
        const displayOdds = formatOdds(h.odds, 'fraction');
        const ownerTag = h.ownerId
          ? ` by ${cleanNick(await safeCall(this.getUserNickname, [h.ownerId]))}`
          : '';
        return `#${i+1} ${h.name} (odds: ${displayOdds})${ownerTag}`;
      }));

      await safeCall(this.postMessage, [{
        room: ROOM,
        message:
          `🏇 Today's racers:\n${lines.join('\n')}` +
          `\n\nPlace bets with /horse [number] [amount] in ${CONFIG.BETTING_DURATION/1000}s!`
      }]);

      this.isBettingOpen = true;
      this.timers.push(setTimeout(() => {
        this.isBettingOpen = false;
        this.emit('betsClosed');
      }, CONFIG.BETTING_DURATION));

    } catch (err) {
      await safeCall(this.postMessage, [{
        room: ROOM,
        message: `🐴 No entries—please buy and enter next time!`
      }]);
      this.emit('raceAborted');
    }
  }

  // ... remaining methods unchanged (runRace, finalizeStats, payouts, etc.) ...
}

let activeRace = null;
export async function startHorseRace() {
  activeRace = new Race({
    postMessage,
    getAllHorses,
    updateHorseStats,
    getUserNickname,
    fetchCurrentUsers,
    getUserWallet,
    removeFromUserWallet,
    addToUserWallet
  });
  activeRace.on('entriesClosed', () => activeRace.openBets());
  activeRace.on('betsClosed',    () => activeRace.runRace());
  activeRace.on('raceAborted',   () => (activeRace = null));
  activeRace.on('raceFinished',  () => (activeRace = null));
  await activeRace.openEntries();
}

export async function handleHorseEntryAttempt(ctx) {
  if (!activeRace) return;
  await activeRace.handleHorseEntry(ctx);
}

export async function handleHorseBet(ctx) {
  if (!activeRace) return;
  await activeRace.handleHorseBet(ctx);
}
