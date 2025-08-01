// src/games/horserace/utils/fraction.js

/**
 * Convert a decimal (e.g. 2.5) into a simple fraction string (e.g. "5/2").
 *
 * @param {number} decimal  The decimal to convert.
 * @param {number} [denominatorLimit=20]  Max denominator to try.
 * @returns {string}  Fraction as "numerator/denominator".
 */
export function decimalToFraction(decimal, denominatorLimit = 20) {
  if (Number.isInteger(decimal)) {
    return `${decimal}/1`;
  }

  // Round input to 2dp to avoid floating-point craziness
  decimal = Math.round(decimal * 100) / 100;

  let bestNum = 1;
  let bestDen = 1;
  let smallestDiff = Infinity;

  for (let d = 1; d <= denominatorLimit; d++) {
    const n = Math.round(decimal * d);
    const diff = Math.abs(decimal - (n / d));
    if (diff < smallestDiff) {
      bestNum = n;
      bestDen = d;
      smallestDiff = diff;
    }
  }

  return `${bestNum}/${bestDen}`;
}
