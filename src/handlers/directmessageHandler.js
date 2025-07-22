import { sendDirectMessage } from '../libs/Cometchat/messageSender.js'
import { getMessages } from '../libs/Cometchat/messageFetcher.js'
import { getTrackedUsers } from '../utils/trackedUsers.js'

const lastTimestamps = new Map() // userUUID -> timestamp

/**
 * Poll for new direct messages and respond
 */
export const pollDirectMessages = async () => {
  const users = getTrackedUsers()

  for (const userUUID of users) {
    try {
      // Default to current time if no timestamp saved
      const fromTimestamp = lastTimestamps.get(userUUID) || Math.floor(Date.now() / 1000)

      const response = await getMessages(userUUID, fromTimestamp, 'user')
      const messages = response.data || []

      for (const message of messages) {
        const senderUUID = message.sender?.uid

        // Skip messages sent by the bot itself
        if (senderUUID === process.env.BOT_USER_UUID) continue

        // Update the timestamp tracker
        lastTimestamps.set(userUUID, Math.max(fromTimestamp, message.sentAt))

        const userMessage = message.data?.text?.trim()
        if (!userMessage) continue

        // === Your custom DM logic here ===
        if (userMessage.toLowerCase() === 'hello') {
          await sendDirectMessage(senderUUID, 'Hi there! 👋')
        } else {
          await sendDirectMessage(senderUUID, `You said: "${userMessage}"`)
        }
      }
    } catch (error) {
      console.error(`DM Polling error for user ${userUUID}:`, error.message)
    }
  }
}
