import { postMessage } from '../libs/cometchat.js'
import { fetchRecentSongs, fetchUserData } from './API.js'
import { roomBot } from '../index.js'
import { logCurrentSong } from '../libs/roomStats.js'

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

    // If songStatsEnabled is true, post the message
    if (songStatsEnabled) {
      const message = `${trackName} by ${artistName}\n 🎧 Played By: ${djNickname}\n 👍: ${likes}\n 👎: ${dislikes}\n ⭐: ${stars}\n Popularity Score: ${popularity} out of 100\n______________________________________________________`

      await postMessage({
        room,
        message
      })
    } else {
      console.log('Posting song stats is disabled.')
    }
  } catch (error) {
    console.error('Error in postVoteCountsForLastSong:', error.message)
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
