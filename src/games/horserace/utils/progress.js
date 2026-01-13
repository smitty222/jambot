// src/games/horserace/utils/progress.js
//
// CometChat-optimized progress bar renderers. These helpers construct
// monospace-safe race progress displays suitable for the Turntable chat
// environment.
//
// Key CometChat rules enforced here:
// - Always wrap progress output in triple-backtick code blocks.
// - Track uses ASCII-only characters and is fixed width: "|" + BAR_CELLS + "|".
// - Each line is fixed width: 2-digit lane + space + track + space + padded name + constant-width suffix.
// - No “jitter”: never conditionally add/remove characters that change line length.

const FILL = '='
const EMPTY = '-'
const MARKER = '>'

// Kept for compatibility with older style names; mapped to ASCII.
const SHADE_FULL = FILL
const SHADE_EMPTY = EMPTY

function clamp01 (x) {
  return Math.max(0, Math.min(1, x))
}

function truncName (s, max = 24) {
  s = String(s || '')
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// Simple fixed-width header: "|" + BAR_CELLS + "|"
export function header (barLength = 12) {
  return '|' + '-'.repeat(barLength) + '|'
}

// Legacy helper retained for callers that pass style='rail'.
// The old grouped separator header looked “uneven” in CometChat, so we render the clean header.
function headerRail (cells = 12) {
  return header(cells)
}

// Optional overlay tick marks (ASCII). We keep the helper, but we intentionally
// do NOT apply ticks to the default “solid/shaded” style because it hurts readability.
function overlayTicks (str, every, tickChar = '|') {
  if (!every || every <= 0) return str
  const arr = str.split('')
  for (let i = every; i < arr.length; i += every) {
    if (i >= 0 && i < arr.length) arr[i] = tickChar
  }
  return arr.join('')
}

// Canonical CometChat-friendly track: fixed width with exactly one marker.
function renderTrack (pct, len) {
  const clamped = clamp01(pct)
  const pos = Math.round(clamped * (len - 1))
  const out = Array.from({ length: len }, () => EMPTY)
  for (let i = 0; i < pos; i++) out[i] = FILL
  out[pos] = MARKER
  return out.join('')
}

function renderShade (pct, len, { ticksEvery = 0, tickChar = '|' } = {}) {
  // “solid/shaded”: always render the clean track.
  // Tick overlays made bars noisy and visually “uneven” in CometChat, so ignore them.
  void ticksEvery
  void tickChar
  return renderTrack(pct, len)
}

function renderFill (pct, len) {
  // Plain fill (no marker) for callers that explicitly want it.
  const filled = Math.round(clamp01(pct) * len)
  return SHADE_FULL.repeat(filled) + SHADE_EMPTY.repeat(Math.max(0, len - filled))
}

function renderMarker (pct, len) {
  // Keep style name, render as canonical track.
  return renderTrack(pct, len)
}

function renderSegmented (pct, len) {
  // Segmented bars looked uneven in CometChat. Keep style name, render canonical track.
  return renderTrack(pct, len)
}

function renderRail (pct, cells = 12) {
  // Rail-style internal separators caused visual noise; render canonical track.
  return '|' + renderTrack(pct, cells) + '|'
}

/**
 * Universal, monospace-safe progress renderer with names on the right.
 *
 * @param {Array<{index:number,name:string,progress:number}>} raceState
 * @param {{
 *   barLength?:number,
 *   finishDistance?:number,
 *   winnerIndex?:number,
 *   style?:'rail'|'solid'|'shaded'|'fill'|'marker'|'segmented',
 *   ticksEvery?:number,
 *   tickChar?:string,
 *   nameWidth?:number,
 *   cellWidth?:number,
 *   groupSize?:number
 * }} opts
 */
export function renderProgress (
  raceState,
  {
    barLength = 12,
    finishDistance = 1.0,
    winnerIndex = null,
    style = 'solid',
    ticksEvery = 0,
    tickChar = '|',
    nameWidth = 24,
    cellWidth = 1, // retained for compatibility
    groupSize = 3  // retained for compatibility
  } = {}
) {
  if (!raceState?.length) return ''

  const rows = raceState.map((h, i) => {
    const pct = clamp01((h.progress || 0) / (finishDistance || 1))

    let headLine
    let barStr

    if (style === 'rail') {
      // No grouped separators. Clean header + clean canonical track.
      headLine = headerRail(barLength, cellWidth, '|', groupSize)
      barStr = renderRail(pct, barLength)
    } else {
      headLine = header(barLength)
      const draw =
        style === 'solid' || style === 'shaded'
          ? (p) => renderShade(p, barLength, { ticksEvery, tickChar })
          : style === 'marker'
            ? (p) => renderMarker(p, barLength)
            : style === 'segmented'
              ? (p) => renderSegmented(p, barLength)
              : (p) => renderFill(p, barLength)

      barStr = '|' + draw(pct) + '|'
    }

    // Fixed 2-digit lane number: 01, 02, ...
    const lane = String(i + 1).padStart(2, '0')

    // Fixed-width name field (silk emoji may be included here by caller).
    const nameStr = truncName(h.name, nameWidth).padEnd(nameWidth, ' ')

    // Constant-width suffix: " WIN" or four spaces.
    const suffix = i === winnerIndex ? ' WIN' : '    '

    return { headLine, line: `${lane} ${barStr} ${nameStr}${suffix}` }
  })

  const headerLine = rows[0]?.headLine || header(barLength)
  const lines = [headerLine, ...rows.map(r => r.line)]

  // Always return inside a triple-backtick code block for CometChat alignment.
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
