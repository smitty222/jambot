// albumVotes.js
import fs from 'fs/promises'
const albumStatsPath = 'src/libs/albumStats.json'

export async function saveAlbumReview({ albumId, albumName, albumArt, artistName, trackCount, userId, rating }) {
  try {
    if (typeof rating !== 'number' || rating < 1 || rating > 6) {
      return { success: false, message: 'Rating must be between 1 and 6' }
    }

    let stats = []

    try {
      const file = await fs.readFile(albumStatsPath, 'utf8')
      stats = JSON.parse(file)
    } catch (err) {
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
    } else if (!albumEntry.albumArt && albumArt) {
      albumEntry.albumArt = albumArt
    }

    const existing = albumEntry.reviews.find(r => r.userId === userId)
    if (existing) {
      existing.rating = rating
    } else {
      albumEntry.reviews.push({ userId, rating })
    }

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
export const getUserAlbumReviews = async (userId, limit = 5) => {
  try {
    const file = await fs.readFile(albumStatsPath, 'utf-8')
    const albums = JSON.parse(file)

    // Filter albums reviewed by user and map to include user's rating
    const userAlbums = albums
      .map(album => {
        const userReview = album.reviews?.find(r => r.userId === userId)
        if (userReview) {
          return {
            albumId: album.albumId,
            albumName: album.albumName,
            albumArt: album.albumArt,
            artistName: album.artistName,
            trackCount: album.trackCount,
            rating: userReview.rating
          }
        }
        return null
      })
      .filter(a => a !== null)

    // Sort by user's rating descending
    userAlbums.sort((a, b) => b.rating - a.rating)

    // Return top `limit`
    return userAlbums.slice(0, limit)
  } catch (err) {
    console.error('Failed to fetch user album reviews:', err)
    return []
  }
}

