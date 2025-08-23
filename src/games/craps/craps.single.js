// src/games/craps/craps.single.js
// Monolithic version for easier reading/debugging.

// ─── Imports & Setup ───────────────────────────────────────────────────────────
import { EventEmitter } from 'events';
import { postMessage } from '../../libs/cometchat.js';
import { addToUserWallet, removeFromUserWallet } from '../../database/dbwalletmanager.js';
import { getUserNickname } from '../../handlers/message.js';
import db from '../../database/db.js';

const ROOM = process.env.ROOM_UUID;

// ─── Config (payouts & timings) ───────────────────────────────────────────────
// Field is a one-roll bet. Keys are totals → profit multiple (NOT total return).
// 1 means 1:1 (return 2x stake), 2 means 2:1 (return 3x), 3 means 3:1 (return 4x)
const FIELD_PAYOUT = {
  2: 2,   // double on 2
  3: 1,
  4: 1,
  9: 1,
  10: 1,
  11: 1,
  12: 3   // triple on 12 (set to 2 if your table pays double)
};
// Doubles = exact pair one-roll bet (e.g., 4-4). Profit multiple (NOT total return).
const DOUBLE_PROFIT = 30;

// Betting windows
const JOIN_WINDOW_MS = 30000;        // seat window at the start of each round
const COME_OUT_WINDOW_MS = 30000;    // come-out betting window
const POINT_FIRST_WINDOW_MS = 30000; // first window after point is established
const POINT_REBET_WINDOW_MS = 10000; // short re-bet window after non-terminal point rolls
const AUTO_NEXT_JOIN_WINDOW_MS = 10000; // brief join window before auto-continued rounds

// ─── State ─────────────────────────────────────────────────────────────────────
const PHASES = { IDLE: 'IDLE', JOIN: 'JOIN', COME_OUT: 'COME_OUT', POINT: 'POINT' };

const crapsState = {
  tableUsers: [],
  currentShooter: 0,

  phase: PHASES.IDLE,
  point: null,
  isBetting: false,
  canJoinTable: true,
  bettingTimeout: null,

  // Line bets
  passBets: Object.create(null),
  dontPassBets: Object.create(null),

  // Place bets: userId -> {4,5,6,8,9,10}
  placeBets: Object.create(null),

  // One-roll props (point phase only)
  fieldBets: Object.create(null),    // userId -> amount
  doublesBets: Object.create(null),  // userId -> {1..6: amount} for exact pairs

  // Roll info
  lastRoll: null,
  rollsThisRound: 0,

  // Records
  records: {
    maxRolls: { count: 0, shooterId: null },
  },
};

// ─── DB helpers for record ─────────────────────────────────────────────────────
function ensureCrapsRecordRow() {
  try {
    db.prepare('INSERT OR IGNORE INTO craps_records (roomId, maxRolls) VALUES (?, 0)').run(ROOM);
  } catch (e) { console.error('[craps] ensureCrapsRecordRow failed:', e); }
}

try {

} catch (e) { console.error('[craps] ensure schema failed:', e); }

function hydrateRecordIntoState() {
  try {
    const row = db.prepare('SELECT maxRolls, shooterId FROM craps_records WHERE roomId = ?').get(ROOM);
    if (row) crapsState.records.maxRolls = { count: row.maxRolls || 0, shooterId: row.shooterId || null };
  } catch (e) { console.error('[craps] hydrateRecordIntoState failed:', e); }
}
ensureCrapsRecordRow();
hydrateRecordIntoState();

// ─── Engine (Service) ──────────────────────────────────────────────────────────
const POINT_NUMBERS = new Set([4, 5, 6, 8, 9, 10]);

function ensureUserMapSlot(map, userId) { if (!map[userId]) map[userId] = 0; }
function ensureNumberMapSlot(map, userId) { if (!map[userId]) map[userId] = { 4:0, 5:0, 6:0, 8:0, 9:0, 10:0 }; }
function ensureDoublesSlot(map, userId) { if (!map[userId]) map[userId] = { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }; }

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
  crapsState.placeBets = Object.create(null);
  crapsState.fieldBets = Object.create(null);
  crapsState.doublesBets = Object.create(null);
}

class CrapsTable extends EventEmitter {
  constructor() { super(); }

