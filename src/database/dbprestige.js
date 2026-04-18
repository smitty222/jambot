import db from './db.js'
import { getCurrentMonthKey } from '../utils/monthKey.js'

const BADGE_DEFS = {
  dj_streak_3: { label: 'Needle Drop', description: '3-song DJ streak', emoji: '🎚️' },
  dj_streak_5: { label: 'Crowd Mover', description: '5-song DJ streak', emoji: '🎧' },
  dj_streak_8: { label: 'Selector Elite', description: '8-song DJ streak', emoji: '📀' },
  dj_streak_12: { label: 'Crate Monarch', description: '12-song DJ streak', emoji: '🏆' },
  monthly_earner_1: { label: 'Money Monarch', description: '#1 monthly earner', emoji: '💸' },
  monthly_dj_1: { label: 'Headliner', description: '#1 monthly DJ earnings', emoji: '🎤' },
  monthly_f1_1: { label: 'Pole King', description: '#1 monthly F1', emoji: '🏎️' },
  monthly_gambler_1: { label: 'Table Tyrant', description: '#1 monthly gambler', emoji: '🎲' },
  champagne: { label: 'Champagne', description: 'Reached a $100,000 wallet balance.', emoji: '🥂' },
  high_roller: { label: 'High Roller', description: 'Wallet hit $1M', emoji: '👑' },
  bottle_pop: { label: 'Bottle Pop', description: 'Won $100,000 or more in a single game payout.', emoji: '🍾' },
  whiskey: { label: 'Whiskey', description: 'Used /getdjdrunk 5 times.', emoji: '🥃' },
  cocktail: { label: 'Cocktail', description: 'Used /party twice.', emoji: '🍹' },
  round_buyer: { label: 'Round Buyer', description: 'Tipped the DJ 5 times', emoji: '🍺' },
  big_tipper: { label: 'Big Tipper', description: 'Single tip of $50k+', emoji: '🤑' },
  pride: { label: 'Pride', description: 'Used a gay avatar', emoji: '🌈' },
  room_favorite_badge: { label: 'Room Favorite', description: 'Full room liked your song (6+)', emoji: '🌟' },
  album_10: { label: 'Wax Collector', description: 'Played 10 albums', emoji: '💿' },
  f1_legendary_win: { label: 'Legendary', description: 'Won a Legendary Grand Prix', emoji: '🏁' },
  broke: { label: 'Broke', description: 'Hit $0 balance', emoji: '💀' },
  slots_bonus_hunter: { label: 'Bonus Hunter', description: 'Triggered a bonus round', emoji: '💰' },
  slots_feature_hunter: { label: 'Feature Hunter', description: 'Unlocked free spins', emoji: '🎟️' },
  slots_jackpot_bite: { label: 'Jackpot Bite', description: 'Collected a jackpot slice', emoji: '💎' },
  slots_collector: { label: 'Reel Collector', description: 'Completed a collection reward', emoji: '🎰' },
  horse_first_winner: { label: 'First Across', description: 'Horse won a race', emoji: '🏇' },
  horse_stable_star: { label: 'Stable Star', description: '5 career horse race wins', emoji: '🐎' },
  horse_cash_ticket: { label: 'Cash Ticket', description: 'Hit a big horse payout', emoji: '💵' },
  bj_clown: { label: 'Clown', description: 'Lost 5 blackjack hands in a row', emoji: '🤡' },
  begone: { label: 'Ice Cold', description: 'Used /begonebitch to eject a DJ.', emoji: '🧊' },
  bj_first_blackjack: { label: 'Natural 21', description: 'Hit a natural blackjack', emoji: '🂡' },
  bj_double_down: { label: 'Double Down Hero', description: 'Won a doubled-down hand', emoji: '🃏' },
  bj_big_hand: { label: 'Big Hand', description: 'Won a big blackjack payout', emoji: '♠️' },
  lottery_first_hit: { label: 'Lucky Number', description: 'First lottery win', emoji: '🎱' },
  lottery_repeat_winner: { label: 'Loaded Dice', description: 'Won the lottery 3 times', emoji: '🍀' },
  roulette_color_caller: { label: 'Color Caller', description: '3 correct color calls in a row', emoji: '🔴' },
  roulette_house_beater: { label: 'House Beater', description: 'Won a straight-number bet', emoji: '💚' },
  craps_natural: { label: 'Natural', description: 'Rolled a natural on come-out', emoji: '🎲' },
  craps_point_made: { label: 'Point Made', description: 'Made your point in craps', emoji: '🎯' },
  trivia_know_it_all: { label: 'Know-It-All', description: 'Got a trivia question correct', emoji: '🧠' },
  trivia_quick_draw: { label: 'Quick Draw', description: 'First to answer correctly', emoji: '⚡' },
  music_critic: { label: 'Critic', description: 'Reviewed 25 songs', emoji: '⭐' },
  dj_debut: { label: 'DJ Debut', description: 'First song as DJ', emoji: '🎙️' },
  regular: { label: 'Regular', description: 'Joined on 10 separate days', emoji: '👋' },
  party_starter: { label: 'Party Starter', description: 'Room hit 10+ users', emoji: '🎉' }
}

