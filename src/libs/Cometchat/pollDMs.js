// pollDMs.js
import { getMessages } from "./messageFetcher.js"
import { handleDirectMessage } from "../../handlers/message.js"

const smittyUUID = process.env.SMITTY_UUID
let lastSeenTimestamp = Math.floor(Date.now() / 1000) - 30  // Start 30 seconds ago

export async function pollForDMs(botUUID) {
  try {
    const messages = await getMessages(smittyUUID, lastSeenTimestamp, 'user')

    if (messages && Array.isArray(messages.data)) {
      for (const msg of messages.data) {
        const isNew = msg.sentAt > lastSeenTimestamp
        const isIncoming = msg.sender !== botUUID

        if (isNew && isIncoming) {
          await handleDirectMessage(msg)
          lastSeenTimestamp = msg.sentAt
        }
      }
    } else {
      console.warn('No messages or unexpected format from CometChat:', messages)
    }
  } catch (err) {
    console.error('DM polling error:', err.message)
  }
}