import { QueueManager } from './queueManager.js'
import { getUserNickname } from '../handlers/message.js'

const queueManager = new QueueManager(getUserNickname)
export default queueManager
