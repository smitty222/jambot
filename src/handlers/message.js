// message.js
import { postMessage } from '../libs/cometchat.js'
import { askQuestion } from '../libs/ai.js'
import { handleTriviaStart, handleTriviaEnd, handleTriviaSubmit, totalPoints } from '../handlers/triviaCommands.js'
import { logger } from '../utils/logging.js'
import { roomBot } from '../index.js'
import { fetchCurrentlyPlayingSong, isUserAuthorized, fetchSpotifyPlaylistTracks, fetchUserData, fetchSpotifyRecommendations, updateRoomInfo} from '../utils/API.js'
import { handleLotteryCommand, handleLotteryNumber, LotteryGameActive } from '../utils/lotteryGame.js'
import { enableSongStats, disableSongStats, songStatsEnabled } from '../utils/voteCounts.js'
import { enableGreetingMessages, disableGreetingMessages, greetingMessagesEnabled } from './userJoined.js'
import { getCurrentDJ } from '../libs/bot.js'
import { resetCurrentQuestion } from './triviaData.js'
import { addTracksToPlaylist, removeTrackFromPlaylist } from '../utils/playlistUpdate.js'

const ttlUserToken = process.env.TTL_USER_TOKEN
export const roomThemes = {}
const usersToBeRemoved = {}

