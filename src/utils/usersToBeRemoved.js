// src/utils/usersToBeRemoved.js
// Map of userUuid -> true (flagged to be removed after their next song ends)
export const usersToBeRemoved = Object.create(null)

export function markUserForEscort (userUuid) {
  if (!userUuid) return false
  if (usersToBeRemoved[userUuid]) return false
  usersToBeRemoved[userUuid] = true
  return true
}

export function clearUserEscort (userUuid) {
  if (!userUuid) return
  delete usersToBeRemoved[userUuid]
}

export function isUserMarkedForEscort (userUuid) {
  return !!(userUuid && usersToBeRemoved[userUuid])
}