  // ----- Round / Betting control -----
  startRound({ joinWindowMs = JOIN_WINDOW_MS, comeOutMs = COME_OUT_WINDOW_MS } = {}) {
    if (!crapsState.tableUsers.length) {
      this.emit('systemNotice', 'No players at the table. Type `/join` to sit.');
      return;
    }

    // New round baseline
    crapsState.phase = PHASES.JOIN;
    crapsState.point = null;
    crapsState.isBetting = false;
    crapsState.canJoinTable = true;
    crapsState.rollsThisRound = 0;
    crapsState.lastRoll = null;
    clearTimeout(crapsState.bettingTimeout);
    resetBets();

    this.emit('roundStart', { joinWindowMs });

    clearTimeout(crapsState.bettingTimeout);
    crapsState.bettingTimeout = setTimeout(() => {
      crapsState.canJoinTable = false;
      crapsState.phase = PHASES.COME_OUT;
      this.openBetting({ phase: PHASES.COME_OUT, betWindowMs: comeOutMs });
    }, joinWindowMs);
  }

  openBetting({ phase = crapsState.phase, betWindowMs = 10000 } = {}) {
    if (phase !== crapsState.phase) return;
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
      ensureUserMapSlot(crapsState.passBets, userId);
      ensureUserMapSlot(crapsState.dontPassBets, userId);
      ensureNumberMapSlot(crapsState.placeBets, userId);
      ensureUserMapSlot(crapsState.fieldBets, userId);
      ensureDoublesSlot(crapsState.doublesBets, userId);
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

  // ----- Bet placement -----
  async placePass(userId, amount) {
    if (crapsState.phase !== PHASES.COME_OUT || !crapsState.isBetting) return { ok: false, reason: 'NOT_ALLOWED_NOW' };
    if (!(amount > 0)) return { ok: false, reason: 'BAD_AMOUNT' };
    const removed = await removeFromUserWallet(userId, amount);
    if (removed === false) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
    ensureUserMapSlot(crapsState.passBets, userId);
    crapsState.passBets[userId] += amount;
    return { ok: true };
  }
  async placeDontPass(userId, amount) {
    if (crapsState.phase !== PHASES.COME_OUT || !crapsState.isBetting) return { ok: false, reason: 'NOT_ALLOWED_NOW' };
    if (!(amount > 0)) return { ok: false, reason: 'BAD_AMOUNT' };
    const removed = await removeFromUserWallet(userId, amount);
    if (removed === false) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
    ensureUserMapSlot(crapsState.dontPassBets, userId);
    crapsState.dontPassBets[userId] += amount;
    return { ok: true };
  }
  async placePlace(userId, number, amount) {
    if (crapsState.phase !== PHASES.POINT || !crapsState.isBetting) return { ok: false, reason: 'NOT_ALLOWED_NOW' };
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
  async placeField(userId, amount) {
    if (crapsState.phase !== PHASES.POINT || !crapsState.isBetting) return { ok: false, reason: 'NOT_ALLOWED_NOW' };
    if (!(amount > 0)) return { ok: false, reason: 'BAD_AMOUNT' };
    const removed = await removeFromUserWallet(userId, amount);
    if (removed === false) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
    ensureUserMapSlot(crapsState.fieldBets, userId);
    crapsState.fieldBets[userId] += amount;
    // keep event for future hooks, but router will ack immediately
    this.emit('fieldPlaced', { userId, amount });
    return { ok: true };
  }
  async placeDouble(userId, pip, amount) {
    pip = Number(pip);
    if (crapsState.phase !== PHASES.POINT || !crapsState.isBetting) return { ok: false, reason: 'NOT_ALLOWED_NOW' };
    if (![1,2,3,4,5,6].includes(pip)) return { ok: false, reason: 'BAD_PIP' };
    if (!(amount > 0)) return { ok: false, reason: 'BAD_AMOUNT' };
    const removed = await removeFromUserWallet(userId, amount);
    if (removed === false) return { ok: false, reason: 'INSUFFICIENT_FUNDS' };
    ensureDoublesSlot(crapsState.doublesBets, userId);
    crapsState.doublesBets[userId][pip] += amount;
    // keep event for future hooks, but router will ack immediately
    this.emit('doublePlaced', { userId, pip, amount });
    return { ok: true };
  }

  // ----- Roll handling -----
  async roll(shooterId) {
    if (crapsState.phase === PHASES.JOIN) { this.emit('systemNotice', 'Join period is active — betting will open shortly.'); return; }
    if (crapsState.isBetting) { this.emit('systemNotice', 'Betting is still open — wait for bets to close.'); return; }

    const current = this.getShooter();
    if (!current || current !== shooterId) { this.emit('systemNotice', 'Only the shooter can /roll right now.'); return; }

    // Dice
    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    const total = d1 + d2;
    crapsState.lastRoll = { d1, d2, total };
    crapsState.rollsThisRound += 1;
    this.emit('roll', { d1, d2, total });

    // One-roll props settle first
    await this._resolveOneRollProps(d1, d2, total);

    if (crapsState.phase === PHASES.COME_OUT) {
      await this._resolveComeOut(total);
    } else {
      await this._resolvePointPhase(total);
    }
  }

  async _resolveOneRollProps(d1, d2, total) {
    // Field
    for (const userId of Object.keys(crapsState.fieldBets)) {
      const stake = crapsState.fieldBets[userId] || 0;
      if (!stake) continue;
      const profitMult = FIELD_PAYOUT[total] ?? 0;
      if (profitMult > 0) {
        const totalReturn = stake * (1 + profitMult);
        await addToUserWallet(userId, totalReturn, `Field ${total} win`);
        this.emit('fieldWin', { userId, total, stake, totalReturn, profit: profitMult });
      } else {
        this.emit('fieldLoss', { userId, total, stake });
      }
      crapsState.fieldBets[userId] = 0; // clears after one roll
    }

    // Doubles (exact pair)
    for (const userId of Object.keys(crapsState.doublesBets)) {
      const bag = crapsState.doublesBets[userId] || {};
      let clearedAny = false;
      for (const pip of [1,2,3,4,5,6]) {
        const stake = bag[pip] || 0;
        if (!stake) continue;
        if (d1 === pip && d2 === pip) {
          const totalReturn = stake * (1 + DOUBLE_PROFIT);
          await addToUserWallet(userId, totalReturn, `Double ${pip}-${pip} win`);
          this.emit('doubleWin', { userId, pip, stake, totalReturn, profit: DOUBLE_PROFIT });
        } else {
          this.emit('doubleLoss', { userId, pip, stake });
        }
        bag[pip] = 0; // one-roll
        clearedAny = true;
      }
      if (clearedAny) crapsState.doublesBets[userId] = bag;
    }
  }

  async _resolveComeOut(total) {
    if (total === 7 || total === 11) {
      this.emit('lineResult', {
        stage: 'COME_OUT',
        outcome: 'NATURAL',
        passWinners: { ...crapsState.passBets },
        passLosers: {},
        dpWinners: {},
        dpLosers: { ...crapsState.dontPassBets },
        dpPushes: {},
      });
      return this._endRound({ reason: 'NATURAL' }); // shooter STAYS

    } else if (total === 2 || total === 3) {
      this.emit('lineResult', {
        stage: 'COME_OUT',
        outcome: 'CRAPS_2_3',
        passWinners: {},
        passLosers: { ...crapsState.passBets },
        dpWinners: { ...crapsState.dontPassBets },
        dpLosers: {},
        dpPushes: {},
      });
      return this._endRound({ reason: 'CRAPS' }); // shooter STAYS

    } else if (total === 12) {
      this.emit('lineResult', {
        stage: 'COME_OUT',
        outcome: 'CRAPS_12',
        passWinners: {},
        passLosers: { ...crapsState.passBets },
        dpWinners: {},
        dpLosers: {},
        dpPushes: { ...crapsState.dontPassBets },
      });
      return this._endRound({ reason: 'CRAPS_12' }); // shooter STAYS
    }

    // Establish point
    if (POINT_NUMBERS.has(total)) {
      crapsState.point = total;
      crapsState.phase = PHASES.POINT;
      this.emit('pointEstablished', { point: total });
      this.openBetting({ phase: PHASES.POINT, betWindowMs: POINT_FIRST_WINDOW_MS });
    } else {
      this.emit('systemNotice', `Unexpected come-out total ${total}.`);
    }
  }

  async _resolvePointPhase(total) {
    // 7-out: line resolves, place loses, shooter changes
    if (total === 7) {
      for (const userId of Object.keys(crapsState.placeBets)) {
        const nums = crapsState.placeBets[userId];
        for (const n of [4,5,6,8,9,10]) {
          if (nums[n] > 0) {
            this.emit('placeLoss', { userId, number: n, amount: nums[n], reason: 'SEVEN_OUT' });
            nums[n] = 0;
          }
        }
      }

      this.emit('lineResult', {
        stage: 'POINT',
        outcome: 'SEVEN_OUT',
        passWinners: {},
        passLosers: { ...crapsState.passBets },
        dpWinners: { ...crapsState.dontPassBets },
        dpLosers: {},
        dpPushes: {},
      });
      return this._endRound({ reason: 'SEVEN_OUT' }); // shooter ROTATES
    }

    // Place wins
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

    // Point made: shooter stays, new come-out follows
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
      return this._endRound({ reason: 'POINT_MADE' }); // shooter STAYS
    }

    // Neither 7 nor point → short re-bet window
    this.openBetting({ phase: PHASES.POINT, betWindowMs: POINT_REBET_WINDOW_MS });
  }

  async _endRound({ reason }) {
    clearTimeout(crapsState.bettingTimeout);
    crapsState.isBetting = false;
    crapsState.canJoinTable = false;

    // record
    if (crapsState.rollsThisRound > crapsState.records.maxRolls.count) {
      crapsState.records.maxRolls = { count: crapsState.rollsThisRound, shooterId: this.getShooter() };
      this.emit('newRecord', { ...crapsState.records.maxRolls });
    }

    // Mark idle so a new round can start cleanly
    crapsState.phase = PHASES.IDLE;

    this.emit('roundEnd', { reason, rolls: crapsState.rollsThisRound, shooterId: this.getShooter() });
  }
}

// Single engine instance
const table = new CrapsTable();

// ─── Controller (UI wiring) ───────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const DRAMA = {
  beforeBetsOpen: 600,
  beforePointAnnounce: 900,
  afterRecord: 700,
  afterBufferedRoll: 1300,
  afterLineResult: 900,
  afterRoundOver: 700
};

