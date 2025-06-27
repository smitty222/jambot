import fs from 'fs/promises'
import path from 'path'

const statsFilePath = path.join(process.cwd(), 'src/libs/roomStats.json')

export async function logCurrentSong(song, likes = 0, dislikes = 0, stars = 0) {
  if (!song || !song.trackName || !song.artistName) return

  let history = []

  try {
    await fs.stat(statsFilePath)
    const content = await fs.readFile(statsFilePath, 'utf8')
    if (content.trim()) {
      history = JSON.parse(content)
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('Error reading roomStats.json:', e)
    }
  }

  const now = new Date().toISOString()

  const existingIndex = history.findIndex(s =>
    (song.songId && s.songId === song.songId) ||
    (!song.songId &&
      s.trackName === song.trackName &&
      s.artistName === song.artistName)
  )

  if (existingIndex !== -1) {
    const existing = history[existingIndex]
    existing.playCount += 1
    existing.songId = existing.songId || song.songId || null
    existing.spotifyTrackId = existing.spotifyTrackId || song.spotifyTrackId || null  
    existing.songDuration = existing.songDuration || song.songDuration || null
    existing.likes += likes
    existing.dislikes += dislikes
    existing.stars += stars

  } else {
    history.push({
      trackName: song.trackName,
      artistName: song.artistName,
      songId: song.songId || null,
      spotifyTrackId: song.spotifyTrackId || null,   
      songDuration: song.songDuration || null,
      playCount: 1,
      likes,
      dislikes,
      stars
    })
  }

  try {
    history.sort((a, b) => {
      if (!a.artistName) return 1;
      if (!b.artistName) return -1;
      return a.artistName.localeCompare(b.artistName);
    });
    await fs.writeFile(statsFilePath, JSON.stringify(history, null, 2))
  } catch (e) {
    console.error('Error writing to roomStats.json:', e)
  }
}

export async function updateLastPlayed(song) {
  if (!song || !song.trackName || !song.artistName) return

  try {
    const content = await fs.readFile(statsFilePath, 'utf8')
    const history = JSON.parse(content)

    const existing = history.find(s =>
      (song.songId && s.songId === song.songId) ||
      (!song.songId &&
        s.trackName === song.trackName &&
        s.artistName === song.artistName)
    )

    if (!existing) return

    existing.lastPlayed = new Date().toISOString()

    await fs.writeFile(statsFilePath, JSON.stringify(history, null, 2))
  } catch (err) {
    console.error('Error updating lastPlayed in roomStats.json:', err)
  }
}

export async function getUserSongReviews(userId, limit = 5) {
  try {
    const file = await fs.readFile(statsFilePath, 'utf-8')
    const songs = JSON.parse(file)

    const userSongs = songs
      .map(song => {
        const userReview = song.reviews?.find(r => r.userId === userId)
        if (userReview) {
          return {
            trackName: song.trackName,
            artistName: song.artistName,
            albumName: song.albumName || 'Unknown Album',
            spotifyTrackId: song.spotifyTrackId,
            rating: userReview.rating
          }
        }
        return null
      })
      .filter(Boolean)

    userSongs.sort((a, b) => b.rating - a.rating)

    return userSongs.slice(0, limit)
  } catch (err) {
    console.error('Failed to fetch user song reviews:', err)
    return []
  }
}

