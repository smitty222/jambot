// tools/pga_prune_snapshots.js
//
// Deletes old PGA snapshot rows to keep DB size under control.
// Defaults:
// - keep last 30 days of snapshots
// - always keep "final" snapshots (optional)
//
// Usage:
//   node tools/pga_prune_snapshots.js
// Env:
//   PGA_SNAPSHOT_KEEP_DAYS=30
//   PGA_KEEP_FINALS=1   (default 1)

import '../src/database/initdb.js'
import db from '../src/database/db.js'

function daysToCutoffIso (days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

async function main () {
  const keepDays = Number(process.env.PGA_SNAPSHOT_KEEP_DAYS || 30)
  const keepFinals = String(process.env.PGA_KEEP_FINALS ?? '1') !== '0'
  const cutoff = daysToCutoffIso(keepDays)

  console.log('[pga][prune] keepDays=', keepDays, 'keepFinals=', keepFinals, 'cutoff=', cutoff)

  // Count before
  const before = db.prepare(`SELECT COUNT(*) AS n FROM pga_leaderboard_snapshots`).get()?.n || 0

  let res
  if (keepFinals) {
    res = db.prepare(`
      DELETE FROM pga_leaderboard_snapshots
      WHERE datetime(capturedAt) < datetime(?)
        AND COALESCE(kind, 'live') != 'final'
    `).run(cutoff)
  } else {
    res = db.prepare(`
      DELETE FROM pga_leaderboard_snapshots
      WHERE datetime(capturedAt) < datetime(?)
    `).run(cutoff)
  }

  const after = db.prepare(`SELECT COUNT(*) AS n FROM pga_leaderboard_snapshots`).get()?.n || 0

  // Optional: vacuum occasionally (not every run)
  // NOTE: VACUUM can be expensive; only do it if you want and not too frequently.
  // if (String(process.env.PGA_PRUNE_VACUUM || '') === '1') db.exec('VACUUM')

  console.log(`[pga][prune] deleted=${res.changes} before=${before} after=${after}`)
}

main().catch(err => {
  console.error('[pga][prune] failed:', err)
  process.exit(1)
})
