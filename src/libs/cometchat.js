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

export const postMessage = async (options) => {
  headers.appid = process.env.CHAT_API_KEY
  const paths = ['v3.0', 'messages']

  // Build the base chat metadata (not for attachments)
  const chatMessageMetadata = {
    message: options.message || '',
    avatarId: process.env.CHAT_AVATAR_ID,
    userName: process.env.CHAT_NAME,
    color: `#${process.env.CHAT_COLOUR}`,
    mentions: [],
    userUuid: process.env.CHAT_USER_ID,
    badges: ['VERIFIED', 'STAFF'],
    id: uuidv4()
  }

  if (options.mentions) {
    chatMessageMetadata.mentions = options.mentions.map((mention) => ({
      start: mention.position,
      userNickname: mention.nickname,
      userUuid: mention.userId
    }))
  }

  if (options.customData && options.customData.songs) {
    chatMessageMetadata.songs = options.customData.songs
  }

  // Determine if this is a media message
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
        size: 'unknown' // Optional; fill in if known
      })
    }
  } else {
    data.text = options.message || ''
  }

  data.metadata = {
    chatMessage: chatMessageMetadata
  }

  const payload = {
    type,
    receiverType: options.receiverType === 'user' ? 'user' : 'group',
    category: 'message',
    receiver: options.receiverType === 'user' ? options.receiver : options.room,
    data
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
