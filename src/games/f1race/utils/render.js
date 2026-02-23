// src/games/f1race/utils/render.js

function padR (s, n) { return String(s ?? '').padEnd(n, ' ') }
function padL (s, n) { return String(s ?? '').padStart(n, ' ') }
function clamp (s, n) {
  s = String(s ?? '')
  if (s.length <= n) return padR(s, n)
  return padR(s.slice(0, Math.max(0, n - 1)) + '…', n)
}

export function renderGrid (rows, { title = 'GRID', nameWidth = 18, showOdds = true } = {}) {
  const W_POS = 2
  const W_NAME = nameWidth
  const W_TEAM = 10
  const W_ODDS = showOdds ? 5 : 0
  const W_TIRE = 5
  const W_MODE = 6

  const header =
    `${padL('P', W_POS)} ` +
    `${padR('Car', W_NAME)} ` +
    `${padR('Team', W_TEAM)} ` +
    (showOdds ? `${padR('Odds', W_ODDS)} ` : '') +
    `${padR('Tire', W_TIRE)} ` +
    `${padR('Mode', W_MODE)}`

  const line = '-'.repeat(header.length)

  const body = rows.map((r, i) => {
    const pos = padL(String(i + 1), W_POS)
    const name = clamp(r.label, W_NAME)
    const team = clamp(r.teamLabel || '—', W_TEAM)
    const odds = showOdds ? padL((r.odds ?? '—'), W_ODDS) + ' ' : ''
    const tire = padR(String(r.tire || 'MED').toUpperCase(), W_TIRE)
    const mode = padR(String(r.mode || 'NORM').toUpperCase(), W_MODE)
    return `${pos} ${name} ${team} ${odds}${tire} ${mode}`
  })

  return '```\n' + [title, header, line, ...body].join('\n') + '\n```'
}

export function renderRaceProgress (rows, { title = 'RACE', barCells = 14, nameWidth = 18 } = {}) {
  const W_POS = 2
  const W_NAME = nameWidth
  const W_GAP = 6

  const header =
    `${padL('P', W_POS)} ` +
    `${padR('Car', W_NAME)} ` +
    `${padR('Track', barCells)} ` +
    `${padR('Gap', W_GAP)}`

  const line = '-'.repeat(header.length)

  const mkBar = (pct, dnf = false) => {
    if (dnf) return 'DNF'.padEnd(barCells, ' ')
    const p = Math.max(0, Math.min(1, Number(pct || 0)))
    const filled = Math.round(p * barCells)
    return '▰'.repeat(filled) + '▱'.repeat(Math.max(0, barCells - filled))
  }

  const body = rows.map((r, i) => {
    const pos = padL(String(i + 1), W_POS)
    const name = clamp(r.label, W_NAME)
    const bar = padR(mkBar(r.progress01, !!r.dnf), barCells)
    const gap = padL(r.gap || '+0.0', W_GAP)
    return `${pos} ${name} ${bar} ${gap}`
  })

  return '```\n' + [title, header, line, ...body].join('\n') + '\n```'
}

export function fmtMoney (n) {
  const x = Math.floor(Number(n || 0))
  return '$' + x.toLocaleString('en-US')
}