const TITLE_DEFS = {
  room_favorite: { label: 'Headliner', description: 'Monthly top DJ title.', emoji: '🎤' },
  high_roller: { label: 'Table Tyrant', description: 'Monthly top gambler title.', emoji: '🎲' },
  grid_king: { label: 'Pole King', description: 'Monthly top F1 title.', emoji: '🏁' },
  money_machine: { label: 'Money Monarch', description: 'Monthly top net-gain title.', emoji: '💸' },
  crate_legend: { label: 'Crate Monarch', description: 'Earned from a 12-song DJ streak.', emoji: '📀' },
  trivia_scholar: { label: 'The Scholar', description: '10 correct trivia answers', emoji: '🧠' },
  gambling_house: { label: 'The House', description: 'Won $500k+ gambling in a month', emoji: '🎰' },
  roulette_royale: { label: 'Roulette Royale', description: 'Hit a straight-number bet twice', emoji: '🔴' },
  vocal_minority: { label: 'Vocal Minority', description: 'Diverged from room on 5 reviews', emoji: '🎙️' },
  decorated: { label: 'Decorated', description: 'Collected 8 badges', emoji: '🏅' }
}

const MONTHLY_PRESTIGE = {
  monthly: { badgeKey: 'monthly_earner_1', titleKey: 'money_machine' },
  monthlydj: { badgeKey: 'monthly_dj_1', titleKey: 'room_favorite' },
  monthlyf1: { badgeKey: 'monthly_f1_1', titleKey: 'grid_king' },
  monthlygamblers: { badgeKey: 'monthly_gambler_1', titleKey: 'high_roller' }
}

function nextMonthIso (monthKey = getCurrentMonthKey()) {
  const [yearRaw, monthRaw] = String(monthKey || '').split('-')
  const year = Number.parseInt(yearRaw, 10)
  const monthIndex = Number.parseInt(monthRaw, 10) - 1
  return new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0)).toISOString()
}

function parseJson (value, fallback = null) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export function getBadgeDefinition (badgeKey) {
  return BADGE_DEFS[String(badgeKey || '').trim()] || null
}

export function getAllBadgeDefinitions () {
  return Object.entries(BADGE_DEFS).map(([key, def]) => ({ key, ...def }))
}

export function getAllTitleDefinitions () {
  return Object.entries(TITLE_DEFS).map(([key, def]) => ({ key, ...def }))
}

export function getTitleDefinition (titleKey) {
  return TITLE_DEFS[String(titleKey || '').trim()] || null
}

export function awardBadge (userUUID, badgeKey, { source = null, meta = null, expiresAt = null } = {}) {
  const def = getBadgeDefinition(badgeKey)
  if (!userUUID || !def) return false

  const result = db.prepare(`
    INSERT OR IGNORE INTO prestige_badges (userUUID, badgeKey, source, meta, expiresAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(userUUID),
    String(badgeKey),
    source,
    meta ? JSON.stringify(meta) : null,
    expiresAt
  )

  return result.changes > 0 ? 'new' : 'existing'
}

function tableOrViewExists (name) {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE name = ? AND type IN ('table', 'view')
  `).get(String(name))
  return Boolean(row)
}

function tableColumnExists (table, column) {
  if (!tableOrViewExists(table)) return false
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)
}

function runHistoricalBackfillInsert (sql) {
  if (!db.available) return 0
  return db.prepare(sql).run().changes || 0
}

function backfillLotteryPrestigeBadges () {
  if (!tableOrViewExists('lottery_winners') || !tableOrViewExists('prestige_badges')) {
    return { lottery_first_hit: 0, lottery_repeat_winner: 0 }
  }

  const firstHit = runHistoricalBackfillInsert(`
    INSERT OR IGNORE INTO prestige_badges (userUUID, badgeKey, source, meta)
    SELECT
      userId,
      'lottery_first_hit',
      'lottery',
      '{"totalWins":' || COUNT(*) || ',"historicalBackfill":true}'
    FROM lottery_winners
    WHERE userId IS NOT NULL AND userId <> ''
    GROUP BY userId
    HAVING COUNT(*) >= 1
  `)

  const repeatWinner = runHistoricalBackfillInsert(`
    INSERT OR IGNORE INTO prestige_badges (userUUID, badgeKey, source, meta)
    SELECT
      userId,
      'lottery_repeat_winner',
      'lottery',
      '{"totalWins":' || COUNT(*) || ',"historicalBackfill":true}'
    FROM lottery_winners
    WHERE userId IS NOT NULL AND userId <> ''
    GROUP BY userId
    HAVING COUNT(*) >= 3
  `)

  return {
    lottery_first_hit: firstHit,
    lottery_repeat_winner: repeatWinner
  }
}

function backfillHorsePrestigeBadges () {
  if (!tableOrViewExists('horses') || !tableOrViewExists('prestige_badges')) {
    return { horse_first_winner: 0, horse_stable_star: 0 }
  }

  const firstWinner = runHistoricalBackfillInsert(`
    INSERT OR IGNORE INTO prestige_badges (userUUID, badgeKey, source, meta)
    SELECT
      ownerId,
      'horse_first_winner',
      'horse_race',
      '{"totalWins":' || COALESCE(SUM(wins), 0) || ',"historicalBackfill":true}'
    FROM horses
    WHERE ownerId IS NOT NULL AND ownerId <> ''
    GROUP BY ownerId
    HAVING COALESCE(SUM(wins), 0) >= 1
  `)

  const stableStar = runHistoricalBackfillInsert(`
    INSERT OR IGNORE INTO prestige_badges (userUUID, badgeKey, source, meta)
    SELECT
      ownerId,
      'horse_stable_star',
      'horse_race',
      '{"totalWins":' || COALESCE(SUM(wins), 0) || ',"historicalBackfill":true}'
    FROM horses
    WHERE ownerId IS NOT NULL AND ownerId <> ''
    GROUP BY ownerId
    HAVING COALESCE(SUM(wins), 0) >= 5
  `)

  return {
    horse_first_winner: firstWinner,
    horse_stable_star: stableStar
  }
}

