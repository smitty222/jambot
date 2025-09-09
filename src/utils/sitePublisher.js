// src/utils/sitePublisher.js
// If your Node is < 18, uncomment the next line:
// import fetch from 'node-fetch'
import db from '../database/db.js'

/**
 * Any item may be:
 *   - a string (public), e.g. '/song'
 *   - an object: { text: '/secret', private: true }  // goes only to commands_mod
 *
 * Any group may include: { modOnly: true }           // whole group only in commands_mod
 */
const MASTER_GROUPS = [
  {
    group: 'Essentials & DJ',
    items: [
      '/theme',
      { text: '/settheme <name>', private: true },   // mark private if you want
      { text: '/removetheme', private: true },
      '/room <style>',
      '/games',
      '/q', '/q+', '/q-',
      '/escortme', '/dive',
      '/djbeer', '/djbeers', '/getdjdrunk',
      '/like', '/dislike', '/star', '/unstar',
      { text: '/addDJ', private: true },
      { text: '/removeDJ', private: true },
      '/jump'
    ]
  },
  {
    group: 'Music & Stats',
    items: [
      '/song', '/stats', '/score', '/album', '/art',
      '/mostplayed', '/topliked',
      '/topsongs', '/mytopsongs',
      '/topalbums', '/mytopalbums',
      '/songreview <1-10>', '/rating', '/reviewhelp',
      '/albumreview <1-10>',
      '/searchalbum <artist>',
      '/qalbum <id>',
      '/suggestsongs',
      { text: '/blacklist+ <artist|title>', private: true },
      '/addsong [beach]',
      { text: '/removesong [beach]', private: true }
    ]
  },
  {
    group: 'Trivia & Lottery',
    items: [
      '/trivia', '/triviastart [rounds]', '/triviaend',
      '/a', '/b', '/c', '/d',
      '/lottery', '/lotto <#>', '/lottostats', '/lottowinners'
    ]
  },
  {
    group: 'Roulette & Slots',
    items: [
      '/roulette', '/bet <type> <amount>', '/bets',
      '/slots [amount]', '/slotinfo', '/jackpot'
    ]
  },
  {
    group: 'Blackjack',
    items: [
      '/blackjack', '/join', '/leave',
      '/betbj <amount>', '/hit', '/stand', '/double', '/surrender', '/split', '/table'
    ]
  },
  {
    group: 'Horse Racing',
    items: [
      '/horserace', '/buyhorse <name>', '/myhorses',
      '/horsehelp', '/horserules', '/horseinfo',
      '/horsestats', '/tophorses'
    ]
  },
  {
    group: 'Craps',
    items: [
      '/craps', '/craps help', '/craps status', '/craps start',
      '/roll',
      '/pass <amt>', '/dontpass <amt>',
      '/place <4|5|6|8|9|10> <amt>', '/removeplace <num>',
      '/field <amt>', '/double <1-6> <amt>',
      '/crapsrecord'
    ]
  },
  { group: 'Magic 8-Ball', items: ['/8ball <question>'] },
  {
    group: 'Wallet & Betting',
    items: [
      '/balance', '/bankroll', '/getwallet', '/checkbalance',
      '/tip <amount>',
      '/sportsbet <sport> <team> <amount>',
      { text: '/resolvebets', private: true },
      '/mlbodds'
    ]
  },
  {
    group: 'Avatars',
    items: [
      '/randomavatar', '/randomcyber', '/randomcosmic', '/randomlovable',
      '/cyber', '/cosmic', '/lovable',
      '/dino', '/duck', '/spacebear', '/walrus', '/vibesguy', '/faces',
      '/dodo', '/dumdum', '/flowerpower',
      '/botrandom', '/botdino', '/botduck', '/botalien', '/botalien2',
      '/botwalrus', '/botpenguin', '/bot1', '/bot2', '/bot3'
    ]
  },
  {
    group: 'GIFs & Fun',
    items: [
      '/gifs', '/burp', '/dance', '/party', '/beer', '/cheers',
      '/fart', '/tomatoes', '/bark', '/barkbark', '/jam',
      '/berad', '/cam', '/drink', '/shirley', '/ello', '/allen',
      '/props', '/ass', '/titties', '/azz', '/shred',
      '/dog [breed] [sub-breed]'
    ]
  },
  { group: 'Sports', items: ['/MLB [YYYY-MM-DD]', '/NHL [YYYY-MM-DD]', '/NBA [YYYY-MM-DD]'] },
  {
    group: 'Store & Misc',
    items: [
      '/store',
      { text: '/secret', private: true }, // secret stays off the public page
      '/test'
    ]
  },
  // Entire group only for mods:
  {
    group: 'Room Look Presets',
    modOnly: true,
    items: ['/room classic','/room ferry','/room barn','/room yacht','/room festival','/room stadium','/room theater']
  },
  {
    group: 'Moderator Toggles',
    modOnly: true,
    items: [
      '/status',
      '/bopon', '/bopoff',
      '/autodjon', '/autodjoff',
      '/songstatson', '/songstatsoff',
      '/greeton', '/greetoff',
      '/infoon', '/infooff', '/infotoggle',
      '/infotone <tone>',
      '/settheme <name>', '/removetheme',
      '/room <style>',
      '/addDJ', '/removeDJ',
      '/blacklist+ <artist|title>',
      '/resolvebets'
    ]
  }
]

// ---------- helpers to render lists ----------
function normalizeItems(items, includePrivate) {
  // Returns array of strings, filtering by private flag
  const out = []
  for (const it of items) {
    if (typeof it === 'string') {
      out.push(it)
    } else if (it && typeof it === 'object' && typeof it.text === 'string') {
      if (includePrivate || !it.private) out.push(it.text)
    }
  }
  return out
}

function buildPublicCommands() {
  return MASTER_GROUPS
    .filter(g => !g.modOnly) // drop groups that are mod-only
    .map(g => {
      const items = normalizeItems(g.items, /* includePrivate */ false)
      return items.length ? { group: g.group, items } : null
    })
    .filter(Boolean)
}

function buildModCommands() {
  // Include everything (public + private + modOnly)
  return MASTER_GROUPS
    .map(g => {
      const items = normalizeItems(g.items, /* includePrivate */ true)
      return items.length ? { group: g.group, items } : null
    })
    .filter(Boolean)
}

// ---------- stats (unchanged) ----------
function buildStats() {
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

  return { totals, topSongs, topAlbums }
}

export function buildSnapshot() {
  return {
    commands: buildPublicCommands(),
    commands_mod: buildModCommands(),
    stats: buildStats()
  }
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
