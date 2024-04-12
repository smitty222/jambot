import { Chain } from 'repeat'
import { Bot } from './libs/bot.js'

const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // Use the port provided by Heroku or default to 3000 for local development

console.log('Initializing roomBot...')
const roomBot = new Bot(process.env.JOIN_ROOM)

console.log('Connecting to room...')
await roomBot.connect()
console.log('Connected to room successfully.')

console.log('Configuring listeners...')
roomBot.configureListeners()
console.log('Listeners configured successfully.')

let repeatedTasks = null

if (process.env.ENABLE_REPEATED_TASKS === 'true') {
  console.log('Setting up repeated tasks...')
  repeatedTasks = new Chain()
    .add(async () => {
      console.log('Processing new messages...')
      await roomBot.processNewMessages()
      console.log('New messages processed successfully.')
    })
    .every(500)
  console.log('Repeated tasks set up successfully.')
}

console.log('Initialization complete.')

// Add this section to start the server listening on the specified port
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

export { roomBot, repeatedTasks }
