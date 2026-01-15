// src/games/horserace/utils/odds.js

function roundTo (value, step = 0.05) {
  return Math.round(value / step) * step
}

function gcd (a, b) {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) {
    const t = b
    b = a % b
    a = t
  }
  return a || 1
}

function reduceFraction (num, den) {
  const g = gcd(num, den)
  return { num: num / g, den: den / g }
}

/**
 * Convert a decimal PROFIT (dec - 1) into a board-style fraction (Option A).
 * Allowed denominators: 1, 2, 4.
 */
export function profitToBoardFraction (profit, allowedDens = [1, 2, 4]) {
  const p = Math.max(0, Number(profit || 0))

  let best = null
  for (const den of allowedDens) {
    // nearest numerator for this denominator
    let num = Math.round(p * den)
    if (num < 1) num = 1 // avoid 0/X

    const approx = num / den
    const err = Math.abs(approx - p)

    // tie-breaker: prefer larger denominator for a slightly "truer" board price
    if (!best || err < best.err || (err === best.err && den > best.den)) {
      best = { num, den, err }
    }
  }

  const reduced = reduceFraction(best.num, best.den)
  const decLocked = 1 + (reduced.num / reduced.den)
  return {
    num: reduced.num,
    den: reduced.den,
    label: `${reduced.num}/${reduced.den}`,
    decLocked
  }
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

  // Better form -> slightly lower odds. Cap the form impact at 30% and weight by 0.25.
  let dec = base * (1.0 - Math.min(0.3, form * 0.25))

  // Owner horses get a small (2%) discount.
  const isBot = !horse?.ownerId || horse.ownerId === 'allen'
  dec *= isBot ? 1.0 : 0.98

  // Guardrails
  dec = Math.max(1.2, roundTo(dec, 0.05))
  return dec
}

/**
 * Lock board odds (fraction + equivalent decimal return) from a decimal input.
 *
 * @param {number} dec Decimal odds.
 * @returns {{ dec:number, frac:{num:number,den:number}, label:string, decLocked:number }}
 */
export function lockBoardOdds (dec) {
  const d = Number(dec || 0)
  if (!Number.isFinite(d) || d <= 0) {
    return { dec: 3.0, frac: { num: 2, den: 1 }, label: '2/1', decLocked: 3.0 }
  }
  const board = profitToBoardFraction(d - 1)
  return {
    dec: d,
    frac: { num: board.num, den: board.den },
    label: board.label,
    decLocked: board.decLocked
  }
}

/**
 * Format odds for display.
 * - 'fraction'/'frac' (default): board-style fraction (Option A)
 * - 'decimal'/'dec': 2dp decimal odds
 */
export function formatOdds (dec, mode = 'fraction') {
  const d = Number(dec || 0)
  if (!Number.isFinite(d) || d <= 0) return '—'

  if (mode === 'decimal' || mode === 'dec') return d.toFixed(2)

  return lockBoardOdds(d).label
}
