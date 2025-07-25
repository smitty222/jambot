// votecounts.js
import { postMessage } from '../libs/cometchat.js'
import { fetchRecentSongs, fetchUserData } from './API.js'
import db from '../database/db.js'

let songStatsEnabled = false

export async function postVoteCountsForLastSong(room) {
  try {
    const recentSongs = await fetchRecentSongs()
    if (!recentSongs?.length) return console.log('No recent songs found.')

    const { song, voteCounts, djUuid } = recentSongs[0]
    if (!song) return console.log('No song found.')

    const { trackName, artistName, songId, duration } = song
    const { likes = 0, dislikes = 0, stars = 0 } = voteCounts

    const now = new Date().toISOString()
    const durationStr = duration || null

    // Update stats table
    const existing = db.prepare('SELECT * FROM room_stats WHERE songId = ?').get(songId)

    if (existing) {
      db.prepare(`
        UPDATE room_stats SET 
          playCount = playCount + 1,
          likes = likes + ?,
          dislikes = dislikes + ?,
          stars = stars + ?,
          lastPlayed = ?
        WHERE songId = ?
      `).run(likes, dislikes, stars, now, songId)
    } else {
      db.prepare(`
        INSERT INTO room_stats (songId, trackName, artistName, songDuration, playCount, likes, dislikes, stars, lastPlayed)
        VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
      `).run(songId, trackName, artistName, durationStr, likes, dislikes, stars, now)
    }

    console.log(`Logged stats for ${trackName} by ${artistName}: 👍 ${likes}, 👎 ${dislikes}, ❤️ ${stars}`)

    // 🎯 Only post if stats are enabled
    if (!songStatsEnabled) return

    let message = `🛑 **Song Recap**\n🎵 *${trackName}* by *${artistName}*`

    // Fetch DJ nickname
    let djNickname = 'Unknown DJ'
    try {
      const [user] = await fetchUserData([djUuid])
      djNickname = user?.userProfile?.nickname || djNickname
    } catch {}

    message += `\n🎧 Played by: **${djNickname}**\n👍 ${likes}   👎 ${dislikes}   ❤️ ${stars}`

    // Append play count and avg review
    const updated = db.prepare('SELECT playCount, averageReview FROM room_stats WHERE songId = ?').get(songId)
    if (updated) {
      if (updated.averageReview) {
        message += `   ⭐ ${updated.averageReview}/5`
      }

      if (updated.playCount) {
        message += `\n🔁 Played ${updated.playCount} time${updated.playCount !== 1 ? 's' : ''}`
      }
    }

    await postMessage({ room, message })
  } catch (error) {
    console.error('Error in postVoteCountsForLastSong:', error)
  }
}

export async function saveSongReview({ currentSong, rating, sender }) {
  try {
    const { songId, trackName, artistName } = currentSong
    const existing = db.prepare('SELECT * FROM song_reviews WHERE songId = ? AND userId = ?').get(songId, sender)

    if (existing) {
      db.prepare(`
        UPDATE song_reviews 
        SET rating = ?, userPlayCount = userPlayCount + 1 
        WHERE songId = ? AND userId = ?
      `).run(rating, songId, sender)
    } else {
      db.prepare(`
        INSERT INTO song_reviews (songId, userId, rating, userPlayCount)
        VALUES (?, ?, ?, 1)
      `).run(songId, sender, rating)
    }

    // Recalculate average
    const rows = db.prepare('SELECT rating FROM song_reviews WHERE songId = ?').all(songId)
    const total = rows.reduce((sum, r) => sum + r.rating, 0)
    const average = parseFloat((total / rows.length).toFixed(2))

    db.prepare('UPDATE room_stats SET averageReview = ? WHERE songId = ?').run(average, songId)

    return { success: true }
  } catch (err) {
    console.error('Error in saveSongReview:', err)
    return { success: false, reason: 'error' }
  }
}

export async function getAverageRating(currentSong) {
  try {
    const stmt = db.prepare(`
      SELECT AVG(rating) as average, COUNT(*) as count
      FROM song_reviews
      WHERE songId = ?
    `)

    const result = stmt.get(currentSong.songId)

    if (!result || result.count === 0) {
      return { found: false }
    }

    return {
      found: true,
      average: parseFloat(result.average.toFixed(2)),
      count: result.count
    }
  } catch (err) {
    console.error('Error getting average rating:', err)
    return { found: false }
  }
}


// Flag controls
export function isSongStatsEnabled() {
  return songStatsEnabled
}

export function enableSongStats() {
  songStatsEnabled = true
}

export function disableSongStats() {
  songStatsEnabled = false
}
