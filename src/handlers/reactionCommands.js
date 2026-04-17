import { postMessage } from '../libs/cometchat.js'
import { syncBegonePrestige, syncCocktailPrestige, formatPrestigeUnlockLines } from '../database/dbprestige.js'
import { getCurrentDJ } from '../libs/bot.js'
import { getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js'
import { getRandomDogImage } from '../utils/API.js'
import { isSpotlightProtected } from './spotlight.js'
import { getSenderNickname } from '../utils/helpers.js'

const GIFS_HELP_MESSAGE = [
  '🎞️ GIF & Fun Commands',
  '- `/burp` `/dance` `/party` `/beer` `/fart` `/cheers` `/tomatoes`',
  '- `/trash` `/bonk` `/rigged` `/banger` `/peace`',
  '- `/props` `/ass` `/titties` `/azz` `/shred`',
  '- `/dog [breed] [sub-breed]`',
  '',
  'More grouped help:',
  '- `/gifs`',
  '- `/commands`'
].join('\n')

const SINGLE_GIF_COMMANDS = {
  burp: 'https://media.giphy.com/media/3orieOieQrTkLXl2SY/giphy.gif?cid=790b7611gofgmq0d396jww26sbt1bhc9ljg9am4nb8m6f6lo&ep=v1_gifs_search&rid=giphy.gif&ct=g'
}

const RANDOM_GIF_COMMANDS = {
  dance: [
    'https://media.giphy.com/media/IwAZ6dvvvaTtdI8SD5/giphy.gif',
    'https://media.giphy.com/media/3o7qDQ4kcSD1PLM3BK/giphy.gif',
    'https://media.giphy.com/media/oP997KOtJd5ja/giphy.gif',
    'https://media.giphy.com/media/wAxlCmeX1ri1y/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbDRvZDRsb3dmcmtnYWY0bXQxMmxlOWtqNHQ5ZnRhdjg0dnF2ZmhjNyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/lsJCkIKV6AT28/giphy.gif'
  ],
  fart: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ21qYmtndjNqYWRqaTFrd2NqaDNkejRqY3RrMTV5Mzlvb3gydDk0ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/dWxYMTXIJtT9wGLkOw/giphy.gif',
    'https://media.giphy.com/media/LFvQBWwKk7Qc0/giphy.gif?cid=790b7611gmjbkgv3jadji1kwcjh3dz4jctk15y39oox2t94g&ep=v1_gifs_search&rid=giphy.gif&ct=g'
  ],
  party: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHF6aTAzeXNubW84aHJrZzd1OGM1ZjM0MGp5aTZrYTRrZmdscnYwbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IwAZ6dvvvaTtdI8SD5/giphy.gif',
    'https://media.giphy.com/media/xUA7aT1vNqVWHPY1cA/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/iJ2cZjydqg9wFkzbGD/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g'
  ],
  beer: [
    'https://media.giphy.com/media/l2Je5C6DLUvYVj37a/giphy.gif?cid=ecf05e475as76fua0g8zvld9lzbm85sb3ojqyt95jrxrnlqz&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/9GJ2w4GMngHCh2W4uk/giphy.gif?cid=ecf05e47vxjww4oli5eck8v6nd6jcmfl9e6awd3a9ok2wa7w&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG5yc2UzZXh5dDdzbTh4YnE4dzc5MjMweGc5YXowZjViYWthYXczZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DmzUp9lX7lHlm/giphy.gif',
    'https://media.giphy.com/media/70lIzbasCI6vOuE2zG/giphy.gif?cid=ecf05e4758ayajrk9c6dnrcblptih04zceztlwndn0vwxmgd&ep=v1_gifs_search&rid=giphy.gif&ct=g'
  ],
  cheers: [
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3dpem43dXNuNnkzb3A3NmY0ZjBxdTZxazR5aXh1dDl1N3R5OHRyaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/BPJmthQ3YRwD6QqcVD/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/3oeSB36G9Au4V0xUhG/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' },
    { type: 'gif', value: 'https://media.giphy.com/media/l7jc8M23lg9e3l9SDn/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' },
    { type: 'emoji', value: '🍻🍻🍻🍻' }
  ],
  tomatoes: [
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb296MmJyeHBpYm9yMGQwbG81cnhlcGd4MWF4N3A1dWhhN3FxNmJvdCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Her9TInMPQYrS/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbGY4YmQwZTA5aHk3ejhrbTI1Mmk1NDl6ZTkzM2h6cm53djZsYnB5diZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26nfoIrm8lHXqmm7C/giphy.gif' },
    { type: 'emoji', value: '🍅🍅🍅🍅' }
  ],
  trash: [
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNW15MDZnb2hiNHhiajNrY2xnOTNwMmQxMWNvcW1laXY5bXl5NTZzaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/QVP7DawXZitKYg3AX5/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNW15MDZnb2hiNHhiajNrY2xnOTNwMmQxMWNvcW1laXY5bXl5NTZzaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/bQvTkpRYa4CF0lX3Zg/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNW15MDZnb2hiNHhiajNrY2xnOTNwMmQxMWNvcW1laXY5bXl5NTZzaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/NHs9GJQzKh3uU/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeXNxd3BtOGV1cGhlaHRwbm0waWczZ2thOHBtZnA2cnc3aGM5MXFjYSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/05wBfiXHq4U6dfHeeP/giphy.gif' },
    { type: 'emoji', value: '🗑️🔥💀' }
  ],
  bonk: [
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2U3dnhvdm1oZWVyMjJ4cGJ2NnU1cnV3eWFyZ3RvYzdtaTFwc2VwbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/30lxTuJueXE7C/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2U3dnhvdm1oZWVyMjJ4cGJ2NnU1cnV3eWFyZ3RvYzdtaTFwc2VwbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/HxMhuDg7O4pKOhhcRC/giphy.gif' }
  ],
  rigged: [
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWw3eDRlMmJxdTR1b3ppM240bmkxbWhoaDFpZ3czaG1wZDByb3hjMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mJhRSYXxzq6CA0ldkh/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWw3eDRlMmJxdTR1b3ppM240bmkxbWhoaDFpZ3czaG1wZDByb3hjMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/fUpocChFusfX0sCkuG/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWw3eDRlMmJxdTR1b3ppM240bmkxbWhoaDFpZ3czaG1wZDByb3hjMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IWzAC2lMELuPQE1wWv/giphy.gif' }
  ],
  banger: [
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDlteDB1cmIwZjcxajBzcTVhc2x3dzkya3NzOW5mZTV4ZnA5M291aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/YOqbsB7Ega18s/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDlteDB1cmIwZjcxajBzcTVhc2x3dzkya3NzOW5mZTV4ZnA5M291aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vwcnDMKml1udSvcNUx/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3NDYzdGdvMXFhdWNnY2Vsa3B2bnpkMmEyYjRkZjVjazZvY2pkY3V3ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Op5wF3ZF35900Zjmdr/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDlteDB1cmIwZjcxajBzcTVhc2x3dzkya3NzOW5mZTV4ZnA5M291aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xDA8aFqZuAlWuu69Ed/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3NDYzdGdvMXFhdWNnY2Vsa3B2bnpkMmEyYjRkZjVjazZvY2pkY3V3ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/7AVv1sSY7quBwZSmCj/giphy.gif' }
  ],
  peace: [
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbWs3ZWRvZHJpZ2YyZXE2MGUwNnd6dDRybDB6OHRheWRxYzIydHkyOSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/rrLt0FcGrDeBq/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbWs3ZWRvZHJpZ2YyZXE2MGUwNnd6dDRybDB6OHRheWRxYzIydHkyOSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/iVJEhiEdcMNQ4/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2NhMmhlYThiZ3Nhd2NrNDhhOHJuN3hscjdvd2swZDRqMWpudXVhNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/QoesEe6tCbLyw/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2NhMmhlYThiZ3Nhd2NrNDhhOHJuN3hscjdvd2swZDRqMWpudXVhNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/w89ak63KNl0nJl80ig/giphy.gif' },
    { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2NhMmhlYThiZ3Nhd2NrNDhhOHJuN3hscjdvd2swZDRqMWpudXVhNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7qDEq2bMbcbPRQ2c/giphy.gif' }
  ],
  begonebitch: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3c3aDU4MXkyNTNuenkxY2l1dDBrMnBpZ244MjY4MDhzdnB5eWYxdyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/9Rp27Gpwjx1n2/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3c3aDU4MXkyNTNuenkxY2l1dDBrMnBpZ244MjY4MDhzdnB5eWYxdyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/MX5vcczsj1rw4ySjcl/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZDVxbmlpd3A0b3lta256Mm1teG1xdXMwMzVtaTJld29hZzJtOHlkYSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3oEhmHaxNpPrSymkIo/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExemNkbmVlOXZjdDM3dnN4ZnAyemNtb2NqdWtlOWQ1bmo0YW95NzBrdyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/EOIHxXCGiPPIT2Xl9t/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExemNkbmVlOXZjdDM3dnN4ZnAyemNtb2NqdWtlOWQ1bmo0YW95NzBrdyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/2rWwvPlNJIuP7Ndy0W/giphy.gif'
  ]
}

