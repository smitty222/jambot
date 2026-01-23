// tools/pga_save_final.js
import '../src/database/initdb.js'
import { fetchEspnPgaLeaderboardRaw, normalizeEspnPgaRows } from '../src/utils/API.js'
import { upsertPgaEvent, insertPgaSnapshot, upsertPgaResults } from '../src/database/dbpga.js'

async function main () {
  const raw = await fetchEspnPgaLeaderboardRaw()
  const norm = normalizeEspnPgaRows(raw)

  if (!norm.eventId) throw new Error('No eventId in ESPN response')

  // Always upsert results, but only finalize if eventCompleted
  upsertPgaEvent({
    eventId: norm.eventId,
    eventName: norm.eventName,
    status: norm.eventStatus,
    source: 'espn',
    finalizedAt: norm.eventCompleted ? new Date().toISOString() : null
  })

  insertPgaSnapshot({
    eventId: norm.eventId,
    eventName: norm.eventName,
    status: norm.eventStatus,
    kind: norm.eventCompleted ? 'final' : 'live',
    json: raw
  })

  upsertPgaResults(norm.eventId, norm.rows)

  console.log(`[pga] saved ${norm.eventCompleted ? 'FINAL' : 'LIVE'} snapshot + results for ${norm.eventName} (${norm.eventId}) rows=${norm.rows.length}`)
}

main().catch(err => {
  console.error('[pga] save_final failed:', err)
  process.exit(1)
})