console.log('[crapsController] Loaded — registering event listeners');

async function nick(userId) { try { return await getUserNickname(userId); } catch { return 'Player'; } }
function sumMap(m) { return Object.values(m || {}).reduce((a,b)=>a + (b||0), 0); }
function* eachEntry(m) { for (const k of Object.keys(m || {})) yield [k, m[k]]; }

async function payLineWinners({ passWinners, dpWinners, dpPushes }) {
  for (const [uid, amt] of eachEntry(passWinners)) if (amt > 0) await addToUserWallet(uid, amt * 2, 'Pass line win');
  for (const [uid, amt] of eachEntry(dpWinners))   if (amt > 0) await addToUserWallet(uid, amt * 2, 'Don’t Pass win');
  for (const [uid, amt] of eachEntry(dpPushes))    if (amt > 0) await addToUserWallet(uid, amt, 'Don’t Pass push refund');
}
function resetLineBets() { crapsState.passBets = Object.create(null); crapsState.dontPassBets = Object.create(null); }

function isTerminalRoll(total) {
  if (crapsState.phase === PHASES.COME_OUT) return total === 7 || total === 11 || total === 2 || total === 3 || total === 12;
  if (crapsState.phase === PHASES.POINT)     return total === 7 || total === crapsState.point;
  return false;
}

