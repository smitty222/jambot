// src/games/craps/service.js
import { EventEmitter } from 'events';
import { crapsState, PHASES } from './crapsState.js';
import { addToUserWallet, removeFromUserWallet } from '../../database/dbwalletmanager.js';

const POINT_NUMBERS = new Set([4, 5, 6, 8, 9, 10]);

function ensureUserMapSlot(map, userId) {
  if (!map[userId]) map[userId] = 0;
}

function ensureNumberMapSlot(map, userId) {
  if (!map[userId]) map[userId] = { 4:0, 5:0, 6:0, 8:0, 9:0, 10:0 };
}

function placeProfitRatio(n) {
  // Profit ratios for Place wins (profit only, not including stake)
  // 4/10 → 9:5; 5/9 → 7:5; 6/8 → 7:6
  if (n === 4 || n === 10) return 9/5;
  if (n === 5 || n === 9)  return 7/5;
  if (n === 6 || n === 8)  return 7/6;
  return 0;
}

function resetBets() {
  crapsState.passBets = Object.create(null);
  crapsState.dontPassBets = Object.create(null);
  crapsState.comePending = Object.create(null);
  crapsState.comeOn = Object.create(null);
  crapsState.placeBets = Object.create(null);
}

export class CrapsTable extends EventEmitter {
  constructor() {
    super();
  }

  // ----- Round / Betting control -----
  startRound({ betWindowMs = 12000 } = {}) {
    if (!crapsState.tableUsers.length) {
      this.emit('systemNotice', 'No players at the table. Type `/join` to sit.');
      return;
    }

    // New round baseline
    crapsState.phase = PHASES.COME_OUT;
    crapsState.point = null;
    crapsState.isBetting = false;
    crapsState.canJoinTable = true;
    crapsState.rollsThisRound = 0;
    crapsState.lastRoll = null;
    clearTimeout(crapsState.bettingTimeout);
    resetBets();

    this.emit('roundStart');

    this.openBetting({ phase: PHASES.COME_OUT, betWindowMs });
  }

  openBetting({ phase = crapsState.phase, betWindowMs = 10000 } = {}) {
    if (phase !== crapsState.phase) return;

    // Toggle bets ON and announce
    crapsState.isBetting = true;
    this.emit('betsOpen', { phase, durationMs: betWindowMs });

    clearTimeout(crapsState.bettingTimeout);
    crapsState.bettingTimeout = setTimeout(() => {
      crapsState.isBetting = false;
      this.emit('betsClosed', { phase });
    }, betWindowMs);
  }

  // ----- Seat / table management -----
  addPlayer(userId) {
    if (!crapsState.canJoinTable) return { ok: false, reason: 'JOIN_CLOSED' };
    if (!crapsState.tableUsers.includes(userId)) {
      crapsState.tableUsers.push(userId);
      // Initialize their maps
      ensureUserMapSlot(crapsState.passBets, userId);
      ensureUserMapSlot(crapsState.dontPassBets, userId);
      ensureUserMapSlot(crapsState.comePending, userId);
      ensureNumberMapSlot(crapsState.comeOn, userId);
      ensureNumberMapSlot(crapsState.placeBets, userId);
    }
    return { ok: true };
  }

  nextShooter() {
    if (!crapsState.tableUsers.length) return null;
    crapsState.currentShooter = (crapsState.currentShooter + 1) % crapsState.tableUsers.length;
    return crapsState.tableUsers[crapsState.currentShooter];
  }

  getShooter() {
    if (!crapsState.tableUsers.length) return null;
    return crapsState.tableUsers[crapsState.currentShooter % crapsState.tableUsers.length];
  }

  // ----- Bet placement (stake deducted HERE exactly once) -----
  async placePass(userId, amount) {
    if (crapsState.phase !== PHASES.COME_OUT || !crapsState.isBetting) {
      return { ok: false, reason: 'NOT_ALLOWED_NOW' };
    }
    if (!(amount > 0)) return { ok: false, reason: 'BAD_AMOUNT' };

    const removed = await removeFromUserWallet(userId, amount);
    if (removed === false) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };

