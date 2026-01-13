// src/games/horserace/utils/progress.js
//
// CometChat-optimized progress bar renderers.  These helpers construct
// monospace-safe race progress displays suitable for the Turntable chat
// environment.  The layout deliberately avoids emoji-dependent widths by
// using only plain ASCII for the track itself, limiting the bar length
// to a compact value (~12 cells) to prevent line wrapping on mobile.  Each
// rendered line has a fixed width consisting of a two‑digit lane number,
// a track surrounded by pipes, a padded/truncated name, and a constant
// winner suffix.  The entire output is wrapped in triple backticks to
// force the chat client to render it as a code block.

// ASCII characters used for the progress bar.  Using dashes and dots
// ensures consistent width across platforms and avoids relying on
// variable‑width emoji.
const SHADE_FULL = '-'
const SHADE_EMPTY = '.'
const FILL = '-'
const EMPTY = '.'
const MARKER = '>'

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

/**
 * Truncate a horse name to at most `max` characters.  If truncated,
 * append an ellipsis.  Conversion to string protects against null/undefined.
 *
 * @param {string} s
 * @param {number} max
 */
function truncName(s, max = 24) {
  s = String(s || '')
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

// Simple header for non‑rail styles.  Generates the outer pipes and a run
// of dashes equal to the bar length.  This is deliberately compact and
// monospace‑friendly.
export function header(barLength = 12) {
  return '|' + '-'.repeat(barLength) + '|'
}

// Header that matches the rail layout visually.  Group separators appear
// every `groupSize` cells to reduce visual noise.  Each cell within a
// group may be wider than one character via `cellWidth`.
function headerRail(cells = 12, cellWidth = 1, sep = '|', groupSize = 3) {
  const cell = '-'.repeat(cellWidth)
  const parts = []
  for (let i = 0; i < cells; i++) {
    parts.push(cell)
    if ((i + 1) % groupSize === 0 && i < cells - 1) parts.push(sep)
  }
  return sep + parts.join('') + sep
}

// Overlay subtle tick marks inside shaded or solid bars.  Every `every`
// characters are replaced with the provided `tickChar`.  If `every` is 0
// or negative, the original string is returned unchanged.
function overlayTicks(str, every, tickChar = '|') {
  if (!every || every <= 0) return str
  const arr = str.split('')
  for (let i = every; i < arr.length; i += every) {
    if (i >= 0 && i < arr.length) arr[i] = tickChar
  }
  return arr.join('')
}

function renderShade(pct, len, { ticksEvery = 0, tickChar = '|' } = {}) {
  const filled = Math.round(clamp01(pct) * len)
  const base = SHADE_FULL.repeat(filled) + SHADE_EMPTY.repeat(Math.max(0, len - filled))
  return overlayTicks(base, ticksEvery, tickChar)
}

function renderFill(pct, len) {
  const filled = Math.round(clamp01(pct) * len)
  return FILL.repeat(filled) + EMPTY.repeat(Math.max(0, len - filled))
}

function renderMarker(pct, len) {
  const pos = Math.round(clamp01(pct) * (len - 1))
  const out = EMPTY.repeat(len).split('')
  out[pos] = MARKER
  return out.join('')
}

function renderSegmented(pct, len) {
  // Divide the bar into four legs with ':' separators.  This creates a
  // segmented look while keeping within the overall bar length.  The
  // colon characters are ASCII and safe for monospace rendering.
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
    if (i < legs - 1) bar += ':'
  }
  const pad = Math.max(0, len - (segLen * legs + (legs - 1)))
  return bar + EMPTY.repeat(pad)
}

// Rail renderer — grouped pipes:  |---|--.|...
function renderRail(pct, cells = 12, cellWidth = 1, sep = '|', groupSize = 3) {
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
 * Universal, monospace‑safe progress renderer with names on the right.  The
 * resulting string is wrapped in triple backticks so that CometChat will
 * render it as a code block.  Each line has a fixed width: a two‑digit
 * lane number (zero‑padded), a bar of exactly `barLength` characters
 * enclosed by pipes, a padded/truncated name, and a winner suffix of
 * constant width (" WIN" for winners, four spaces otherwise).  This
 * prevents any jitter in the display when the race updates.
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
export function renderProgress(
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

  // Build each row with consistent formatting.  The bar is rendered
  // according to the chosen style.  Names are truncated then padded to
  // `nameWidth` to ensure alignment.  A constant‑width winner suffix is
  // appended after the name.  We also record the header line so we can
  // reuse the same one for every row.
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
          ? (p) => renderShade(p, barLength, { ticksEvery, tickChar })
          : style === 'shaded'
            ? (p) => renderShade(p, barLength, { ticksEvery, tickChar })
            : style === 'marker'
              ? (p) => renderMarker(p, barLength)
              : style === 'segmented'
                ? (p) => renderSegmented(p, barLength)
                : (p) => renderFill(p, barLength)
      barStr = '|' + draw(pct) + '|'
    }

    // Two‑digit lane number, zero‑padded.  E.g. 01, 02, 10.
    const idx = String(i + 1).padStart(2, '0')
    // Truncate then pad name to fixed width.  A silk emoji (if present)
    // remains part of the string but still counts towards the length.
    const nameStr = truncName(h.name, nameWidth).padEnd(nameWidth, ' ')
    // Constant‑width winner suffix.  Append " WIN" if this row is the
    // winner; otherwise append four spaces.
    const suffix = i === winnerIndex ? ' WIN' : '    '
    const line = `${idx} ${barStr} ${nameStr}${suffix}`
    return { headLine, line }
  })

  const headerLine = rows[0]?.headLine || header(barLength)
  const lines = [headerLine, ...rows.map((r) => r.line)]
  // Wrap everything in triple backticks.  Ensure a trailing newline
  // before the closing backticks for cleaner formatting.
  return '```\n' + lines.join('\n') + '\n```'
}

/**
 * CometChat‑friendly racecard with aligned columns.  This function
 * displays the list of horses and their odds in a monospace table.
 * Only minor tweaks (if any) are needed to meet the Turntable display
 * requirements.
 *
 * @param {Array<{name:string,odds:string}>} entries
 * @param {{ nameWidth?:number, oddsWidth?:number }} opts
 */
export function renderRacecard(entries, { nameWidth = 20, oddsWidth = 6 } = {}) {
  const pad = (s, n) => String(s || '').padEnd(n, ' ')
  const headerLine = `#  ${pad('Horse', nameWidth)}  ${pad('Odds', oddsWidth)}`
  const line = '-'.repeat(headerLine.length)
  const rows = entries.map((e, i) => {
    // Two‑digit lane numbers for consistency.  Note: racecard lane numbers
    // may exceed two digits if there are >99 entrants but this is unlikely.
    const num = String(i + 1).padStart(2, '0')
    return `${num} ${pad(e.name, nameWidth)}  ${pad(e.odds, oddsWidth)}`
  })
  return [headerLine, line, ...rows].join('\n')
}