async function renderLineResult(res) {
  const { stage, outcome, passWinners = {}, passLosers = {}, dpWinners = {}, dpLosers = {}, dpPushes = {} } = res;
  const passWinSum = sumMap(passWinners), passLoseSum = sumMap(passLosers), dpWinSum = sumMap(dpWinners),
        dpLoseSum = sumMap(dpLosers), dpPushSum = sumMap(dpPushes);

  const toLines = async (entries, computePayout, label) => {
    if (!entries.length) return [];
    const lines = await Promise.all(entries.map(async ([uid, amt]) => {
      const name = await nick(uid);
      const payout = computePayout(amt);
      return `  - **${name}** $${payout.toFixed(2)} ${payout === amt ? '(refund)' : `(stake $${amt} + win $${(payout-amt).toFixed(2)})`}`;
    }));
    return [`**${label}**`, ...lines];
  };

  const passWinnerLines = await toLines(Object.entries(passWinners).filter(([,a]) => a > 0), amt => amt * 2, 'Pass winners (even money):');
  const dpWinnerLines   = await toLines(Object.entries(dpWinners).filter(([,a]) => a > 0),   amt => amt * 2, "Don't Pass winners (even money):");
  const dpPushLines     = await toLines(Object.entries(dpPushes).filter(([,a]) => a > 0),    amt => amt,     "Don't Pass pushes (refunds):");

  const totals = [
    passWinSum ? `• Pass paid total: $${passWinSum}` : null,
    passLoseSum ? `• Pass lost total: $${passLoseSum}` : null,
    dpWinSum ? `• Don't Pass paid total: $${dpWinSum}` : null,
    dpLoseSum ? `• Don't Pass lost total: $${dpLoseSum}` : null,
    dpPushSum ? `• Don't Pass push refunded total: $${dpPushSum}` : null,
  ].filter(Boolean);

  const header = `🧮 **Line result (${stage} → ${outcome})**`;
  const body = [...passWinnerLines, ...dpWinnerLines, ...dpPushLines, totals.length ? '' : null, ...totals].filter(Boolean).join('\n');
  return [header, body].filter(Boolean).join('\n');
}

