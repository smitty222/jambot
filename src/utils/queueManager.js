import { postMessage } from '../libs/cometchat'
import { getCurrentDJUUIDs } from '../libs/bot'

// Queue management class
class DJQueue {
  constructor () {
    this.queue = [] // Queue to hold the list of DJs waiting to join
    this.currentDJ = null // Store the current DJ on stage
    this.room = process.env.ROOM_UUID
  }

  // Add a user to the queue
  addToQueue (userUUID) {
    if (!this.queue.includes(userUUID)) {
      this.queue.push(userUUID)
      return `User ${userUUID} added to the queue.`
    }
    return `User ${userUUID} is already in the queue.`
  }

  // Remove a user from the queue
  removeFromQueue (userUUID) {
    const index = this.queue.indexOf(userUUID)
    if (index > -1) {
      this.queue.splice(index, 1)
      return `User ${userUUID} removed from the queue.`
    }
    return `User ${userUUID} is not in the queue.`
  }

  // Get the next DJ in the queue
  getNextDJ () {
    return this.queue.length > 0 ? this.queue[0] : null
  }

  // Allow the next user to take the stage
  async notifyNextDJ () {
    const nextDJ = this.getNextDJ()
    if (nextDJ) {
      // Notify the user it's their turn and give them 60 seconds to take the stage
      await postMessage({
        room: this.room,
        message: `@${nextDJ}, it's your turn! You have 60 seconds to take the stage.`
      })
      this.giveUserTimeToJoin(nextDJ)
    } else {
      console.log('No DJs in the queue.')
    }
  }

  // Give the user 60 seconds to join the stage
  giveUserTimeToJoin (userUUID) {
    setTimeout(async () => {
      const currentDJUUIDs = getCurrentDJUUIDs() // Get current DJs on stage
      if (currentDJUUIDs.includes(userUUID)) {
        console.log(`User ${userUUID} took the stage.`)
        this.currentDJ = userUUID
        this.queue.shift() // Remove the user from the queue
      } else {
        await postMessage({
          room: this.room,
          message: `@${userUUID}, you missed your turn. Moving to the next DJ.`
        })
        this.notifyNextDJ() // Move to the next DJ
      }
    }, 60000) // 60 seconds to join the stage
  }

  // Remove unauthorized DJs from the stage
  async enforceQueue () {
    const currentDJUUIDs = getCurrentDJUUIDs()
    const unauthorizedDJs = currentDJUUIDs.filter(djUUID => djUUID !== this.currentDJ)

    for (const djUUID of unauthorizedDJs) {
      await roomBot.removeDJ(djUUID) // Remove unauthorized DJ
      await postMessage({
        room: this.room,
        message: `@${djUUID}, it's not your turn. You have been removed from the stage.`
      })
    }
  }

  // Handle a user trying to join the queue
  handleJoinQueue (userUUID) {
    return this.addToQueue(userUUID)
  }

  // Handle a user trying to leave the queue
  handleLeaveQueue (userUUID) {
    return this.removeFromQueue(userUUID)
  }
}

const djQueue = new DJQueue()

export { djQueue }