// Messages
export default async (payload, room, state) => {
  logger.info({ sender: payload.senderName, message: payload.message })

  // Handle Gifs Sent in Chat
  if (payload.message.type === 'ChatGif') {
    logger.info('Received a GIF message:', payload.message)
    return
  }

  // AI Chat Stuff
  if (
    typeof payload.message === 'string' &&
  payload.message.includes(`@${process.env.CHAT_NAME}`) &&
  payload.senderName &&
  !payload.senderName.startsWith(`@${process.env.BOT_USER_UUID}`) &&
  !payload.message.includes('played')
  ) {
    try {
      const question = payload.message.replace(`@${process.env.CHAT_NAME}`, '').trim().toLowerCase()
      console.log(`Received question: "${question}"`)
      logger.info(`Received question: "${question}" from ${payload.senderName}`)

      let context = question

      if (question.includes('song is this') || question.includes('this song') || question.includes('song is playing')| question.includes('this')) {
        const currentSong = roomBot.currentSong

        if (currentSong) {
          console.log(`Current song details: ${JSON.stringify(currentSong)}`)
          logger.info(`Current song details: ${JSON.stringify(currentSong)}`)

          const artistText = currentSong.artistName ? `by ${currentSong.artistName}` : ''
          context = `The current song is "${currentSong.trackName}" ${artistText}. ${question} briefly`
        } else {
          console.warn('No song is currently playing or trackName is missing.')
          logger.warn('No song is currently playing or trackName is missing.')

          await postMessage({
            room,
            message: 'No song is currently playing.'
          })
          return
        }
      }
      if (question.includes('you good?')) {
        await postMessage({
          room,
          message: 'Couldnt be better'
        })
      }


      // Check if the question includes "popularity score"
      if (question.includes('popularity score')) {
        context = `The popularity of the track comes from Spotify's metrics. The value will be between 0 and 100, with 100 being the most popular.
      The popularity of a track is a value between 0 and 100, with 100 being the most popular. The popularity is calculated by algorithm and is based, in the most part, on the total number of plays the track has had and how recent those plays are.
      Generally speaking, songs that are being played a lot now will have a higher popularity than songs that were played a lot in the past. Duplicate tracks (e.g. the same track from a single and an album) are rated independently. Artist and album popularity is derived mathematically from track popularity. Note: the popularity value may lag actual popularity by a few days: the value is not updated in real time. ${question}`
      }

      if (context) {
        console.log(`Context passed to AI: "${context}"`)
        logger.info(`Context passed to AI: "${context}"`)

        const reply = await askQuestion(context)
        const responseText = reply?.text || (typeof reply === 'string' ? reply : 'Sorry, I could not generate a response at the moment.')

        console.log('AI Reply:', responseText)
        logger.info(`AI Reply: ${responseText}`)

        await postMessage({
          room,
          message: responseText
        })
      } else {
        console.log('No question found in the message')
        await postMessage({
          room,
          message: 'Please provide a question for me to answer.'
        })
      }
    } catch (error) {
      logger.error('Error handling AI response:', error)
      await postMessage({
        room,
        message: 'Sorry, something went wrong trying to process your message.'
      })
    }

    /// //////////// LOTTERY GAME ////////////////////////////////////////////
  } else if (payload.message.startsWith('/lottery')) {
    try {
      const GifUrl = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm11bGZ0M3RraXg5Z3Z4ZzZpNjU4ZDR4Y2QwMzc0NWwyaWFlNWU4byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Ps8XflhsT5EVa/giphy.gif'
      await postMessage({
        room,
        message: '',
        images: [GifUrl]
      })
    } catch (error) {
      console.error('Error processing command', error.message)
      await postMessage({
        room,
        message: 'An error occurred while processing the command. Please try again.'
      })
    }
    await handleLotteryCommand(payload)
  } else if (LotteryGameActive) {
    await handleLotteryNumber(payload)

    /// ///////////// Commands Start Here. ////////////////////////
  } else if (payload.message.startsWith('/hello')) {
    await postMessage({
      room,
      message: 'Hi!'
    })
  } else if (payload.message.startsWith('/test')) {
    await postMessage({
      room,
      message: 'https://open.spotify.com/track/3z8DyeoD1bZOQtEYyCL2wn?si=862691bd0df047d8'
    })
  } else if (payload.message.startsWith('/commands')) {
    await postMessage({
      room,
      message: 'General commands are:\n- /theme: Checks the current room theme\n- /trivia: Trivia Game\n- /lottery: Numbers!\n- /jump: Makes the bot jump\n- /dislike: Makes the bot downvote\n- /addDJ: Adds the bot as DJ\n- /removeDJ: Removes the bot as DJ\n- /dive: Remove yourself from the stage\n- /escortme: Stagedive after your next song\n- /djbeer: Gives the DJ a beer\n- /audio: Bot will list spotify audio stats for song\n- /gifs: Bot will list all GIF commands\n- /mod: Bot will list all Mod commands'
    })
  } else if (payload.message.startsWith('/gifs')) {
    await postMessage({
      room,
      message: 'Randomly selected GIFs:\n- /burp\n- /dance\n- /party\n- /beer\n- /fart\n- /tomatoes\n- /cheers'
    })
  } else if (payload.message.startsWith('/mod')) {
    await postMessage({
      room,
      message: 'Moderator commands are:\n- /settheme: Set room theme\n- /removetheme: Remove room theme\n- /addsong: Add current song to bot playlist\n- /removesong: Remove current song from bot playlist\n- /songstatson: Turns song stats on\n- /songstatsoff: Turns song stats off\n- /bopoff: Turns bot auto like off\n- /bopon: Turns bot auto like back on\n- /greeton: Turns on expanded user greeting\n- /greetoff: Turns off expanded user greeting\n -/audiostatson: Turns on audio stats\n -/audiostatsoff: Turns off audio stats\n- /status: Shows bot toggles status'
    })
  } else if (payload.message.startsWith('/secret')) {
    await postMessage({
      room,
      message: 'Sssshhhhhh be very quiet. These are top secret\n- /bark\n- /barkbark\n- /drink\n- /djbeers\n- /getdjdrunk\n- /jam\n- /ass\n- /azz\n- /cam\n- /shirley\n- /berad\n- /ello\n- /score\n- /art'
    })
    /// /////////////// General Commands ////////////////
  } else if (payload.message.startsWith('/theme')) {
    try {
      const theme = roomThemes[room]
      if (theme) {
        await postMessage({
          room,
          message: `Current theme: ${theme}`
        })
      } else {
        await postMessage({
          room,
          message: 'No theme set for the room.'
        })
      }
    } catch (error) {
      console.error('Error fetching theme:', error)
      await postMessage({
        room,
        message: 'An error occurred while fetching the theme. Please try again.'
      })
    }
  } else if (payload.message.startsWith('/djbeers')) {
    try {
      const senderName = payload.senderName
      const currentDJUuid = getCurrentDJ(state)

      if (!currentDJUuid) {
        await postMessage({
          room,
          message: `${senderName}, there is no DJ currently playing.`
        })
        throw new Error('No current DJ found.')
      }

      const [currentDJName] = await fetchUserData([currentDJUuid])

      if (!currentDJName) {
        await postMessage({
          room,
          message: `${senderName}, could not fetch the current DJ's name.`
        })
        throw new Error('Could not fetch the current DJ\'s name.')
      }
      await postMessage({
        room,
        message: `@${senderName} gives @${currentDJName} two ice cold beers!! 🍺🍺`
      })
    } catch (error) {
      console.error('Error handling /beerDJ command:', error)
    }
  } else if (payload.message.startsWith('/djbeer')) {
    try {
      const senderName = payload.senderName
      const currentDJUuid = getCurrentDJ(state)

      if (!currentDJUuid) {
        await postMessage({
          room,
          message: `${senderName}, there is no DJ currently playing.`
        })
        throw new Error('No current DJ found.')
      }
      const [currentDJName] = await fetchUserData([currentDJUuid])

      if (!currentDJName) {
        await postMessage({
          room,
          message: `${senderName}, could not fetch the current DJ's name.`
        })
        throw new Error('Could not fetch the current DJ\'s name.')
      }

      await postMessage({
        room,
        message: `@${senderName} gives @${currentDJName} a ice cold beer! 🍺`
      })

      console.log(`${senderName} gives ${currentDJName} a ice cold beer! 🍺`)
    } catch (error) {
    }
  } else if (payload.message.startsWith('/getdjdrunk')) {
    try {
      const senderName = payload.senderName
      const currentDJUuid = getCurrentDJ(state)

      if (!currentDJUuid) {
        await postMessage({
          room,
          message: `${senderName}, there is no DJ currently playing.`
        })
        throw new Error('No current DJ found.')
      }
      const [currentDJName] = await fetchUserData([currentDJUuid])

      if (!currentDJName) {
        await postMessage({
          room,
          message: `${senderName}, could not fetch the current DJ's name.`
        })
        throw new Error('Could not fetch the current DJ\'s name.')
      }
      await postMessage({
        room,
        message: `@${senderName} gives @${currentDJName} a million ice cold beers!!! 🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺`
      })
    } catch (error) {
      console.error('Error handling /beerDJ command:', error)
    }
  } else if (payload.message.startsWith('/jump')) {
    try {
      await roomBot.playOneTimeAnimation('jump', process.env.ROOM_UUID, process.env.BOT_USER_UUID)
    } catch (error) {
      console.error('Error Jumping', error)
    }
  } else if (payload.message.startsWith('/like')) {
    try {
      await roomBot.voteOnSong(process.env.ROOM_UUID, { like: true }, process.env.BOT_USER_UUID)
    } catch (error) {
      console.error('Error Voting on Song', error)
    }
  } else if (payload.message.startsWith('/dislike')) {
    try {
      await roomBot.voteOnSong(process.env.ROOM_UUID, { like: false }, process.env.BOT_USER_UUID)
    } catch (error) {
      console.error('Error Voting on Song', error)
    }
  } else if (payload.message.startsWith('/addDJ')) {
    try {
      await roomBot.addDJ()
    } catch (error) {
      console.error('Error adding DJ:', error)
    }
  } else if (payload.message.startsWith('/removeDJ')) {
    try {
      const isBotDJ = roomBot.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)
      if (isBotDJ) {
        await roomBot.removeDJ(process.env.BOT_USER_UUID)
      } else {
        console.log('Bot is not a DJ.')
      }
    } catch (error) {
      console.error('Error removing DJ:', error)
    }
  } else if (payload.message.startsWith('/dive')) {
    try {
      const userUuid = payload.sender
      await roomBot.removeDJ(userUuid)
    } catch (error) {
      console.error('Error removing user from DJ:', error)
    }
  } else if (payload.message.startsWith('/escortme')) {
    try {
      const userUuid = payload.sender
      usersToBeRemoved[userUuid] = true
      await postMessage({
        room,
        message: `${payload.senderName}, you will be removed from the stage after your next song`
      })
    } catch (error) {
      console.error('Error handling /escortme command:', error)
    }

  /// /////////////// Secret Commands /////////////////////
  } else if (payload.message.startsWith('/barkbark')) {
    await postMessage({
      room,
      message: 'WOOF WOOF'
    })
  } else if (payload.message.startsWith('/bark')) {
    await postMessage({
      room,
      message: 'WOOF'
    })
  } else if (payload.message.startsWith('/star')) {
    try {
      await roomBot.voteOnSong(process.env.ROOM_UUID, { star: true }, process.env.BOT_USER_UUID)
    } catch (error) {
      console.error('Error Voting on Song', error)
    }
  } else if (payload.message.startsWith('/unstar')) {
    try {
      await roomBot.voteOnSong(process.env.ROOM_UUID, { star: false }, process.env.BOT_USER_UUID)
    } catch (error) {
      console.error('Error Voting on Song', error)
    }
  } else if (payload.message.startsWith('/jam')) {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

    try {
      for (let i = 0; i < 10; i++) {
        await roomBot.voteOnSong(process.env.ROOM_UUID, { star: true }, process.env.BOT_USER_UUID)
        console.log(`Round ${i + 1}: Starred the song`)

        await roomBot.playOneTimeAnimation('jump', process.env.ROOM_UUID, process.env.BOT_USER_UUID)
        console.log(`Round ${i + 1}: Bot jumped`)

        await delay(500)

        await roomBot.voteOnSong(process.env.ROOM_UUID, { star: false }, process.env.BOT_USER_UUID)
        console.log(`Round ${i + 1}: Unstarred the song`)

        await delay(500)
      }
    } catch (error) {
      console.error('Error Jamming', error)
    }
  } else if (payload.message.startsWith('/berad')) {
    await postMessage({
      room,
      message: '@BeRad is the raddest guy in town'
    })
  } else if (payload.message.startsWith('/cam')) {
    await postMessage({
      room,
      message: '@Cam i love you!'
    })
  } else if (payload.message.startsWith('/drink')) {
    await postMessage({
      room,
      message: 'Im drunk already. Catch me if you can'
    })
  } else if (payload.message.startsWith('/shirley')) {
    try {
      const GifUrl = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzdyamVybTVwa256NnVrdWQzcXMwcWd6YXlseTQ0dmY3OWloejQyYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3oEjHLzm4BCF8zfPy0/giphy.gif'
      await postMessage({
        room,
        message: '',
        images: [GifUrl]
      })
    } catch (error) {
      console.error('Error processing command:', error.message)
    }
  } else if (payload.message.startsWith('/ello')) {
    try {
      const GifUrl = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdjczM2hxOHRtZWlxdmVoamsxZHA5NHk3OXljemMyeXBubzhpMTFkYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3vPU8fnm8HZ1C/giphy.gif'
      await postMessage({
        room,
        message: '',
        images: [GifUrl]
      })
    } catch (error) {
      console.error('Error processing command:', error.message)
    }
  } else if (payload.message.startsWith('/allen')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/sA8nO56Gj9RHq/giphy.gif?cid=790b7611h6b5ihdlko5foubqcifo0e3h0i7e6p1vo2h8znzj&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        ''
      ]
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]
      await postMessage({
        room,
        message: '',
        images: [randomDanceImageUrl]
      })
    } catch (error) {
      console.error('Error processing command:', error.message)
    }
  } else if (payload.message.startsWith('/ass')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2JkNnliMGxhMjZ5NnVtcGd3dWN1YmVyZHJ3ZXo3cTZyZnJsM2UzbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/uxXNV3Xa7QqME/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2JkNnliMGxhMjZ5NnVtcGd3dWN1YmVyZHJ3ZXo3cTZyZnJsM2UzbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xUPGGL6TieAUk10oNO/giphy.gif',
        'https://media.giphy.com/media/rAKdqZ8nfiaZi/giphy.gif?cid=790b7611cbd6yb0la26y6umpgwucuberdrwez7q6rfrl3e3o&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/IYJBTNLgES23K/giphy.gif?cid=790b7611cbd6yb0la26y6umpgwucuberdrwez7q6rfrl3e3o&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/r0maJFJCvM8Pm/giphy.gif?cid=ecf05e47ymi8mjlscn2zhhaq5jwlixct7t9hxqy4bvi0omzp&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/CsjpI6bhjptTO/giphy.gif?cid=ecf05e47i0e2qssmhziagwv4stpgetatpz2555i70q4own0v&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/H7kO0C0DCkQjUaQxOF/giphy.gif?cid=ecf05e47kpjyfjk0pfslwnyl220r2gsn54t77flye0fpgqol&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]
      await postMessage({
        room,
        message: '',
        images: [randomDanceImageUrl]
      })
    } catch (error) {
      console.error('Error processing command:', error.message)
    }
  } else if (payload.message.startsWith('/azz')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/fcDNkoEy1aXOFwbv7q/giphy.gif?cid=ecf05e47fvbfd2n1xikifbbtuje37cga98d9rmx7sjo2olzu&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/GB4N7W7OP5iOk/giphy.gif?cid=ecf05e4706qgo7363yeua3o6hq4m5ps3u1y88ssw8tgi1o9e&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]
      await postMessage({
        room,
        message: '',
        images: [randomDanceImageUrl]
      })
    } catch (error) {
      console.error('Error processing command:', error.message)
    }

    /// ///////////  GIF Commands /////////////////////////
  } else if (payload.message.startsWith('/burp')) {
    try {
      const GifUrl = 'https://media.giphy.com/media/3orieOieQrTkLXl2SY/giphy.gif?cid=790b7611gofgmq0d396jww26sbt1bhc9ljg9am4nb8m6f6lo&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      await postMessage({
        room,
        message: '',
        images: [GifUrl]
      })
    } catch (error) {
      console.error('Error processing /burp command:', error.message)
      await postMessage({
        room,
        message: 'An error occurred while processing the burp command. Please try again.'
      })
    }
  } else if (payload.message.startsWith('/dance')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/IwAZ6dvvvaTtdI8SD5/giphy.gif',
        'https://media.giphy.com/media/3o7qDQ4kcSD1PLM3BK/giphy.gif',
        'https://media.giphy.com/media/oP997KOtJd5ja/giphy.gif',
        'https://media.giphy.com/media/wAxlCmeX1ri1y/giphy.gif'
      ]
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]
      await postMessage({
        room,
        message: '',
        images: [randomDanceImageUrl]
      })
    } catch (error) {
      console.error('Error processing /dance command:', error.message)
      await postMessage({
        room,
        message: 'An error occurred while processing the dance command. Please try again.'
      })
    }
  } else if (payload.message.startsWith('/fart')) {
    try {
      const FartImageOptions = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ21qYmtndjNqYWRqaTFrd2NqaDNkejRqY3RrMTV5Mzlvb3gydDk0ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/dWxYMTXIJtT9wGLkOw/giphy.gif',
        'https://media.giphy.com/media/LFvQBWwKk7Qc0/giphy.gif?cid=790b7611gmjbkgv3jadji1kwcjh3dz4jctk15y39oox2t94g&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const randomfartImageUrl = FartImageOptions[Math.floor(Math.random() * FartImageOptions.length)]
      await postMessage({
        room,
        message: '',
        images: [randomfartImageUrl]
      })
    } catch (error) {
      console.error('Error processing /dance command:', error.message)
      await postMessage({
        room,
        message: 'An error occurred while processing the dance command. Please try again.'
      })
    }
  } else if (payload.message.startsWith('/party')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHF6aTAzeXNubW84aHJrZzd1OGM1ZjM0MGp5aTZrYTRrZmdscnYwbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IwAZ6dvvvaTtdI8SD5/giphy.gif',
        'https://media.giphy.com/media/xUA7aT1vNqVWHPY1cA/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/iJ2cZjydqg9wFkzbGD/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]
      await postMessage({
        room,
        message: '',
        images: [randomDanceImageUrl]
      })
    } catch (error) {
      console.error('Error processing command:', error.message)
    }
  } else if (payload.message.startsWith('/beer')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/l2Je5C6DLUvYVj37a/giphy.gif?cid=ecf05e475as76fua0g8zvld9lzbm85sb3ojqyt95jrxrnlqz&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/9GJ2w4GMngHCh2W4uk/giphy.gif?cid=ecf05e47vxjww4oli5eck8v6nd6jcmfl9e6awd3a9ok2wa7w&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG5yc2UzZXh5dDdzbTh4YnE4dzc5MjMweGc5YXowZjViYWthYXczZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DmzUp9lX7lHlm/giphy.gif',
        'https://media.giphy.com/media/70lIzbasCI6vOuE2zG/giphy.gif?cid=ecf05e4758ayajrk9c6dnrcblptih04zceztlwndn0vwxmgd&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]
      await postMessage({
        room,
        message: '',
        images: [randomDanceImageUrl]
      })
    } catch (error) {
      console.error('Error processing command:', error.message)
    }
  } else if (payload.message.startsWith('/cheers')) {
    try {
      const cheersOptions = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3dpem43dXNuNnkzb3A3NmY0ZjBxdTZxazR5aXh1dDl1N3R5OHRyaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/BPJmthQ3YRwD6QqcVD/giphy.gif' }, // LEO Cheers GIF
        { type: 'gif', value: 'https://media.giphy.com/media/3oeSB36G9Au4V0xUhG/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' }, // Wedding Crashers cheers GIF
        { type: 'gif', value: 'https://media.giphy.com/media/l7jc8M23lg9e3l9SDn/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' }, // Biden cheers GIF
        { type: 'emoji', value: '🍻🍻🍻🍻' }
      ]
      const randomCheersOption = cheersOptions[Math.floor(Math.random() * cheersOptions.length)]
      if (randomCheersOption.type === 'gif') {
        await postMessage({
          room,
          message: '',
          images: [randomCheersOption.value]
        })
      } else if (randomCheersOption.type === 'emoji') {
        await postMessage({
          room,
          message: randomCheersOption.value
        })
      }
    } catch (error) {
      console.error('Error processing command:', error.message)
    }
  } else if (payload.message.startsWith('/tomatoes')) {
    try {
      const cheersOptions = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb296MmJyeHBpYm9yMGQwbG81cnhlcGd4MWF4N3A1dWhhN3FxNmJvdCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Her9TInMPQYrS/giphy.gif' }, // Taz tomatoes GIF
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbGY4YmQwZTA5aHk3ejhrbTI1Mmk1NDl6ZTkzM2h6cm53djZsYnB5diZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26nfoIrm8lHXqmm7C/giphy.gif' }, // Spongebob tomatoes GIF
        { type: 'emoji', value: '🍅🍅🍅🍅' }

      ]
      const randomCheersOption = cheersOptions[Math.floor(Math.random() * cheersOptions.length)]
      if (randomCheersOption.type === 'gif') {
        await postMessage({
          room,
          message: '',
          images: [randomCheersOption.value]
        })
      } else if (randomCheersOption.type === 'emoji') {
        await postMessage({
          room,
          message: randomCheersOption.value
        })
      }
    } catch (error) {
      console.error('Error processing command:', error.message)
    }
  }
  /// ////////////// MOD Commands ///////////////////////////
  // Import or include the updateRoomInfo function