// Sequencing buffers
const seqState = { bufferRecordMsg: null, bufferRollMsg: null, bufferLineRes: null, sequencing: false };

table.on('systemNotice', async (text) => { await postMessage({ room: ROOM, message: `ℹ️ ${text}` }); });

table.on('roundStart', async ({ joinWindowMs }) => {
  const shooterId = table.getShooter();
  const shooterName = shooterId ? await nick(shooterId) : 'Shooter';
  await postMessage({
    room: ROOM,
    message:
`🏁 **New round started!**
- Shooter: **${shooterName}**
- 🕒 Joining open for ~${Math.floor((joinWindowMs || JOIN_WINDOW_MS)/1000)}s — use \`/join\`
- Betting opens after join closes (${Math.floor(COME_OUT_WINDOW_MS/1000)}s)`
  });
});

table.on('betsOpen', async ({ phase, durationMs }) => {
  await sleep(DRAMA.beforeBetsOpen);
  const shooterId = table.getShooter();
  const shooterName = shooterId ? await nick(shooterId) : 'Shooter';
  const label = phase === PHASES.COME_OUT ? 'Come-out' : 'Point';
  const cmds = phase === PHASES.COME_OUT
    ? '• `/pass [amt]`, `/dontpass [amt]`'
    : '• `/place [4|5|6|8|9|10] [amt]`\n  • `/field [amt]` (one-roll)\n  • `/double [1-6] [amt]` (exact pair, one-roll)';
  await postMessage({
    room: ROOM,
    message:
`🟩 **Bets OPEN** (${label}) — ~${Math.floor(durationMs/1000)}s
- Shooter: **${shooterName}**
- Use commands:
  ${cmds}`
  });
});

table.on('betsClosed', async () => {
  const shooterName = await nick(table.getShooter());
  await postMessage({ room: ROOM, message: `🟥 **Bets CLOSED.** ${shooterName}, type \`/roll\` when ready 🎲` });
});

table.on('pointEstablished', async ({ point }) => {
  await sleep(DRAMA.beforePointAnnounce);
  await postMessage({ room: ROOM, message: `📍 **Point is ${point}.** Place, Field, and Doubles are now available.` });
});

// Buffer the roll if it ends the round; otherwise, show immediately
table.on('roll', async ({ d1, d2, total }) => {
  const rollMsg = `🎲 **Roll:** \`${d1}\` + \`${d2}\` = **${total}**`;
  if (isTerminalRoll(total)) seqState.bufferRollMsg = rollMsg;
  else await postMessage({ room: ROOM, message: rollMsg });
});

table.on('newRecord', async ({ count, shooterId }) => {
  const who = await nick(shooterId);
  try {
    db.prepare(`
      INSERT INTO craps_records (roomId, maxRolls, shooterId, shooterNickname, achievedAt)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(roomId) DO UPDATE SET
        maxRolls = CASE WHEN excluded.maxRolls > craps_records.maxRolls THEN excluded.maxRolls ELSE craps_records.maxRolls END,
        shooterId = CASE WHEN excluded.maxRolls > craps_records.maxRolls THEN excluded.shooterId ELSE craps_records.shooterId END,
        shooterNickname = CASE WHEN excluded.maxRolls > craps_records.maxRolls THEN excluded.shooterNickname ELSE craps_records.shooterNickname END,
        achievedAt = CASE WHEN excluded.maxRolls > craps_records.maxRolls THEN excluded.achievedAt ELSE craps_records.achievedAt END
    `).run(ROOM, count, shooterId, who);
  } catch (e) {
    console.error('[craps] saving record failed:', e);
  }
  seqState.bufferRecordMsg = `🏆 **New record!** ${who} rolled **${count}** times in a single round.`;
});

