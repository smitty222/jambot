import { roomBot } from '../runtime/roomBot.js'
import { postMessage } from '../libs/cometchat.js'
import { env } from '../config.js'
import { logger } from './logging.js'
// Use the standalone nickname util instead of importing from the monolithic
// message handler. This avoids a circular dependency and makes the
// function more reusable.
import { getUserNickname } from './nickname.js'

const activeRemovals = {}

function convertDurationToSeconds (duration) {
  const [minutes, seconds] = duration.split(':').map(Number)
  return (minutes * 60) + seconds
}

async function escortUserFromDJStand (userUuid) {
  try {
    if (activeRemovals[userUuid]) {
      logger.info('[escortDJ] removal already scheduled', { userUuid })
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

    logger.info('[escortDJ] scheduled DJ removal', { userUuid, songDurationInSeconds })

    setTimeout(async () => {
      try {
        // getUserNickname accepts a string; if an array is passed it
        // gracefully handles the first element. Here we pass the UUID
        // directly to avoid unnecessary array allocation.
        const nickname = await getUserNickname(userUuid)

        // Send a message thanking the DJ
        await postMessage({
          room: env.roomUuid,
          message: `@${nickname} its been an honor and a privilege. Thanks for DJing.`
        })

        await new Promise(resolve => setTimeout(resolve, 2000)) // Wait before the next message

        // Send the stage dive message
        await postMessage({
          room: env.roomUuid,
          message: `@${nickname} stage dive!`
        })

        // Remove the DJ from the stage
        await roomBot.removeDJ(userUuid)
        logger.info('[escortDJ] DJ removed after song ended', { userUuid })

        // Clear the active removal status
        delete activeRemovals[userUuid]
      } catch (error) {
        logger.error('[escortDJ] error during DJ removal process', { userUuid, err: error })
      }
    }, songDurationInSeconds * 1000) // Use the song duration to time the removal
  } catch (error) {
    logger.error('[escortDJ] error escorting user from DJ stand', { userUuid, err: error })
  }
}

export { escortUserFromDJStand }
