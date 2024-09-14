import { postMessage } from '../libs/cometchat.js'
import { fetchRecentSongs } from './API.js'
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
    const popularity = roomBot.currentSong.popularity
    const { song, voteCounts } = lastSong
    const { artistName, trackName } = song
    const { likes = 0, dislikes = 0, stars = 0 } = voteCounts // Provide default values if not available
    const message = `${trackName} by ${artistName}:\n 👍: ${likes}\n 👎: ${dislikes}\n ⭐: ${stars}\n Popularity Score: ${popularity} out of 100`

    await postMessage({
      room,
      message
    })
  } catch (error) {
    console.error('Error posting vote counts for last song:', error.message)
    // Handle errors appropriately
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