function backfillChampagnePrestigeBadge () {
  if (!tableOrViewExists('prestige_badges')) return { champagne: 0 }
  const walletSources = []

  if (tableColumnExists('users', 'uuid') && tableColumnExists('users', 'balance')) {
    walletSources.push('SELECT uuid AS userUUID, balance AS balance FROM users')
  }

  if (tableColumnExists('wallets', 'uuid') && tableColumnExists('wallets', 'balance')) {
    walletSources.push('SELECT uuid AS userUUID, balance AS balance FROM wallets')
  }

  if (tableColumnExists('economy_events', 'userUUID') && tableColumnExists('economy_events', 'balanceAfter')) {
    walletSources.push('SELECT userUUID, balanceAfter AS balance FROM economy_events')
  }

  if (!walletSources.length) return { champagne: 0 }

  const champagne = runHistoricalBackfillInsert(`
    WITH wallet_history AS (
      ${walletSources.join('\n      UNION ALL\n      ')}
    ),
    max_wallets AS (
      SELECT userUUID, MAX(balance) AS maxBalance
      FROM wallet_history
      WHERE userUUID IS NOT NULL AND userUUID <> '' AND balance IS NOT NULL
      GROUP BY userUUID
    )
    INSERT OR IGNORE INTO prestige_badges (userUUID, badgeKey, source, meta)
    SELECT
      userUUID,
      'champagne',
      'wallet',
      '{"balance":' || ROUND(maxBalance, 2) || ',"historicalBackfill":true}'
    FROM max_wallets
    WHERE maxBalance >= 100000
  `)

  return { champagne }
}

export function backfillHistoricalPrestigeBadges () {
  const results = {
    ...backfillLotteryPrestigeBadges(),
    ...backfillHorsePrestigeBadges(),
    ...backfillChampagnePrestigeBadge()
  }

  return {
    ...results,
    total: Object.values(results).reduce((sum, count) => sum + Number(count || 0), 0)
  }
}

