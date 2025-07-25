import { formatDistanceToNow } from 'date-fns'
import { getAverageRating } from './voteCounts.js' // adjust path if needed
import { postMessage } from '../libs/cometchat.js'
import { roomThemes } from '../handlers/message.js'
import db from '../database/db.js' // adjust path if needed
import { roomBot } from '../index.js' // if needed

export async function announceNowPlaying(room) {
  try {
    const song = roomBot.currentSong
    if (!song || !song.trackName || !song.artistName || !song.songId) return

    // 🧠 Skip standard message if we're in an album theme — let handleAlbumTheme() do its thing
    const theme = (roomThemes[room] || '').toLowerCase()
    const albumThemes = ['album monday', 'albums', 'album day']
    const isAlbumTheme = albumThemes.includes(theme)

    if (isAlbumTheme) {
      console.log(`🎧 Album theme detected (${theme}) — skipping default now playing message.`)
      return
    }

    const { songId, trackName, artistName } = song

    const stats = db.prepare(`
      SELECT playCount, lastPlayed
      FROM room_stats
      WHERE songId = ?
    `).get(songId)

    const avgInfo = await getAverageRating(song)

    let message = `🎵 Now playing: “${trackName}” by ${artistName}`

    if (!stats?.lastPlayed || stats.playCount === 1) {
      message += `\n🆕 First time playing in this room!`
    } else {
      message += `\n🔁 Played ${stats.playCount} time${stats.playCount !== 1 ? 's' : ''}`
      const lastPlayedTime = formatDistanceToNow(new Date(stats.lastPlayed), { addSuffix: true })
      message += `\n🕒 Last played ${lastPlayedTime}`
    }

    if (avgInfo.found) {
      message += `\n⭐ ${avgInfo.average}/5 (${avgInfo.count} rating${avgInfo.count === 1 ? '' : 's'})`
    }

    await postMessage({ room, message })
  } catch (err) {
    console.error('Error in announceNowPlaying:', err)
  }
}
