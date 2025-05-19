import fs from 'fs/promises'
import path from 'path'

const statsFilePath = path.join(process.cwd(), 'src/libs/roomStats.json')

export async function logCurrentSong(song, likes = 0, dislikes = 0, stars = 0) {
  if (!song || !song.trackName || !song.artistName) return

  let history = []

  // Safely read and parse existing file
  try {
    await fs.stat(statsFilePath) // just checking if file exists
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

  // Matching logic
  const existingIndex = history.findIndex(s =>
    (song.songId && s.songId === song.songId) ||
    (!song.songId &&
      s.trackName === song.trackName &&
      s.artistName === song.artistName)
  )

  if (existingIndex !== -1) {
    const existing = history[existingIndex]
    existing.playCount += 1
    existing.lastPlayed = now
    existing.songId = existing.songId || song.songId || null
    existing.songDuration = existing.songDuration || song.songDuration || null
    existing.likes += likes
    existing.dislikes += dislikes
    existing.stars += stars

  } else {
    history.push({
      trackName: song.trackName,
      artistName: song.artistName,
      songId: song.songId || null,
      songDuration: song.songDuration || null,
      playCount: 1,
      likes,
      dislikes,
      stars,
      lastPlayed: now
    })
  }

  // Write back
  try {
    await fs.writeFile(statsFilePath, JSON.stringify(history, null, 2))
  } catch (e) {
    console.error('Error writing to roomStats.json:', e)
  }
}
