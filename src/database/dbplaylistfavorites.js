import db from './db.js'

export function getFavorite (userUuid, slot) {
  if (!userUuid || !slot) return null
  return db.prepare(`
    SELECT userUuid, slot, playlistId, playlistName
    FROM user_playlist_favorites
    WHERE userUuid = ? AND slot = ?
  `).get(String(userUuid), Number(slot)) || null
}

export function getFavorites (userUuid) {
  if (!userUuid) return []
  return db.prepare(`
    SELECT userUuid, slot, playlistId, playlistName
    FROM user_playlist_favorites
    WHERE userUuid = ?
    ORDER BY slot ASC
  `).all(String(userUuid))
}

export function setFavorite (userUuid, slot, playlistId, playlistName = '') {
  if (!userUuid || !slot || !playlistId) throw new Error('userUuid, slot, and playlistId are required')
  return db.prepare(`
    INSERT INTO user_playlist_favorites (userUuid, slot, playlistId, playlistName, updatedAt)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(userUuid, slot) DO UPDATE SET
      playlistId = excluded.playlistId,
      playlistName = excluded.playlistName,
      updatedAt = CURRENT_TIMESTAMP
  `).run(String(userUuid), Number(slot), String(playlistId), String(playlistName || ''))
}

export function removeFavorite (userUuid, slot) {
  if (!userUuid || !slot) return
  return db.prepare(`
    DELETE FROM user_playlist_favorites WHERE userUuid = ? AND slot = ?
  `).run(String(userUuid), Number(slot))
}
