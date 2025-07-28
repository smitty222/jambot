// src/games/horserace/utils.js

/**
 * Convert a decimal (e.g. 2.5) into a simple fraction string (e.g. "5/2").
 * @param {number} dec 
 * @returns {string}
 */
export function decimalToFraction(decimal) {
  if (Number.isInteger(decimal)) return `${decimal}/1`;

  // Round to 2 decimal places
  decimal = Math.round(decimal * 100) / 100;

  const denominatorLimit = 20; // we won't allow denominators over this
  let bestNumerator = 1;
  let bestDenominator = 1;
  let smallestDiff = Infinity;

  for (let d = 1; d <= denominatorLimit; d++) {
    const n = Math.round(decimal * d);
    const approx = n / d;
    const diff = Math.abs(decimal - approx);
    if (diff < smallestDiff) {
      bestNumerator = n;
      bestDenominator = d;
      smallestDiff = diff;
    }
  }

  return `${bestNumerator}/${bestDenominator}`;
}


/**
 * Generate an ASCII/emoji progress bar for each horse.
 * @param {Array<{ index: number, name: string, progress: number }>} raceState 
 * @param {boolean} showWinner 
 * @returns {string}
 */
export function generateVisualProgress(raceState, showWinner = false) {
  const MAX_BAR = 10;
  const staticMax = 3;  // use for in‐race scaling
  const actualMax = Math.max(...raceState.map(h => h.progress));
  const scale = showWinner ? actualMax : staticMax;

  // find all leaders (for trophies on final)
  const leaders = raceState
    .filter(h => Math.abs(h.progress - actualMax) < 1e-6)
    .map(h => h.index);

  return raceState
    .map(h => {
      // compute filled length
      const ratio = scale > 0 ? h.progress / scale : 0;
      const fullCount = Math.min(MAX_BAR, Math.round(ratio * MAX_BAR));
      const emptyCount = MAX_BAR - fullCount;
      const bar = '🟩'.repeat(fullCount) + '⬜'.repeat(emptyCount);
      const trophy = showWinner && leaders.includes(h.index) ? ' 🏆' : '';
      // format "#1 [bar] |🏁| HorseName"
      return `#${(h.index + 1).toString().padStart(2, ' ')} ${bar} |🏁| ${h.name}${trophy}`;
    })
    .join('\n');
}

/**
 * Computes dynamic odds based on ownership & performance.
 * @param {object} horse
 * @returns {number} dynamic odds
 */
export function getCurrentOdds(horse) {
  const { wins = 0, racesParticipated = 1, baseOdds = 3, ownerId, careerEarnings = 0, price = 100 } = horse;

  const winRate = wins / racesParticipated;

  // 🧑 USER HORSES: Use ROI and form
  if (ownerId && ownerId !== 'allen') {
    const roi = racesParticipated > 0
      ? (careerEarnings || 0) / (racesParticipated * (price || 100))
      : 0;

    // ROI adjusts the odds downward
    const odds = baseOdds / (1 + winRate * 0.4 + roi * 0.6);

    return Math.max(1.1, roundTo(odds, 0.05)); // never go below 1.1
  }

  // 🤖 BOT HORSES: Win rate only
  const odds = baseOdds / (1 + winRate * 0.6);
  return Math.max(1.2, roundTo(odds, 0.05));
}

function roundTo(value, step = 0.05) {
  return Math.round(value / step) * step;
}