// Buffer line result; payment will be handled during the sequence
table.on('lineResult', async (res) => { seqState.bufferLineRes = res; });

// Orchestrate the dramatic ending in order + AUTO CONTINUE
table.on('roundEnd', async ({ reason, rolls, shooterId }) => {
  if (seqState.sequencing) return;
  seqState.sequencing = true;

  try {
    if (seqState.bufferRecordMsg) {
      await postMessage({ room: ROOM, message: seqState.bufferRecordMsg });
      await sleep(DRAMA.afterRecord);
    }

    if (seqState.bufferRollMsg) {
      await postMessage({ room: ROOM, message: seqState.bufferRollMsg });
      await sleep(DRAMA.afterBufferedRoll);
    }

    if (seqState.bufferLineRes) {
      await payLineWinners(seqState.bufferLineRes);
      const rendered = await renderLineResult(seqState.bufferLineRes);
      if (rendered) {
        await postMessage({ room: ROOM, message: rendered });
        await sleep(DRAMA.afterLineResult);
      }
      resetLineBets();
    }

    // Round summary
    const who = await nick(shooterId);
    const passDice = reason === 'SEVEN_OUT';
    await postMessage({
      room: ROOM,
      message:
`⛳ **Round over** (${reason})
- Shooter: **${who}**
- Rolls: **${rolls}**
- ${passDice ? '🎲 Dice pass to the next shooter.' : '🎲 Shooter keeps the dice.'}`
    });

    // Rotate only on seven-out (true casino behavior)
    if (passDice) table.nextShooter();

    // Small beat, then auto-continue with a fresh round
    await sleep(DRAMA.afterRoundOver);
    const nextShooterName = await nick(table.getShooter());
    await postMessage({
      room: ROOM,
      message: `♻️ **Auto-continue:** new round starting with **${nextShooterName}**. Joining opens briefly…`
    });

    // Start the next round automatically
    table.startRound({ joinWindowMs: AUTO_NEXT_JOIN_WINDOW_MS, comeOutMs: COME_OUT_WINDOW_MS });

  } finally {
    // Clear sequence buffers
    seqState.bufferRecordMsg = null;
    seqState.bufferRollMsg = null;
    seqState.bufferLineRes = null;
    seqState.sequencing = false;
  }
});

// — Prop bet event handlers —
// (Removed "placed" announcements to avoid duplicates; router acks immediately.)
table.on('fieldWin', async ({ userId, total, stake, totalReturn, profit }) => {
  await postMessage({ room: ROOM, message: `✅ Field **wins on ${total}** for **${await nick(userId)}** (stake $${stake} → $${totalReturn.toFixed(2)}; ${profit}:1)` });
});
table.on('fieldLoss', async ({ userId, total, stake }) => {
  await postMessage({ room: ROOM, message: `❌ Field **loses** on ${total} for **${await nick(userId)}** ($${stake})` });
});
table.on('doubleWin', async ({ userId, pip, stake, totalReturn, profit }) => {
  await postMessage({ room: ROOM, message: `💥 Doubles **${pip}-${pip} hits!** **${await nick(userId)}** wins (stake $${stake} → $${totalReturn.toFixed(2)}; ${profit}:1)` });
});
table.on('doubleLoss', async ({ userId, pip, stake }) => {
  await postMessage({ room: ROOM, message: `❌ Doubles **${pip}-${pip}** miss for **${await nick(userId)}** ($${stake})` });
});

// — Place actions —
table.on('placePlaced', async ({ userId, number, amount }) => {
  await postMessage({ room: ROOM, message: `🟨 Place bet: **${await nick(userId)}** $${amount} on **${number}**` });
});
table.on('placeRemoved', async ({ userId, number, amount }) => {
  await postMessage({ room: ROOM, message: `↩️ Place bet removed: **${await nick(userId)}** got $${amount} back from **${number}**` });
});
table.on('placeWin', async ({ userId, number, amount, payout }) => {
  await postMessage({ room: ROOM, message: `✅ Place on **${number}** for **${await nick(userId)}** (stake $${amount} → $${payout.toFixed(2)})` });
});
table.on('placeLoss', async ({ userId, number, amount, reason }) => {
  const who = await nick(userId);
  const why = reason === 'SEVEN_OUT' ? '7-out' : 'loss';
  await postMessage({ room: ROOM, message: `❌ Place ${why} for **${who}** on **${number}** ($${amount})` });
});

