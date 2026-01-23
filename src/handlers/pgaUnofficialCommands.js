// src/handlers/pgaUnofficialCommand.js
import { postMessage } from '../libs/cometchat.js'
import { getTournamentLeaderboard } from '../utils/pgaTourUnofficial.js'

function code (s) {
  return `\`\`\`\n${s}\n\`\`\``
}

function pad (v, n) {
  const s = String(v ?? '')
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

export async function handlePgaUnofficial (ctx, payload) {
  const parts = payload.message.trim().split(/\s+/)

  // /pgaunofficial leaderboard 004
  const sub = parts[1]
  const tournamentId = parts[2]

  if (sub !== 'leaderboard' || !tournamentId) {
    await postMessage({
      room: ctx.room,
      message: code(
        [
          'PGA Tour (Unofficial)',
          '------------------------------',
          '/pga leaderboard <tournamentId>',
          '',
          'Example:',
          '/pga leaderboard 004'
        ].join('\n')
      )
    })
    return
  }

  try {
    const data = await getTournamentLeaderboard(tournamentId)
    const players = data.leaderboard.players

    const out = []
    out.push(`Leaderboard — ${data.leaderboard.tournament_name}`)
    out.push('Pos  Player                     Score  Thru')
    out.push('----------------------------------------------')

    for (const p of players.slice(0, 20)) {
      const pos = p.position || ''
      const name = `${p.player_bio.first_name} ${p.player_bio.last_name}`
      const score = p.total_to_par ?? ''
      const thru = p.thru ?? ''

      out.push(
        `${pad(pos, 4)} ${pad(name, 25)} ${pad(score, 6)} ${thru}`
      )
    }

    await postMessage({ room: ctx.room, message: code(out.join('\n')) })
  } catch (err) {
    await postMessage({
      room: ctx.room,
      message: `⛳ PGA error: ${err.message}`
    })
  }
}