export function awardTitle (userUUID, titleKey, { source = null, meta = null, expiresAt = null } = {}) {
  const def = getTitleDefinition(titleKey)
  if (!userUUID || !def) return false

  const result = db.prepare(`
    INSERT OR IGNORE INTO prestige_titles (userUUID, titleKey, source, meta, expiresAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(userUUID),
    String(titleKey),
    source,
    meta ? JSON.stringify(meta) : null,
    expiresAt
  )

  if (result.changes > 0) {
    const profile = db.prepare('SELECT equippedTitleKey FROM prestige_profiles WHERE userUUID = ?').get(String(userUUID))
    if (!profile?.equippedTitleKey) {
      equipTitle(String(userUUID), String(titleKey))
    }
  }

  return result.changes > 0 ? 'new' : 'existing'
}

export function equipTitle (userUUID, titleKey = null) {
  if (!userUUID) return false

  if (titleKey) {
    const row = db.prepare(`
      SELECT 1
      FROM prestige_titles
      WHERE userUUID = ?
        AND titleKey = ?
        AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
    `).get(String(userUUID), String(titleKey))
    if (!row) return false
  }

  db.prepare(`
    INSERT INTO prestige_profiles (userUUID, equippedTitleKey, updatedAt)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(userUUID) DO UPDATE SET
      equippedTitleKey = excluded.equippedTitleKey,
      updatedAt = CURRENT_TIMESTAMP
  `).run(String(userUUID), titleKey ? String(titleKey) : null)

  return true
}

export function getEquippedTitle (userUUID) {
  const row = db.prepare(`
    SELECT equippedTitleKey
    FROM prestige_profiles
    WHERE userUUID = ?
  `).get(String(userUUID))

  if (!row?.equippedTitleKey) return null
  const def = getTitleDefinition(row.equippedTitleKey)
  return def ? { key: row.equippedTitleKey, ...def } : null
}

function compactLabel (label, maxLen = 8) {
  const text = String(label || '').trim()
  if (!text) return ''
  if (text.length <= maxLen) return text

  const initials = text
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0])
    .join('')
    .toUpperCase()

  if (initials.length >= 2 && initials.length <= maxLen) return initials
  return text.slice(0, Math.max(1, maxLen - 1)).trim() + '.'
}

export function getEquippedBadge (userUUID) {
  const row = db.prepare(`
    SELECT equippedBadgeKey
    FROM prestige_profiles
    WHERE userUUID = ?
  `).get(String(userUUID))

  if (!row?.equippedBadgeKey) return null
  const def = getBadgeDefinition(row.equippedBadgeKey)
  return def ? { key: row.equippedBadgeKey, ...def } : null
}

export function equipBadge (userUUID, badgeKey) {
  if (badgeKey === null) {
    db.prepare(`
      INSERT INTO prestige_profiles (userUUID, equippedBadgeKey, updatedAt)
      VALUES (?, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT (userUUID) DO UPDATE SET equippedBadgeKey = NULL, updatedAt = CURRENT_TIMESTAMP
    `).run(String(userUUID))
    return true
  }

  const owned = db.prepare(`
    SELECT 1 FROM prestige_badges
    WHERE userUUID = ? AND badgeKey = ?
    AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
  `).get(String(userUUID), String(badgeKey))

  if (!owned) return false

  db.prepare(`
    INSERT INTO prestige_profiles (userUUID, equippedBadgeKey, updatedAt)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (userUUID) DO UPDATE SET equippedBadgeKey = ?, updatedAt = CURRENT_TIMESTAMP
  `).run(String(userUUID), String(badgeKey), String(badgeKey))

  return true
}

export function decoratedMention (uuid) {
  const equipped = getEquippedBadge(uuid)
  const prefix = equipped?.emoji ? `${equipped.emoji} ` : ''
  return `${prefix}<@uid:${uuid}>`
}

export function getCompactEquippedTitleTag (userUUID, maxLen = 8) {
  const equipped = getEquippedTitle(userUUID)
  if (!equipped) return ''
  const compact = compactLabel(equipped.label, maxLen)
  return compact ? `[${compact}]` : ''
}

export function getUserBadges (userUUID) {
  const rows = db.prepare(`
    SELECT badgeKey, awardedAt, source, meta, expiresAt
    FROM prestige_badges
    WHERE userUUID = ?
      AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
    ORDER BY awardedAt DESC, badgeKey ASC
  `).all(String(userUUID))

  return rows
    .map((row) => {
      const def = getBadgeDefinition(row.badgeKey)
      if (!def) return null
      return {
        key: row.badgeKey,
        ...def,
        awardedAt: row.awardedAt,
        source: row.source || null,
        meta: parseJson(row.meta, null),
        expiresAt: row.expiresAt || null
      }
    })
    .filter(Boolean)
}

export function getUserTitles (userUUID) {
  const rows = db.prepare(`
    SELECT titleKey, awardedAt, source, meta, expiresAt
    FROM prestige_titles
    WHERE userUUID = ?
      AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
    ORDER BY awardedAt DESC, titleKey ASC
  `).all(String(userUUID))

  return rows
    .map((row) => {
      const def = getTitleDefinition(row.titleKey)
      if (!def) return null
      return {
        key: row.titleKey,
        ...def,
        awardedAt: row.awardedAt,
        source: row.source || null,
        meta: parseJson(row.meta, null),
        expiresAt: row.expiresAt || null
      }
    })
    .filter(Boolean)
}

export function maybeAwardDjPrestige (userUUID, streakCount) {
  const streak = Math.max(0, Math.floor(Number(streakCount || 0)))
  if (!userUUID || streak <= 0) return { badges: [], titles: [] }

  const newBadges = []
  const candidates = []
  if (streak >= 3) candidates.push('dj_streak_3')
  if (streak >= 5) candidates.push('dj_streak_5')
  if (streak >= 8) candidates.push('dj_streak_8')
  if (streak >= 12) candidates.push('dj_streak_12')

  for (const badgeKey of candidates) {
    if (awardBadge(userUUID, badgeKey, { source: 'dj_streak', meta: { streak } }) === 'new') {
      newBadges.push(badgeKey)
    }
  }

  const newTitles = []
  if (streak >= 12) {
    if (awardTitle(userUUID, 'crate_legend', { source: 'dj_streak', meta: { streak } }) === 'new') {
      newTitles.push('crate_legend')
    }
  }

  return { badges: newBadges, titles: newTitles }
}

export function syncMonthlyPrestigeAwards (leaderboardType, rows = [], monthKey = getCurrentMonthKey()) {
  const config = MONTHLY_PRESTIGE[String(leaderboardType || '').toLowerCase()]
  if (!config || !Array.isArray(rows) || !rows.length) return []

  const winner = rows[0]
  if (!winner?.uuid) return []

  const expiresAt = nextMonthIso(monthKey)
  const meta = { leaderboardType, monthKey, rank: 1, amount: winner.amount }
  const newBadges = []
  const newTitles = []

  if (awardBadge(winner.uuid, config.badgeKey, { source: 'monthly', meta, expiresAt }) === 'new') {
    newBadges.push(config.badgeKey)
  }
  if (awardTitle(winner.uuid, config.titleKey, { source: 'monthly', meta, expiresAt }) === 'new') {
    newTitles.push(config.titleKey)
  }

  return { badges: newBadges, titles: newTitles }
}

function getHorseOwnerWinCount (ownerId) {
  if (!ownerId) return 0
  const row = db.prepare(`
    SELECT COALESCE(SUM(wins), 0) AS totalWins
    FROM horses
    WHERE ownerId = ?
  `).get(String(ownerId))
  return Number(row?.totalWins || 0)
}

function getLotteryWinCount (userUUID) {
  if (!userUUID) return 0
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM lottery_winners
    WHERE userId = ?
  `).get(String(userUUID))
  return Number(row?.total || 0)
}

export function syncSlotsPrestige ({ userUUID, bonusTriggered = false, featureTriggered = false, jackpotWon = 0, collectionRewardTotal = 0 } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const candidates = []

  if (bonusTriggered) candidates.push('slots_bonus_hunter')
  if (featureTriggered) candidates.push('slots_feature_hunter')
  if (Number(jackpotWon || 0) > 0) candidates.push('slots_jackpot_bite')
  if (Number(collectionRewardTotal || 0) > 0) candidates.push('slots_collector')

  const newBadges = []
  for (const badgeKey of candidates) {
    if (awardBadge(userUUID, badgeKey, { source: 'slots' }) === 'new') {
      newBadges.push(badgeKey)
    }
  }

  return { badges: newBadges, titles: [] }
}

export function syncHorsePrestige ({ ownerId = null, payoutEntries = [] } = {}) {
  const newBadges = []

  if (ownerId) {
    const totalWins = getHorseOwnerWinCount(ownerId)
    if (totalWins >= 1 && awardBadge(ownerId, 'horse_first_winner', { source: 'horse_race', meta: { totalWins } }) === 'new') {
      newBadges.push({ userUUID: ownerId, key: 'horse_first_winner' })
    }
    if (totalWins >= 5 && awardBadge(ownerId, 'horse_stable_star', { source: 'horse_race', meta: { totalWins } }) === 'new') {
      newBadges.push({ userUUID: ownerId, key: 'horse_stable_star' })
    }
  }

  for (const entry of Array.isArray(payoutEntries) ? payoutEntries : []) {
    const userUUID = entry?.userUUID
    const amount = Number(entry?.amount || 0)
    if (userUUID && amount >= 1000 && awardBadge(userUUID, 'horse_cash_ticket', { source: 'horse_race', meta: { payout: amount } }) === 'new') {
      newBadges.push({ userUUID, key: 'horse_cash_ticket' })
    }
  }

  return { badges: newBadges, titles: [] }
}

export function syncBlackjackPrestige ({ userUUID, isNaturalBlackjack = false, doubledWin = false, profit = 0, lossStreak = 0 } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const candidates = []

  if (isNaturalBlackjack) candidates.push('bj_first_blackjack')
  if (doubledWin) candidates.push('bj_double_down')
  if (Number(profit || 0) >= 500) candidates.push('bj_big_hand')
  if (Number(lossStreak) >= 5) candidates.push('bj_clown')

  const newBadges = []
  for (const badgeKey of candidates) {
    if (awardBadge(userUUID, badgeKey, { source: 'blackjack', meta: { profit: Number(profit || 0), lossStreak: Number(lossStreak) } }) === 'new') {
      newBadges.push(badgeKey)
    }
  }

  return { badges: newBadges, titles: [] }
}

export function syncLotteryPrestige ({ userUUID } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const totalWins = getLotteryWinCount(userUUID)
  const newBadges = []

  if (totalWins >= 1 && awardBadge(userUUID, 'lottery_first_hit', { source: 'lottery', meta: { totalWins } }) === 'new') {
    newBadges.push('lottery_first_hit')
  }
  if (totalWins >= 3 && awardBadge(userUUID, 'lottery_repeat_winner', { source: 'lottery', meta: { totalWins } }) === 'new') {
    newBadges.push('lottery_repeat_winner')
  }

  return { badges: newBadges, titles: [] }
}

export function incrementAlbumPlays (userUUID) {
  if (!userUUID) return 0
  db.prepare(`
    INSERT INTO prestige_album_plays (userUUID, count, updatedAt)
    VALUES (?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (userUUID) DO UPDATE SET count = count + 1, updatedAt = CURRENT_TIMESTAMP
  `).run(String(userUUID))
  const row = db.prepare('SELECT count FROM prestige_album_plays WHERE userUUID = ?').get(String(userUUID))
  return row?.count ?? 0
}

export function syncF1LegendaryPrestige (userUUID) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(userUUID, 'f1_legendary_win', { source: 'f1', meta: { tier: 'legendary' } }) === 'new') {
    newBadges.push('f1_legendary_win')
  }
  return { badges: newBadges, titles: [] }
}

