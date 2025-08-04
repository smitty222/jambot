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

  const { d1, d2, total } = rollDice();
  console.log(`[CrapsTable] → doRoll: rolled ${d1} + ${d2} = ${total} in phase ${crapsState.phase}`);

  // Always announce dice first
  this.emit('rollResult', { d1, d2, total });

  // Wait a moment before proceeding with game logic
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const finish = async (resultType) => {
    const passKeys = Object.keys(crapsState.passBets);
    const dpKeys   = Object.keys(crapsState.dontPassBets);

    const resultData = {
      outcome: resultType,
      roll: total,
      passWinners: resultType === 'pass'     ? passKeys : [],
      passLosers:  resultType === 'dontpass' ? passKeys : [],
      dpWinners:   resultType === 'dontpass' ? dpKeys   : [],
      dpLosers:    resultType === 'pass'     ? dpKeys   : [],
      pushOn12:    total === 12 && resultType === 'push'
    };

    await wait(1200); // Give chat a second to see the roll
    this._endRound(resultData);
  };

  // ───── COME OUT or AWAIT_ROLL ─────
  if (['COME_OUT', 'AWAIT_ROLL'].includes(crapsState.phase)) {
    if ([7, 11].includes(total)) return await finish('pass');
    if ([2, 3].includes(total))  return await finish('dontpass');
    if (total === 12)            return await finish('push');

    // Establish point after showing the dice
    await wait(1000);
    this._startPointPhase(total);
    crapsState.isRolling = false;
    return;
  }

  // ───── POINT PHASE ─────
  if (crapsState.phase === 'POINT') {
    await wait(1000);

    this.resolveComeBets(total);
    this.resolvePlaceBets(total);

    if (total === crapsState.point) return await finish('pass');
    if (total === 7)                return await finish('dontpass');

    crapsState.isRolling = false;
  }
}





  _startPointPhase(point) {
    console.log(`[CrapsTable] → _startPointPhase: establishing point ${point}`);
    crapsState.phase = 'POINT';
    crapsState.point = point;
    crapsState.isBetting = true;
    crapsState.isRolling = false;

    this.emit('pointEstablished', { point });
    this.emit('betsOpen', { phase: 'POINT', ms: BET_MS });

    clearTimeout(crapsState.bettingTimeout);
    crapsState.bettingTimeout = setTimeout(() => {
      console.log('[CrapsTable] → _closePointBets: closing POINT bets');
      crapsState.isBetting = false;
      this.emit('betsClosed', { phase: 'POINT' });
    }, BET_MS);
  }

  _endRound(resultData) {
  console.log('[CrapsTable] → _endRound: resolving round and rotating shooter', resultData);
  this.emit('roundEnd', resultData);
  clearTimeout(crapsState.bettingTimeout);

  const currentShooterId = crapsState.tableUsers[crapsState.currentShooter];
  crapsState.shooterHistory ??= new Set();
  crapsState.shooterHistory.add(currentShooterId);

  // Reset game phase and bets
  crapsState.phase        = 'IDLE';
  crapsState.canJoinTable = false;
  crapsState.isRolling    = false;
  crapsState.point        = null;
  crapsState.passBets     = {};
  crapsState.dontPassBets = {};
  crapsState.comeBets     = {};
  crapsState.placeBets    = {};

  const numPlayers = crapsState.tableUsers.length;

  // 🧍 Single-player mode: end the session completely
  if (numPlayers <= 1) {
    crapsState.currentShooter  = 0;
    crapsState.shooterHistory = new Set();
    crapsState.tableUsers     = [];
    return;
  }

  // ✅ Check if all players have had a turn
  const everyoneHadTurn = crapsState.tableUsers.every(uid =>
    crapsState.shooterHistory.has(uid)
  );

  if (everyoneHadTurn) {
    crapsState.currentShooter  = 0;
    crapsState.shooterHistory = new Set();
    crapsState.tableUsers     = [];
    return;
  }

  // ➡️ Move to next shooter
  crapsState.currentShooter = (crapsState.currentShooter + 1) % numPlayers;
  setTimeout(() => this.startRound(), 5000);
}


  resolveComeBets(total) {
  for (const [userId, bets] of Object.entries(crapsState.comeBets)) {
    for (const bet of bets) {
      if (bet.status === 'awaiting') {
        if ([2, 3, 12].includes(total)) {
          bet.status = 'lost';
          removeFromUserWallet(userId, bet.amount).then(() => {
            getUserNickname(userId).then(nick => {
              this.emit('comeLoss', {
                user: userId,
                nickname: nick,
                amount: bet.amount,
                point: null,
                reason: `Come-out roll was ${total}`
              });
            });
          });
        } else if ([7, 11].includes(total)) {
          bet.status = 'won';
          addToUserWallet(userId, bet.amount * 2).then(() => {
            getUserNickname(userId).then(nick => {
              this.emit('comeWin', {
                user: userId,
                nickname: nick,
                amount: bet.amount,
                point: null,
                reason: `Come-out roll was ${total}`
              });
            });
          });
        } else {
          bet.status = 'active';
          bet.point = total;
          getUserNickname(userId).then(nick => {
            this.emit('comeMove', {
              user: userId,
              nickname: nick,
              amount: bet.amount,
              newPoint: total
            });
          });
        }
      }

      else if (bet.status === 'active') {
        if (total === bet.point) {
          bet.status = 'won';
          addToUserWallet(userId, bet.amount * 2).then(() => {
            getUserNickname(userId).then(nick => {
              this.emit('comeWin', {
                user: userId,
                nickname: nick,
                amount: bet.amount,
                point: bet.point,
                reason: `Hit point ${bet.point}`
              });
            });
          });
        } else if (total === 7) {
          bet.status = 'lost';
          removeFromUserWallet(userId, bet.amount).then(() => {
            getUserNickname(userId).then(nick => {
              this.emit('comeLoss', {
                user: userId,
                nickname: nick,
                amount: bet.amount,
                point: bet.point,
                reason: `7-out`
              });
            });
          });
        }
      }
    }
  }
}

  resolvePlaceBets(total) {
  for (const [userId, numbers] of Object.entries(crapsState.placeBets)) {
    for (const num of Object.keys(numbers)) {
      const betAmt = numbers[num];
      const pointNum = parseInt(num);

      if (pointNum === total) {
        const winnings = betAmt * 2;
        addToUserWallet(userId, winnings).then(() => {
          getUserNickname(userId).then(nick => {
            this.emit('placeWin', {
              user: userId,
              number: pointNum,
              amount: betAmt,
              winnings,
              nickname: nick
            });
          });
        });
        delete numbers[num]; // ✅ remove bet after win
      }

      else if (total === 7) {
        removeFromUserWallet(userId, betAmt).then(() => {
          getUserNickname(userId).then(nick => {
            this.emit('placeLoss', {
              user: userId,
              number: pointNum,
              amount: betAmt,
              nickname: nick
            });
          });
        });
        delete numbers[num]; // ✅ remove bet after loss
      }
    }
  }
}
  }

export const table = new CrapsTable();
