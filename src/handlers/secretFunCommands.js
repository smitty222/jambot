import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { isUserAuthorized } from '../utils/API.js'

const SECRET_MESSAGE = 'Sssshhhhhh be very quiet. These are top secret\n- /bark\n- /barkbark\n- /djbeers\n- /getdjdrunk\n- /jam\n- /ass\n- /azz\n- /cam\n- /shirley\n- /berad\n- /ello\n- /art\n- /ello\n- /allen\n- /art'

const SINGLE_GIF_COMMANDS = {
  shirley: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzdyamVybTVwa256NnVrdWQzcXMwcWd6YXlseTQ0dmY3OWloejQyYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3oEjHLzm4BCF8zfPy0/giphy.gif',
  ello: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjczM2hxOHRtZWlxdmVoamsxZHA5NHk3OXljemMyeXBubzhpMTFkYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3vPU8fnm8HZ1C/giphy.gif',
  props: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa280ZGd3Y25iajJ3MXF1Nm8wbG15dHFseWZmNGhrNzJrYjJ6YXpmZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/MaJ7An3EUgLCCh4lXS/giphy.gif'
}

const RANDOM_GIF_COMMANDS = {
  allen: [
    'https://media.giphy.com/media/sA8nO56Gj9RHq/giphy.gif?cid=790b7611h6b5ihdlko5foubqcifo0e3h0i7e6p1vo2h8znzj&ep=v1_gifs_search&rid=giphy.gif&ct=g'
  ],
  ass: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2JkNnliMGxhMjZ5NnVtcGd3dWN1YmVyZHJ3ZXo3cTZyZnJsM2UzbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/uxXNV3Xa7QqME/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2JkNnliMGxhMjZ5NnVtcGd3dWN1YmVyZHJ3ZXo3cTZyZnJsM2UzbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xUPGGL6TieAUk10oNO/giphy.gif',
    'https://media.giphy.com/media/rAKdqZ8nfiaZi/giphy.gif?cid=790b7611cbd6yb0la26y6umpgwucuberdrwez7q6rfrl3e3o&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/IYJBTNLgES23K/giphy.gif?cid=790b7611cbd6yb0la26y6umpgwucuberdrwez7q6rfrl3e3o&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/r0maJFJCvM8Pm/giphy.gif?cid=ecf05e47ymi8mjlscn2zhhaq5jwlixct7t9hxqy4bvi0omzp&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/CsjpI6bhjptTO/giphy.gif?cid=ecf05e47i0e2qssmhziagwv4stpgetatpz2555i70q4own0v&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/H7kO0C0DCkQjUaQxOF/giphy.gif?cid=ecf05e47kpjyfjk0pfslwnyl220r2gsn54t77flye0fpgqol&ep=v1_gifs_search&rid=giphy.gif&ct=g'
  ],
  titties: [
    'https://media.giphy.com/media/e3ju7ALSHtJmM/giphy.gif?cid=790b7611cyxzebyly4t75g8ozzbf00q5l4u9afsklnpc7qvh&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/13lIl3lZmDtwNq/giphy.gif?cid=790b7611cyxzebyly4t75g8ozzbf00q5l4u9afsklnpc7qvh&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/Hri053BSFUkRa/giphy.gif?cid=ecf05e47ivnowgc3ezif52b7a9mlfr5hg6wn4okbemd1t4zl&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/qPj2kjakDOPQY/giphy.gif?cid=ecf05e47nbx8btyqq37pl0qtf18gdbr6ijbs4297kg8d7e39&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/28A92fQr8uG6Q/giphy.gif?cid=790b7611cyxzebyly4t75g8ozzbf00q5l4u9afsklnpc7qvh&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/h0yZVLoXKJKb6/giphy.gif?cid=ecf05e47ivnowgc3ezif52b7a9mlfr5hg6wn4okbemd1t4zl&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY3l4emVieWx5NHQ3NWc4b3p6YmYwMHE1bDR1OWFmc2tsbnBjN3F2aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/tGbhyv8Wmi4EM/giphy.gif'
  ],
  azz: [
    'https://media.giphy.com/media/fcDNkoEy1aXOFwbv7q/giphy.gif?cid=ecf05e47fvbfd2n1xikifbbtuje37cga98d9rmx7sjo2olzu&ep=v1_gifs_search&rid=giphy.gif&ct=g',
    'https://media.giphy.com/media/GB4N7W7OP5iOk/giphy.gif?cid=ecf05e4706qgo7363yeua3o6hq4m5ps3u1y88ssw8tgi1o9e&ep=v1_gifs_search&rid=giphy.gif&ct=g'
  ],
  shred: [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZTIxczIxamNnbHpyajFyMmFhZmVwZnR4OTdhN3IwaDM0NGp4ZGhrbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/0VwKnH9W96meBS9NAv/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd295ajQ1cmJtdGZhMWQ4eWQ4cXhtNmV5eGphODBxNnV0anI5b3F0ZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/9D8SldWd6lmVbHwRB1/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzd1MnlzNnZsN2Z0NWZ3ajU4bTJ3NnJmZHh1bzAweHFrbnA5eDY5YiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/7aLx6EHBGyTZTNOt5G/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3oyN2phaXN1emk4aXN0eHJwb3BhODZpdDU0a2hxNmd3NGVsZWs4eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/U23XuUNi3XdW93JM0b/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd3l4a2hlNzk0Y2dlYm9sOTZ4ajFvOTFjOTdqOTU4ZW15ZjU1OGRlaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7P4DBaIJG4n8DzNK/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2JleHNweGkwZGtpcXo4dm9sZGo1ZTB2ZmoxbGJqb2IweTlpZ3c4ZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mI3J3e2v97T8Y/giphy.gif'
  ]
}

