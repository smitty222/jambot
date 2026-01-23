// src/handlers/pgaUnofficialCommands.js
import { postMessage } from '../libs/cometchat.js'
import { getTournamentLeaderboard } from '../utils/pgaTourUnofficial.js'

function code (s) { return `\`\`\`\n${s}\n\`\`\`` }
function pad (v, n) {
  const s = String(v ?? '')
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

export async function handlePgaUnofficial (payload, room) {
  const txt = (payload?.message ?? payload?.data?.text ?? '').trim()
  const parts = txt.split(/\s+/)

  // /pga leaderboard 004
  const sub = (parts[1] || '').toLowerCase()
  const tournamentId = parts[2]

  if (!sub || sub === 'help') {
    await postMessage({
      room,
      message: code([
        'PGA Tour (Unofficial)',
        '------------------------------',
        '/pga leaderboard <tournamentId>',
        '',
        'Example:',
        '/pga leaderboard 004'
      ].join('\n'))
    })
    return
  }

  if (sub !== 'leaderboard' || !tournamentId) {
    await postMessage({ room, message: 'Usage: /pga leaderboard <tournamentId>  (try /pga help)' })
    return
  }

  try {
    await postMessage({ room, message: '⛳ Fetching leaderboard…' })

    const data = await getTournamentLeaderboard(tournamentId)
    const lb = data?.leaderboard
    const players = lb?.players || []

    const out = []
    out.push(`Leaderboard — ${lb?.tournament_name || tournamentId}`)
    out.push('Pos  Player                     Score  Thru')
    out.push('----------------------------------------------')

    for (const p of players.slice(0, 20)) {
      const pos = p.position || ''
      const name = `${p?.player_bio?.first_name || ''} ${p?.player_bio?.last_name || ''}`.trim() || 'Unknown'
      const score = p.total_to_par ?? ''
      const thru = p.thru ?? ''

      out.push(`${pad(pos, 4)} ${pad(name, 25)} ${pad(score, 6)} ${thru}`)
    }

    await postMessage({ room, message: code(out.join('\n')) })
  } catch (err) {
    console.error('[pga] error', err)
    await postMessage({ room, message: `⛳ PGA error: ${err.message}` })
  }
}
