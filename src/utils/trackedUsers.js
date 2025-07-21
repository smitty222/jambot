// utils/trackedUsers.js
const trackedUsers = new Set()

export const addTrackedUser = (userUUID) => {
  trackedUsers.add(userUUID)
}

export const getTrackedUsers = () => Array.from(trackedUsers)