function chooseRandom (items) {
  return items[Math.floor(Math.random() * items.length)]
}

function cleanGifUrl (rawUrl) {
  const url = new URL(rawUrl)
  url.search = ''
  return url.toString()
}

export function createSecretFunHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    sendDirectMessage: sendDm = sendDirectMessage,
    isUserAuthorized: isAuthorized = isUserAuthorized
  } = deps

  return {
    secret: async ({ payload, room, ttlUserToken }) => {
      const ok = await isAuthorized(payload.sender, ttlUserToken)
      if (!ok) {
        await post({
          room,
          message: 'I cant reveal my secrets to you. I dont make the rules. Talk to Rsmitty'
        })
        return
      }
      await sendDm(payload.sender, SECRET_MESSAGE)
      await post({ room, message: '🕵️‍♂️ Psst… look in your messages.' })
    },

    bark: async ({ room }) => {
      await post({ room, message: 'WOOF' })
    },

    barkbark: async ({ room }) => {
      await post({ room, message: 'WOOF WOOF' })
    },

    star: async ({ roomBot }) => {
      await roomBot.voteOnSong(process.env.ROOM_UUID, { star: true }, process.env.BOT_USER_UUID)
    },

    unstar: async ({ roomBot }) => {
      await roomBot.voteOnSong(process.env.ROOM_UUID, { star: false }, process.env.BOT_USER_UUID)
    },

    jam: async ({ roomBot, delay = (ms) => new Promise(resolve => setTimeout(resolve, ms)) }) => {
      for (let i = 0; i < 10; i++) {
        await roomBot.voteOnSong(process.env.ROOM_UUID, { star: true }, process.env.BOT_USER_UUID)
        await roomBot.playOneTimeAnimation('jump', process.env.ROOM_UUID, process.env.BOT_USER_UUID)
        await delay(500)
        await roomBot.voteOnSong(process.env.ROOM_UUID, { star: false }, process.env.BOT_USER_UUID)
        await delay(500)
      }
    },

    berad: async ({ room }) => {
      await post({ room, message: '@BeRad is the raddest guy in town' })
    },

    cam: async ({ room }) => {
      await post({ room, message: '@Cam i love you!' })
    },

    drink: async ({ room }) => {
      await post({ room, message: 'Im drunk already. Catch me if you can' })
    },

    shirley: async ({ room }) => {
      await post({ room, message: '', images: [SINGLE_GIF_COMMANDS.shirley] })
    },

    ello: async ({ room }) => {
      await post({ room, message: '', images: [SINGLE_GIF_COMMANDS.ello] })
    },

    allen: async ({ room }) => {
      await post({ room, message: '', images: [cleanGifUrl(chooseRandom(RANDOM_GIF_COMMANDS.allen))] })
    },

    props: async ({ room }) => {
      await post({ room, message: '', images: [SINGLE_GIF_COMMANDS.props] })
    },

    ass: async ({ room }) => {
      await post({ room, message: '', images: [chooseRandom(RANDOM_GIF_COMMANDS.ass)] })
    },

    titties: async ({ room }) => {
      await post({ room, message: '', images: [chooseRandom(RANDOM_GIF_COMMANDS.titties)] })
    },

    azz: async ({ room }) => {
      await post({ room, message: '', images: [chooseRandom(RANDOM_GIF_COMMANDS.azz)] })
    },

    shred: async ({ room }) => {
      await post({ room, message: '', images: [chooseRandom(RANDOM_GIF_COMMANDS.shred)] })
    }
  }
}
