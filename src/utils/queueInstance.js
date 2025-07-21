import { QueueManager } from './queueManager.js'
import { getUserNickname } from '../handlers/roulette.js'

const queueManager = new QueueManager('src/libs/djQueue.json', getUserNickname)

export default queueManager
