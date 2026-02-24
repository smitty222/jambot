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

export function renderRaceProgress (rows, {
  title = 'RACE',
  nameWidth = 18
} = {}) {
  const W_POS = 2
  const W_NAME = nameWidth
  const W_GAP = 7 // "+0.00" / "DNF"

  const header =
    `${padL('P', W_POS)} ` +
    `${padR('Car', W_NAME)} ` +
    `${padR('Gap', W_GAP)}`

  const line = '-'.repeat(header.length)

  // Format gap:
  // - If a number: "+0.00"
  // - If string already: use it
  // - Leader: "+0.00"
  function fmtGap (g, dnf = false) {
    if (dnf) return 'DNF'
    if (g == null || g === '') return '+0.00'

    if (typeof g === 'number' && Number.isFinite(g)) {
      const sign = g >= 0 ? '+' : '-'
      return `${sign}${Math.abs(g).toFixed(2)}`
    }

    // If it's a string like "+0.1", normalize to 2 decimals when possible
    const s = String(g).trim()
    const m = s.match(/^([+-])?\s*(\d+(?:\.\d+)?)$/)
    if (m) {
      const sign = m[1] || '+'
      const num = Number(m[2])
      if (Number.isFinite(num)) return `${sign}${num.toFixed(2)}`
    }

    return s.slice(0, W_GAP)
  }

  const body = rows.map((r, i) => {
    const pos = padL(String(i + 1), W_POS)
    const name = clamp(r.label, W_NAME)
    const gap = padL(fmtGap(r.gap, !!r.dnf), W_GAP)
    return `${pos} ${name} ${gap}`.trimEnd()
  })

  return '```\n' + [title, header, line, ...body].join('\n') + '\n```'
}

export function fmtMoney (n) {
  const x = Math.floor(Number(n || 0))
  return '$' + x.toLocaleString('en-US')
}