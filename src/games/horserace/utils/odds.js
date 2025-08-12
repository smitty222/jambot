// horserace/utils/odds.js

function roundTo(value, step = 0.05) {
  return Math.round(value / step) * step;
}

/**
 * Compute dynamic decimal odds from baseOdds + basic form.
 * Owner horses get slightly tighter odds than bots.
 */
export function getCurrentOdds(horse) {
  const base = Number(horse?.baseOdds ?? 3.0);

  const wins  = Number(horse?.wins ?? 0);
  const races = Number(horse?.racesParticipated ?? 0);
  const form  = races > 0 ? wins / races : 0;

  // Tweak: better form -> lower odds
  let dec = base * (1.0 - Math.min(0.4, form * 0.35));

  // Nudge for owner vs bot
  const isBot = !horse?.ownerId || horse.ownerId === 'allen';
  dec *= isBot ? 1.0 : 0.95;

  // Guardrails
  dec = Math.max(1.2, roundTo(dec, 0.05));
  return dec;
}

/**
 * Format odds as "N/1" (fraction-ish) or decimal string.
 * @param {number} dec
 * @param {'fraction'|'frac'|'decimal'|'dec'} [mode='fraction']
 */
export function formatOdds(dec, mode = 'fraction') {
  const d = Number(dec || 0);
  if (mode === 'decimal' || mode === 'dec') {
    return d.toFixed(2);
  }
  // crude but readable: 4.3 -> "4/1"
  const n = Math.max(1, Math.round(d));
  return `${n}/1`;
}
