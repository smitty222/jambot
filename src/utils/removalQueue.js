// libs/removalQueue.js

// Store UUID of the DJ marked for removal after current song
let markedDJToRemove = null

// Mark a user UUID for post-song removal
export function markUser (uuid) {
  markedDJToRemove = uuid
}

// Get the UUID of the currently marked DJ for removal
export function getMarkedUser () {
  return markedDJToRemove
}

// Clear the marked DJ after they are removed
export function unmarkUser () {
  markedDJToRemove = null
}