export function syncAlbumPlaysPrestige (userUUID) {
  if (!userUUID) return { badges: [], titles: [] }
  const count = incrementAlbumPlays(userUUID)
  const newBadges = []
  if (count >= 10 && awardBadge(userUUID, 'album_10', { source: 'album', meta: { count } }) === 'new') {
    newBadges.push('album_10')
  }
  return { badges: newBadges, titles: [] }
}

export function syncBrokePrestige (userUUID, balance) {
  if (!userUUID || Number(balance) > 0) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(userUUID, 'broke', { source: 'wallet', meta: { balance: Number(balance) } }) === 'new') {
    newBadges.push('broke')
  }
  return { badges: newBadges, titles: [] }
}

export function syncRoomFavoritePrestige (djUuid, likes, totalUsersInRoom) {
  if (!djUuid || !likes || totalUsersInRoom <= 5) return { badges: [], titles: [] }
  const eligibleVoters = totalUsersInRoom - 1 // exclude the DJ
  if (likes < eligibleVoters) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(djUuid, 'room_favorite_badge', { source: 'song', meta: { likes, totalUsersInRoom } }) === 'new') {
    newBadges.push('room_favorite_badge')
  }
  return { badges: newBadges, titles: [] }
}

export function syncPridePrestige (userUUID) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(userUUID, 'pride', { source: 'avatar' }) === 'new') {
    newBadges.push('pride')
  }
  return { badges: newBadges, titles: [] }
}

export function incrementCommandCount (userUUID, commandKey) {
  if (!userUUID || !commandKey) return 0
  db.prepare(`
    INSERT INTO prestige_command_counts (userUUID, commandKey, count, updatedAt)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
    ON CONFLICT (userUUID, commandKey) DO UPDATE SET count = count + 1, updatedAt = CURRENT_TIMESTAMP
  `).run(String(userUUID), String(commandKey))
  const row = db.prepare('SELECT count FROM prestige_command_counts WHERE userUUID = ? AND commandKey = ?').get(String(userUUID), String(commandKey))
  return row?.count ?? 0
}

export function syncChampagnePrestige (userUUID, balance) {
  if (!userUUID || Number(balance) < 100_000) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(userUUID, 'champagne', { source: 'wallet', meta: { balance: Number(balance) } }) === 'new') {
    newBadges.push('champagne')
  }
  return { badges: newBadges, titles: [] }
}

export function syncBottlePopPrestige (userUUID, amount) {
  if (!userUUID || Number(amount) < 100_000) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(userUUID, 'bottle_pop', { source: 'game', meta: { amount: Number(amount) } }) === 'new') {
    newBadges.push('bottle_pop')
  }
  return { badges: newBadges, titles: [] }
}

export function syncWhiskeyPrestige (userUUID) {
  if (!userUUID) return { badges: [], titles: [] }
  const count = incrementCommandCount(userUUID, 'getdjdrunk')
  const newBadges = []
  if (count >= 5 && awardBadge(userUUID, 'whiskey', { source: 'command', meta: { count } }) === 'new') {
    newBadges.push('whiskey')
  }
  return { badges: newBadges, titles: [] }
}

export function syncCocktailPrestige (userUUID) {
  if (!userUUID) return { badges: [], titles: [] }
  const count = incrementCommandCount(userUUID, 'party')
  const newBadges = []
  if (count >= 2 && awardBadge(userUUID, 'cocktail', { source: 'command', meta: { count } }) === 'new') {
    newBadges.push('cocktail')
  }
  return { badges: newBadges, titles: [] }
}