// ─── Commands Router ───────────────────────────────────────────────────────────
function parseAmount(txt) {
  const v = Number(String(txt).replace(/[^\d.]/g, ''));
  if (!isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}

function helpText() {
  return [
    '**🎰 Craps Commands**',
    '• `/craps start` — begin (auto-continues each round)',
    '• `/join` — sit at the table (join opens briefly each round)',
    '• `/roll` — shooter rolls the dice',
    '• `/craps status` — show current phase/point/shooter',
    '',
    '**Allowed bets**',
    '• **Come-out:** `/pass [amt]`, `/dontpass [amt]` (only)',
    '• **Point:** `/place [4|5|6|8|9|10] [amt]`, `/removeplace [num]`, `/field [amt]` (one-roll), `/double [1-6] [amt]` (exact pair, one-roll)',
    '',
    '**Notes**',
    `- After each round: seven-out → dice pass; other outcomes → shooter stays.`,
    `- One-roll bets resolve on the next roll and then clear.`,
    `- Re-bet window during point ≈ ${Math.floor(POINT_REBET_WINDOW_MS/1000)}s after non-terminal rolls.`,
    '- Place pays true odds (4/10: 9:5; 5/9: 7:5; 6/8: 7:6).',
    `- Field pays 1:1 on 3,4,9,10,11; ${FIELD_PAYOUT[2]}:1 on 2; ${FIELD_PAYOUT[12]}:1 on 12.`,
    `- Doubles pays ${DOUBLE_PROFIT}:1 on exact pair (e.g., 4-4).`,
    '- Don’t Pass on 12 at come-out is a push (refund).',
  ].join('\n');
}

export async function routeCrapsMessage(payload) {
  const txt = String(payload.message || '').trim();
  const userId = payload.sender;
  const name = await getUserNickname(userId).catch(() => 'Player');

  // HELP
  if (/^\/craps\s+(help|rules)\b/i.test(txt)) {
    return postMessage({ room: ROOM, message: helpText() });
  }

  // STATUS
  if (/^\/craps\s+status\b/i.test(txt)) {
    const shooterId = table.getShooter();
    const shooter = shooterId ? await getUserNickname(shooterId).catch(()=> 'Shooter') : '—';
    const p = crapsState.point ?? '—';
    const phase = crapsState.phase;
    const betting = crapsState.isBetting ? 'OPEN' : 'CLOSED';
    const players = crapsState.tableUsers.length;
    return postMessage({
      room: ROOM,
      message:
`**Craps Status**
- Phase: **${phase}**
- Point: **${p}**
- Betting: **${betting}**
- Shooter: **${shooter}**
- Players seated: **${players}**`
    });
  }

  // START
  if (/^\/craps\s+start\b/i.test(txt)) {
    if (!crapsState.tableUsers.includes(userId)) table.addPlayer(userId);
    if (!crapsState.tableUsers.length) table.addPlayer(userId);
    if (crapsState.phase !== PHASES.IDLE) {
      await postMessage({ room: ROOM, message: 'A round is already underway.' });
      return;
    }
    table.startRound({ joinWindowMs: JOIN_WINDOW_MS, comeOutMs: COME_OUT_WINDOW_MS });
    return;
  }

  // JOIN
  if (/^\/join\b/i.test(txt)) {
    const res = table.addPlayer(userId);
    if (res.ok) return postMessage({ room: ROOM, message: `🪑 **${name}** sat at the table.` });
    return postMessage({ room: ROOM, message: 'Joining is closed right now. It re-opens at the start of each round.' });
  }

  // ROLL (only shooter)
  if (/^\/roll\b/i.test(txt)) return table.roll(userId);

  // PASS / DONTPASS (Come-out only)
  let m;
  if ((m = txt.match(/^\/pass\s+(\S+)/i))) {
    const amt = parseAmount(m[1]);
    if (!amt) return postMessage({ room: ROOM, message: 'Usage: `/pass [amount]`' });
    const res = await table.placePass(userId, amt);
    if (!res.ok) {
      const msg =
        res.reason === 'NOT_ALLOWED_NOW' ? 'Pass can only be placed during the come-out betting window.'
        : res.reason === 'INSUFFICIENT_FUNDS' ? 'Insufficient funds.'
        : 'Could not place Pass bet.';
      return postMessage({ room: ROOM, message: msg });
    }
    return postMessage({ room: ROOM, message: `✅ **${name}** Pass $${amt}` });
  }

  if ((m = txt.match(/^\/dontpass\s+(\S+)/i))) {
    const amt = parseAmount(m[1]);
    if (!amt) return postMessage({ room: ROOM, message: 'Usage: `/dontpass [amount]`' });
    const res = await table.placeDontPass(userId, amt);
    if (!res.ok) {
      const msg =
        res.reason === 'NOT_ALLOWED_NOW' ? 'Don’t Pass can only be placed during the come-out betting window.'
        : res.reason === 'INSUFFICIENT_FUNDS' ? 'Insufficient funds.'
        : 'Could not place Don’t Pass bet.';
      return postMessage({ room: ROOM, message: msg });
    }
    return postMessage({ room: ROOM, message: `✅ **${name}** Don’t Pass $${amt}` });
  }

  // PLACE (Point only)
  if ((m = txt.match(/^\/place\s+(\d+)\s+(\S+)/i))) {
    const num = Number(m[1]);
    const amt = parseAmount(m[2]);
    if (!amt) return postMessage({ room: ROOM, message: 'Usage: `/place [4|5|6|8|9|10] [amount]`' });
    const res = await table.placePlace(userId, num, amt);
    if (!res.ok) {
      const msg =
        res.reason === 'NOT_ALLOWED_NOW' ? 'Place bets are only during the point betting window.'
        : res.reason === 'BAD_NUMBER' ? 'Number must be 4, 5, 6, 8, 9, or 10.'
        : res.reason === 'INSUFFICIENT_FUNDS' ? 'Insufficient funds.'
        : 'Could not place Place bet.';
      return postMessage({ room: ROOM, message: msg });
    }
    return; // placePlaced event announces
  }

  // REMOVE PLACE
  if ((m = txt.match(/^\/removeplace\s+(\d+)/i))) {
    const num = Number(m[1]);
    const res = await table.removePlace(userId, num);
    if (!res.ok) {
      const msg =
        res.reason === 'BAD_NUMBER' ? 'Number must be 4, 5, 6, 8, 9, or 10.'
        : res.reason === 'NONE' ? 'You have no Place bet on that number.'
        : 'Could not remove Place bet.';
      return postMessage({ room: ROOM, message: msg });
    }
    return; // placeRemoved event announces
  }

  // FIELD (Point only) — immediate ack on success
  if ((m = txt.match(/^\/field\s+(\S+)/i))) {
    const amt = parseAmount(m[1]);
    if (!amt) return postMessage({ room: ROOM, message: 'Usage: `/field [amount]`' });
    const res = await table.placeField(userId, amt);
    if (!res.ok) {
      const msg =
        res.reason === 'NOT_ALLOWED_NOW' ? 'Field can only be placed during the point betting window while Bets are OPEN.'
        : res.reason === 'INSUFFICIENT_FUNDS' ? 'Insufficient funds.'
        : 'Could not place Field bet.';
      return postMessage({ room: ROOM, message: msg });
    }
    await postMessage({ room: ROOM, message: `🟪 **${name}** Field $${amt} (one roll)` });
    return;
  }

  // DOUBLES (Point only) — immediate ack on success
  if ((m = txt.match(/^\/double\s+(\d)\s+(\S+)/i))) {
    const pip = Number(m[1]);
    const amt = parseAmount(m[2]);
    if (!amt || !(pip >= 1 && pip <= 6)) {
      return postMessage({ room: ROOM, message: 'Usage: `/double [1-6] [amount]` (e.g., `/double 4 10` for 4-4)' });
    }
    const res = await table.placeDouble(userId, pip, amt);
    if (!res.ok) {
      const msg =
        res.reason === 'NOT_ALLOWED_NOW' ? 'Doubles can only be placed during the point betting window while Bets are OPEN.'
        : res.reason === 'BAD_PIP' ? 'Pip must be 1–6.'
        : res.reason === 'INSUFFICIENT_FUNDS' ? 'Insufficient funds.'
        : 'Could not place Doubles bet.';
      return postMessage({ room: ROOM, message: msg });
    }
    await postMessage({ room: ROOM, message: `🟥 **${name}** Doubles ${pip}-${pip} $${amt} (one roll)` });
    return;
  }

  // Fallback
  if (/^\/craps\b/i.test(txt)) return postMessage({ room: ROOM, message: helpText() });
}
