// src/games/craps/message.js
import {
  handleCrapsStart,
  handleCrapsJoin,
  handleCrapsPass,
  handleCrapsDontPass,
  handleCrapsRoll,
  handleCrapsHelp,
  handleCrapsCome,
  handleCrapsPlace,
} from './commands.js';

// Only command routing here
export function routeCrapsMessage(payload) {
  const txt = payload.message.trim();

  if (/^\/craps\s+start\b/i.test(txt)) return handleCrapsStart(payload);
  if (/^\/craps\s+join\b/i.test(txt)) return handleCrapsJoin(payload);
  if (/^\/pass\b/i.test(txt)) return handleCrapsPass(payload);
  if (/^\/dontpass\b/i.test(txt)) return handleCrapsDontPass(payload);
  if (/^\/roll\b/i.test(txt)) return handleCrapsRoll(payload);
  if (/^\/craps\s+(help|rules)\b/i.test(txt)) return handleCrapsHelp();
  if (/^\/come\b/i.test(txt)) return handleCrapsCome(payload);
  if (/^\/place\b/i.test(txt)) return handleCrapsPlace(payload);
}
