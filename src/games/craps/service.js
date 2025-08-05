
// src/games/craps/service.js
import { EventEmitter } from 'events';
import { rollDice } from './utils/dice.js';
import { crapsState } from './crapsState.js';
import { addToUserWallet, removeFromUserWallet } from '../../database/dbwalletmanager.js';
import { getUserNickname } from '../../handlers/message.js';

const JOIN_MS = 30_000;
const BET_MS = 30_000;

export class CrapsTable extends EventEmitter {
  constructor() {
    super();
  }

  startRound() {
    console.log('[CrapsTable] → startRound: entering JOIN phase');
    crapsState.passBets = {};
    crapsState.dontPassBets = {};
    crapsState.comeBets = {};
    crapsState.placeBets = {};
    crapsState.point = null;
    crapsState.phase = 'JOIN';
    crapsState.canJoinTable = true;
    crapsState.isBetting = false;
    crapsState.isRolling = false;
    crapsState.currentShooterRollCount = 0;
    this.emit('roundStart');

    clearTimeout(crapsState.bettingTimeout);
    crapsState.bettingTimeout = setTimeout(() => this._startComeOut(), JOIN_MS);
  }

  _startComeOut() {
    console.log('[CrapsTable] → _startComeOut: entering COME_OUT phase');
    crapsState.phase = 'COME_OUT';
    crapsState.canJoinTable = false;
    crapsState.isBetting = true;
    crapsState.isRolling = false;
    this.emit('betsOpen', { phase: 'COME_OUT', ms: BET_MS });

    clearTimeout(crapsState.bettingTimeout);
    crapsState.bettingTimeout = setTimeout(() => this._closeBetsAndAwaitRoll(), BET_MS);
  }

  _closeBetsAndAwaitRoll() {
    console.log('[CrapsTable] → _closeBetsAndAwaitRoll: closing COME_OUT bets');
    crapsState.isBetting = false;
    crapsState.phase = 'AWAIT_ROLL';
    crapsState.isRolling = false;
    this.emit('betsClosed', { phase: 'COME_OUT' });
  }

  async doRoll() {
    if (crapsState.isRolling) {
      console.log('[CrapsTable] → doRoll: roll ignored, already rolling');
      return;
    }

    crapsState.isRolling = true;
    crapsState.currentShooterRollCount++;

    const { d1, d2, total } = rollDice();
    console.log(`[CrapsTable] → doRoll: rolled ${d1} + ${d2} = ${total} in phase ${crapsState.phase}`);

    this.emit('rollResult', { d1, d2, total });

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const finish = async (resultType) => {
      const passKeys = Object.keys(crapsState.passBets);
      const dpKeys = Object.keys(crapsState.dontPassBets);
      const resultData = {
        outcome: resultType,
        roll: total,
        passWinners: resultType === 'pass' ? passKeys : [],
        passLosers: resultType === 'dontpass' ? passKeys : [],
        dpWinners: resultType === 'dontpass' ? dpKeys : [],
        dpLosers: resultType === 'pass' ? dpKeys : [],
        pushOn12: total === 12 && resultType === 'push'
      };

      await wait(1200);
      this._endRound(resultData);
    };

    if (['COME_OUT', 'AWAIT_ROLL'].includes(crapsState.phase)) {
      if ([7, 11].includes(total)) return await finish('pass');
      if ([2, 3].includes(total)) return await finish('dontpass');
      if (total === 12) return await finish('push');

      await wait(1000);
      if (!crapsState.point) this._startPointPhase(total);
      crapsState.isRolling = false;
      return;
    }

    if (crapsState.phase === 'POINT') {
      await wait(1000);

      this.resolveComeBets(total);
      this.resolvePlaceBets(total);

      if (total === crapsState.point) return await finish('pass');
      if (total === 7) return await finish('dontpass');

      crapsState.isRolling = false;
    }
  }

  _startPointPhase(point) {
    console.log(`[CrapsTable] → _startPointPhase: setting point to ${point}`);
    crapsState.phase = 'POINT';
    crapsState.point = point;
    crapsState.isBetting = true;

    this.emit('betsOpen', { phase: 'POINT' });

    crapsState.bettingTimeout = setTimeout(() => {
      crapsState.isBetting = false;
      const shooterId = crapsState.tableUsers[crapsState.currentShooter];
      this.emit('betsClosed', { shooter: shooterId });
    }, BET_MS);
  }

