// albumVotes.js
import fs from 'fs/promises'
const albumStatsPath = 'src/libs/albumStats.json'

export async function saveAlbumReview({ albumId, albumName, albumArt, artistName, trackCount, userId, rating }) {
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
        albumArt,
        artistName,
        trackCount,
        reviews: []
      }
      stats.push(albumEntry)
    } else {
      // If album already exists but was missing albumArt, update it
      if (!albumEntry.albumArt && albumArt) {
        albumEntry.albumArt = albumArt
      }
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



export const getTopAlbumReviews = async (limit = 5) => {
  try {
    const file = await fs.readFile(albumStatsPath, 'utf-8')
    const albums = JSON.parse(file)

    const sorted = albums
      .filter(album => typeof album.averageReview === 'number')
      .sort((a, b) => {
        if (b.averageReview !== a.averageReview) {
          return b.averageReview - a.averageReview
        }
        return (b.reviews?.length || 0) - (a.reviews?.length || 0)
      })

    return sorted.slice(0, limit)
  } catch (err) {
    console.error('Failed to fetch top album reviews:', err)
    return []
  }
}