export function syncBegonePrestige (userUUID) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(userUUID, 'begone', { source: 'begonebitch' }) === 'new') {
    newBadges.push('begone')
  }
  return { badges: newBadges, titles: [] }
}

export function syncBigTipperPrestige (userUUID, amount) {
  if (!userUUID || Number(amount) < 50000) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(userUUID, 'big_tipper', { source: 'tip', meta: { amount: Number(amount) } }) === 'new') {
    newBadges.push('big_tipper')
  }
  return { badges: newBadges, titles: [] }
}

export function syncRoundBuyerPrestige (userUUID) {
  if (!userUUID) return { badges: [], titles: [] }
  const row = db.prepare(`
    SELECT COUNT(*) AS tipCount FROM economy_events
    WHERE userUUID = ? AND source = 'tip' AND category = 'transfer_out'
  `).get(String(userUUID))
  const newBadges = []
  if ((row?.tipCount ?? 0) >= 5) {
    if (awardBadge(userUUID, 'round_buyer', { source: 'tip', meta: { tipCount: row.tipCount } }) === 'new') {
      newBadges.push('round_buyer')
    }
  }
  return { badges: newBadges, titles: [] }
}

export function syncHighRollerPrestige (userUUID, balance) {
  if (!userUUID || Number(balance) < 1_000_000) return { badges: [], titles: [] }
  const newBadges = []
  if (awardBadge(userUUID, 'high_roller', { source: 'wallet', meta: { balance: Number(balance) } }) === 'new') {
    newBadges.push('high_roller')
  }
  return { badges: newBadges, titles: [] }
}

// ─── Private helpers ──────────────────────────────────────────────────────────

function markDailyVisit (userUUID) {
  if (!userUUID) return 0
  const dateKey = `visit_${new Date().toISOString().slice(0, 10)}`
  db.prepare(`
    INSERT OR IGNORE INTO prestige_command_counts (userUUID, commandKey, count, updatedAt)
    VALUES (?, ?, 1, CURRENT_TIMESTAMP)
  `).run(String(userUUID), dateKey)
  const row = db.prepare(`
    SELECT COUNT(*) AS total FROM prestige_command_counts
    WHERE userUUID = ? AND commandKey LIKE 'visit_%'
  `).get(String(userUUID))
  return Number(row?.total || 0)
}

function getDailyUniqueVisitorCount () {
  const dateKey = `visit_${new Date().toISOString().slice(0, 10)}`
  const row = db.prepare(`
    SELECT COUNT(DISTINCT userUUID) AS total FROM prestige_command_counts
    WHERE commandKey = ?
  `).get(dateKey)
  return Number(row?.total || 0)
}

function incrementGamblingWins (userUUID, amount) {
  if (!userUUID || Number(amount) <= 0) return 0
  const monthKey = getCurrentMonthKey()
  const key = `gambling_win_${monthKey}`
  db.prepare(`
    INSERT INTO prestige_command_counts (userUUID, commandKey, count, updatedAt)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT (userUUID, commandKey) DO UPDATE SET
      count = count + excluded.count,
      updatedAt = CURRENT_TIMESTAMP
  `).run(String(userUUID), key, Math.floor(Number(amount)))
  const row = db.prepare('SELECT count FROM prestige_command_counts WHERE userUUID = ? AND commandKey = ?').get(String(userUUID), key)
  return Number(row?.count || 0)
}

function getUserSongReviewCount (userUUID) {
  if (!userUUID) return 0
  const row = db.prepare('SELECT COUNT(*) AS total FROM song_reviews WHERE userId = ?').get(String(userUUID))
  return Number(row?.total || 0)
}

function getVocalMinorityCount (userUUID) {
  if (!userUUID) return 0
  const rows = db.prepare(`
    SELECT sr.rating AS userRating, avgSong.avgRating
    FROM song_reviews sr
    JOIN (
      SELECT songId, AVG(rating) AS avgRating, COUNT(*) AS reviewCount
      FROM song_reviews
      GROUP BY songId
    ) avgSong ON sr.songId = avgSong.songId
    WHERE sr.userId = ?
      AND avgSong.reviewCount >= 2
  `).all(String(userUUID))
  return rows.filter(r => Math.abs(r.userRating - r.avgRating) >= 3).length
}

function maybeAwardDecoratedTitle (userUUID, newTitles) {
  if (!userUUID) return
  const row = db.prepare(`
    SELECT COUNT(*) AS total FROM prestige_badges
    WHERE userUUID = ? AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
  `).get(String(userUUID))
  const badgeCount = Number(row?.total || 0)
  if (badgeCount >= 8 && awardTitle(userUUID, 'decorated', { source: 'milestone', meta: { badgeCount } }) === 'new') {
    newTitles.push('decorated')
  }
}

function trackAndCheckGamblingHouse (userUUID, winAmount) {
  if (!userUUID || Number(winAmount) <= 0) return []
  const newTitles = []
  const monthlyWins = incrementGamblingWins(userUUID, winAmount)
  if (monthlyWins >= 500_000 && awardTitle(userUUID, 'gambling_house', { source: 'gambling', meta: { monthlyWins } }) === 'new') {
    newTitles.push('gambling_house')
  }
  return newTitles
}

// ─── New sync functions ───────────────────────────────────────────────────────