  _endRound(resultData) {
    console.log('[CrapsTable] → _endRound: resolving round and rotating shooter', resultData);
    this.emit('roundEnd', resultData);
    clearTimeout(crapsState.bettingTimeout);

    const currentShooterId = crapsState.tableUsers[crapsState.currentShooter];
    crapsState.shooterHistory ??= new Set();
    crapsState.shooterHistory.add(currentShooterId);

    const numPlayers = crapsState.tableUsers.length;

    if (!crapsState.records) crapsState.records = { maxRolls: 0, shooter: null };

    if (crapsState.currentShooterRollCount > crapsState.records.maxRolls) {
      crapsState.records.maxRolls = crapsState.currentShooterRollCount;
      crapsState.records.shooter = currentShooterId;
    }

    crapsState.phase = 'IDLE';
    crapsState.canJoinTable = false;
    crapsState.isRolling = false;
    crapsState.point = null;
    crapsState.passBets = {};
    crapsState.dontPassBets = {};
    crapsState.comeBets = {};
    crapsState.placeBets = {};
    crapsState.currentShooterRollCount = 0;

    if (numPlayers <= 1) {
      crapsState.currentShooter = 0;
      crapsState.shooterHistory = new Set();
      crapsState.tableUsers = [];
      return;
    }

    const everyoneHadTurn = crapsState.tableUsers.every(uid =>
      crapsState.shooterHistory.has(uid)
    );

    if (everyoneHadTurn) {
      crapsState.currentShooter = 0;
      crapsState.shooterHistory = new Set();
      crapsState.tableUsers = [];
      return;
    }

    crapsState.currentShooter = (crapsState.currentShooter + 1) % numPlayers;
    setTimeout(() => this.startRound(), 5000);
  }

  resolveComeBets(total) {
    for (const [userId, bets] of Object.entries(crapsState.comeBets)) {
      for (const bet of bets) {
        if (bet.status === 'awaiting') {
          if ([2, 3, 12].includes(total)) {
            bet.status = 'lost';
            removeFromUserWallet(userId, bet.amount);
            this.emit('comeLoss', {
              user: userId,
              amount: bet.amount,
              reason: `Come-out roll was ${total}`
            });
          } else if ([7, 11].includes(total)) {
            bet.status = 'won';
            addToUserWallet(userId, bet.amount * 2);
            this.emit('comeWin', {
              user: userId,
              amount: bet.amount,
              reason: `Come-out roll was ${total}`
            });
          } else {
            bet.status = 'active';
            bet.point = total;
            this.emit('comeMove', {
              user: userId,
              amount: bet.amount,
              newPoint: total
            });
          }
        } else if (bet.status === 'active') {
          if (total === bet.point) {
            bet.status = 'won';
            addToUserWallet(userId, bet.amount * 2);
            this.emit('comeWin', {
              user: userId,
              amount: bet.amount,
              point: bet.point,
              reason: `Hit point ${bet.point}`
            });
          } else if (total === 7) {
            bet.status = 'lost';
            removeFromUserWallet(userId, bet.amount);
            this.emit('comeLoss', {
              user: userId,
              amount: bet.amount,
              point: bet.point,
              reason: `7-out`
            });
          }
        }
      }
    }
  }

  async resolvePlaceBets(total) {
  for (const [userId, numbers] of Object.entries(crapsState.placeBets)) {
    for (const num of Object.keys(numbers)) {
      const betAmt = numbers[num];
      const pointNum = parseInt(num);

      if (pointNum === total) {
        const winnings = betAmt * 2;
        await addToUserWallet(userId, winnings);

        const nick = await getUserNickname(userId);
        this.emit('placeWin', {
          user: userId,
          number: pointNum,
          amount: betAmt,
          winnings,
          nickname: nick
        });

        delete numbers[num]; // 💸 remove after win
      } else if (total === 7) {
        await removeFromUserWallet(userId, betAmt);

        const nick = await getUserNickname(userId);
        this.emit('placeLoss', {
          user: userId,
          number: pointNum,
          amount: betAmt,
          nickname: nick
        });

        delete numbers[num]; // ☠️ remove after loss
      }
    }
  }
}
}

export const table = new CrapsTable();
