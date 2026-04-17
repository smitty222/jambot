import db from './db.js'
import { getCurrentMonthKey } from '../utils/monthKey.js'

const BADGE_DEFS = {
  dj_streak_3: { label: 'Needle Drop', description: 'Hit a 3-song DJ streak.', emoji: '🎚️' },
  dj_streak_5: { label: 'Crowd Mover', description: 'Hit a 5-song DJ streak.', emoji: '🎧' },
  dj_streak_8: { label: 'Selector Elite', description: 'Hit an 8-song DJ streak.', emoji: '📀' },
  dj_streak_12: { label: 'Crate Monarch', description: 'Hit a 12-song DJ streak.', emoji: '🏆' },
  monthly_earner_1: { label: 'Money Monarch', description: 'Finished #1 in monthly net gain.', emoji: '💸' },
  monthly_dj_1: { label: 'Headliner', description: 'Finished #1 in monthly DJ earnings.', emoji: '🎤' },
  monthly_f1_1: { label: 'Pole King', description: 'Finished #1 in monthly F1 net.', emoji: '🏎️' },
  monthly_gambler_1: { label: 'Table Tyrant', description: 'Finished #1 in monthly gambling net.', emoji: '🎲' },
  high_roller: { label: 'High Roller', description: 'Reached a cash wallet balance of $1,000,000.', emoji: '🏦' },
  round_buyer: { label: 'Round Buyer', description: 'Tipped the DJ 5 times.', emoji: '🍺' },
  big_tipper: { label: 'Big Tipper', description: 'Tipped $50,000 or more in a single tip.', emoji: '🤑' },
  pride: { label: 'Pride', description: 'Used a gay avatar command.', emoji: '🌈' },
  room_favorite_badge: { label: 'Room Favorite', description: 'Every person in a room of 6+ liked your song.', emoji: '🌟' },
  album_10: { label: 'Wax Collector', description: 'Played 10 albums.', emoji: '📀' },
  f1_legendary_win: { label: 'Legendary', description: 'Finished P1 in a Legendary Grand Prix.', emoji: '🏁' },
  broke: { label: 'Broke', description: 'Hit a $0 wallet balance.', emoji: '💀' },
  slots_bonus_hunter: { label: 'Bonus Hunter', description: 'Triggered a slots jackpot bonus round.', emoji: '💰' },
  slots_feature_hunter: { label: 'Feature Hunter', description: 'Unlocked slots free spins.', emoji: '🎟️' },
  slots_jackpot_bite: { label: 'Jackpot Bite', description: 'Collected a slice of the slots jackpot.', emoji: '💎' },
  slots_collector: { label: 'Reel Collector', description: 'Completed a slots collection reward.', emoji: '🧰' },
  horse_first_winner: { label: 'First Across', description: 'Owned a horse that won a race.', emoji: '🏇' },
  horse_stable_star: { label: 'Stable Star', description: 'Reached 5 career wins across your horses.', emoji: '🌟' },
  horse_cash_ticket: { label: 'Cash Ticket', description: 'Hit a big horse-race payout.', emoji: '🎫' },
  bj_first_blackjack: { label: 'Natural Twenty-One', description: 'Hit a natural blackjack.', emoji: '🂡' },
  bj_double_down: { label: 'Double Down Hero', description: 'Won a doubled blackjack hand.', emoji: '🎴' },
  bj_big_hand: { label: 'Big Hand', description: 'Won a big blackjack payout.', emoji: '♠️' },
  lottery_first_hit: { label: 'Lucky Number', description: 'Won the lottery for the first time.', emoji: '🎱' },
  lottery_repeat_winner: { label: 'Loaded Dice', description: 'Won the lottery 3 times.', emoji: '🍀' }
}

const TITLE_DEFS = {
  room_favorite: { label: 'Headliner', description: 'Monthly top DJ title.', emoji: '🎤' },
  high_roller: { label: 'Table Tyrant', description: 'Monthly top gambler title.', emoji: '🎲' },
  grid_king: { label: 'Pole King', description: 'Monthly top F1 title.', emoji: '🏁' },
  money_machine: { label: 'Money Monarch', description: 'Monthly top net-gain title.', emoji: '💸' },
  crate_legend: { label: 'Crate Monarch', description: 'Earned from a 12-song DJ streak.', emoji: '📀' }
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

export function syncBlackjackPrestige ({ userUUID, isNaturalBlackjack = false, doubledWin = false, profit = 0 } = {}) {
  if (!userUUID) return { badges: [], titles: [] }
  const candidates = []

  if (isNaturalBlackjack) candidates.push('bj_first_blackjack')
  if (doubledWin) candidates.push('bj_double_down')
  if (Number(profit || 0) >= 500) candidates.push('bj_big_hand')

  const newBadges = []
  for (const badgeKey of candidates) {
    if (awardBadge(userUUID, badgeKey, { source: 'blackjack', meta: { profit: Number(profit || 0) } }) === 'new') {
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
