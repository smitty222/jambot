import { postMessage } from '../libs/cometchat.js'
import { fetchRecentSongs, fetchUserData } from './API.js'
import { roomBot } from '../index.js'

let songStatsEnabled = false

async function postVoteCountsForLastSong (room) {
  try {
    if (!songStatsEnabled) {
      return
    }

    const recentSongs = await fetchRecentSongs()

    if (!recentSongs || recentSongs.length === 0) {
      await postMessage({
        room,
        message: 'No recent songs found.'
      })
      return
    }

    // Get the most recent song
    const lastSong = recentSongs[0]

    if (!lastSong) {
      await postMessage({
        room,
        message: 'No previous song found.'
      })
      return
    }

    const { song, voteCounts, djUuid } = lastSong
    const { artistName, trackName } = song

    // Check if djUuid is available
    if (!djUuid) {
      await postMessage({
        room,
        message: 'No DJ found.'
      })
      return
    }

    // Fetch DJ nickname using djUuid
    let djNickname = 'Unknown DJ' // Default to 'Unknown DJ'
    try {
      const userData = await fetchUserData([djUuid]) // Fetch user data
      // Check if userData returned and extract the nickname
      if (userData.length > 0 && userData[0].userProfile) {
        djNickname = userData[0].userProfile.nickname // Access nickname from userProfile
      }
    } catch (fetchError) {
      console.error(`Failed to fetch DJ nickname: ${fetchError.message}`)
    }

    const popularity = roomBot.currentSong ? roomBot.currentSong.popularity : 'Unknown'

    const { likes = 0, dislikes = 0, stars = 0 } = voteCounts // Provide default values if not available

    const message = `${trackName} by ${artistName}\n 🎧 Played By: ${djNickname}\n 👍: ${likes}\n 👎: ${dislikes}\n ⭐: ${stars}\n Popularity Score: ${popularity} out of 100\n______________________________________________________`

    await postMessage({
      room,
      message
    })
  } catch (error) {
    console.error('Error in postVoteCountsForLastSong:', error.message)
    // Handle errors appropriately, such as notifying the user or logging the issue
  }
}

// Command to turn on song stats
async function enableSongStats () {
  songStatsEnabled = true
}

// Command to turn off song stats
async function disableSongStats () {
  songStatsEnabled = false
}

export { postVoteCountsForLastSong, enableSongStats, disableSongStats, songStatsEnabled }
