import { Chain } from 'repeat'
import { Bot } from './libs/bot.js'

const roomBot = new Bot(process.env.JOIN_ROOM)

await roomBot.connect()

roomBot.configureListeners()

const repeatedTasks = new Chain()
  .add(async () => {
    await roomBot.processNewMessages()
  })
  .every(500)

export { roomBot }
