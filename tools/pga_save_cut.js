// tools/pga_save_cut.js
import '../src/database/initdb.js'
import { fetchEspnPgaLeaderboardRaw, normalizeEspnPgaRows } from '../src/utils/API.js'
import { upsertPgaEvent, insertPgaSnapshot, upsertPgaResults } from '../src/database/dbpga.js'

async function main () {
  const raw = await fetchEspnPgaLeaderboardRaw()
  const norm = normalizeEspnPgaRows(raw)

  if (!norm.eventId) throw new Error('No eventId in ESPN response')

  upsertPgaEvent({
    eventId: norm.eventId,
    eventName: norm.eventName,
    status: norm.eventStatus,
    source: 'espn'
  })

  // Save a raw snapshot labeled "cut"
  insertPgaSnapshot({
    eventId: norm.eventId,
    eventName: norm.eventName,
    status: norm.eventStatus,
    kind: 'cut',
    json: raw
  })

  // Upsert results as they stand (post-cut snapshot)
  upsertPgaResults(norm.eventId, norm.rows)

  console.log(`[pga] saved CUT snapshot + results for ${norm.eventName} (${norm.eventId}) rows=${norm.rows.length}`)
}

main().catch(err => {
  console.error('[pga] save_cut failed:', err)
  process.exit(1)
})
