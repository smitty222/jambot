import { postMessage } from '../libs/cometchat.js'
import { handleTriviaStart, handleTriviaEnd, handleTriviaSubmit, displayTriviaInfo } from '../handlers/triviaCommands.js'
import { storeItems } from '../libs/jamflowStore.js'
import { askMagic8Ball } from './magic8Ball.js'
import { getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js'
import { getLotteryWinners } from '../database/dblotterymanager.js'
import { getJackpotValue } from './slots.js'
import { handleThemeCommand } from '../database/dbtheme.js'
import { formatMention } from '../utils/names.js'

function parseTriviaRounds(args) {
  const value = Number.parseInt(String(args || '').trim(), 10)
  return Number.isFinite(value) && value > 0 ? value : 1
}

function buildStoreMessage(items) {
  const lines = []
  lines.push('🛒 **Welcome to the JamFlow Store** 🛒')
  lines.push('')
  lines.push("Here's what you can spend your hard-earned dollars on today:")
  lines.push('')

  for (const [command, value] of Object.entries(items)) {
    if (command.startsWith('---')) {
      lines.push('')
      lines.push(`__**${command.replace(/---/g, '').trim()}**__`)
      lines.push(`_${value}_`)
      lines.push('')
      continue
    }

    const costText = typeof value.cost === 'number' ? `$${value.cost}` : value.cost
    lines.push(`\`${command}\` — ${value.desc} (${costText})`)
  }

  lines.push('')
  lines.push('🧾 Type any command to get started.')
  return lines.join('\n')
}

export function createMiscCommandHandlers(deps = {}) {
  const {
    postMessage: post = postMessage,
    handleTriviaStart: startTrivia = handleTriviaStart,
    handleTriviaEnd: endTrivia = handleTriviaEnd,
    handleTriviaSubmit: submitTrivia = handleTriviaSubmit,
    displayTriviaInfo: showTrivia = displayTriviaInfo,
    handleThemeCommand: themeCommand = handleThemeCommand,
    getLotteryWinners: getWinners = getLotteryWinners,
    getJackpotValue: getJackpot = getJackpotValue,
    askMagic8Ball: ask8Ball = askMagic8Ball,
    getUserWallet: getWallet = getUserWallet,
    removeFromUserWallet: removeWallet = removeFromUserWallet,
    storeItems: items = storeItems,
    getUserNickname: getUserNickname = async (userId) => `<@uid:${userId}>`
  } = deps

  const runThemeCommand = async ({ payload, room }) => {
    try {
      await themeCommand({
        sender: payload.sender,
        room,
        message: payload.message
      })
    } catch (err) {
      console.error('[MessageHandler] theme handler threw:', err)
      await post({ room, message: '⚠️ Theme command failed—please try again.' })
    }
  }

  return {
    theme: runThemeCommand,

    settheme: async ({ payload, room }) => {
      await runThemeCommand({ payload, room })
    },

    removetheme: async ({ payload, room }) => {
      await runThemeCommand({ payload, room })
    },

    lottowinners: async ({ room }) => {
      try {
        const winners = getWinners()
        if (!winners || winners.length === 0) {
          await post({ room, message: 'No lottery winners found at this time.' })
          return
        }

        winners.sort((a, b) => new Date(a.date) - new Date(b.date))
        const formattedWinners = winners.map((winner, index) => {
          const name = winner.userId ? formatMention(winner.userId) : (winner.nickname || 'Unknown user')
          const amount = Math.round(Number(winner.amountWon) || 0).toLocaleString()
          const num = winner.winningNumber ?? '?'
          const dateStr = winner.date || 'unknown date'
          return `${index + 1}. ${name}: Won $${amount} with number ${num} on ${dateStr}`
        })

        await post({
          room,
          message: `💰 💵 **Lottery Winners List** 💵 💰\n\n${formattedWinners.join('\n')}`
        })
      } catch (error) {
        console.error('Error fetching or displaying lottery winners:', error)
        await post({ room, message: 'There was an error fetching the lottery winners list.' })
      }
    },

    jackpot: async ({ room }) => {
      const formattedJackpot = Math.round(getJackpot()).toLocaleString('en-US')
      await post({ room, message: `🎰 The current progressive jackpot is: $${formattedJackpot}!` })
    },

    triviastart: async ({ room, args }) => {
      await startTrivia(room, parseTriviaRounds(args))
    },

    triviaend: async ({ room }) => {
      await endTrivia(room)
    },

    trivia: async ({ room }) => {
      await showTrivia(room)
    },

    a: async ({ payload, room }) => {
      await submitTrivia(payload, room, payload.sender)
    },

    b: async ({ payload, room }) => {
      await submitTrivia(payload, room, payload.sender)
    },

    c: async ({ payload, room }) => {
      await submitTrivia(payload, room, payload.sender)
    },

    d: async ({ payload, room }) => {
      await submitTrivia(payload, room, payload.sender)
    },

    store: async ({ payload, room }) => {
      const roomId = payload.room ?? room
      await post({ room: roomId, message: buildStoreMessage(items) })
    },

    '8ball': async ({ payload, room }) => {
      const roomId = payload.room ?? room
      const input = String(payload.message || '').trim()
      const args = input.split(' ').slice(1).join(' ').trim()

      if (!args) {
        await post({
          room: roomId,
          message: '🎱 You need to ask a question after the command! Try: /8ball Will I win today?'
        })
        return
      }

      const cost = items['/8ball']?.cost ?? 0
      const uuid = payload.sender
      const balance = await getWallet(uuid)
      if (balance < cost) {
        await post({
          room: roomId,
          message: `💸 Not enough funds! You need $${cost}, but you only have $${balance}.`
        })
        return
      }

      await removeWallet(uuid, cost)
      const nickname = await getUserNickname(uuid)
      const answer = await ask8Ball(uuid, args)

      await post({
        room: roomId,
        message: `🎱 ${nickname}\nMagic 8-Ball says: *${answer}* (Cost: $${cost})`
      })
    }
  }
}
