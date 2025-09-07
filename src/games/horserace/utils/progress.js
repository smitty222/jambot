// src/games/horserace/utils/progress.js
// CometChat-optimized renderers with names on the RIGHT.
// New: 'solid' style — compact solid rail with subtle ':' ticks.

const SHADE_FULL = '█'
const SHADE_EMPTY = '░'
const FILL = '='
const EMPTY = '.'
const MARKER = '●'

function clamp01 (x) { return Math.max(0, Math.min(1, x)) }
function truncName (s, max = 24) { s = String(s || ''); return s.length <= max ? s : s.slice(0, max - 1) + '…' }

// Simple header for non-rail styles
export function header (barLength = 12) {
  return '|' + '-'.repeat(barLength) + '|'
}

// Header that matches the rail layout visually.
// Group separators appear every `groupSize` cells to reduce visual noise.
function headerRail (cells = 12, cellWidth = 1, sep = '|', groupSize = 3) {
  const cell = '-'.repeat(cellWidth)
  const parts = []
  for (let i = 0; i < cells; i++) {
    parts.push(cell)
    if ((i + 1) % groupSize === 0 && i < cells - 1) parts.push(sep)
  }
  return sep + parts.join('') + sep
}

// Optional subtle tick marks inside shaded/fill bars
function overlayTicks (str, every, tickChar = '|') {
  if (!every || every <= 0) return str
  const arr = str.split('')
  for (let i = every; i < arr.length; i += every) {
    if (i >= 0 && i < arr.length) arr[i] = tickChar
  }
  return arr.join('')
}

function renderShade (pct, len, { ticksEvery = 0, tickChar = '|' } = {}) {
  const filled = Math.round(clamp01(pct) * len)
  const base = SHADE_FULL.repeat(filled) + SHADE_EMPTY.repeat(Math.max(0, len - filled))
  return overlayTicks(base, ticksEvery, tickChar)
}

function renderFill (pct, len) {
  const filled = Math.round(clamp01(pct) * len)
  return FILL.repeat(filled) + EMPTY.repeat(Math.max(0, len - filled))
}

function renderMarker (pct, len) {
  const pos = Math.round(clamp01(pct) * (len - 1))
  const out = EMPTY.repeat(len).split('')
  out[pos] = MARKER
  return out.join('')
}

function renderSegmented (pct, len) {
  const legs = 4
  const segLen = Math.max(2, Math.floor(len / legs))
  const total = segLen * legs
  const p = clamp01(pct) * total
  let bar = ''
  for (let i = 0; i < legs; i++) {
    const start = i * segLen
    const partial = (p > start && p < start + segLen)
      ? Math.floor(p - start)
      : Math.max(0, Math.min(segLen, Math.floor(p - start)))
    bar += FILL.repeat(partial) + EMPTY.repeat(segLen - partial)
    if (i < legs - 1) bar += ':' // separator
  }
  const pad = Math.max(0, len - (segLen * legs + (legs - 1)))
  return bar + EMPTY.repeat(pad)
}

// RAIL renderer — grouped pipes:  |███|██░|…|
function renderRail (pct, cells = 12, cellWidth = 1, sep = '|', groupSize = 3) {
  const filledCells = Math.round(clamp01(pct) * cells)
  const pieces = []
  for (let i = 0; i < cells; i++) {
    const cellChar = (i < filledCells ? SHADE_FULL : SHADE_EMPTY)
    pieces.push(cellChar.repeat(cellWidth))
    if ((i + 1) % groupSize === 0 && i < cells - 1) pieces.push(sep)
  }
  return sep + pieces.join('') + sep
}

/**
 * Universal, monospace-safe progress renderer with names on the right.
 *
 * @param {Array<{index:number,name:string,progress:number}>} raceState
 * @param {{
 *   barLength?:number,             // for 'rail' = cell count; others = chars
 *   finishDistance?:number,
 *   winnerIndex?:number,
 *   style?:'rail'|'solid'|'shaded'|'fill'|'marker'|'segmented',
 *   ticksEvery?:number,            // shaded/solid only
 *   tickChar?:string,              // shaded/solid only
 *   nameWidth?:number,
 *   cellWidth?:number,             // rail only (default 1)
 *   groupSize?:number              // rail only (default 3)
 * }} opts
 */
export function renderProgress (
  raceState,
  {
    barLength = 12,
    finishDistance = 1.0,
    winnerIndex = null,
    style = 'rail',
    ticksEvery = 0,
    tickChar = '|',
    nameWidth = 24,
    cellWidth = 1,
    groupSize = 3
  } = {}
) {
  if (!raceState?.length) return ''

  const rows = raceState.map((h, i) => {
    const pct = clamp01((h.progress || 0) / (finishDistance || 1))

    let headLine
    let barStr
    if (style === 'rail') {
      headLine = headerRail(barLength, cellWidth, '|', groupSize)
      barStr = renderRail(pct, barLength, cellWidth, '|', groupSize)
    } else {
      headLine = header(barLength)
      const draw =
        style === 'solid'
          ? (p) => renderShade(p, barLength, { ticksEvery, tickChar }) // solid: compact rail with ':' ticks
          : style === 'shaded'
            ? (p) => renderShade(p, barLength, { ticksEvery, tickChar })
            : style === 'marker'
              ? (p) => renderMarker(p, barLength)
              : style === 'segmented'
                ? (p) => renderSegmented(p, barLength)
                : (p) => renderFill(p, barLength)
      barStr = '|' + draw(pct) + '|'
    }

    const idx = String(i + 1).padStart(2, ' ')
    const crown = (i === winnerIndex) ? ' 🏆' : ''
    const line = `${idx} ${barStr} ${truncName(h.name, nameWidth)}${crown}`

    return { headLine, line }
  })

  const headerLine = rows[0]?.headLine || header(barLength)
  return [headerLine, ...rows.map(r => r.line)].join('\n')
}

/**
 * CometChat-friendly racecard with aligned columns.
 */
export function renderRacecard (entries, { nameWidth = 20, oddsWidth = 6 } = {}) {
  const pad = (s, n) => String(s || '').padEnd(n, ' ')
  const header = `#  ${pad('Horse', nameWidth)}  ${pad('Odds', oddsWidth)}`
  const line = '-'.repeat(header.length)
  const rows = entries.map((e, i) => {
    const num = String(i + 1).padStart(2, ' ')
    return `${num} ${pad(e.name, nameWidth)}  ${pad(e.odds, oddsWidth)}`
  })
  return [header, line, ...rows].join('\n')
}
