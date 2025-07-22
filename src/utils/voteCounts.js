import { postMessage } from '../libs/Cometchat/messageSender.js'
import { fetchRecentSongs, fetchUserData } from './API.js'
import { roomBot } from '../index.js'
import { logCurrentSong } from '../libs/roomStats.js'
import fs from 'fs/promises'
import path from 'path'
import { roomThemes } from '../handlers/message.js'
import { formatDistanceToNow } from 'date-fns'

const statsPath = path.join(process.cwd(), 'src/libs/roomStats.json')

let songStatsEnabled = false

async function postVoteCountsForLastSong(room) {
  try {
    const recentSongs = await fetchRecentSongs()

    if (!recentSongs || recentSongs.length === 0) {
      console.log('No recent songs found.')
      return
    }

    // Get the most recent song
    const lastSong = recentSongs[0]

    if (!lastSong) {
      console.log('No previous song found.')
      return
    }

    const { song, voteCounts, djUuid } = lastSong
   
    const songDuration = song.duration || null
    song.songDuration = songDuration

    const { artistName, trackName, songId } = song

    // Check if djUuid is available
    if (!djUuid) {
      console.log('No DJ found.')
      return
    }

    // Fetch DJ nickname using djUuid
    let djNickname = 'Unknown DJ' // Default to 'Unknown DJ'
    try {
      const userData = await fetchUserData([djUuid]) // Fetch user data
      if (userData.length > 0 && userData[0].userProfile) {
        djNickname = userData[0].userProfile.nickname // Access nickname from userProfile
      }
    } catch (fetchError) {
      console.error(`Failed to fetch DJ nickname: ${fetchError.message}`)
    }

    const popularity = roomBot.currentSong ? roomBot.currentSong.popularity : 'Unknown'

    const { likes = 0, dislikes = 0, stars = 0 } = voteCounts // Provide default values if not available

    // Log the song stats (this will always happen)
    await logCurrentSong(song, likes, dislikes, stars)
    console.log(`Logged stats for ${trackName} by ${artistName}: 👍 ${likes}, 👎 ${dislikes}, ⭐ ${stars}`)

        if (songStatsEnabled) {
          let message = `🛑 **Song Recap**\n`
          message += `🎵 *${trackName}* by *${artistName}*\n`
          message += `🎧 Played by: **${djNickname}**\n`
          message += `👍 ${likes}   👎 ${dislikes}   ❤️ ${stars}`

      // Optionally pull in average review and play count
      try {
        const content = await fs.readFile(statsPath, 'utf8')
        const stats = JSON.parse(content)
        const songEntry = stats.find(s => s.songId === song.songId)

       if (songEntry) {
          if (songEntry.averageReview !== undefined) {
           message += `   ⭐ ${songEntry.averageReview}/5`
          }

          if (songEntry.playCount !== undefined) {
           message += `\n🔁 Played ${songEntry.playCount} time${songEntry.playCount !== 1 ? 's' : ''}`
          }
        }
      } catch (err) {
        console.warn('Could not read songStats for end-of-song post:', err.message)
      }

      await postMessage({ room, message })

    } else {
      console.log('Posting song stats is disabled.')
    }
  } catch (error) {
    console.error('Error in postVoteCountsForLastSong:', error.message)
  }
}

export async function announceNowPlaying(room) {
  try {
    const song = roomBot.currentSong

    if (!song || !song.trackName || !song.artistName || !song.songId) {
      console.log('Not enough data to announce song.')
      return
    }

    // Load roomStats.json
    let stats = []
    try {
      const content = await fs.readFile(statsPath, 'utf8')
      stats = JSON.parse(content)
    } catch (err) {
      console.warn('Could not read roomStats.json, defaulting to blank stats.')
    }

    const entry = stats.find(s => s.songId === song.songId)
    const playCount = entry?.playCount || 1
    const avgReview = entry?.averageReview !== undefined ? `⭐ ${entry.averageReview}/5` : null

    let message = `🎵 Now playing: “${song.trackName}” by ${song.artistName}`

    // Album theme detection
    const theme = (roomThemes[room] || '').toLowerCase()
    const albumThemes = ['album monday', 'albums', 'album day']
    const isAlbumTheme = albumThemes.includes(theme)

    // Track info append
    if (isAlbumTheme && song.trackNumber && song.totalTracks) {
      message += `\n📀 Track ${song.trackNumber} of ${song.totalTracks}`
    }

    if (!entry?.lastPlayed || playCount === 1) {
      message += `\n🆕 First time playing in this room!`
    } else {
      message += `\n🔁 Played ${playCount} time${playCount !== 1 ? 's' : ''}`
      const lastPlayedTime = formatDistanceToNow(new Date(entry.lastPlayed), { addSuffix: true })
      message += `\n🕒 Last played ${lastPlayedTime}`
    }

    if (avgReview) {
      message += `\n${avgReview}`
    }

    await postMessage({ room, message })
  } catch (error) {
    console.error('Error in announceNowPlaying:', error.message)
  }
}



export async function saveSongReview({ currentSong, rating, sender }) {
  try {
    const content = await fs.readFile(statsPath, 'utf8')
    const stats = JSON.parse(content)

    const songIndex = stats.findIndex(s =>
      (currentSong.songId && s.songId === currentSong.songId) ||
      (!currentSong.songId &&
        s.trackName === currentSong.trackName &&
        s.artistName === currentSong.artistName)
    )

    if (songIndex === -1) return { success: false, reason: 'not_found' }

    const songStats = stats[songIndex]
    songStats.reviews = songStats.reviews || []

    // Update or add the user's review
    const existingReview = songStats.reviews.find(r => r.userId === sender)
    if (existingReview) {
      existingReview.rating = rating
      existingReview.userPlayCount = (existingReview.userPlayCount || 0) + 1
    } else {
      songStats.reviews.push({
        userId: sender,
        rating,
        userPlayCount: 1
      })
    }

    // Recalculate average
    const total = songStats.reviews.reduce((sum, r) => sum + r.rating, 0)
    songStats.averageReview = parseFloat((total / songStats.reviews.length).toFixed(2))

    await fs.writeFile(statsPath, JSON.stringify(stats, null, 2))

    return { success: true }
  } catch (err) {
    console.error('Error in saveSongReview:', err)
    return { success: false, reason: 'error' }
  }
}


export async function getAverageRating(currentSong) {
  try {
    const content = await fs.readFile(statsPath, 'utf8')
    const stats = JSON.parse(content)

    const song = stats.find(s =>
      (currentSong.songId && s.songId === currentSong.songId) ||
      (!currentSong.songId &&
        s.trackName === currentSong.trackName &&
        s.artistName === currentSong.artistName)
    )

    if (!song || !song.reviews || song.reviews.length === 0) {
      return { found: false }
    }

    const avg = parseFloat((song.reviews.reduce((sum, r) => sum + r.rating, 0) / song.reviews.length).toFixed(2))

    return {
      found: true,
      average: avg,
      count: song.reviews.length
    }
  } catch (err) {
    console.error('Error getting average rating:', err)
    return { found: false }
  }
}


function isSongStatsEnabled () {
  return songStatsEnabled
}
// Command to turn on song stats
async function enableSongStats () {
  songStatsEnabled = true
}

// Command to turn off song stats
async function disableSongStats () {
  songStatsEnabled = false
}

export { postVoteCountsForLastSong, enableSongStats, disableSongStats, isSongStatsEnabled }
