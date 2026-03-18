// src/handlers/dmHandler.js
//
// This module encapsulates the logic for handling direct messages (DMs) sent
// to the bot. It normalizes incoming payloads, supports public and admin
// commands, and responds via direct messages or posting in the room. By
// isolating DM handling in its own file, we reduce the size of
// `message.js` and make the codebase easier to maintain.

import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { env } from '../config.js'
import { logger } from '../utils/logging.js'
import { isUserAuthorized } from '../utils/API.js'
import { getUserWallet } from '../database/dbwalletmanager.js'

// Build an allow list of UUIDs that are always considered DM admins.
const DM_ALLOW_LIST = new Set(
  (env.dmAllowList || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)

// TTL user token used for mod checks. See utils/API.js for details.
const ttlUserToken = env.ttlUserToken

// Determine whether the sender is allowed to use admin DM commands.
async function isDmAdmin (uuid) {
  if (!uuid) return false
  // 1) Explicit allow list
  if (DM_ALLOW_LIST.has(uuid)) return true
  // 2) Room moderators (via CometChat)
  try {
    if (await isUserAuthorized(uuid, ttlUserToken)) return true
  } catch { /* no-op */ }
  // 3) Owner / test accounts
  if (uuid === process.env.CHAT_OWNER_ID) return true
  if (uuid === process.env.CHAT_TEST_USER_ID) return true
  return false
}

// Wrapper around sendDirectMessage in case future auth is required.
async function sendAuthenticatedDM (userUuid, text) {
  return sendDirectMessage(userUuid, text)
}

/**
 * Handle an incoming DM payload. Supports public commands (/help, /whoami,
 * /balance) and admin commands (/say, /addmoney). Unknown commands result
 * in a help message. Errors are logged but not rethrown.
 *
 * @param {Object} payload The CometChat DM payload.
 */
export async function handleDirectMessage (payload) {
  // Normalize sender from various payload shapes
  const senderRaw =
    payload?.sender ?? payload?.senderId ?? payload?.from ?? payload?.data?.sender
  const sender =
    typeof senderRaw === 'string'
      ? senderRaw
      : senderRaw?.uid || senderRaw?.id || senderRaw?.userUuid || senderRaw?.userId || ''

  // Normalize text
  const rawText = (payload?.message ?? payload?.data?.text ?? payload?.text ?? '').toString()
  const text = rawText.trim()
  if (!sender || !text) return false

  logger.info('[DM] received', { sender, text })

  // Ignore our own messages
  const botUid = env.botUserUuid || env.chatUserId
  if (botUid && sender === botUid) return true

  // Parse "/command args"
  const m = text.match(/^\/(\S+)(?:\s+([\s\S]*))?$/)
  if (!m) {
    await sendAuthenticatedDM(sender, '🤖 Unknown DM input. Try `/help`.')
    return true
  }
  const cmd = m[1].toLowerCase()
  const args = (m[2] || '').trim()

  // Public DM commands (anyone)
  if (cmd === 'help') {
    await sendAuthenticatedDM(sender,
      [
        'DM Commands:',
        '• /help — show this',
        '• /whoami — show your UUID',
        '• /balance — show your wallet',
        '',
        'Admin-only:',
        '• /say <message> — post in the room'
      ].join('\n')
    )
    return true
  }

  if (cmd === 'whoami') {
    await sendAuthenticatedDM(sender, `Your UUID: ${sender}`)
    return true
  }

  if (cmd === 'balance') {
    try {
      const bal = await getUserWallet(sender)
      await sendAuthenticatedDM(sender, `Your balance is $${bal}.`)
    } catch {
      await sendAuthenticatedDM(sender, 'Sorry, unable to retrieve your balance right now.')
    }
    return true
  }

  // Admin-only DM commands
  const admin = await isDmAdmin(sender)

  if (cmd === 'say') {
    if (!admin) {
      await sendAuthenticatedDM(sender, '⛔ You’re not allowed to use /say.')
      return true
    }
    if (!args) {
      await sendAuthenticatedDM(sender, 'Usage: /say <message>')
      return true
    }
    await postMessage({ room: env.roomUuid, message: args })
    await sendAuthenticatedDM(sender, '✅ Posted to room.')
    return true
  }

  await sendAuthenticatedDM(sender, `🤖 Unknown DM command: \`${cmd}\`. Try \`/help\`.`)
  return true
}
