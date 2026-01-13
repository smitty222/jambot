// src/games/horserace/utils/progress.js
//
// CometChat-optimized progress bar renderers.
// Fixed-width, ASCII-only, monospace-safe for Turntable chat.
//
// Key rules enforced:
// - Always wrapped in triple-backtick code blocks
// - Fixed-width bars and rows (no jitter)
// - ASCII-only inside bars
// - Marker replaces cells, never changes line length

const FILL = '='
const EMPTY = '-'
const MARKER = 'o>'           // 2-char horse marker
const BAR_LENGTH = 14         // ⬅️ updated length

function clamp01 (x) {
  return Math.max(0, Math.min(1, x))
}

function truncName (s, max = 24) {
  s = String(s || '')
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// Header: "|" + BAR_LENGTH + "|"
export function header (barLength = BAR_LENGTH) {
  return '|' + '-'.repeat(barLength) + '|'
}

// Canonical fixed-width track renderer
function renderTrack (pct, len) {
  const clamped = clamp01(pct)

  // Marker occupies 2 chars, so last valid start is len - 2
  const maxPos = len - MARKER.length
  const pos = Math.round(clamped * maxPos)

  const out = Array.from({ length: len }, () => EMPTY)

  // Fill behind the horse
  for (let i = 0; i < pos; i++) out[i] = FILL

  // Insert marker safely
  out[pos] = MARKER[0]
  out[pos + 1] = MARKER[1]

  return out.join('')
}

function renderFill (pct, len) {
  const filled = Math.round(clamp01(pct) * len)
  return FILL.repeat(filled) + EMPTY.repeat(Math.max(0, len - filled))
}

/**
 * Universal, monospace-safe progress renderer
 *
 * @param {Array<{index:number,name:string,progress:number}>} raceState
 * @param {{
 *   barLength?:number,
 *   finishDistance?:number,
 *   winnerIndex?:number,
 *   style?:'solid'|'fill',
 *   nameWidth?:number
 * }} opts
 */
export function renderProgress (
  raceState,
  {
    barLength = BAR_LENGTH,
    finishDistance = 1.0,
    winnerIndex = null,
    style = 'solid',
    nameWidth = 24
  } = {}
) {
  if (!raceState?.length) return ''

  const rows = raceState.map((h, i) => {
    const pct = clamp01((h.progress || 0) / (finishDistance || 1))

    const barCore =
      style === 'fill'
        ? renderFill(pct, barLength)
        : renderTrack(pct, barLength)

    const barStr = '|' + barCore + '|'

    const lane = String(i + 1).padStart(2, '0')
    const nameStr = truncName(h.name, nameWidth).padEnd(nameWidth, ' ')
    const suffix = i === winnerIndex ? ' WIN' : '    '

    return `${lane} ${barStr} ${nameStr}${suffix}`
  })

  const lines = [header(barLength), ...rows]

  return '```\n' + lines.join('\n') + '\n```'
}

/**
 * CometChat-friendly racecard with aligned columns.
 */
export function renderRacecard (entries, { nameWidth = 20, oddsWidth = 6 } = {}) {
  const pad = (s, n) => String(s || '').padEnd(n, ' ')
  const headerLine = `#  ${pad('Horse', nameWidth)}  ${pad('Odds', oddsWidth)}`
  const line = '-'.repeat(headerLine.length)
  const rows = entries.map((e, i) => {
    const num = String(i + 1).padStart(2, '0')
    return `${num} ${pad(e.name, nameWidth)}  ${pad(e.odds, oddsWidth)}`
  })
  return [headerLine, line, ...rows].join('\n')
}
