// src/games/horserace/utils/progress.js

/**
 * Generate an ASCII/emoji progress bar for each horse.
 *
 * @param {Array<{ index: number, name: string, progress: number }>} raceState
 * @param {boolean} [showWinner=false]
 * @param {number} [barLength=10]
 * @param {number} [staticScale=3]  Scale used during the race.
 * @returns {string}
 */
export function generateVisualProgress(
  raceState,
  showWinner = false,
  barLength = 10,
  staticScale = 3
) {
  const actualMax = Math.max(...raceState.map(h => h.progress));
  const scale = showWinner ? actualMax : staticScale;

  // leaders (for trophy)
  const leaders = raceState
    .filter(h => Math.abs(h.progress - actualMax) < 1e-6)
    .map(h => h.index);

  return raceState
    .map(h => {
      const ratio = scale > 0 ? h.progress / scale : 0;
      const filled = Math.min(barLength, Math.round(ratio * barLength));
      const empty = barLength - filled;
      const bar = '🟩'.repeat(filled) + '⬜'.repeat(empty);
      const trophy = showWinner && leaders.includes(h.index) ? ' 🏆' : '';
      const idxLabel = `#${(h.index + 1).toString().padStart(2, ' ')}`;
      return `${idxLabel} ${bar} |🏁| ${h.name}${trophy}`;
    })
    .join('\n');
}
