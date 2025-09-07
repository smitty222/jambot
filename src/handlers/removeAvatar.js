import { removeAvatarSlug } from '../database/dbavatars.js'

const authorizedAdmins = new Set([
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e', // Ian
  '210141ad-6b01-4665-84dc-e47ea7c27dcb', // Smitty
  '92302b7d-ae5e-466f-975b-d3fee461f13f', // Cam
  'fd2f1b47-b1d4-4100-8f88-6e56aa82e13f' // Gab
])

export async function handleRemoveAvatarCommand (payload, postMessage) {
  const { sender, message } = payload
  const room = payload.room ?? process.env.ROOM_UUID

  if (!room) {
    throw new Error('handleRemoveAvatarCommand: room missing and ROOM_UUID not set')
  }

  if (!authorizedAdmins.has(sender)) {
    await postMessage({ room, message: '🚫 You are not authorized to use this command.' })
    return
  }

  const match = message.match(/^\/removeavatar\s+([a-z0-9._-]+)$/i)
  if (!match) {
    await postMessage({
      room,
      message: 'Usage: /removeavatar <slug>\nExample: /removeavatar cosmic-meteor-guy'
    })
    return
  }

  const slug = match[1].toLowerCase()

  try {
    const changes = removeAvatarSlug(slug)
    console.log('[removeavatar] attempt', { sender, slug, changes })

    if (changes > 0) {
      await postMessage({ room, message: `🗑️ Removed avatar "${slug}" from the allowed list.` })
    } else {
      await postMessage({ room, message: `❔ Avatar "${slug}" was not found in the list.` })
    }
  } catch (err) {
    console.error('[removeavatar] failed', {
      sender,
      slug,
      error: err?.message || String(err),
      stack: err?.stack
    })
    await postMessage({ room, message: '❌ Failed to remove avatar — check logs.' })
  }
}
