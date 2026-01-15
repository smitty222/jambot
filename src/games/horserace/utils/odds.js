// src/games/horserace/utils/odds.js


function roundTo (value, step = 0.05) {
  return Math.round(value / step) * step
}

// --- Tote-board ladder (profit odds A/B) ---
// Starts at 2/1 to keep the board intuitive for your game.
const TOTE_LADDER = [
  { num: 2, den: 1 },
  { num: 5, den: 2 },
  { num: 3, den: 1 },
  { num: 7, den: 2 },
  { num: 4, den: 1 },
  { num: 9, den: 2 },
  { num: 5, den: 1 },
  { num: 6, den: 1 },
  { num: 7, den: 1 },
  { num: 8, den: 1 },
  { num: 10, den: 1 },
  { num: 12, den: 1 },
  { num: 15, den: 1 },
  { num: 20, den: 1 },
  { num: 30, den: 1 },
  { num: 40, den: 1 },
  { num: 50, den: 1 }
]

function ladderValue (o) {
  return o.num / o.den
}

/**
 * Snap a decimal PROFIT (dec - 1) to the tote-board ladder.
 * Fairness rule: never snap to a shorter price than fair.
 * We choose the smallest ladder value >= fairProfit.
 */
export function profitToToteLadder (profit, { minProfit = 2.0 } = {}) {
  let p = Math.max(0, Number(profit || 0))
  p = Math.max(p, minProfit)

  // Choose smallest ladder >= p
  let chosen = TOTE_LADDER[TOTE_LADDER.length - 1]
  for (const o of TOTE_LADDER) {
    if (ladderValue(o) >= p) {
      chosen = o
      break
    }
  }

  const val = ladderValue(chosen)
  return {
    num: chosen.num,
    den: chosen.den,
    label: `${chosen.num}/${chosen.den}`,
    decLocked: 1 + val
  }
}

/**
 * Compute dynamic decimal odds (return odds) from baseOdds + smoothed form.
 * This is used for *simulation strength* and as the input to tote snapping.
 */
export function getCurrentOdds (horse) {
  const base = Number(horse?.baseOdds ?? 3.0)

  const wins = Number(horse?.wins ?? 0)
  const races = Number(horse?.racesParticipated ?? 0)

  // Bayesian smoothing keeps streaks from over-tightening odds.
  // Acts like each horse starts 1-for-3.
  const priorWins = 1
  const priorRaces = 3
  const form = (wins + priorWins) / Math.max(1, (races + priorRaces))

  // Better form -> slightly lower odds.
  // Cap the form impact at 30% and weight by 0.25.
  let dec = base * (1.0 - Math.min(0.3, form * 0.25))

  // Owner horses get only a small discount.
  const isBot = !horse?.ownerId || horse.ownerId === 'allen'
  dec *= isBot ? 1.0 : 0.98

  // Guardrails
  dec = Math.max(1.2, roundTo(dec, 0.05))
  return dec
}

/**
 * Lock tote-board odds for display + settlement.
 *
 * Returns:
 * - decFair: fair-ish decimal odds (kept for simulation strength)
 * - oddsFrac: {num, den} profit odds for settlement
 * - oddsLabel: string like "5/2" for display
 * - oddsDecLocked: decimal return equivalent of the locked tote odds
 */
export function lockToteBoardOdds (decFair, { minProfit = 2.0 } = {}) {
  const d = Number(decFair || 0)
  const safe = (Number.isFinite(d) && d > 1) ? d : 3.0
  const tote = profitToToteLadder(safe - 1, { minProfit })
  return {
    decFair: safe,
    oddsFrac: { num: tote.num, den: tote.den },
    oddsLabel: tote.label,
    oddsDecLocked: tote.decLocked
  }
}

/**
 * Legacy formatter.
 * Prefer using lockToteBoardOdds() so display/settlement are guaranteed.
 */
export function formatOdds (dec, mode = 'fraction') {
  const d = Number(dec || 0)
  if (!Number.isFinite(d) || d <= 0) return '—'
  if (mode === 'decimal' || mode === 'dec') return d.toFixed(2)
  return lockToteBoardOdds(d, { minProfit: 2.0 }).oddsLabel
}
