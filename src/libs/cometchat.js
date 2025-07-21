import { v4 as uuidv4 } from 'uuid'
import { buildUrl, makeRequest } from '../utils/networking.js'

export const startTimeStamp = Math.floor(Date.now() / 1000)

const headers = {
  appid: process.env.CHAT_API_KEY,
  authtoken: process.env.CHAT_TOKEN,
  dnt: 1,
  origin: 'https://tt.live',
  referer: 'https://tt.live/',
  sdk: 'javascript@3.0.10'
}

// Build the chat metadata consistently
const buildChatMetadata = (message) => ({
  message: message || '',
  avatarId: process.env.CHAT_AVATAR_ID,
  userName: process.env.CHAT_NAME,
  color: `#${process.env.CHAT_COLOUR}`,
  mentions: [],
  userUuid: process.env.BOT_USER_UUID,
  badges: ['VERIFIED', 'STAFF'],
  id: uuidv4()
})

// Build full message payload for CometChat API
const buildPayload = (options) => {
  let type = 'text'
  const data = {}

  if (options.images || options.gifs) {
    type = 'image'
    data.attachments = []
    const mediaUrls = options.images || options.gifs
    for (const url of mediaUrls) {
      const filename = url.split('/').pop()
      const extension = filename.split('.').pop()
      const mimeType = extension === 'gif' ? 'image/gif' : `image/${extension}`
      data.attachments.push({
        url,
        name: filename,
        mimeType,
        extension,
        size: 'unknown'
      })
    }
  } else {
    data.text = options.message || ''
  }

  data.metadata = {
    chatMessage: buildChatMetadata(options.message)
  }

  return {
    type,
    receiverType: options.receiverType === 'user' ? 'user' : 'group',
    category: 'message',
    receiver: options.receiverType === 'user' ? options.receiver : options.room,
    data
  }
}

export const postMessage = async (options) => {
  headers.appid = process.env.CHAT_API_KEY
  const paths = ['v3.0', 'messages']

  const payload = buildPayload(options)

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths)

  try {
    const messageResponse = await makeRequest(url, { method: 'POST', body: JSON.stringify(payload) }, headers)
    return {
      message: options.message,
      messageResponse
    }
  } catch (error) {
    console.error('Failed to post message:', error.message)
    throw error
  }
}

export const sendDirectMessage = async (receiverUUID, message) => {
  try {
    const options = {
      message,
      receiver: receiverUUID,
      receiverType: 'user'
    }
    return await postMessage(options)
  } catch (error) {
    console.error(`Failed to send direct message to ${receiverUUID}: ${error.message}`)
  }
}

export const joinChat = async (roomId) => {
  headers.appid = process.env.CHAT_API_KEY
  const paths = ['v3.0', 'groups', roomId, 'members']

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths)
  const response = await makeRequest(url, { headers, method: 'POST' })
  return response
}

/**
 * Fetch messages for a group or user since a timestamp.
 * @param {string} roomOrUserId - group ID or user ID to fetch messages for
 * @param {number} fromTimestamp - UNIX timestamp from which to fetch new messages
 * @param {'group'|'user'} receiverType - type of chat to fetch
 * @returns {Promise<object>} API response containing messages
 */
export const getMessages = async (roomOrUserId, fromTimestamp = startTimeStamp, receiverType = 'group') => {
  headers.appid = process.env.CHAT_API_KEY
  const messageLimit = 50

  const searchParams = [
    ['per_page', messageLimit],
    ['hideMessagesFromBlockedUsers', 0],
    ['unread', 0],
    ['withTags', 0],
    ['hideDeleted', 0],
    ['sentAt', fromTimestamp],
    ['affix', 'append']
  ]

  let paths
  if (receiverType === 'group') {
    paths = ['v3.0', 'groups', roomOrUserId, 'messages']
  } else if (receiverType === 'user') {
    paths = ['v3.0', 'users', roomOrUserId, 'messages']
  } else {
    throw new Error(`Invalid receiverType "${receiverType}"`)
  }

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths, searchParams)

  try {
    const response = await makeRequest(url, { headers })
    return response
  } catch (error) {
    console.error(`Failed to get messages for ${receiverType} ${roomOrUserId}:`, error.message)
    throw error
  }
}

export const getDirectConversation = async (userUUID, botUUID = process.env.BOT_USER_UUID, limit = 50) => {
  headers.appid = process.env.CHAT_API_KEY

  const searchParams = [
    ['conversationType', 'user'],
    ['limit', limit],
    ['uid', botUUID]
  ]

  const paths = ['v3', 'users', userUUID, 'conversation']

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths, searchParams)

  try {
    const response = await makeRequest(url, { headers })
    return response
  } catch (error) {
    console.error(`Failed to get direct conversation with user ${userUUID}:`, error.message)
    throw error
  }
}
