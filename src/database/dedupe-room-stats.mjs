#!/usr/bin/env node
// This script performs a one-time deduplication of the room_stats table.
// It backfills normalised fields (normTrack, normArtist, normSongKey)
// using the same logic as dbroomstatsmanager.js and merges duplicate
// rows that share a common normalised key or fuzzy match. Run this
// script after deploying the new normalisation logic to clean up
// historical data.

import db from './db.js'
import { buildNormKey, isFuzzyMatch } from './normalizeSong.js'

// Helper to ensure the new normalisation columns exist. While
// initdb.js should create these, running this script independently
// benefits from a defensive check.
function ensureColumns () {
  const cols = db.prepare('PRAGMA table_info(room_stats)').all().map(c => c.name)
  const actions = []
  if (!cols.includes('normTrack')) actions.push('ALTER TABLE room_stats ADD COLUMN normTrack TEXT')
  if (!cols.includes('normArtist')) actions.push('ALTER TABLE room_stats ADD COLUMN normArtist TEXT')
  if (!cols.includes('normSongKey')) actions.push('ALTER TABLE room_stats ADD COLUMN normSongKey TEXT')
  actions.forEach(sql => db.exec(sql))
}

// Populate normTrack/normArtist/normSongKey for each row. Only update
// rows where these fields are null or empty to avoid clobbering
// previously deduplicated data. Returns the number of rows updated.
function backfillNorms () {
  const rows = db.prepare('SELECT id, trackName, artistName, normTrack, normArtist, normSongKey FROM room_stats').all()
  const update = db.prepare(
    'UPDATE room_stats SET normTrack = ?, normArtist = ?, normSongKey = ? WHERE id = ?'
  )
  let count = 0
  const tx = db.transaction(() => {
    for (const row of rows) {
      const { normArtist, normTrack, normKey } = buildNormKey(row.trackName, row.artistName)
      if (!row.normTrack || !row.normArtist || !row.normSongKey) {
        update.run(normTrack, normArtist, normKey, row.id)
        count++
      }
    }
  })
  tx()
  return count
}

// Merge a group of duplicate rows. The group is an array of IDs. The
// first ID in the list is kept; all others are deleted after their
// counters are merged into the first. Summed fields include
// playCount, likes, dislikes and stars. The most recent lastPlayed
// value is preserved.
function mergeGroup (ids) {
  if (ids.length <= 1) return
  const rows = db.prepare(`SELECT * FROM room_stats WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
  // Sort by id ascending to choose the oldest row as canonical
  rows.sort((a, b) => a.id - b.id)
  const keep = rows[0]
  const drop = rows.slice(1)
  // Aggregate counters
  const sums = drop.reduce((acc, r) => {
    acc.playCount += r.playCount || 0
    acc.likes += r.likes || 0
    acc.dislikes += r.dislikes || 0
    acc.stars += r.stars || 0
    // Use the most recent lastPlayed
    const times = [acc.lastPlayed, r.lastPlayed].filter(Boolean).sort()
    acc.lastPlayed = times[times.length - 1] || acc.lastPlayed
    return acc
  }, {
    playCount: keep.playCount || 0,
    likes: keep.likes || 0,
    dislikes: keep.dislikes || 0,
    stars: keep.stars || 0,
    lastPlayed: keep.lastPlayed
  })
  const update = db.prepare('UPDATE room_stats SET playCount = ?, likes = ?, dislikes = ?, stars = ?, lastPlayed = ? WHERE id = ?')
  const del = db.prepare('DELETE FROM room_stats WHERE id = ?')
  const tx = db.transaction(() => {
    update.run(sums.playCount, sums.likes, sums.dislikes, sums.stars, sums.lastPlayed, keep.id)
    for (const r of drop) del.run(r.id)
  })
  tx()
  console.log(`[dedupe] Merged ${drop.length} duplicate(s) into row ${keep.id}`)
}

// Perform exact deduplication on normSongKey. For each key with more
// than one row, merge them.
function exactPass () {
  const groups = db.prepare(`
    SELECT normSongKey AS key, GROUP_CONCAT(id) AS ids, COUNT(*) AS c
    FROM room_stats
    WHERE normSongKey IS NOT NULL AND normSongKey <> ''
    GROUP BY normSongKey
    HAVING c > 1
  `).all()
  for (const g of groups) {
    const ids = g.ids.split(',').map(x => Number(x))
    mergeGroup(ids)
  }
}

// Perform fuzzy deduplication on clusters of the same artist. We use
// isFuzzyMatch from normalizeSong.js to group near-duplicate titles.
function fuzzyPass () {
  // Get distinct normalised artists
  const artists = db.prepare('SELECT DISTINCT normArtist FROM room_stats WHERE normArtist IS NOT NULL AND normArtist <> \'\'').all()
  for (const a of artists) {
    const list = db.prepare('SELECT id, trackName, artistName FROM room_stats WHERE normArtist = ?').all(a.normArtist)
    const used = new Set()
    for (let i = 0; i < list.length; i++) {
      if (used.has(list[i].id)) continue
      const cluster = [list[i]]
      for (let j = i + 1; j < list.length; j++) {
        if (used.has(list[j].id)) continue
        if (isFuzzyMatch(list[i].trackName, list[j].trackName, list[i].artistName, list[j].artistName)) {
          cluster.push(list[j])
          used.add(list[j].id)
        }
      }
      const ids = cluster.map(r => r.id)
      if (ids.length > 1) mergeGroup(ids)
    }
  }
}

function run () {
  ensureColumns()
  const updated = backfillNorms()
  console.log(`[dedupe] Backfilled ${updated} rows with normalised fields`)
  exactPass()
  fuzzyPass()
  console.log('[dedupe] Complete')
}

run()