// async function updateRoomInfo(payload) { ... }

else if (payload.message.startsWith('/settheme')) {
  try {
      const senderUuid = payload.sender; // Assuming payload.sender contains the user UUID
      const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken); // Call isUserAuthorized with senderUuid
      if (!isAuthorized) {
          await postMessage({
              room,
              message: 'You need to be a moderator to execute this command.'
          });
          return;
      }

      const theme = payload.message.replace('/settheme', '').trim();
      roomThemes[room] = theme;

      // Prepare the payload for updating room info based on the theme
      let updatePayload = null;
      const themeLower = theme.toLowerCase();
      
      if (["albums", "album monday", "album day"].includes(themeLower)) {
          updatePayload = {
              design: "FERRY_BUILDING",
              numberOfDjs: 1
          };
      } else if (["covers", "cover friday"].includes(themeLower)) {
          updatePayload = {
              design: "FESTIVAL",
              numberOfDjs: 4
          };
      }

      if (updatePayload) {
          // Call the updateRoomInfo function with the payload
          await updateRoomInfo(updatePayload);
      }

      await postMessage({
          room,
          message: `Theme set to: ${theme}`
      });
  } catch (error) {
      console.error('Error setting theme:', error);
      await postMessage({
          room,
          message: `Error: ${error.message}`
      });
  }
  
} else if (payload.message.startsWith('/removetheme')) {
  try {
      const senderUuid = payload.sender;
      const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken);
      if (!isAuthorized) {
          await postMessage({
              room,
              message: 'You need to be a moderator or owner to execute this command.'
          });
          return;
      }

      // Remove the theme from roomThemes
      delete roomThemes[room];

      // Update room info to set design to YACHT and numberOfDjs to 3
      const updatePayload = {
          design: "YACHT",
          numberOfDjs: 3
      };
      await updateRoomInfo(updatePayload);

      await postMessage({
          room,
          message: 'Theme removed and room info updated.'
      });
  } catch (error) {
      console.error('Error removing theme:', error);
      await postMessage({
          room,
          message: 'An error occurred while removing the theme. Please try again.'
      });
  }

  } else if (payload.message.startsWith('/status')) {
    try {
      const autobopStatus = roomBot.autobop ? 'enabled' : 'disabled'
      const songStatsStatus = songStatsEnabled ? 'enabled' : 'disabled'
      const greetUserStatus = greetingMessagesEnabled ? 'enabled' : 'disabled'
      const audioStatsStatus = roomBot.audioStatsEnabled ? 'enabled' : 'disabled'
      const statusMessage = `Bot Mod Toggles:\n- Autobop: ${autobopStatus}\n- Song stats: ${songStatsStatus}\n- Greet users: ${greetUserStatus}\n- Audio Stats: ${audioStatsStatus}`
      await postMessage({
        room,
        message: statusMessage
      })
    } catch (error) {
      console.error('Error getting status:', error)
      await postMessage({
        room,
        message: 'An error occurred while getting status. Please try again.'
      })
    }
  /// /////////// Mod Toggle Commands //////////////
  } else if (payload.message.startsWith('/bopon')) {
    try {
      await roomBot.enableAutoBop()
      await postMessage({
        room,
        message: 'Autobop enabled.'
      })
    } catch (error) {
      console.error('Error enabling autobop:', error)
      await postMessage({
        room,
        message: 'An error occurred while enabling autobop. Please try again.'
      })
    }
  } else if (payload.message.startsWith('/bopoff')) {
    try {
      await roomBot.disableAutoBop()
      await postMessage({
        room,
        message: 'Autobop disabled.'
      })
    } catch (error) {
      console.error('Error disabling autobop:', error)
      await postMessage({
        room,
        message: 'An error occurred while disabling autobop. Please try again.'
      })
    }
  } else if (payload.message.startsWith('/songstatson')) {
    try {
      const senderUuid = payload.sender
      const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
      if (!isAuthorized) {
        await postMessage({
          room,
          message: 'You need to be a moderator to execute this command.'
        })
        return
      }
      await enableSongStats()
      await postMessage({
        room,
        message: 'Song stats enabled'
      })
    } catch (error) {
      console.error('Error enabling song stats:', error)
      await postMessage({
        room,
        message: `Error: ${error.message}`
      })
    }
  } else if (payload.message.startsWith('/songstatsoff')) {
    try {
      const senderUuid = payload.sender
      const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
      if (!isAuthorized) {
        await postMessage({
          room,
          message: 'You need to be a moderator to execute this command.'
        })
        return
      }

      await disableSongStats()
      await postMessage({
        room,
        message: 'Song stats disabled'
      })
    } catch (error) {
      console.error('Error disabling song stats:', error)
      await postMessage({
        room,
        message: `Error: ${error.message}`
      })
    }
  // Command to turn on greeting messages
  } else if (payload.message.startsWith('/greeton')) {
    try {
      enableGreetingMessages()
      await postMessage({
        room,
        message: 'Greeting messages enabled'
      })
    } catch (error) {
      console.error('Error enabling greeting messages:', error)
      await postMessage({
        room,
        message: `Error: ${error.message}`
      })
    }

    // Command to turn off greeting messages
  } else if (payload.message.startsWith('/greetoff')) {
    try {
      disableGreetingMessages()
      await postMessage({
        room,
        message: 'Greeting messages disabled'
      })
    } catch (error) {
      console.error('Error disabling greeting messages:', error)
      await postMessage({
        room,
        message: `Error: ${error.message}`
      })
    }
  } else if (payload.message.startsWith('/audiostatson')) {
    try {
      const senderUuid = payload.sender
      const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
      if (!isAuthorized) {
        await postMessage({
          room,
          message: 'You need to be a moderator to execute this command.'
        })
        return
      }
      roomBot.audioStatsEnabled = true
      await postMessage({ room, message: 'Audio stats messages enabled.' })
    } catch (error) {
      console.error('Error enabling song stats:', error)
      await postMessage({
        room,
        message: `Error: ${error.message}`
      })
    }
  } else if (payload.message.startsWith('/audiostatsoff')) {
    try {
      const senderUuid = payload.sender
      const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
      if (!isAuthorized) {
        await postMessage({
          room,
          message: 'You need to be a moderator to execute this command.'
        })
        return
      }
      roomBot.audioStatsEnabled = false
      await postMessage({ room, message: 'Audio stats messages disabled.' })
    } catch (error) {
      console.error('Error enabling song stats:', error)
      await postMessage({
        room,
        message: `Error: ${error.message}`
      })
    }
    /// ////////////// SPOTIFY STUFF ////////////////////////////
  } else if (payload.message.startsWith('/nextsong')) {
    const nextSong = roomBot.nextSong
    if (nextSong && nextSong.trackName) {
      const songDetails = `Track Name: ${nextSong.trackName}\nArtist Name: ${nextSong.artistName}`
      await postMessage({
        room,
        message: songDetails
      })
    } else {
      await postMessage({
        room,
        message: 'No song is currently playing or trackName is missing.'
      })
    }
  } else if (payload.message.startsWith('/song')) {
    const currentSong = roomBot.currentSong
    if (currentSong && currentSong.trackName) {
      const songDetails = `Track Name: ${currentSong.trackName}\nArtist Name: ${currentSong.artistName}\n${currentSong.spotifyUrl}`
      await postMessage({
        room,
        message: songDetails
      })
    } else {
      await postMessage({
        room,
        message: 'No song is currently playing or trackName is missing.'
      })
    }
  } else if (payload.message.startsWith('/album')) {
    const currentSong = roomBot.currentSong
    if (currentSong && currentSong.trackName) {
      const albumDetails = `Album Name: ${currentSong.albumName}\nArtist Name: ${currentSong.artistName}\nTrack Name: ${currentSong.trackName}\nTrack ${currentSong.trackNumber} of ${currentSong.totalTracks}`
      const albumArtUrl = currentSong.albumArt
      const images = albumArtUrl ? [albumArtUrl] : []
      await postMessage({
        room,
        message: albumDetails
      })
      if (images.length > 0) {
        await postMessage({
          room,
          images
        })
      }
    } else {
      await postMessage({
        room,
        message: 'No song is currently playing or trackName is missing.'
      })
    }
  } else if (payload.message.startsWith('/art')) {
    const currentSong = roomBot.currentSong
    if (currentSong && currentSong.albumArt) {
      const albumArtUrl = currentSong.albumArt
      const images = albumArtUrl ? [albumArtUrl] : []
      if (images.length > 0) {
        await postMessage({
          room,
          images
        })
      }
    }
  } else if (payload.message.startsWith('/score')) {
    const currentSong = roomBot.currentSong
    if (currentSong && currentSong.trackName) {
      const songDetails = `${currentSong.trackName} by ${currentSong.artistName} received a popularity score of ${currentSong.popularity} out of 100`
      await postMessage({
        room,
        message: songDetails
      })
    } else {
      await postMessage({
        room,
        message: 'No song is currently playing or trackName is missing.'
      })
    }
  } else if (payload.message.startsWith('/audio?')) {
    const currentSong = roomBot.currentSong
    if (currentSong && currentSong.trackName) {
      const audioDetails = "Acousticness: Confidence (0.0 to 1.0) of how acoustic a track is. 1.0 means high confidence it's acoustic.\n\nDanceability: Suitability for dancing (0.0 to 1.0). 1.0 is most danceable, considering tempo, rhythm, and beat.\n\nEnergy: Intensity and activity (0.0 to 1.0). 1.0 is highly energetic, with features like loudness and tempo.\n\nInstrumentalness: Likelihood (0.0 to 1.0) that a track is instrumental. Values close to 1.0 suggest no vocals.\n\nLiveness: Presence of an audience (0.0 to 1.0). Higher values mean a greater likelihood the track is live.\n\nLoudness: Overall loudness in decibels (dB). Values range from -60 to 0 dB, showing the relative loudness of the track.\n\nSpeechiness: Likelihood (0.0 to 1.0) that the track contains spoken words. Values above 0.66 indicate mostly speech.\n\nTempo: Estimated beats per minute (BPM). Reflects the speed or pace of the track.\n\nValence: Musical positiveness (0.0 to 1.0). Higher values are more positive (happy, cheerful), lower values are more negative (sad, angry)."
      await postMessage({
        room,
        message: audioDetails
      })
    }
  } else if (payload.message.startsWith('/audio')) {
    const currentSong = roomBot.currentSong
    if (currentSong && currentSong.trackName) {
      const audioDetails = `Audio Stats for ${currentSong.trackName}\n\nAcousticness: ${currentSong.audioFeatures.acousticness}\n Danceability: ${currentSong.audioFeatures.danceability}\n Energy: ${currentSong.audioFeatures.energy}\n Instrumentalness: ${currentSong.audioFeatures.instrumentalness}\n Liveness: ${currentSong.audioFeatures.liveness}\n Loudness: ${currentSong.audioFeatures.loudness}\n Speechiness: ${currentSong.audioFeatures.speechiness}\n Tempo: ${currentSong.audioFeatures.tempo}\n Valence: ${currentSong.audioFeatures.valence}\n\n\n use '/audio?' for details on each statistic`
      await postMessage({
        room,
        message: audioDetails
      })
    }
  } else if (payload.message.startsWith('/suggestsong')) {
    const seedTracks = roomBot.recentSpotifyTrackIds.slice(0, 5);
    console.log('Fetching recommendations with seedTracks:', seedTracks);
  
    try {
      const recommendations = await fetchSpotifyRecommendations([], [], seedTracks, 5);
  
      if (recommendations.length > 0) {
        // Send the initial message
        await postMessage({
          room,
          message: 'Based on the last 5 songs played in this room, here are 5 suggested songs you might like:'
        });
  
        // Loop through recommendations and send only the Spotify URL in each separate message
        for (const track of recommendations) {
          await postMessage({
            room,
            message: `https://open.spotify.com/track/${track.id}`
          });
  
          // Optional: brief delay between sending messages
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay between messages
        }
      } else {
        await postMessage({
          room,
          message: 'No recommendations available.'
        });
      }
    } catch (error) {
      console.error('Error in /suggestsong command:', error);
      await postMessage({
        room,
        message: 'Could not fetch suggested songs. Please try again later.'
      });
    }
      
    if (payload.message.includes('song feature')) {
        await handleSongFeature(room);
    }

// Command to add a song to the playlist
if (payload.message.startsWith('/addsong')) {
  try {
    // Log the current song's track ID for debugging
    console.log('Current song track ID:', roomBot.currentSong.spotifyTrackId);

    const spotifyTrackId = roomBot.currentSong.spotifyTrackId;

    if (!spotifyTrackId) {
      await postMessage({
        room,
        message: 'No track is currently playing or track ID is invalid.'
      });
      return;
    }

    // Construct the Spotify track URI
    const trackUri = `spotify:track:${spotifyTrackId}`;

    console.log('Track URI:', trackUri); // Log the URI for debugging

    // Fetch playlist tracks and check if the track is already in the playlist
    const playlistTracks = await fetchSpotifyPlaylistTracks();
    const playlistTrackURIs = playlistTracks.map(track => track.track.uri);

    if (playlistTrackURIs.includes(trackUri)) {
      await postMessage({
        room,
        message: 'Track is already in the playlist!'
      });
    } else {
      // Add the track to the playlist
      const snapshotId = await addTracksToPlaylist([trackUri]);

      if (snapshotId) {
        await postMessage({
          room,
          message: 'Track added successfully!'
        });
      } else {
        await postMessage({
          room,
          message: 'Failed to add the track to the playlist.'
        });
      }
    }
  } catch (error) {
    await postMessage({
      room,
      message: `Error adding track to playlist: ${error.message}`
    });
  }
}

// Command to remove a song from the playlist
if (payload.message.startsWith('/removesong')) {
  try {
    const senderUuid = payload.sender;
    const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken);
    if (!isAuthorized) {
      await postMessage({
        room,
        message: 'You need to be a moderator to execute this command.'
      });
      return;
    }

    const trackUri = await fetchCurrentlyPlayingSong();
    
    if (!trackUri) {
      await postMessage({
        room,
        message: 'No track is currently playing or track URI is invalid.'
      });
      return;
    }

    const snapshotId = await removeTrackFromPlaylist(process.env.DEFAULT_PLAYLIST_ID, trackUri);

    if (snapshotId) {
      await postMessage({
        room,
        message: 'Track removed successfully!'
      });
    } else {
      await postMessage({
        room,
        message: 'Failed to remove the track from the playlist.'
      });
    }
  } catch (error) {
    await postMessage({
      room,
      message: `Error removing track from playlist: ${error.message}`
    });
  }
}

    /// /////////////  Trivia Stuff /////////////////////////////
  } else if (payload.message.startsWith('/triviastart')) {
    await handleTriviaStart(room)
  } else if (payload.message.startsWith('/a') || payload.message.startsWith('/b') || payload.message.startsWith('/c') || payload.message.startsWith('/d')) {
    await handleTriviaSubmit(payload, roomBot, room)
  } else if (payload.message.startsWith('/triviaend')) {
    await handleTriviaEnd(resetCurrentQuestion, totalPoints, room)
  } else if (payload.message.startsWith('/trivia')) {
    await postMessage({
      room,
      message: 'To start a trivia game you can use /triviastart. To submit your answer you can use /a, /b, /c, or /d. The points will tally up and the game will continue on until you use /triviaend.'
    })
  }
}
export { usersToBeRemoved }
