import db from './db.js'

const BADGE_DEFS = {
  dj_streak_3: { label: 'Warm Deck', description: 'Hit a 3-song DJ streak.', emoji: '🎚️' },
  dj_streak_5: { label: 'Room Favorite', description: 'Hit a 5-song DJ streak.', emoji: '🎧' },
  dj_streak_8: { label: 'Selector Supreme', description: 'Hit an 8-song DJ streak.', emoji: '📀' },
  dj_streak_12: { label: 'Legendary Crate', description: 'Hit a 12-song DJ streak.', emoji: '🏆' },
  monthly_earner_1: { label: 'Money Machine', description: 'Finished #1 in monthly net gain.', emoji: '💸' },
  monthly_dj_1: { label: 'Monthly Headliner', description: 'Finished #1 in monthly DJ earnings.', emoji: '🎤' },
  monthly_f1_1: { label: 'Grid Boss', description: 'Finished #1 in monthly F1 net.', emoji: '🏎️' },
  monthly_gambler_1: { label: 'Heat Check', description: 'Finished #1 in monthly gambling net.', emoji: '🎲' }
}

const TITLE_DEFS = {
  room_favorite: { label: 'Room Favorite', description: 'Monthly top DJ title.', emoji: '🎤' },
  high_roller: { label: 'High Roller', description: 'Monthly top gambler title.', emoji: '🎲' },
  grid_king: { label: 'Grid King', description: 'Monthly top F1 title.', emoji: '🏁' },
  money_machine: { label: 'Money Machine', description: 'Monthly top net-gain title.', emoji: '💸' },
  crate_legend: { label: 'Crate Legend', description: 'Earned from a 12-song DJ streak.', emoji: '📀' }
}

const MONTHLY_PRESTIGE = {
  monthly: { badgeKey: 'monthly_earner_1', titleKey: 'money_machine' },
  monthlydj: { badgeKey: 'monthly_dj_1', titleKey: 'room_favorite' },
  monthlyf1: { badgeKey: 'monthly_f1_1', titleKey: 'grid_king' },
  monthlygamblers: { badgeKey: 'monthly_gambler_1', titleKey: 'high_roller' }
}

function getCurrentMonthKey (date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
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

export function getTitleDefinition (titleKey) {
  return TITLE_DEFS[String(titleKey || '').trim()] || null
}

export function awardBadge (userUUID, badgeKey, { source = null, meta = null, expiresAt = null } = {}) {
  const def = getBadgeDefinition(badgeKey)
  if (!userUUID || !def) return false

  db.prepare(`
    INSERT OR IGNORE INTO prestige_badges (userUUID, badgeKey, source, meta, expiresAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(userUUID),
    String(badgeKey),
    source,
    meta ? JSON.stringify(meta) : null,
    expiresAt
  )

  return true
}

export function awardTitle (userUUID, titleKey, { source = null, meta = null, expiresAt = null } = {}) {
  const def = getTitleDefinition(titleKey)
  if (!userUUID || !def) return false

  db.prepare(`
    INSERT OR IGNORE INTO prestige_titles (userUUID, titleKey, source, meta, expiresAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    String(userUUID),
    String(titleKey),
    source,
    meta ? JSON.stringify(meta) : null,
    expiresAt
  )

  return true
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
  if (!userUUID || streak <= 0) return []

  const awarded = []
  if (streak >= 3) awarded.push('dj_streak_3')
  if (streak >= 5) awarded.push('dj_streak_5')
  if (streak >= 8) awarded.push('dj_streak_8')
  if (streak >= 12) awarded.push('dj_streak_12')

  for (const badgeKey of awarded) {
    awardBadge(userUUID, badgeKey, {
      source: 'dj_streak',
      meta: { streak }
    })
  }

  if (streak >= 12) {
    awardTitle(userUUID, 'crate_legend', {
      source: 'dj_streak',
      meta: { streak }
    })
  }

  return awarded
}

export function syncMonthlyPrestigeAwards (leaderboardType, rows = [], monthKey = getCurrentMonthKey()) {
  const config = MONTHLY_PRESTIGE[String(leaderboardType || '').toLowerCase()]
  if (!config || !Array.isArray(rows) || !rows.length) return []

  const winner = rows[0]
  if (!winner?.uuid) return []

  const expiresAt = nextMonthIso(monthKey)
  awardBadge(winner.uuid, config.badgeKey, {
    source: 'monthly',
    meta: { leaderboardType, monthKey, rank: 1, amount: winner.amount },
    expiresAt
  })
  awardTitle(winner.uuid, config.titleKey, {
    source: 'monthly',
    meta: { leaderboardType, monthKey, rank: 1, amount: winner.amount },
    expiresAt
  })

  return [config.badgeKey, config.titleKey]
}