function chooseRandom(items) {
  return items[Math.floor(Math.random() * items.length)]
}

async function postRandomReaction({ post, room, options, choose = chooseRandom }) {
  const selection = choose(options)
  if (typeof selection === 'string') {
    await post({ room, message: '', images: [selection] })
    return
  }
  if (selection.type === 'gif') {
    await post({ room, message: '', images: [selection.value] })
    return
  }
  await post({ room, message: selection.value })
}

export function createReactionHandlers(deps = {}) {
  const {
    postMessage: post = postMessage,
    getCurrentDJ: getCurrent = getCurrentDJ,
    getUserWallet: getWallet = getUserWallet,
    removeFromUserWallet: removeWallet = removeFromUserWallet,
    getSenderNickname: getNickname = getSenderNickname,
    isSpotlightProtected: isProtected = isSpotlightProtected,
    chooseRandom: choose = chooseRandom,
    delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
  } = deps

  return {
    gifs: async ({ room }) => {
      await post({ room, message: GIFS_HELP_MESSAGE })
    },

    burp: async ({ room }) => {
      await post({ room, message: '', images: [SINGLE_GIF_COMMANDS.burp] })
    },

    dog: async ({ room, args }) => {
      const parts = args ? args.trim().split(/\s+/).filter(Boolean) : []
      const breed =
        parts.length === 0
          ? null
          : parts.length === 1
            ? parts[0].toLowerCase()
            : `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`

      const imgUrl = await getRandomDogImage(breed || undefined)
      if (!imgUrl) {
        await post({ room, message: '🐶 Could not fetch a pup right now — try again in a bit!' })
        return
      }

      await post({ room, images: [imgUrl] })
    },

    dance: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.dance, choose }),
    fart: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.fart, choose }),
    party: async ({ payload, room }) => {
      await postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.party, choose })
      syncCocktailPrestige(payload?.sender)
    },
    beer: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.beer, choose }),
    cheers: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.cheers, choose }),
    tomatoes: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.tomatoes, choose }),
    trash: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.trash, choose }),
    bonk: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.bonk, choose }),
    rigged: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.rigged, choose }),
    banger: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.banger, choose }),
    peace: async ({ room }) => postRandomReaction({ post, room, options: RANDOM_GIF_COMMANDS.peace, choose }),

    begonebitch: async ({ payload, room, state, roomBot }) => {
      const callerUuid = payload?.sender
      const callerName = await getNickname(callerUuid).catch(() => `<@uid:${callerUuid}>`)
      const cost = 5000
      const fmt = (n) => Math.round(Number(n || 0)).toLocaleString('en-US')
      const fmtMoney = (n) => `$${fmt(n)}`
      const currentDJ = getCurrent(state)

      if (!currentDJ) {
        await post({ room, message: `🕳️ ${callerName} tried /begonebitch… but nobody is DJing right now.` })
        return
      }

      if (currentDJ === process.env.BOT_USER_UUID) {
        await post({ room, message: `😤 ${callerName}… nice try. You can’t eject Allen with this one.` })
        return
      }

      if (currentDJ === callerUuid) {
        await post({ room, message: `💀 ${callerName} you can’t pay to eject yourself. Use /dive like a normal person.` })
        return
      }

      if (isProtected(currentDJ)) {
        await post({ room, message: '🚫 Spotlight mode: that DJ is protected.' })
        return
      }

      const numericBalance = Number(await getWallet(callerUuid)) || 0
      if (!Number.isFinite(numericBalance)) {
        await post({ room, message: `⚠️ ${callerName}, I couldn’t read your wallet. Try again.` })
        return
      }

      if (numericBalance < cost) {
        await post({
          room,
          message: `💸 ${callerName}, /begonebitch costs ${fmtMoney(cost)} but you only have ${fmtMoney(numericBalance)}.`
        })
        return
      }

      const paid = await removeWallet(callerUuid, cost)
      if (!paid) {
        await post({
          room,
          message: `⚠️ ${callerName}, payment failed. Your balance should still be ${fmtMoney(numericBalance)}.`
        })
        return
      }

      const djName = await getNickname(currentDJ).catch(() => `<@uid:${currentDJ}>`)
      await post({ room, message: `💰 ${callerName} just paid ${fmtMoney(cost)} for ${djName} to get tf off the stage…` })
      await delay(900)
      await post({ room, message: '', images: [choose(RANDOM_GIF_COMMANDS.begonebitch)] })
      await delay(1100)
      await post({ room, message: `${djName}… nobody likes you.` })
      await delay(800)
      await post({ room, message: '👋 BEGONE.' })
      await delay(450)
      await roomBot.removeDJ(currentDJ)

      const prestige = syncBegonePrestige(callerUuid)
      if (prestige.badges.length) {
        const lines = formatPrestigeUnlockLines(prestige)
        if (lines.length) await post({ room, message: lines.join('\n') })
      }
    }
  }
}
