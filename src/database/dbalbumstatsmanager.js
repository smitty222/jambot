import db from './db.js'

// Save or update a user's review for an album
export function saveAlbumReview({ albumName, albumArt, artistName, trackCount, userId, rating }) {
  if (typeof rating !== 'number' || rating < 1 || rating > 6) {
    return { success: false, message: 'Rating must be between 1 and 6' }
  }

  // Check if album exists, insert if not
  let album = db.prepare(`
    SELECT * FROM album_stats
    WHERE albumName = ? AND artistName = ?
  `).get(albumName, artistName)

  if (!album) {
    const insert = db.prepare(`
      INSERT INTO album_stats (albumName, albumArt, artistName, trackCount, averageReview)
      VALUES (?, ?, ?, ?, 0)
    `)
    const result = insert.run(albumName, albumArt, artistName, trackCount)
    album = {
      id: result.lastInsertRowid,
      albumName,
      artistName,
    }
  }

  const albumId = album.id

  // Upsert the user's review
  const existing = db.prepare(`
    SELECT * FROM album_reviews
    WHERE albumId = ? AND userId = ?
  `).get(albumId, userId)

  if (existing) {
    db.prepare(`
      UPDATE album_reviews
      SET rating = ?
      WHERE albumId = ? AND userId = ?
    `).run(rating, albumId, userId)
  } else {
    db.prepare(`
      INSERT INTO album_reviews (albumId, userId, rating)
      VALUES (?, ?, ?)
    `).run(albumId, userId, rating)
  }

  // Recalculate averageReview
  const result = db.prepare(`
    SELECT AVG(rating) as average FROM album_reviews
    WHERE albumId = ?
  `).get(albumId)

  db.prepare(`
    UPDATE album_stats SET averageReview = ?
    WHERE id = ?
  `).run(result.average.toFixed(2), albumId)

  return { success: true, average: parseFloat(result.average.toFixed(2)) }
}

// 🥇 Top-rated albums
export function getTopAlbumReviews(limit = 5) {
  return db.prepare(`
    SELECT * FROM album_stats
    WHERE averageReview IS NOT NULL
    ORDER BY averageReview DESC, trackCount DESC
    LIMIT ?
  `).all(limit)
}

// 👤 Albums reviewed by a specific user
export function getUserAlbumReviews(userId, limit = 5) {
  const rows = db.prepare(`
    SELECT
      s.albumName,
      s.albumArt,
      s.artistName,
      s.trackCount,
      r.rating
    FROM album_reviews r
    JOIN album_stats s ON s.id = r.albumId
    WHERE r.userId = ?
    ORDER BY r.rating DESC
    LIMIT ?
  `).all(userId, limit)

  return rows
}
