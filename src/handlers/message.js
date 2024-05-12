// message.js
import { postMessage } from '../libs/cometchat.js'
import { askQuestion } from '../libs/ai.js'
import { selectRandomQuestion, checkAnswer } from './trivia.js'
import { logger } from '../utils/logging.js'
import { roomBot } from '../index.js'
import { handleAddSongCommand } from './addSong.js'


// Themes Stuff
const roomThemes = {}
let currentQuestion = null;
let submittedAnswer = null;
let totalPoints = 0;
const askedQuestions = new Set();
const resetTriviaState = () => {
  currentQuestion = null;
  submittedAnswer = null;
};
const getNewQuestion = () => {
  let question = selectRandomQuestion();
  while (askedQuestions.has(question)) {
    question = selectRandomQuestion();
  }
  askedQuestions.add(question);
  return question;
};
// Messages
export default async (payload, room) => {
  logger.info({ sender: payload.senderName, message: payload.message })
  // Handle Gifs Sent in Chat
  if (payload.message.type === 'ChatGif') {
    logger.info('Received a GIF message:', payload.message);
    return; 
  }
  
// AI Chat Stuff
if (
  typeof payload.message === 'string' &&
  payload.message.includes(`@${process.env.CHAT_NAME}`) &&
  payload.senderName &&
  !payload.senderName.startsWith(`@${process.env.BOT_USER_UUID}`) &&
  !payload.message.includes("played")
) {
  const reply = await askQuestion(payload.message.replace(`@${process.env.CHAT_NAME}`, ''), room)
  if (reply) {
    const responseText = reply.text
    if (responseText) {
      await postMessage({
        room,
        message: responseText
      })
    } else {
      await postMessage({
        room,
        message: 'Sorry, I could not generate a response at the moment.'
      })
    }
  }

    //  Trivia Stuff
  } else if (payload.message.startsWith('/triviastart')) {
    if (currentQuestion) {
      await postMessage({
        room,
        message: "A trivia question is already active. Wait for it to end."
      });
    } else {
      currentQuestion = getNewQuestion();
      const triviaMessage = `Question: ${currentQuestion.question}\nOptions: ${currentQuestion.answers.join(', ')}`;
      await postMessage({
        room,
        message: triviaMessage
      });
    }
  } else if (payload.message.startsWith('/submit')) {
    if (!currentQuestion) {
      await postMessage({
        room,
        message: "There is no active trivia question."
      });
      return;
    }
    if (submittedAnswer) {
      await postMessage({
        room,
        message: "An answer has already been submitted."
      });
      return;
    }
    const answer = payload.message.split(' ')[1].toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(answer)) {
      await postMessage({
        room,
        message: "Invalid answer format. Please submit your answer as A/B/C/D."
      });
      return;
    }
    submittedAnswer = answer;
if (checkAnswer(currentQuestion, submittedAnswer)) {
  totalPoints++;
  await postMessage({
    room,
    message: `Congratulations! Your answer is correct. Total points: ${totalPoints}`
  });
  if (totalPoints === 5) {
    try {
      await roomBot.playOneTimeAnimation('jump', process.env.ROOM_UUID, process.env.BOT_USER_UUID);
    } catch (error) {
      console.error('Error Jumping', error);
    }
  }
} else {
  await postMessage({
    room,
    message: `Sorry, your answer is incorrect. The correct answer was ${currentQuestion.correctAnswer}.`
  });
}
    resetTriviaState();
    currentQuestion = getNewQuestion();
    const triviaMessage = `Question: ${currentQuestion.question}\nOptions: ${currentQuestion.answers.join(', ')}`;
    await postMessage({
      room,
      message: triviaMessage
    });
  } else if (payload.message.startsWith('/triviaend')) {
    resetTriviaState();
    askedQuestions.clear();
    await postMessage({
      room,
      message: `The trivia game has been ended. Total points: ${totalPoints}`
    });
  } else if (payload.message.startsWith('/trivia')) {
    if (!currentQuestion) {
      await postMessage({
        room,
        message: "To start a trivia game you can use /triviastart. To submit your answer you can use /submit followed by the letter option you choose. The points will tally up and the game will continue on until you use /triviaend"
      });
      return;
    }
    // "/ COMMANDS" Start Here.
  } else if (payload.message.startsWith('/hello')) {
    await postMessage({
      room,
      message: 'Hi!'
    })

  } else if (payload.message.startsWith('/addsong')) {
    await handleAddSongCommand(payload);

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

  } else if (payload.message.startsWith('/commands')) {
    await postMessage({
      room,
      message: 'General commands are /theme, /dance, /cheers, /tomatoes, /party, /trivia'
    })

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
  } else if (payload.message.startsWith('/addDJ')) {
    try {
      await roomBot.addDJ()
    } catch (error) {
      console.error('Error adding DJ:', error)
    }
  } else if (payload.message.startsWith('/removeDJ')) {
    try {
      await roomBot.removeDJ()
    } catch (error) {
      console.error('Error adding DJ:', error)
    }
  } else if (payload.message.startsWith('/updatesong')) {
    try {
      await roomBot.updateNextSong()
    } catch (error) {
      console.error('Error updating next song:', error)
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

    //  GIF's
  } else if (payload.message.startsWith('/burp')) {
    try {
      const GifUrl = 'https://media.giphy.com/media/3orieOieQrTkLXl2SY/giphy.gif?cid=790b7611gofgmq0d396jww26sbt1bhc9ljg9am4nb8m6f6lo&ep=v1_gifs_search&rid=giphy.gif&ct=g';
      await postMessage({
        room,
        message: '',
        images: [GifUrl]
      });
    } catch (error) {
      console.error('Error processing /burp command:', error.message);
      await postMessage({
        room,
        message: 'An error occurred while processing the burp command. Please try again.'
      });
    }
  } else if (payload.message.startsWith('/shirley')) {
    try {
      const GifUrl = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzdyamVybTVwa256NnVrdWQzcXMwcWd6YXlseTQ0dmY3OWloejQyYyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3oEjHLzm4BCF8zfPy0/giphy.gif';
      await postMessage({
        room,
        message: '',
        images: [GifUrl]
      });
    } catch (error) {
      console.error('Error processing /burp command:', error.message);
      await postMessage({
        room,
        message: 'An error occurred while processing the burp command. Please try again.'
      });
    }
    // RANDOM GIF's 
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
        'https://media.giphy.com/media/LFvQBWwKk7Qc0/giphy.gif?cid=790b7611gmjbkgv3jadji1kwcjh3dz4jctk15y39oox2t94g&ep=v1_gifs_search&rid=giphy.gif&ct=g',
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
        'https://media.giphy.com/media/iJ2cZjydqg9wFkzbGD/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        // Add more dance image URLs as needed
      ]

      // Randomly choose a dance image URL
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]

      // Send the dance message with the randomly chosen image
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
  } else if (payload.message.startsWith('/beer')) {
    try {
      // Define an array of image URLs
      const danceImageOptions = [
        'https://media.giphy.com/media/l2Je5C6DLUvYVj37a/giphy.gif?cid=ecf05e475as76fua0g8zvld9lzbm85sb3ojqyt95jrxrnlqz&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/9GJ2w4GMngHCh2W4uk/giphy.gif?cid=ecf05e47vxjww4oli5eck8v6nd6jcmfl9e6awd3a9ok2wa7w&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG5yc2UzZXh5dDdzbTh4YnE4dzc5MjMweGc5YXowZjViYWthYXczZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DmzUp9lX7lHlm/giphy.gif',
        'https://media.giphy.com/media/70lIzbasCI6vOuE2zG/giphy.gif?cid=ecf05e4758ayajrk9c6dnrcblptih04zceztlwndn0vwxmgd&ep=v1_gifs_search&rid=giphy.gif&ct=g'
        // Add more image URLs as needed
      ]

      // Randomly choose a image URL
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]

      // Send the message with the randomly chosen image
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
  } else if (payload.message.startsWith('/azz')) {
    try {
      // Define an array of image URLs
      const danceImageOptions = [
        'https://media.giphy.com/media/fcDNkoEy1aXOFwbv7q/giphy.gif?cid=ecf05e47fvbfd2n1xikifbbtuje37cga98d9rmx7sjo2olzu&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/GB4N7W7OP5iOk/giphy.gif?cid=ecf05e4706qgo7363yeua3o6hq4m5ps3u1y88ssw8tgi1o9e&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]

      // Randomly choose a image URL
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]

      // Send the message with the randomly chosen image
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
  } else if (payload.message.startsWith('/ass')) {
    try {
      // Define an array of image URLs
      const danceImageOptions = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2JkNnliMGxhMjZ5NnVtcGd3dWN1YmVyZHJ3ZXo3cTZyZnJsM2UzbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/uxXNV3Xa7QqME/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY2JkNnliMGxhMjZ5NnVtcGd3dWN1YmVyZHJ3ZXo3cTZyZnJsM2UzbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xUPGGL6TieAUk10oNO/giphy.gif',
        'https://media.giphy.com/media/rAKdqZ8nfiaZi/giphy.gif?cid=790b7611cbd6yb0la26y6umpgwucuberdrwez7q6rfrl3e3o&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/IYJBTNLgES23K/giphy.gif?cid=790b7611cbd6yb0la26y6umpgwucuberdrwez7q6rfrl3e3o&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/r0maJFJCvM8Pm/giphy.gif?cid=ecf05e47ymi8mjlscn2zhhaq5jwlixct7t9hxqy4bvi0omzp&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/CsjpI6bhjptTO/giphy.gif?cid=ecf05e47i0e2qssmhziagwv4stpgetatpz2555i70q4own0v&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/H7kO0C0DCkQjUaQxOF/giphy.gif?cid=ecf05e47kpjyfjk0pfslwnyl220r2gsn54t77flye0fpgqol&ep=v1_gifs_search&rid=giphy.gif&ct=g'
        // Add more image URLs as needed
      ]

      // Randomly choose a image URL
      const randomDanceImageUrl = danceImageOptions[Math.floor(Math.random() * danceImageOptions.length)]

      // Send the message with the randomly chosen image
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
  } else if (payload.message.startsWith('/cheers')) {
    try {
      // Define an array of cheers options (GIF URLs and emojis)
      const cheersOptions = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3dpem43dXNuNnkzb3A3NmY0ZjBxdTZxazR5aXh1dDl1N3R5OHRyaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/BPJmthQ3YRwD6QqcVD/giphy.gif' }, // LEO Cheers GIF
        { type: 'gif', value: 'https://media.giphy.com/media/3oeSB36G9Au4V0xUhG/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' }, // Wedding Crashers cheers GIF
        { type: 'gif', value: 'https://media.giphy.com/media/l7jc8M23lg9e3l9SDn/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' }, // Biden cheers GIF
        { type: 'emoji', value: '🍻🍻🍻🍻' } // Beer clinking emoji
        // Add more cheers options as needed
      ]

      // Randomly choose a cheers option
      const randomCheersOption = cheersOptions[Math.floor(Math.random() * cheersOptions.length)]

      // Check the type of cheers option and send the appropriate message
      if (randomCheersOption.type === 'gif') {
        // Send the cheers message with the randomly chosen GIF
        await postMessage({
          room,
          message: '',
          images: [randomCheersOption.value]
        })
      } else if (randomCheersOption.type === 'emoji') {
        // Send the cheers message with the randomly chosen emoji
        await postMessage({
          room,
          message: randomCheersOption.value
        })
      }
    } catch (error) {
      console.error('Error processing /cheers command:', error.message)
      await postMessage({
        room,
        message: 'An error occurred while processing the cheers command. Please try again.'
      })
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
      console.error('Error processing /cheers command:', error.message)
      await postMessage({
        room,
        message: 'An error occurred while processing the cheers command. Please try again.'
      })
    }
    // "/ THEME COMMANDS"
  } else if (payload.message.startsWith('/settheme')) {
    try {
      // Fetch user roles for the room with authorization header
      const userRolesResponse = await fetch('https://rooms.prod.tt.fm/roomUserRoles/just-jams', {
        headers: {
          Authorization: `Bearer ${process.env.TTL_USER_TOKEN}`
        }
      })

      if (!userRolesResponse.ok) {
        const errorMessage = await userRolesResponse.text()
        console.error('User Roles Response Error:', errorMessage)
        throw new Error(`User Roles request failed with status ${userRolesResponse.status}`)
      }

      const userRolesData = await userRolesResponse.json()
      const userRoles = Array.isArray(userRolesData) ? userRolesData : []

      // Check if user is a moderator or owner
      const allowedRoles = ['moderator', 'owner']
      const userRole = userRoles.find(role => role.userUuid === payload.sender)?.role

      if (allowedRoles.includes(userRole)) {
        // Extract theme from the command
        const theme = payload.message.replace('/settheme', '').trim()

        // Store the theme for the room
        roomThemes[room] = theme

        await postMessage({
          room,
          message: `Theme set to: ${theme}`
        })
      } else {
        await postMessage({
          room,
          message: 'You need to be a moderator to execute this command.'
        })
      }
    } catch (error) {
      console.error('Error fetching user roles:', error.message)
      await postMessage({
        room,
        message: 'An error occurred while fetching user roles. Please try again.'
      })
    }
  } else if (payload.message.startsWith('/theme')) {
    // Retrieve and post the theme for the room
    const theme = roomThemes[room]
    if (theme) {
      await postMessage({
        room,
        message: `The theme is currently set to: ${theme}`
      })
    } else {
      await postMessage({
        room,
        message: 'No theme set. Play whatever you like!'
      })
    }
  } else if (payload.message.startsWith('/removetheme')) {
    try {
      // Fetch user roles for the room with authorization header
      const userRolesResponse = await fetch('https://rooms.prod.tt.fm/roomUserRoles/just-jams', {
        headers: {
          Authorization: `Bearer ${process.env.TTL_USER_TOKEN}`
        }
      })

      if (!userRolesResponse.ok) {
        const errorMessage = await userRolesResponse.text()
        console.error('User Roles Response Error:', errorMessage)
        throw new Error(`User Roles request failed with status ${userRolesResponse.status}`)
      }

      const userRolesData = await userRolesResponse.json()
      const userRoles = Array.isArray(userRolesData) ? userRolesData : []

      // Check if user is a moderator or owner
      const allowedRoles = ['moderator', 'owner']
      const userRole = userRoles.find(role => role.userUuid === payload.sender)?.role

      if (allowedRoles.includes(userRole)) {
        // Remove the theme for the room
        delete roomThemes[room]

        await postMessage({
          room,
          message: 'Theme removed.'
        })
      } else {
        await postMessage({
          room,
          message: 'You need to be a moderator or owner to execute this command.'
        })
      }
    } catch (error) {
      console.error('Error fetching user roles:', error.message)
      await postMessage({
        room,
        message: 'An error occurred while fetching user roles. Please try again.'
      })
    }
  }
}
