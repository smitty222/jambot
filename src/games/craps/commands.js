// src/games/craps/commands.js
import { table } from './service.js';
import { crapsState, PHASES } from './crapsState.js';
import { postMessage } from '../../libs/cometchat.js';
import { getUserNickname } from '../../handlers/message.js';

const ROOM = process.env.ROOM_UUID;

function parseAmount(txt) {
  const v = Number(String(txt).replace(/[^\d.]/g, ''));
  if (!isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}

function helpText() {
  return [
    '**🎰 Craps Commands**',
    '• `/craps start` — start a new round (no auto-restart)',
    '• `/join` — sit at the table',
    '• `/roll` — shooter rolls the dice',
    '• Come-out (green): `/pass [amt]`, `/dontpass [amt]`',
    '• Point (yellow): `/come [amt]`, `/place [4|5|6|8|9|10] [amt]`, `/removeplace [num]`',
    '',
    '**Notes**',
    '- Stake is deducted once on bet placement.',
    '- Winners are paid stake + winnings (even money on Pass/DP/Come; true odds on Place).',
    '- DP on 12 at come-out is a push (refund).',
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

  // START
  if (/^\/craps\s+start\b/i.test(txt)) {
    if (!crapsState.tableUsers.includes(userId)) {
      table.addPlayer(userId);
    }
    // Ensure someone is shooter; keep currentShooter in range
    if (!crapsState.tableUsers.length) table.addPlayer(userId);
    if (crapsState.phase !== PHASES.IDLE) {
      await postMessage({ room: ROOM, message: 'A round is already in progress. Finish it or wait for it to end.' });
      return;
    }
    await postMessage({ room: ROOM, message: `🚦 **Starting round** — Shooter: **${name}** (or next in rotation)` });
    table.startRound();
    return;
  }

  // JOIN
  if (/^\/join\b/i.test(txt)) {
    const res = table.addPlayer(userId);
    if (res.ok) {
      return postMessage({ room: ROOM, message: `🪑 **${name}** sat at the table.` });
    }
    return postMessage({ room: ROOM, message: 'Joining is closed right now. Try before the next round.' });
  }

  // ROLL (only shooter)
  if (/^\/roll\b/i.test(txt)) {
    return table.roll(userId);
  }

  // PASS / DONTPASS
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

  // COME
  if ((m = txt.match(/^\/come\s+(\S+)/i))) {
    const amt = parseAmount(m[1]);
    if (!amt) return postMessage({ room: ROOM, message: 'Usage: `/come [amount]`' });
    const res = await table.placeCome(userId, amt);
    if (!res.ok) {
      const msg =
        res.reason === 'NOT_ALLOWED_NOW' ? 'Come bets can only be placed during the point betting window.'
        : res.reason === 'INSUFFICIENT_FUNDS' ? 'Insufficient funds.'
        : 'Could not place Come bet.';
      return postMessage({ room: ROOM, message: msg });
    }
    return; // announcement handled by controller via event
  }

  // PLACE
  if ((m = txt.match(/^\/place\s+(\d+)\s+(\S+)/i))) {
    const num = Number(m[1]);
    const amt = parseAmount(m[2]);
    if (!amt) return postMessage({ room: ROOM, message: 'Usage: `/place [4|5|6|8|9|10] [amount]`' });
    const res = await table.placePlace(userId, num, amt);
    if (!res.ok) {
      const msg =
        res.reason === 'NOT_ALLOWED_NOW' ? 'Place bets can only be placed during the point betting window.'
        : res.reason === 'BAD_NUMBER' ? 'Number must be 4, 5, 6, 8, 9, or 10.'
        : res.reason === 'INSUFFICIENT_FUNDS' ? 'Insufficient funds.'
        : 'Could not place Place bet.';
      return postMessage({ room: ROOM, message: msg });
    }
    return; // controller announces
  }

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
    return; // controller announces
  }

  // Fallback
  if (/^\/craps\b/i.test(txt)) {
    return postMessage({ room: ROOM, message: helpText() });
  }
}