export function syncRoulettePrestige ({ userUUID, isColorWin = false, isStraightWin = false, colorStreak = 0, winAmount = 0 } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  const newTitles = []

  if (isColorWin && colorStreak >= 3) {
    if (awardBadge(userUUID, 'roulette_color_caller', { source: 'roulette', meta: { streak: colorStreak } }) === 'new') {
      newBadges.push('roulette_color_caller')
    }
  }

  if (isStraightWin) {
    if (awardBadge(userUUID, 'roulette_house_beater', { source: 'roulette', meta: { win: winAmount } }) === 'new') {
      newBadges.push('roulette_house_beater')
    }
    const straightWinCount = incrementCommandCount(userUUID, 'roulette_straight_win')
    if (straightWinCount >= 2 && awardTitle(userUUID, 'roulette_royale', { source: 'roulette', meta: { count: straightWinCount } }) === 'new') {
      newTitles.push('roulette_royale')
    }
  }

  trackAndCheckGamblingHouse(userUUID, winAmount).forEach(t => newTitles.push(t))
  maybeAwardDecoratedTitle(userUUID, newTitles)

  return { badges: newBadges, titles: newTitles }
}

export function syncCrapsPrestige ({ userUUID, isNatural = false, isPointMade = false } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  const newTitles = []

  if (isNatural && awardBadge(userUUID, 'craps_natural', { source: 'craps' }) === 'new') {
    newBadges.push('craps_natural')
  }
  if (isPointMade && awardBadge(userUUID, 'craps_point_made', { source: 'craps' }) === 'new') {
    newBadges.push('craps_point_made')
  }

  maybeAwardDecoratedTitle(userUUID, newTitles)
  return { badges: newBadges, titles: newTitles }
}

export function syncTriviaPrestige ({ userUUID, isFirst = false } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  const newTitles = []

  if (awardBadge(userUUID, 'trivia_know_it_all', { source: 'trivia' }) === 'new') {
    newBadges.push('trivia_know_it_all')
  }
  if (isFirst && awardBadge(userUUID, 'trivia_quick_draw', { source: 'trivia' }) === 'new') {
    newBadges.push('trivia_quick_draw')
  }

  const correctCount = incrementCommandCount(userUUID, 'trivia_correct')
  if (correctCount >= 10 && awardTitle(userUUID, 'trivia_scholar', { source: 'trivia', meta: { correctCount } }) === 'new') {
    newTitles.push('trivia_scholar')
  }

  maybeAwardDecoratedTitle(userUUID, newTitles)
  return { badges: newBadges, titles: newTitles }
}

export function syncMusicCriticPrestige ({ userUUID } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  const newTitles = []

  const reviewCount = getUserSongReviewCount(userUUID)
  if (reviewCount >= 25 && awardBadge(userUUID, 'music_critic', { source: 'review', meta: { reviewCount } }) === 'new') {
    newBadges.push('music_critic')
  }

  const divergentCount = getVocalMinorityCount(userUUID)
  if (divergentCount >= 5 && awardTitle(userUUID, 'vocal_minority', { source: 'review', meta: { divergentCount } }) === 'new') {
    newTitles.push('vocal_minority')
  }

  maybeAwardDecoratedTitle(userUUID, newTitles)
  return { badges: newBadges, titles: newTitles }
}

export function syncDJDebutPrestige (userUUID) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  const newTitles = []
  if (awardBadge(userUUID, 'dj_debut', { source: 'dj' }) === 'new') {
    newBadges.push('dj_debut')
  }
  maybeAwardDecoratedTitle(userUUID, newTitles)
  return { badges: newBadges, titles: newTitles }
}

export function syncUserJoinPrestige ({ userUUID } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const newBadges = []
  const newTitles = []

  const uniqueDays = markDailyVisit(userUUID)
  if (uniqueDays >= 10 && awardBadge(userUUID, 'regular', { source: 'join', meta: { uniqueDays } }) === 'new') {
    newBadges.push('regular')
  }

  const dailyVisitors = getDailyUniqueVisitorCount()
  if (dailyVisitors >= 10 && awardBadge(userUUID, 'party_starter', { source: 'join', meta: { dailyVisitors } }) === 'new') {
    newBadges.push('party_starter')
  }

  maybeAwardDecoratedTitle(userUUID, newTitles)
  return { badges: newBadges, titles: newTitles }
}

export function getUserReviewStats (userUUID) {
  if (!userUUID) return { count: 0, avgRating: null }
  const row = db.prepare(`
    SELECT COUNT(*) AS total, AVG(rating) AS avg FROM song_reviews WHERE userId = ?
  `).get(String(userUUID))
  return {
    count: Number(row?.total || 0),
    avgRating: row?.avg != null ? Math.round(Number(row.avg) * 10) / 10 : null
  }
}

export function getUserTipStats (userUUID) {
  if (!userUUID) return { count: 0, total: 0 }
  const row = db.prepare(`
    SELECT COUNT(*) AS tipCount, COALESCE(SUM(amount), 0) AS tipTotal
    FROM economy_events
    WHERE userUUID = ? AND source = 'tip' AND category = 'transfer_out'
  `).get(String(userUUID))
  return { count: Number(row?.tipCount || 0), total: Number(row?.tipTotal || 0) }
}

export function getUserFavoriteGame (userUUID) {
  if (!userUUID) return null
  const row = db.prepare(`
    SELECT source, SUM(amount) AS total
    FROM economy_events
    WHERE userUUID = ? AND category = 'bet_win'
      AND source IN ('roulette', 'slots', 'blackjack', 'craps', 'horse_race', 'f1', 'lottery')
    GROUP BY source
    ORDER BY total DESC
    LIMIT 1
  `).get(String(userUUID))
  return row?.source || null
}

