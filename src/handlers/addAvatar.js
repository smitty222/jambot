import { insertAvatarSlug } from '../database/dbavatars.js'

// Add this to your authorized admin check if needed
const authorizedAdmins = new Set([
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e', // Ian
  '210141ad-6b01-4665-84dc-e47ea7c27dcb', // Smitty
  '92302b7d-ae5e-466f-975b-d3fee461f13f', // Cam
  'fd2f1b47-b1d4-4100-8f88-6e56aa82e13f'  // Gab
])

export async function handleAddAvatarCommand(payload, postMessage) {
  const { sender, message, room } = payload

  if (!authorizedAdmins.has(sender)) {
    await postMessage({
      room,
      message: '🚫 You are not authorized to use this command.'
    })
    return
  }

  const match = message.match(/^\/addavatar\s+([\w-]+)$/i)
  if (!match) {
    await postMessage({
      room,
      message: `Usage: /addavatar <slug>\nExample: /addavatar stadiumseason-02`
    })
    return
  }

  const slug = match[1]

  try {
    insertAvatarSlug(slug)
    await postMessage({
      room,
      message: `✅ Avatar "${slug}" was added to the database.`
    })
  } catch (error) {
    console.error('Failed to insert avatar slug:', error)
    await postMessage({
      room,
      message: `❌ Failed to add avatar.`
    })
  }
}
