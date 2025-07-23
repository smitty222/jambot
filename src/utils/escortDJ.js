import { roomBot } from '../index.js'
import { postMessage } from '../libs/cometChat.js'
import { getUserNickname } from '../handlers/roulette.js'

const activeRemovals = {}

function convertDurationToSeconds (duration) {
  const [minutes, seconds] = duration.split(':').map(Number)
  return (minutes * 60) + seconds
}

async function escortUserFromDJStand (userUuid) {
  try {
    if (activeRemovals[userUuid]) {
      console.log(`User ${userUuid} is already scheduled for removal.`)
      return
    }

    const rawDuration = roomBot.currentSong?.songDuration
    if (!rawDuration) {
      throw new Error('No song is currently playing.')
    }

    // Convert the raw duration to seconds
    const songDurationInSeconds = convertDurationToSeconds(rawDuration)

    // Mark the user for removal to prevent duplicate timeouts
    activeRemovals[userUuid] = true

    console.log(`User ${userUuid} will be removed in ${songDurationInSeconds} seconds`)

    setTimeout(async () => {
      try {
        const nickname = await getUserNickname([userUuid])

        // Send a message thanking the DJ
        await postMessage({
          room: process.env.ROOM_UUID,
          message: `@${nickname} its been an honor and a privilege. Thanks for DJing.`
        })

        await new Promise(resolve => setTimeout(resolve, 2000)) // Wait before the next message

        // Send the stage dive message
        await postMessage({
          room: process.env.ROOM_UUID,
          message: `@${nickname} stage dive!`
        })

        // Remove the DJ from the stage
        await roomBot.removeDJ(userUuid)
        console.log(`User ${userUuid} removed from DJ stand after their song ended.`)

        // Clear the active removal status
        delete activeRemovals[userUuid]
      } catch (error) {
        console.error('Error during DJ removal process:', error)
      }
    }, songDurationInSeconds * 1000) // Use the song duration to time the removal
  } catch (error) {
    console.error('Error escorting user from DJ stand:', error)
  }
}

export { escortUserFromDJStand }