export function getBadgeProgress (userUUID) {
  if (!userUUID) return []

  const earnedRows = db.prepare(`
    SELECT badgeKey FROM prestige_badges
    WHERE userUUID = ? AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
  `).all(String(userUUID))
  const earned = new Set(earnedRows.map(r => r.badgeKey))

  const progress = []

  function check (key, currentNum, targetNum, hint, formatFn = null) {
    if (currentNum <= 0) return
    // Threshold already met but badge missing — award it now as a catch-up
    if (currentNum >= targetNum && !earned.has(key)) {
      if (awardBadge(userUUID, key, { source: 'backfill' }) === 'new') {
        earned.add(key)
      }
    }
    if (earned.has(key)) return
    const def = BADGE_DEFS[key]
    if (!def) return
    const clamped = Math.min(currentNum, targetNum)
    const currentStr = formatFn ? formatFn(clamped) : String(clamped)
    const targetStr = formatFn ? formatFn(targetNum) : String(targetNum)
    progress.push({ key, emoji: def.emoji, label: def.label, current: clamped, target: targetNum, display: `${currentStr}/${targetStr} ${hint}` })
  }

  const fmtMoney = n => '$' + Math.round(n).toLocaleString('en-US')

  // DJ streak
  const streakRow = db.prepare('SELECT bestStreak FROM dj_streaks WHERE userUUID = ?').get(String(userUUID))
  const bestStreak = Number(streakRow?.bestStreak || 0)
  check('dj_streak_3', bestStreak, 3, 'DJ streak songs')
  check('dj_streak_5', bestStreak, 5, 'DJ streak songs')
  check('dj_streak_8', bestStreak, 8, 'DJ streak songs')
  check('dj_streak_12', bestStreak, 12, 'DJ streak songs')

  // Album plays
  const albumRow = db.prepare('SELECT count FROM prestige_album_plays WHERE userUUID = ?').get(String(userUUID))
  check('album_10', Number(albumRow?.count || 0), 10, 'albums played')

  // Command counts
  const getCommandCount = (key) => {
    const row = db.prepare('SELECT count FROM prestige_command_counts WHERE userUUID = ? AND commandKey = ?').get(String(userUUID), key)
    return Number(row?.count || 0)
  }
  check('whiskey', getCommandCount('getdjdrunk'), 5, '/getdjdrunk uses')
  check('cocktail', getCommandCount('party'), 2, '/party uses')

  // Tips
  const tipRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM economy_events
    WHERE userUUID = ? AND source = 'tip' AND category = 'transfer_out'
  `).get(String(userUUID))
  check('round_buyer', Number(tipRow?.cnt || 0), 5, 'tips sent')

  // Lottery repeat winner
  if (tableOrViewExists('lottery_winners')) {
    try {
      const lotteryRow = db.prepare('SELECT COUNT(*) AS cnt FROM lottery_winners WHERE userId = ?').get(String(userUUID))
      check('lottery_repeat_winner', Number(lotteryRow?.cnt || 0), 3, 'lottery wins')
    } catch {}
  }

  // Horse stable star
  if (tableOrViewExists('horses')) {
    try {
      const horseRow = db.prepare('SELECT COALESCE(SUM(wins), 0) AS totalWins FROM horses WHERE ownerId = ?').get(String(userUUID))
      check('horse_stable_star', Number(horseRow?.totalWins || 0), 5, 'horse race wins')
    } catch {}
  }

  // Unique visit days
  const visitRow = db.prepare(`
    SELECT COUNT(*) AS cnt FROM prestige_command_counts
    WHERE userUUID = ? AND commandKey LIKE 'visit_%'
  `).get(String(userUUID))
  check('regular', Number(visitRow?.cnt || 0), 10, 'days visited')

  // Music critic
  if (tableOrViewExists('song_reviews')) {
    try {
      const reviewRow = db.prepare('SELECT COUNT(*) AS cnt FROM song_reviews WHERE userId = ?').get(String(userUUID))
      check('music_critic', Number(reviewRow?.cnt || 0), 25, 'songs reviewed')
    } catch {}
  }

  // Trivia scholar title (tracked as badge progress even though it awards a title)
  const triviaCorrect = getCommandCount('trivia_correct')
  if (!earned.has('trivia_scholar_title_proxy')) {
    const triviaScholarDef = BADGE_DEFS.trivia_know_it_all // reuse for display shape only
    if (triviaCorrect > 0 && triviaCorrect < 10 && triviaScholarDef) {
      progress.push({
        key: 'trivia_scholar_title',
        emoji: '🧠',
        label: 'The Scholar (title)',
        current: triviaCorrect,
        target: 10,
        display: `${triviaCorrect}/10 correct answers`
      })
    }
  }

  // Roulette Royale title
  const straightWins = getCommandCount('roulette_straight_win')
  if (straightWins === 1) {
    progress.push({
      key: 'roulette_royale_title',
      emoji: '🔴',
      label: 'Roulette Royale (title)',
      current: 1,
      target: 2,
      display: '1/2 straight-number wins'
    })
  }

  // Wallet milestones
  const walletRow = db.prepare('SELECT balance FROM users WHERE uuid = ?').get(String(userUUID))
  const balance = Number(walletRow?.balance || 0)
  check('champagne', balance, 100_000, 'balance', fmtMoney)
  check('high_roller', balance, 1_000_000, 'balance', fmtMoney)

  // Sort by % completion descending (closest to done first)
  return progress.sort((a, b) => (b.current / b.target) - (a.current / a.target))
}

export function formatPrestigeUnlockLines ({ badges = [], titles = [] } = {}) {
  const lines = []
  for (const key of badges) {
    const def = getBadgeDefinition(key)
    if (def) lines.push(`${def.emoji} **Badge Unlocked: ${def.label}** — ${def.description}`)
  }
  for (const key of titles) {
    const def = getTitleDefinition(key)
    if (def) lines.push(`${def.emoji} **Title Earned: ${def.label}** — use \`/titles\` to equip`)
  }
  return lines
}
