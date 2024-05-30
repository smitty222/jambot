import { postMessage } from '../libs/cometchat.js'
import { fetchRecentSongs } from './API.js'

async function postVoteCountsForLastSong (room) {
  try {
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

    const { song, voteCounts } = lastSong
    const { artistName, trackName } = song
    const { likes = 0, dislikes = 0, stars = 0 } = voteCounts // Provide default values if not available
    const message = `${trackName} by ${artistName} - 👍: ${likes}, 👎: ${dislikes}, ⭐: ${stars}`

    await postMessage({
      room,
      message
    })
  } catch (error) {
    console.error('Error posting vote counts for last song:', error.message)
    // Handle errors appropriately
  }
}

export { postVoteCountsForLastSong }
