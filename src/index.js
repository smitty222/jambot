import { Chain } from 'repeat'
import { Bot } from './libs/bot.js'

const roomBot = new Bot(process.env.JOIN_ROOM)

await roomBot.connect()

roomBot.configureListeners()

let repeatedTasks = null

if (process.env.ENABLE_REPEATED_TASKS === 'true') {
  repeatedTasks = new Chain()
    .add(async () => {
      await roomBot.processNewMessages()
    })
    .every(500)
}

export { roomBot, repeatedTasks }
