// src/handlers/commandRegistry.js
//
// A central registry for high-traffic slash commands and a dispatcher
// function to route incoming messages to the appropriate command handler.
// Moving this logic out of message.js improves readability and makes it
// easier to add or remove commands without touching the monolithic file.

import { postMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'

// Game and feature handlers
import { handleSlotsCommand } from './slots.js'
import {
  startRouletteGame,
  handleRouletteBet,
  handleBalanceCommand,
  showAllBets,
  rouletteGameActive
} from './roulette.js'

// Lottery and GIF/Dog handlers
import {
  handleLotteryCommand,
  handleTopLotteryStatsCommand,
  handleSingleNumberQuery
} from '../database/dblotterymanager.js'
import handleDogCommand from './commandDog.js'

// Avatar command handlers
import {
  handleBotRandomAvatarCommand,
  handleBotDinoCommand,
  handleBotDuckCommand,
  handleBotAlienCommand,
  handleBotAlien2Command,
  handleBotWalrusCommand,
  handleBotPenguinCommand,
  handleBot1Command,
  handleBot2Command,
  handleBot3Command,
  handleDinoCommand,
  handleDuckCommand,
  handleSpaceBearCommand,
  handleWalrusCommand,
  handleVibesGuyCommand,
  handleFacesCommand,
  handleDoDoCommand,
  handleDumDumCommand,
  handleFlowerPowerCommand,
  handleRandomAvatarCommand,
  handleRandomCyberCommand,
  handleRandomCosmicCommand,
  handleRandomLovableCommand
} from './avatarCommands.js'

// User authorization helper to restrict bot avatar changes
import { isUserAuthorized } from '../utils/API.js'


// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------
// Each entry maps a slash command (without the leading '/') to an async
// handler. The handler receives an object with the original payload, the
// current room ID, and a string of extra arguments.
const commandRegistry = {
  // 🎰 Slots: `/slots [betAmount]`
  slots: async ({ payload, room }) => {
    const parts = (payload?.message || '').trim().split(/\s+/)
    let betAmount = 1
    if (parts.length > 1) {
      const amt = parseFloat(parts[1])
      if (!Number.isFinite(amt) || amt <= 0) {
        await postMessage({ room, message: 'Please provide a valid bet amount.' })
        return
      }
      betAmount = amt
    }
    const userUUID = payload?.sender
    const response = await handleSlotsCommand(userUUID, betAmount)
    await postMessage({ room, message: response })
  },
  // 🕹️ Roulette: `/roulette`
  roulette: async ({ payload }) => {
    if (rouletteGameActive) {
      await postMessage({ room: payload.room ?? process.env.ROOM_UUID, message: 'Roulette game already in progress!' })
      return
    }
    await startRouletteGame(payload)
  },
  // 💰 Roulette bet: `/bet <type|number> <amount>`
  bet: async ({ payload }) => {
    await handleRouletteBet(payload)
  },
  // 🧮 Balance: `/balance`
  balance: async ({ payload }) => {
    await handleBalanceCommand(payload)
  },

  // 🎱 Lottery: `/lottery`
  // Show a fun GIF and then start the lottery game. This mirrors the
  // original behavior in message.js but moves the logic into the
  // centralized registry for faster dispatch.
  lottery: async ({ payload, room }) => {
    try {
      // Pre-game GIF (pumped up for lotto!)
      const gifUrl =
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm11bGZ0M3RraXg5Z3Z4ZzZpNjU4ZDR4Y2QwMzc0NWwyaWFlNWU4byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Ps8XflhsT5EVa/giphy.gif'
      await postMessage({ room, message: '', images: [gifUrl] })
    } catch (err) {
      logger.error('Error sending lottery GIF:', err?.message || err)
    }
    // Start the game; handleLotteryCommand will DM users about picks
    await handleLotteryCommand(payload)
  },

  // 📊 Lotto stats: `/lottostats`
  lottostats: async ({ room }) => {
    await handleTopLotteryStatsCommand(room)
  },

  // 🔢 Lotto single number query: `/lotto #<number>`
  lotto: async ({ payload, room }) => {
    // Pass the entire message to the helper which extracts and validates the number
    await handleSingleNumberQuery(room, payload.message)
  },

  // 🎞 Show GIF list: `/gifs`
  gifs: async ({ room }) => {
    await postMessage({
      room,
      message:
        'Randomly selected GIFs:\n- /burp\n- /dance\n- /party\n- /beer\n- /fart\n- /tomatoes\n- /cheers'
    })
  },

  // 🤮 Burp: `/burp`
  burp: async ({ room }) => {
    try {
      const gifUrl =
        'https://media.giphy.com/media/3orieOieQrTkLXl2SY/giphy.gif?cid=790b7611gofgmq0d396jww26sbt1bhc9ljg9am4nb8m6f6lo&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      await postMessage({ room, message: '', images: [gifUrl] })
    } catch (err) {
      logger.error('Error sending burp GIF:', err?.message || err)
    }
  },

  // 💃 Dance: `/dance`
  dance: async ({ room }) => {
    try {
      const options = [
        'https://media.giphy.com/media/IwAZ6dvvvaTtdI8SD5/giphy.gif',
        'https://media.giphy.com/media/3o7qDQ4kcSD1PLM3BK/giphy.gif',
        'https://media.giphy.com/media/oP997KOtJd5ja/giphy.gif',
        'https://media.giphy.com/media/wAxlCmeX1ri1y/giphy.gif'
      ]
      const choice = options[Math.floor(Math.random() * options.length)]
      await postMessage({ room, message: '', images: [choice] })
    } catch (err) {
      logger.error('Error sending dance GIF:', err?.message || err)
      await postMessage({ room, message: 'An error occurred while processing the dance command. Please try again.' })
    }
  },

  // 🎉 Party: `/party`
  party: async ({ room }) => {
    try {
      const options = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHF6aTAzeXNubW84aHJrZzd1OGM1ZjM0MGp5aTZrYTRrZmdscnYwbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IwAZ6dvvvaTtdI8SD5/giphy.gif',
        'https://media.giphy.com/media/xUA7aT1vNqVWHPY1cA/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/iJ2cZjydqg9wFkzbGD/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const choice = options[Math.floor(Math.random() * options.length)]
      await postMessage({ room, message: '', images: [choice] })
    } catch (err) {
      logger.error('Error sending party GIF:', err?.message || err)
    }
  },

  // 🍺 Beer: `/beer`
  beer: async ({ room }) => {
    try {
      const options = [
        'https://media.giphy.com/media/l2Je5C6DLUvYVj37a/giphy.gif?cid=ecf05e475as76fua0g8zvld9lzbm85sb3ojqyt95jrxrnlqz&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/9GJ2w4GMngHCh2W4uk/giphy.gif?cid=ecf05e47vxjww4oli5eck8v6nd6jcmfl9e6awd3a9ok2wa7w&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG5yc2UzZXh5dDdzbTh4YnE4dzc5MjMweGc5YXowZjViYWthYXczZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DmzUp9lX7lHlm/giphy.gif',
        'https://media.giphy.com/media/70lIzbasCI6vOuE2zG/giphy.gif?cid=ecf05e4758ayajrk9c6dnrcblptih04zceztlwndn0vwxmgd&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const choice = options[Math.floor(Math.random() * options.length)]
      await postMessage({ room, message: '', images: [choice] })
    } catch (err) {
      logger.error('Error sending beer GIF:', err?.message || err)
    }
  },

  // 💨 Fart: `/fart`
  fart: async ({ room }) => {
    try {
      const options = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ21qYmtndjNqYWRqaTFrd2NqaDNkejRqY3RrMTV5Mzlvb3gydDk0ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/dWxYMTXIJtT9wGLkOw/giphy.gif',
        'https://media.giphy.com/media/LFvQBWwKk7Qc0/giphy.gif?cid=790b7611gmjbkgv3jadji1kwcjh3dz4jctk15y39oox2t94g&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const choice = options[Math.floor(Math.random() * options.length)]
      await postMessage({ room, message: '', images: [choice] })
    } catch (err) {
      logger.error('Error sending fart GIF:', err?.message || err)
      await postMessage({ room, message: 'An error occurred while processing the fart command. Please try again.' })
    }
  },

  // 🍹 Cheers: `/cheers`
  cheers: async ({ room }) => {
    try {
      const options = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3dpem43dXNuNnkzb3A3NmY0ZjBxdTZxazR5aXh1dDl1N3R5OHRyaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/BPJmthQ3YRwD6QqcVD/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/3oeSB36G9Au4V0xUhG/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' },
        { type: 'gif', value: 'https://media.giphy.com/media/l7jc8M23lg9e3l9SDn/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' },
        { type: 'emoji', value: '🍻🍻🍻🍻' }
      ]
      const selection = options[Math.floor(Math.random() * options.length)]
      if (selection.type === 'gif') {
        await postMessage({ room, message: '', images: [selection.value] })
      } else {
        await postMessage({ room, message: selection.value })
      }
    } catch (err) {
      logger.error('Error sending cheers:', err?.message || err)
    }
  },

  // 🍅 Tomatoes: `/tomatoes`
  tomatoes: async ({ room }) => {
    try {
      const options = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb296MmJyeHBpYm9yMGQwbG81cnhlcGd4MWF4N3A1dWhhN3FxNmJvdCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Her9TInMPQYrS/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbGY4YmQwZTA5aHk3ejhrbTI1Mmk1NDl6ZTkzM2h6cm53djZsYnB5diZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26nfoIrm8lHXqmm7C/giphy.gif' },
        { type: 'emoji', value: '🍅🍅🍅🍅' }
      ]
      const selection = options[Math.floor(Math.random() * options.length)]
      if (selection.type === 'gif') {
        await postMessage({ room, message: '', images: [selection.value] })
      } else {
        await postMessage({ room, message: selection.value })
      }
    } catch (err) {
      logger.error('Error sending tomatoes:', err?.message || err)
    }
  },

  // 🐶 Dog: `/dog [breed] [sub-breed]`
  dog: async ({ room, args }) => {
    try {
      // Parse arguments into an array for breed and sub-breed
      const breedArgs = args ? args.trim().split(/\s+/).filter(Boolean) : []
      await handleDogCommand({ room, args: breedArgs })
    } catch (err) {
      logger.error('Error processing dog command:', err?.message || err)
      try {
        await postMessage({ room, message: '🐶 Something went wrong fetching a pup.' })
      } catch {
        /* ignore */
      }
    }
  },

  // -----------------------------------------------------------------------
  // Avatar commands
  // These handlers update the bot's appearance or change a user's avatar.
  // Placing them in the registry avoids scanning the long conditional chain
  // in message.js and provides faster routing for commonly used avatar
  // commands.  Moderator checks are enforced for bot commands via
  // isUserAuthorized.
  botrandom: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotRandomAvatarCommand(room, postMessage, ttlToken)
  },
  botdino: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotDinoCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botduck: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotDuckCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botalien: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotAlienCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botalien2: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotAlien2Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botwalrus: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotWalrusCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botpenguin: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotPenguinCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot1: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBot1Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot2: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBot2Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot3: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBot3Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },

  // User avatar commands
  dino: async ({ payload, room }) => {
    await handleDinoCommand(payload?.sender, room, postMessage)
  },
  duck: async ({ payload, room }) => {
    await handleDuckCommand(payload?.sender, room, postMessage)
  },
  spacebear: async ({ payload, room }) => {
    await handleSpaceBearCommand(payload?.sender, room, postMessage)
  },
  walrus: async ({ payload, room }) => {
    await handleWalrusCommand(payload?.sender, room, postMessage)
  },
  vibesguy: async ({ payload, room }) => {
    await handleVibesGuyCommand(payload?.sender, room, postMessage)
  },
  faces: async ({ payload, room }) => {
    await handleFacesCommand(payload?.sender, room, postMessage)
  },
  dodo: async ({ payload, room }) => {
    await handleDoDoCommand(payload?.sender, room, postMessage)
  },
  dumdum: async ({ payload, room }) => {
    await handleDumDumCommand(payload?.sender, room, postMessage)
  },
  flowerpower: async ({ payload, room }) => {
    await handleFlowerPowerCommand(payload?.sender, room, postMessage)
  },
  randomavatar: async ({ payload, room }) => {
    await handleRandomAvatarCommand(payload?.sender, room, postMessage)
  },
  randomcyber: async ({ payload, room }) => {
    await handleRandomCyberCommand(payload?.sender, room, postMessage)
  },
  randomcosmic: async ({ payload, room }) => {
    await handleRandomCosmicCommand(payload?.sender, room, postMessage)
  },
  randomlovable: async ({ payload, room }) => {
    await handleRandomLovableCommand(payload?.sender, room, postMessage)
  }
}

/**
 * Attempt to dispatch the provided message to a command handler. Returns
 * true if a handler was found and executed, false otherwise. Errors are
 * logged and result in a user-facing error message.
 *
 * @param {string} txt The full text of the incoming message.
 * @param {Object} payload The original CometChat payload.
 * @param {string} room The UUID of the current room.
 * @returns {Promise<boolean>}
 */
export async function dispatchCommand (txt, payload, room) {
  if (!txt || txt[0] !== '/') return false
  const parts = txt.trim().substring(1).split(/\s+/)
  const cmd = (parts[0] || '').toLowerCase()
  const handler = commandRegistry[cmd]
  if (!handler) return false
  try {
    await handler({ payload, room, args: parts.slice(1).join(' ') })
  } catch (err) {
    logger.error(`[Dispatcher] Error executing /${cmd}:`, err?.message || err)
    try {
      await postMessage({ room, message: `⚠️ Error processing /${cmd}.` })
    } catch { /* swallow */ }
  }
  return true
}
