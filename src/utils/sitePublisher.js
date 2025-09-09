import db from '../database/db.js'

export function buildSnapshot() {
  // 👇 Customize the command groups to show only main entry points
  const commands = [
    { group: 'Core',  items: ['/commands','/songreview <1-10>','/albumreview <1-10>','/rating','/topsongs','/topalbums'] },
    { group: 'Games', items: ['/games','/blackjack','/craps','/roulette'] },
    { group: 'DJ',    items: ['/tip <amount>','/djbeers','/queue','/autodj on|off'] },
    { group: 'Fun',   items: ['/gifs','/props','/allen'] },
    { group: 'Mods',  items: ['/mod','/theme <name>'] }
  ]

  const topSongs = db.prepare(`
    SELECT trackName, artistName, averageReview AS avg, playCount
    FROM room_stats
    WHERE averageReview IS NOT NULL
    ORDER BY averageReview DESC, playCount DESC
    LIMIT 20
  `).all()

  const topAlbums = db.prepare(`
    SELECT albumName, artistName, averageReview AS avg, trackCount
    FROM album_stats
    WHERE averageReview IS NOT NULL
    ORDER BY averageReview DESC, trackCount DESC
    LIMIT 20
  `).all()

  const totals = {
    songsTracked:  db.prepare('SELECT COUNT(*) AS c FROM room_stats').get().c,
    albumsTracked: db.prepare('SELECT COUNT(*) AS c FROM album_stats').get().c,
    songReviews:   db.prepare('SELECT COUNT(*) AS c FROM song_reviews').get().c,
    albumReviews:  db.prepare('SELECT COUNT(*) AS c FROM album_reviews').get().c,
    updatedAt:     new Date().toISOString()
  }

  return { commands, stats: { totals, topSongs, topAlbums } }
}

export async function publishSiteSnapshot() {
  const payload = buildSnapshot()
  const res = await fetch(process.env.SITE_PUBLISH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${process.env.SITE_PUBLISH_TOKEN}`
    },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('publish failed: ' + await res.text())
}
