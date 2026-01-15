// src/games/horserace/utils/progress.js

const FILL = '='
const EMPTY = '-'
const MARKER = 'o>'           // 2-char horse marker
const BAR_LENGTH = 14         // default bar length

function clamp01 (x) {
  return Math.max(0, Math.min(1, x))
}

function truncName (s, max = 24) {
  s = String(s || '')
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

export function wrapCode (s) {
  const body = String(s || '').trimEnd()
  return '```\n' + body + '\n```'
}

// Header: "|" + BAR_LENGTH + "|"
export function header (barLength = BAR_LENGTH) {
  return '|' + '-'.repeat(barLength) + '|'
}

function isMarkerPos (pos, i) {
  return i === pos || i === pos + 1
}

// Canonical fixed-width track renderer (solid rail with horse marker)
function renderTrack (pct, len, { ticksEvery = 0, tickChar = ':' } = {}) {
  const clamped = clamp01(pct)

  // Marker occupies 2 chars, so last valid start is len - 2
  const maxPos = Math.max(0, len - MARKER.length)
  const pos = Math.round(clamped * maxPos)

  const out = Array.from({ length: len }, () => EMPTY)

  // Fill behind the horse
  for (let i = 0; i < pos; i++) out[i] = FILL

  // Add tick marks in empty space (only if they won't overwrite fill/marker)
  if (ticksEvery && ticksEvery > 0) {
    for (let i = 0; i < len; i++) {
      if (isMarkerPos(pos, i)) continue
      if (out[i] !== EMPTY) continue
      if (i > 0 && (i % ticksEvery === 0)) out[i] = tickChar
    }
  }

  // Insert marker safely
  out[pos] = MARKER[0]
  if (pos + 1 < len) out[pos + 1] = MARKER[1]

  return out.join('')
}

function renderFill (pct, len) {
  const filled = Math.round(clamp01(pct) * len)
  return FILL.repeat(filled) + EMPTY.repeat(Math.max(0, len - filled))
}

/**
 * Universal, monospace-safe progress renderer.
 *
 * @param {Array<{index:number,name:string,progress:number}>} raceState
 * @param {{
 *   barLength?:number,
 *   finishDistance?:number,
 *   winnerIndex?:number,
 *   style?:'solid'|'fill',
 *   nameWidth?:number,
 *   ticksEvery?:number,
 *   tickChar?:string,
 *   wrap?:boolean
 * }} opts
 * @returns {string} Progress display (optionally wrapped in ``` code blocks)
 */
export function renderProgress (
  raceState,
  {
    barLength = BAR_LENGTH,
    finishDistance = 1.0,
    winnerIndex = null,
    style = 'solid',
    nameWidth = 24,
    ticksEvery = 0,
    tickChar = ':',
    wrap = false
  } = {}
) {
  if (!raceState?.length) return ''

  const rows = raceState.map((h, i) => {
    const pct = clamp01((h.progress || 0) / (finishDistance || 1))

    const barCore =
      style === 'fill'
        ? renderFill(pct, barLength)
        : renderTrack(pct, barLength, { ticksEvery, tickChar })

    const barStr = '|' + barCore + '|'

    const lane = String(i + 1).padStart(2, '0')
    const nameStr = truncName(h.name, nameWidth).padEnd(nameWidth, ' ')
    const suffix = i === winnerIndex ? ' WIN' : '    '

    return `${lane} ${barStr} ${nameStr}${suffix}`
  })

  // NOTE: we do not prepend a separate header line here to avoid
  // extra "|------|" lines. The rows already include their own bars.
  const text = rows.join('\n')
  return wrap ? wrapCode(text) : text
}

/**
 * CometChat-friendly racecard with aligned columns.
 * Returns plain text (caller can wrap).
 */
export function renderRacecard (entries, { nameWidth = 20, oddsWidth = 7 } = {}) {
  const pad = (s, n) => String(s || '').padEnd(n, ' ')
  const headerLine = `#  ${pad('Horse', nameWidth)}  ${pad('Odds', oddsWidth)}`
  const line = '-'.repeat(headerLine.length)
  const rows = entries.map((e, i) => {
    const num = String(i + 1).padStart(2, '0')
    return `${num} ${pad(e.name, nameWidth)}  ${pad(e.odds, oddsWidth)}`
  })
  return [headerLine, line, ...rows].join('\n')
}