    ensureUserMapSlot(crapsState.passBets, userId);
    crapsState.passBets[userId] += amount;
    return { ok: true };
  }

  async placeDontPass(userId, amount) {
    if (crapsState.phase !== PHASES.COME_OUT || !crapsState.isBetting) {
      return { ok: false, reason: 'NOT_ALLOWED_NOW' };
    }
    if (!(amount > 0)) return { ok: false, reason: 'BAD_AMOUNT' };

    const removed = await removeFromUserWallet(userId, amount);
    if (removed === false) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };

    ensureUserMapSlot(crapsState.dontPassBets, userId);
    crapsState.dontPassBets[userId] += amount;
    return { ok: true };
  }

  async placeCome(userId, amount) {
    if (crapsState.phase !== PHASES.POINT || !crapsState.isBetting) {
      return { ok: false, reason: 'NOT_ALLOWED_NOW' };
    }
    if (!(amount > 0)) return { ok: false, reason: 'BAD_AMOUNT' };

    const removed = await removeFromUserWallet(userId, amount);
    if (removed === false) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };

    ensureUserMapSlot(crapsState.comePending, userId);
    crapsState.comePending[userId] += amount;
    this.emit('comePlaced', { userId, amount });
    return { ok: true };
  }

  async placePlace(userId, number, amount) {
    if (crapsState.phase !== PHASES.POINT || !crapsState.isBetting) {
      return { ok: false, reason: 'NOT_ALLOWED_NOW' };
    }
    number = Number(number);
    if (!POINT_NUMBERS.has(number)) return { ok: false, reason: 'BAD_NUMBER' };
    if (!(amount > 0)) return { ok: false, reason: 'BAD_AMOUNT' };

    const removed = await removeFromUserWallet(userId, amount);
    if (removed === false) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };

    ensureNumberMapSlot(crapsState.placeBets, userId);
    crapsState.placeBets[userId][number] += amount;
    this.emit('placePlaced', { userId, number, amount });
    return { ok: true };
  }

  async removePlace(userId, number) {
    number = Number(number);
    if (!POINT_NUMBERS.has(number)) return { ok: false, reason: 'BAD_NUMBER' };
    ensureNumberMapSlot(crapsState.placeBets, userId);
    const stake = crapsState.placeBets[userId][number] || 0;
    if (!stake) return { ok: false, reason: 'NONE' };

    crapsState.placeBets[userId][number] = 0;
    await addToUserWallet(userId, stake, 'Remove place bet (refund)');
    this.emit('placeRemoved', { userId, number, amount: stake });
    return { ok: true };
  }

  // ----- Roll handling -----
  async roll(shooterId) {
    if (crapsState.isBetting) {
      this.emit('systemNotice', 'Betting is still open — wait for bets to close.');
      return;
    }
    const current = this.getShooter();
    if (!current || current !== shooterId) {
      this.emit('systemNotice', 'Only the shooter can /roll right now.');
      return;
    }

    // Dice
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const total = d1 + d2;
    crapsState.lastRoll = { d1, d2, total };
    crapsState.rollsThisRound += 1;
    this.emit('roll', { d1, d2, total });

    if (crapsState.phase === PHASES.COME_OUT) {
      await this._resolveComeOut(total);
    } else {
      await this._resolvePointPhase(total);
    }
  }

  async _resolveComeOut(total) {
    if (total === 7 || total === 11) {
      // Pass wins, DP loses
      this.emit('lineResult', {
        stage: 'COME_OUT',
        outcome: 'NATURAL',
        passWinners: { ...crapsState.passBets },
        passLosers: {},
        dpWinners: {},
        dpLosers: { ...crapsState.dontPassBets },
        dpPushes: {},
      });
      return this._endRound({ reason: 'NATURAL' });

    } else if (total === 2 || total === 3) {
      // Pass loses, DP wins
      this.emit('lineResult', {
        stage: 'COME_OUT',
        outcome: 'CRAPS_2_3',
        passWinners: {},
        passLosers: { ...crapsState.passBets },
        dpWinners: { ...crapsState.dontPassBets },
        dpLosers: {},
        dpPushes: {},
      });
      return this._endRound({ reason: 'CRAPS' });

    } else if (total === 12) {
      // Pass loses; DP pushes on 12
      this.emit('lineResult', {
        stage: 'COME_OUT',
        outcome: 'CRAPS_12',
        passWinners: {},
        passLosers: { ...crapsState.passBets },
        dpWinners: {},
        dpLosers: {},
        dpPushes: { ...crapsState.dontPassBets },
      });
      return this._endRound({ reason: 'CRAPS_12' });
    }

    // Establish point
    if (POINT_NUMBERS.has(total)) {
      crapsState.point = total;
      crapsState.phase = PHASES.POINT;
      this.emit('pointEstablished', { point: total });

      // Re-open betting for come/place
      this.openBetting({ phase: PHASES.POINT, betWindowMs: 9000 });
    } else {
      // Shouldn't happen in regular dice, but guard anyway
      this.emit('systemNotice', `Unexpected come-out total ${total}.`);
    }
  }

  async _resolvePointPhase(total) {
    // 7-out resolves *everything*
    if (total === 7) {
      // Come-on bets lose
      for (const userId of Object.keys(crapsState.comeOn)) {
        const nums = crapsState.comeOn[userId];
        for (const n of [4,5,6,8,9,10]) {
          if (nums[n] > 0) {
            this.emit('comeLoss', { userId, number: n, amount: nums[n], reason: 'SEVEN_OUT' });
            nums[n] = 0;
          }
        }
      }

      // Place bets lose
      for (const userId of Object.keys(crapsState.placeBets)) {
        const nums = crapsState.placeBets[userId];
        for (const n of [4,5,6,8,9,10]) {
          if (nums[n] > 0) {
            this.emit('placeLoss', { userId, number: n, amount: nums[n], reason: 'SEVEN_OUT' });
            nums[n] = 0;
          }
        }
      }

      // Line bets: pass loses, DP wins (controller pays)
      this.emit('lineResult', {
        stage: 'POINT',
        outcome: 'SEVEN_OUT',
        passWinners: {},
        passLosers: { ...crapsState.passBets },
        dpWinners: { ...crapsState.dontPassBets },
        dpLosers: {},
        dpPushes: {},
      });
      return this._endRound({ reason: 'SEVEN_OUT' });
    }

    // Resolve COMEs that were just placed (pending)
    for (const userId of Object.keys(crapsState.comePending)) {
      const amt = crapsState.comePending[userId] || 0;
      if (!amt) continue;

      if (total === 7 || total === 11) {
        // Instant win (even money payout)
        await addToUserWallet(userId, amt * 2, 'Come win');
        this.emit('comeWin', { userId, kind: 'instant', amount: amt, roll: total });
        crapsState.comePending[userId] = 0;
      } else if (total === 2 || total === 3 || total === 12) {
        // Loses (stake already removed on placement)
        this.emit('comeLoss', { userId, number: total, amount: amt, reason: 'COME_OUT_LOSS' });
        crapsState.comePending[userId] = 0;
      } else if (POINT_NUMBERS.has(total)) {
        // Move to that number
        ensureNumberMapSlot(crapsState.comeOn, userId);
        crapsState.comeOn[userId][total] += amt;
        this.emit('comeMove', { userId, number: total, amount: amt });
        crapsState.comePending[userId] = 0;
      }
    }

    // Resolve COMEs "on numbers" that just hit
    if (POINT_NUMBERS.has(total)) {
      for (const userId of Object.keys(crapsState.comeOn)) {
        const amt = (crapsState.comeOn[userId] && crapsState.comeOn[userId][total]) || 0;
        if (amt > 0) {
          await addToUserWallet(userId, amt * 2, `Come on ${total} win`);
          this.emit('comeWin', { userId, kind: 'number', number: total, amount: amt });
          crapsState.comeOn[userId][total] = 0;
        }
      }
    }

    // Resolve PLACE wins (pay odds)
    if (POINT_NUMBERS.has(total)) {
      const ratio = placeProfitRatio(total);
      for (const userId of Object.keys(crapsState.placeBets)) {
        const stake = crapsState.placeBets[userId][total] || 0;
        if (stake > 0) {
          const totalReturn = stake * (1 + ratio);
          await addToUserWallet(userId, totalReturn, `Place ${total} win`);
          this.emit('placeWin', { userId, number: total, amount: stake, payout: totalReturn });
          crapsState.placeBets[userId][total] = 0;
        }
      }
    }

    // Point made ends round (pass wins, DP loses)
    if (crapsState.point && total === crapsState.point) {
      this.emit('lineResult', {
        stage: 'POINT',
        outcome: 'POINT_MADE',
        passWinners: { ...crapsState.passBets },
        passLosers: {},
        dpWinners: {},
        dpLosers: { ...crapsState.dontPassBets },
        dpPushes: {},
      });
      return this._endRound({ reason: 'POINT_MADE', point: crapsState.point });
    }

    // Neither 7 nor the point: open next betting window
    this.openBetting({ phase: PHASES.POINT, betWindowMs: 8000 });
  }

  async _endRound({ reason }) {
    clearTimeout(crapsState.bettingTimeout);
    crapsState.isBetting = false;
    crapsState.canJoinTable = false;

    // Records
    if (crapsState.rollsThisRound > crapsState.records.maxRolls.count) {
      crapsState.records.maxRolls = {
        count: crapsState.rollsThisRound,
        shooterId: this.getShooter(),
      };
      this.emit('newRecord', { ...crapsState.records.maxRolls });
    }

    this.emit('roundEnd', { reason, rolls: crapsState.rollsThisRound, shooterId: this.getShooter() });
  }
}

export const table = new CrapsTable();
