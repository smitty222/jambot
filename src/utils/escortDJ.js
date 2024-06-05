import { currentsongduration, fetchUserData } from './API.js'
import { roomBot } from '../index.js'
import { postMessage } from '../libs/cometchat.js'

async function escortUserFromDJStand (userUuid) {
  try {
    const songDuration = await currentsongduration()

    if (!songDuration) {
      throw new Error('No song is currently playing.')
    }

    setTimeout(async () => {
      try {
        // Fetch the user data to get the nickname
        const nicknames = await fetchUserData([userUuid])
        const djNickname = nicknames[0]

        // Send an appreciation message to the DJ
        await postMessage({
          room: process.env.ROOM_UUID,
          message: `@${djNickname} it's been an honor and a privilege. Thanks for DJing.`
        })

        // Wait for a brief moment
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Send a stage dive message
        await postMessage({
          room: process.env.ROOM_UUID,
          message: `@${djNickname} stage dive!`
        })

        // Remove the DJ
        await roomBot.removeDJ(userUuid)
        console.log(`User ${userUuid} removed from DJ stand after their song ended.`)
      } catch (error) {
        console.error('Error handling end of song:', error)
      }
    }, songDuration * 1000)
  } catch (error) {
    console.error('Error escorting user from DJ stand:', error)
  }
}

export { escortUserFromDJStand }
