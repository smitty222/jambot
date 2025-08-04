/**
 * Generate the finish-line header for the track display.
 * @param {number} barLength - Number of blocks in the track.
 * @returns {string}
 */
export function generateTrackHeader(barLength = 10) {
  return '🏁' + '─'.repeat(barLength) + 'FINISH';
}

/**
 * Generate an emoji progress bar for each horse (static use or final display).
 * @param {Array<{ index: number, name: string, progress: number }>} raceState
 * @param {boolean} [showWinner=false]
 * @param {number} [barLength=10]
 * @param {number} [staticScale=3]
 * @returns {string}
 */
export function generateVisualProgress(
  raceState,
  showWinner = false,
  barLength = 10,
  staticScale = 3
) {
  const actualMax = Math.max(...raceState.map(h => h.progress));
  const scale     = showWinner ? actualMax : staticScale;
  const leaders   = raceState
    .filter(h => Math.abs(h.progress - actualMax) < 1e-6)
    .map(h => h.index);

  const FILLED = '▮';
  const EMPTY  = '▯';

  return raceState
    .map(h => {
      const ratio  = scale > 0 ? h.progress / scale : 0;
      const filled = Math.min(barLength, Math.round(ratio * barLength));
      const empty  = barLength - filled;
      const bar    = FILLED.repeat(filled) + EMPTY.repeat(empty);
      const trophy = showWinner && leaders.includes(h.index) ? ' 🏆' : '';
      const idx    = `${h.index+1}`.padStart(2);
      return `${idx} │ ${bar} │ ${h.name}${trophy}`;
    })
    .join('\n');
}


/**
 * Generate a clean progress display based on distance filled, not speed.
 * @param {Array<{ index:number, progress:number }>} lastState
 * @param {Array<{ index:number, name:string, progress:number }>} curState
 * @param {number} [barLength=10]
 * @returns {{ header: string, lanes: string[] }}
 */
export function generateColoredTrack(
  lastState,
  curState,
  barLength = 10
) {
  const maxProg = Math.max(...curState.map(h => h.progress), 1);
  const header = generateTrackHeader(barLength);

  const lanes = curState.map(h => {
    const filled = Math.min(barLength, Math.round((h.progress / maxProg) * barLength));
    const blocks = '🟩'.repeat(filled) + '⬜'.repeat(barLength - filled);
    const idxLabel = `${h.index + 1}`.padStart(2, ' ');
    const nameLabel = h.name.padEnd(12);
    return `${idxLabel} │ ${nameLabel} │ ▶${blocks}`;
  });

  return { header, lanes };
}
