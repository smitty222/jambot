import { QueueManager } from './queueManager.js'
// Import the nickname helper from the dedicated util to avoid pulling
// in the heavy message handler. See src/utils/nickname.js for details.
import { getUserNickname } from './nickname.js'

const queueManager = new QueueManager(getUserNickname)
export default queueManager
