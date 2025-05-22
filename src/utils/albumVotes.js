// albumVotes.js
import fs from 'fs/promises'
const albumStatsPath = 'src/libs/albumStats.json'

export async function saveAlbumReview({ albumId, albumName, artistName, trackCount, userId, rating }) {
  try {
    let stats = []

    try {
      const file = await fs.readFile(albumStatsPath, 'utf8')
      stats = JSON.parse(file)
    } catch (err) {
      // File might not exist yet, fallback to empty
      stats = []
    }

    let albumEntry = stats.find(a => a.albumId === albumId)

    if (!albumEntry) {
      albumEntry = {
        albumId,
        albumName,
        artistName,
        trackCount,
        reviews: []
      }
      stats.push(albumEntry)
    }

    // Replace or add the user’s review
    const existing = albumEntry.reviews.find(r => r.userId === userId)
    if (existing) {
      existing.rating = rating
    } else {
      albumEntry.reviews.push({ userId, rating })
    }

    // Update average
    const total = albumEntry.reviews.reduce((sum, r) => sum + r.rating, 0)
    albumEntry.averageReview = parseFloat((total / albumEntry.reviews.length).toFixed(2))

    await fs.writeFile(albumStatsPath, JSON.stringify(stats, null, 2))
    return { success: true, average: albumEntry.averageReview }
  } catch (err) {
    console.error('Error saving album review:', err)
    return { success: false }
  }
}
