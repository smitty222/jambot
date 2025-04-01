import { v4 as uuidv4 } from 'uuid'
import { buildUrl, makeRequest } from '../utils/networking.js'

const startTimeStamp = Math.floor(Date.now() / 1000)

const headers = {
  appid: process.env.CHAT_API_KEY,
  authtoken: process.env.CHAT_TOKEN,
  dnt: 1,
  origin: 'https://tt.live',
  referer: 'https://tt.live/',
  sdk: 'javascript@3.0.10'
}

// Updated postMessage function with support for direct messages
export const postMessage = async (options) => {
  headers.appid = process.env.CHAT_API_KEY
  const paths = ['v3.0', 'messages']

  // Build the customData object
  const customData = {
    message: options.message || '',
    avatarId: process.env.CHAT_AVATAR_ID,
    userName: process.env.CHAT_NAME,
    color: `#${process.env.CHAT_COLOUR}`,
    mentions: [],
    userUuid: process.env.CHAT_USER_ID,
    badges: ['VERIFIED', 'STAFF'],
    id: uuidv4()
  }

  // Handle URL-specific messages
  if (options.message && options.message.startsWith('https://')) {
    customData.type = 'URL' // Explicitly specify URL message type
    customData.url = options.message // Include the URL in the customData
    customData.interactive = true // Add an interactive flag if needed
  }

  // Handle images
  if (options.images) {
    customData.imageUrls = options.images // Ensure imageUrls is an array of URLs
  }

  // Handle GIFs
  if (options.gifs) {
    customData.gifUrls = options.gifs // For GIFs if needed
  }

  // Handle mentions
  if (options.mentions) {
    customData.mentions = options.mentions.map((mention) => ({
      start: mention.position,
      userNickname: mention.nickname,
      userUuid: mention.userId
    }))
  }

  // If song data is provided in the options, include it in the customData
  if (options.customData && options.customData.songs) {
    customData.songs = options.customData.songs
  }

  // Determine if the message is for a group or a user
  const receiverType = options.receiverType === 'user' ? 'user' : 'group'
  const receiver = receiverType === 'user' ? options.receiver : options.room

  const payload = {
    type: 'text',
    receiverType: receiverType === 'user' ? 'user' : 'group',
    category: 'message',
    data: {
      text: options.message || '', // The actual message content
      metadata: {
        chatMessage: customData // Store extra data inside metadata
      }
    },
    receiver
  }

  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths)
  const messageResponse = await makeRequest(url, { method: 'POST', body: JSON.stringify(payload) }, headers)

  return {
    message: options.message,
    messageResponse
  }
}

// Function to send a direct message to a specific user
export const sendDirectMessage = async (receiverUUID, message) => {
  try {
    const options = {
      message,
      receiver: receiverUUID, // Receiver's UUID for direct message
      receiverType: 'user' // Specify that the receiver is a user
    }
    return await postMessage(options) // Use the modified postMessage function
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

export const getMessages = async (roomOrUserId, fromTimestamp = startTimeStamp, receiverType = 'group') => {
  headers.appid = process.env.CHAT_API_KEY
  const messageLimit = 50

  let paths
  const searchParams = [
    ['per_page', messageLimit],
    ['hideMessagesFromBlockedUsers', 0],
    ['unread', 0],
    ['withTags', 0],
    ['hideDeleted', 0],
    ['sentAt', fromTimestamp],
    ['affix', 'append']
  ]

  if (receiverType === 'group') {
    // Fetching messages for a group chat
    paths = ['v3.0', 'groups', roomOrUserId, 'messages']
  } else if (receiverType === 'user') {
    // Fetching direct messages for a user
    paths = ['v3.0', 'users', roomOrUserId, 'messages'] // This fetches direct messages for a user
  }

  // Build the URL for the API request
  const url = buildUrl(`${process.env.CHAT_API_KEY}.apiclient-us.cometchat.io`, paths, searchParams)

  // Fetch messages
  return await makeRequest(url, { headers })
}
