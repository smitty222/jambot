// src/games/horserace/utils/odds.js

/*
 * This module computes dynamic decimal odds for each horse based on a
 * combination of base odds, recent form (wins vs races), and owner/bot
 * distinctions.  It exposes two helpers: getCurrentOdds() returns the
 * decimal odds, while formatOdds() produces a fractional or decimal
 * representation for display.
 *
 * Fairness Adjustments:
 *  - The form factor now has a smaller impact on odds (cap 30% reduction
 *    with a 0.25 weight) so that strong horses are not overly favored.
 *  - Owner horses get only a slight discount (2%) instead of 5%, reducing
 *    any hidden advantage.
 */

function roundTo (value, step = 0.05) {
  return Math.round(value / step) * step
}

/**
 * Compute dynamic decimal odds from baseOdds + basic form.
 * Owner horses get slightly tighter odds than bots.
 *
 * @param {object} horse The horse object containing baseOdds, wins, races,
 *        ownerId, and other stats.
 * @returns {number} Decimal odds (rounded to nearest 0.05, minimum 1.2).
 */
export function getCurrentOdds (horse) {
  const base = Number(horse?.baseOdds ?? 3.0)

  const wins = Number(horse?.wins ?? 0)
  const races = Number(horse?.racesParticipated ?? 0)
  const form = races > 0 ? wins / races : 0

  // Tweak: better form -> lower odds. Cap the form impact at 30% and weight by 0.25.
  let dec = base * (1.0 - Math.min(0.3, form * 0.25))

  // Nudge for owner vs bot. Owner horses get a small (2%) discount.
  const isBot = !horse?.ownerId || horse.ownerId === 'allen'
  dec *= isBot ? 1.0 : 0.98

  // Guardrails
  dec = Math.max(1.2, roundTo(dec, 0.05))
  return dec
}

/**
 * Format odds as "N/1" (fraction-ish) or decimal string.
 * @param {number} dec Decimal odds to format.
 * @param {'fraction'|'frac'|'decimal'|'dec'} [mode='fraction']
 *        Output mode.  'fraction' or 'frac' yields N/1; 'decimal' yields a
 *        two-decimal fixed string.
 */
export function formatOdds (dec, mode = 'fraction') {
  const d = Number(dec || 0)
  if (mode === 'decimal' || mode === 'dec') {
    return d.toFixed(2)
  }
  // crude but readable: 4.3 -> "4/1"
  const n = Math.max(1, Math.round(d))
  return `${n}/1`
}
