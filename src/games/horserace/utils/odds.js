// src/games/horserace/utils/odds.js

/**
 * Round `value` to the nearest multiple of `step`.
 * @param {number} value
 * @param {number} [step=0.05]
 * @returns {number}
 */
function roundTo(value, step = 0.05) {
  return Math.round(value / step) * step;
}

/**
 * Compute dynamic odds based on performance & ownership.
 *
 * @param {object}  horse
 * @param {number}  horse.baseOdds
 * @param {number}  [horse.wins=0]
 * @param {number}  [horse.racesParticipated=1]
 * @param {string}  [horse.ownerId]
 * @param {number}  [horse.careerEarnings=0]
 * @param {number}  [horse.price=100]
 * @returns {number}  Decimal odds, never below floor.
 */
export function getCurrentOdds(horse) {
  const {
    name = '<unknown>',
    baseOdds,
    wins = 0,
    racesParticipated = 1,
    ownerId,
    careerEarnings = 0,
    price = 100,
  } = horse;

  const winRate = wins / racesParticipated;
  console.log(`[ODDS_UTIL] getCurrentOdds('${name}') → baseOdds=${baseOdds}, wins=${wins}, races=${racesParticipated}, winRate=${winRate.toFixed(2)}`);

  let odds;
  if (ownerId && ownerId !== 'allen') {
    // User-owned horses: mix ROI + form
    const roi = (careerEarnings / (racesParticipated * price)) || 0;
    odds = baseOdds / (1 + winRate * 0.4 + roi * 0.6);
    const raw = Math.max(1.1, roundTo(odds, 0.05));
    console.log(`[ODDS_UTIL] getCurrentOdds('${name}') → ownerId detected, roi=${roi.toFixed(2)}, rawOdds=${raw}`);
    return raw;
  } else {
    // Bot horses: only form
    odds = baseOdds / (1 + winRate * 0.6);
    const raw = Math.max(1.2, roundTo(odds, 0.05));
    console.log(`[ODDS_UTIL] getCurrentOdds('${name}') → bot horse, rawOdds=${raw}`);
    return raw;
  }
}

/**
 * Format odds for display, both decimal and (simple) fraction.
 *
 * In 'fraction' mode we round the decimal to the nearest integer,
 * then display as "N/1" (e.g. 5.0 → "5/1", 4.3 → "4/1").
 *
 * @param {number}  dec    Decimal odds (e.g. 2.5)
 * @param {'decimal'|'dec'|'fraction'|'frac'} [mode='fraction']
 * @returns {string}
 */
export function formatOdds(dec, mode = 'fraction') {
  const m = mode.toLowerCase();
  console.log(`[ODDS_UTIL] formatOdds(dec=${dec}, mode='${m}')`);

  if (m === 'fraction' || m === 'frac') {
    // Round to nearest whole number, then display N/1
    const whole = Math.round(dec);
    const out = `${whole}/1`;
    console.log(`[ODDS_UTIL] formatOdds → fraction output='${out}'`);
    return out;
  }

  if (m === 'decimal' || m === 'dec') {
    // Always show one decimal place ("1.0" not "1")
    const out = dec.toFixed(1);
    console.log(`[ODDS_UTIL] formatOdds → decimal output='${out}'`);
    return out;
  }

  console.error(`[ODDS_UTIL] formatOdds → unsupported mode '${mode}'`);
  throw new Error(`formatOdds: unsupported mode "${mode}"`);
}
