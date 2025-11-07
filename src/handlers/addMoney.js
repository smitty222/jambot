// src/handlers/addMoneyHandler.js
import { postMessage } from '../libs/cometchat.js'
import { addDollarsByUUID } from '../database/dbwalletmanager.js'

const ROOM = process.env.ROOM_UUID
const OWNER_ID = process.env.CHAT_OWNER_ID // set this in env to your UUID

function parseUidFromMention (s) {
  if (!s) return ''
  const m = /<@uid:([\w-]+)>/i.exec(s)
  return m?.[1] || ''
}

export async function handleAddMoneyCommand (payload) {
  const text = (payload.message || '').trim()
  if (!text.toLowerCase().startsWith('/addmoney')) return

  const sender =
    payload?.sender ??
    payload?.senderId ??
    payload?.from ??
    payload?.data?.sender

  // 1) Only allow in main room (ignore DMs or other rooms)
  const roomId = payload?.room || payload?.receiverId || payload?.receiver
  if (roomId !== ROOM) {
    // Silently ignore, or DM the sender if you prefer.
    return
  }

  // 2) Only allow the owner to run this
  if (!OWNER_ID || sender !== OWNER_ID) {
    await postMessage({
      room: ROOM,
      message: '⛔ /addmoney is restricted.'
    })
    return
  }

  // 3) Parse args: /addmoney <@uid:...> <amount>
  const parts = text.split(/\s+/)
  if (parts.length < 3) {
    await postMessage({
      room: ROOM,
      message: 'Usage: `/addmoney <@User> <amount>`'
    })
    return
  }

  const whoRaw = parts[1]
  const amountRaw = parts[2]
  const userUuid = parseUidFromMention(whoRaw)
  const amount = Number(amountRaw)

  if (!userUuid || !Number.isFinite(amount) || amount <= 0) {
    await postMessage({
      room: ROOM,
      message: 'Usage: `/addmoney <@User> <amount>` (valid mention + positive number)'
    })
    return
  }

  try {
    await addDollarsByUUID(userUuid, amount)
    await postMessage({
      room: ROOM,
      message: `💸 Admin credited $${amount} to <@uid:${userUuid}>`
    })
  } catch (e) {
    await postMessage({
      room: ROOM,
      message: `❌ Failed to add money: ${e?.message || e}`
    })
  }
}
