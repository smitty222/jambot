import db from './db.js'

export function getSpotifyUserAuth (userUuid) {
  if (!userUuid) return null
  try {
    return db.prepare(`
      SELECT userUuid, spotifyUserId, accessToken, refreshToken, expiresAt, scopes, createdAt, updatedAt
      FROM spotify_user_auth
      WHERE userUuid = ?
    `).get(String(userUuid)) || null
  } catch {
    return null
  }
}

export function upsertSpotifyUserAuth ({
  userUuid,
  spotifyUserId = '',
  accessToken = '',
  refreshToken,
  expiresAt = null,
  scopes = ''
}) {
  if (!userUuid) throw new Error('userUuid is required')
  if (!refreshToken) throw new Error('refreshToken is required')

  return db.prepare(`
    INSERT INTO spotify_user_auth (
      userUuid, spotifyUserId, accessToken, refreshToken, expiresAt, scopes, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(userUuid) DO UPDATE SET
      spotifyUserId = excluded.spotifyUserId,
      accessToken = excluded.accessToken,
      refreshToken = excluded.refreshToken,
      expiresAt = excluded.expiresAt,
      scopes = excluded.scopes,
      updatedAt = CURRENT_TIMESTAMP
  `).run(
    String(userUuid),
    String(spotifyUserId || ''),
    String(accessToken || ''),
    String(refreshToken),
    expiresAt == null ? null : Number(expiresAt),
    String(scopes || '')
  )
}

export function updateSpotifyUserAuthTokens (userUuid, {
  accessToken = '',
  refreshToken = null,
  expiresAt = null,
  scopes = null
} = {}) {
  if (!userUuid) throw new Error('userUuid is required')

  return db.prepare(`
    UPDATE spotify_user_auth
    SET
      accessToken = ?,
      refreshToken = COALESCE(?, refreshToken),
      expiresAt = ?,
      scopes = COALESCE(?, scopes),
      updatedAt = CURRENT_TIMESTAMP
    WHERE userUuid = ?
  `).run(
    String(accessToken || ''),
    refreshToken == null ? null : String(refreshToken),
    expiresAt == null ? null : Number(expiresAt),
    scopes == null ? null : String(scopes),
    String(userUuid)
  )
}
