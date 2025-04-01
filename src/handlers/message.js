// message.js
import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { askQuestion } from '../libs/ai.js'
import { handleTriviaStart, handleTriviaEnd, handleTriviaSubmit, totalPoints } from '../handlers/triviaCommands.js'
import { logger } from '../utils/logging.js'
import { roomBot } from '../index.js'
import { fetchCurrentlyPlayingSong, isUserAuthorized, fetchSpotifyPlaylistTracks, fetchUserData, fetchSongData, updateRoomInfo, isUserOwner, DeleteQueueSong, fetchAllUserQueueSongIDsWithUUID, searchSpotify} from '../utils/API.js'
import { handleLotteryCommand, handleLotteryNumber, LotteryGameActive, getLotteryWinners } from '../utils/lotteryGame.js'
import { enableSongStats, disableSongStats, songStatsEnabled } from '../utils/voteCounts.js'
import { enableGreetingMessages, disableGreetingMessages, greetingMessagesEnabled } from './userJoined.js'
import { getCurrentDJ, readRecentSongs } from '../libs/bot.js'
import { resetCurrentQuestion } from './triviaData.js'
import { addTracksToPlaylist, removeTrackFromPlaylist } from '../utils/playlistUpdate.js'
import {getUserNickname, handleRouletteBet, rouletteGameActive, startRouletteGame } from '../handlers/roulette.js';
import { getBalanceByNickname, getNicknamesFromWallets, addDollarsByNickname, loadWallets, saveWallets, removeFromUserWallet, getUserWallet } from '../libs/walletManager.js'
import { getJackpotValue, handleSlotsCommand} from './slots.js';
import { handleBlackjackBet, handleHit, handleStand, joinTable, getBlackjackGameActive, setBlackjackGameActive, tableUsers, preventFurtherJoins} from '../handlers/blackJack.js'
import { updateAfkStatus, isUserAfkAuthorized, userTokens } from './afk.js'



const ttlUserToken = process.env.TTL_USER_TOKEN
export const roomThemes = {}
const usersToBeRemoved = {}

// Messages
export default async (payload, room, state) => {
  console.log('Received message:', payload.message); // Log the full message to check its content
  logger.info({ sender: payload.senderName, message: payload.message });
  
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
    const question = payload.message.replace(`@${process.env.CHAT_NAME}`, '').trim().toLowerCase();
    console.log(`Received question: "${question}"`);
    logger.info(`Received question: "${question}" from ${payload.senderName}`);

    let context = question;

    // Directly handle the "you good?" question
    if (question === 'you good?') {
      await postMessage({
        room,
        message: "Couldn't be better"
      });
      return; // Exit early to avoid processing further
    }
    if (question.includes('dj with us') || question.includes('dj with me')) {
      await postMessage({
        room,
        message: "Let's get it"
      });
      await roomBot.enableAutoDJ(); // Call the enableAutoDJ function
      await roomBot.addDJ(true); // Add the DJ to the queue
      return; // Exit early to avoid processing further
    }
    if (question.includes('get tf off the stage') || question.includes('stop djing')) {
      await postMessage({
        room,
        message: "Damn...alright"
      });
      await roomBot.removeDJ(process.env.BOT_USER_UUID); // Remove the DJ from the stage
      return; // Exit early to avoid processing further
    }
    if (question.includes('9+10'||'9 + 10')) {
      await postMessage({
        room,
        message: "21...are you stoopid?"
      });
      return; // Exit early to avoid processing further
    }
    if (question.includes('are you a bot?'||'are you a bot')) {
      await postMessage({
        room,
        message: "I am not"
      });
      return; // Exit early to avoid processing further
    }
    if (question.includes('spin the wheel') || question.includes('spin that wheel')) {
      await startRouletteGame(payload);
      return; // Exit early to avoid processing further
    }

    if (question.includes('song is this') || question.includes('this song') || question.includes('song is playing') || question.includes('this')) {
      const currentSong = roomBot.currentSong;

      if (currentSong) {
        console.log(`Current song details: ${JSON.stringify(currentSong)}`);
        logger.info(`Current song details: ${JSON.stringify(currentSong)}`);

        const artistText = currentSong.artistName ? `by ${currentSong.artistName}` : '';
        context = `The current song is "${currentSong.trackName}" ${artistText}. ${question} briefly`;
      } else {
        console.warn('No song is currently playing or trackName is missing.');
        logger.warn('No song is currently playing or trackName is missing.');

        await postMessage({
          room,
          message: 'No song is currently playing.'
        });
        return;
      }
    }

    // Check if the question includes "popularity score"
    if (question.includes('popularity score')) {
      context = `The popularity of the track comes from Spotify's metrics. The value will be between 0 and 100, with 100 being the most popular. 
      The popularity of a track is a value between 0 and 100, with 100 being the most popular. The popularity is calculated by an algorithm and is based, in the most part, on the total number of plays the track has had and how recent those plays are.
      Generally speaking, songs that are being played a lot now will have a higher popularity than songs that were played a lot in the past. Duplicate tracks (e.g., the same track from a single and an album) are rated independently. Artist and album popularity is derived mathematically from track popularity. Note: the popularity value may lag actual popularity by a few days: the value is not updated in real time. ${question}`;
    }

    if (context) {
      console.log(`Context passed to AI: "${context}"`);
      logger.info(`Context passed to AI: "${context}"`);

      const reply = await askQuestion(context);
      const responseText = reply?.text || (typeof reply === 'string' ? reply : 'Sorry, I could not generate a response at the moment.');

      console.log('AI Reply:', responseText);
      logger.info(`AI Reply: ${responseText}`);

      await postMessage({
        room,
        message: responseText
      });
    } else {
      console.log('No question found in the message');
      await postMessage({
        room,
        message: 'Please provide a question for me to answer.'
      });
    }
  } catch (error) {
    logger.error('Error handling AI response:', error);
    await postMessage({
      room,
      message: 'Sorry, something went wrong trying to process your message.'
    });
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
      });
    
  // Command for deleting the current song
} else if (payload.message.startsWith('/delete')) {
  console.log('Delete command received.');

  const userId = payload.sender; // Get the user UUID from the payload
  console.log(`Received delete request from user ID: ${userId}`);

  // Check if the user ID is AFK authorized
  if (!isUserAfkAuthorized(userId)) {
      console.log(`User ID: ${userId} is not authorized to delete songs.`);
      await postMessage({
          room,
          message: 'You are not authorized to use this command.'
      });
      return; // Exit if the user is not authorized
  }
  console.log(`User ID: ${userId} is authorized.`);

  // Ensure the current song information is available
  console.log(`Checking current song: ${JSON.stringify(roomBot.currentSong)}`);
  if (!roomBot.currentSong || !roomBot.currentSong.songId) {
      console.log('No song is currently playing or the song ID is unavailable.');
      await postMessage({
          room,
          message: 'No song is currently playing or the song ID is unavailable.'
      });
      return;
  }

  // Get the current song's songID
  const currentSongID = roomBot.currentSong.songId;
  console.log(`Current song ID: ${currentSongID}`);

  // Get the user's token for authorization
  const userToken = userTokens[userId];
  console.log(`User token for deletion: ${userToken ? 'Token found' : 'No token found'}`);

  try {
      // Fetch the user's queue with the user's token
      const userQueue = await fetchAllUserQueueSongIDsWithUUID(userToken);

      const matchingSong = userQueue.find(song => song.songID === currentSongID); // Note the corrected property `songID`

      if (!matchingSong) {
          console.log('No matching song found in user queue.');
          await postMessage({
              room,
              message: 'The currently playing song is not in your queue, so it cannot be deleted.'
          });
          return;
      }

      // Extract the corresponding crateSongUUID
      const crateSongUUID = matchingSong.crateSongUUID;
      console.log(`Found matching song in queue with crateSongUUID: ${crateSongUUID}`);

      // Call the DeleteQueueSong function to remove the song
      console.log('Attempting to delete the song...');
      await DeleteQueueSong(crateSongUUID, userToken);
      console.log(`Successfully deleted the song with crateSongUUID: ${crateSongUUID}`);

      // Provide success feedback
      await postMessage({
          room,
          message: `Successfully deleted the current song from the queue with crateSongUUID: ${crateSongUUID}.`
      });

  } catch (error) {
      console.error(`Failed to delete the current song: ${error.message}`);
      await postMessage({
          room,
          message: `Failed to delete the current song: ${error.message}.`
      });
  }
} else if (payload.message.startsWith('/search')) {
  console.log("Processing /search command...");

  // Hardcoding the artist and track name for this example
  const artistName = "Flume";
  const trackName = "Still Woozy";

  // Call your searchSpotify function
  const trackDetails = await searchSpotify(artistName, trackName);

  // If track is found, structure the custom data payload
  if (trackDetails && trackDetails.spotifyUrl) {
      const spotifyUrl = trackDetails.spotifyUrl;

      // Fetch additional data for the song (optional)
      const songData = await fetchSongData(spotifyUrl);

      // Transform the song data if needed (to fit the expected structure)
      const transformedSongData = {
          ...songData,
          musicProviders: songData.musicProvidersIds,  // Ensure this matches the expected structure
          status: "SUCCESS"
      };

      // Structure the custom data payload for posting the song
      const customData = {
          songs: [
              {
                  song: transformedSongData
              }
          ]
      };

      // Send the custom data to the room (assuming postMessage is expecting customData)
      await postMessage({
          room,
          message: 'Here is the custom song data:',
          customData: customData  // Attach custom data here
      });
  } else {
      await postMessage({
          room,
          message: `Sorry, I couldn't find "${trackName}" by ${artistName} on Spotify.`
      });
  }

  } else if (payload.message.startsWith('/test')) {
    await postMessage({
      room,
      message: 'Hello'
    })
    // Send a direct message to the sender
    const senderUUID = payload.sender; // Extract sender's UUID
    await sendDirectMessage(senderUUID, 'This is a private test message just for you!');

  } else if (payload.message.startsWith('/commands')) {
    await postMessage({
      room,
      message: 'General commands are:\n- /theme: Checks the current room theme\n- /games: List of games to play\n- /escortme: Stagedive after your next song\n- /djbeer: Gives the DJ a beer\n- /album: Display album info for current song\n- /score: Spotify popularity score\n- /bankroll: Lists top wallet leaders\n- /lottowinners: Lists all lottery ball winners\n- /gifs: Bot will list all GIF commands\n- /mod: Bot will list all Mod commands'
    })
    /// /////////////// General Commands ////////////////
  } else if (payload.message.startsWith('/games')) {
    await postMessage({
      room,
      message: 'Games:\n- /trivia: Play Trivia\n- /lottery: Play the Lottery\n- /roulette: Play Roulette\n- /slots: Play Slots\n- /blackjack: Play Blackjack\n- /slotinfo: Display slots payout info\n- /jackpot: Slots progressive jackpot value'
    })
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
      const senderName = payload.senderName;
      const currentDJUuid = getCurrentDJ(state);

      if (!currentDJUuid) {
        await postMessage({
          room,
          message: `${senderName}, there is no DJ currently playing.`
        });
        throw new Error('No current DJ found.');
      }

      // Fetch user data for the current DJ
      const currentDJData = await fetchUserData([currentDJUuid]);

      // Ensure the user data is valid and extract the nickname
      const currentDJName = currentDJData.length > 0 && currentDJData[0].userProfile
        ? currentDJData[0].userProfile.nickname
        : null;

      if (!currentDJName) {
        await postMessage({
          room,
          message: `${senderName}, could not fetch the current DJ's name.`
        });
        throw new Error('Could not fetch the current DJ\'s name.');
      }

      // Post the message with the sender's and DJ's names
      await postMessage({
        room,
        message: `@${senderName} gives @${currentDJName} two ice cold beers!! 🍺🍺`
      });
    } catch (error) {
      console.error('Error handling /djbeers command:', error);
    }
  } else if (payload.message.startsWith('/djbeer')) {
    try {
      const senderName = payload.senderName;
      const currentDJUuid = getCurrentDJ(state);

      if (!currentDJUuid) {
        await postMessage({
          room,
          message: `${senderName}, there is no DJ currently playing.`
        });
        throw new Error('No current DJ found.');
      }

      // Fetch user data for the current DJ
      const currentDJData = await fetchUserData([currentDJUuid]);

      // Ensure the user data is valid and extract the nickname
      const currentDJName = currentDJData.length > 0 && currentDJData[0].userProfile
        ? currentDJData[0].userProfile.nickname
        : null;

      if (!currentDJName) {
        await postMessage({
          room,
          message: `${senderName}, could not fetch the current DJ's name.`
        });
        throw new Error('Could not fetch the current DJ\'s name.');
      }

      // Post the message with the sender's and DJ's names
      await postMessage({
        room,
        message: `@${senderName} gives @${currentDJName} an ice cold beer! 🍺`
      });

      console.log(`${senderName} gives ${currentDJName} an ice cold beer! 🍺`);
    } catch (error) {
      console.error('Error handling /djbeer command:', error);
    }

  } else if (payload.message.startsWith('/getdjdrunk')) {
    try {
      const senderName = payload.senderName;
      const currentDJUuid = getCurrentDJ(state);

      if (!currentDJUuid) {
        await postMessage({
          room,
          message: `${senderName}, there is no DJ currently playing.`
        });
        throw new Error('No current DJ found.');
      }

      // Fetch user data for the current DJ
      const currentDJData = await fetchUserData([currentDJUuid]);

      // Ensure the user data is valid and extract the nickname
      const currentDJName = currentDJData.length > 0 && currentDJData[0].userProfile
        ? currentDJData[0].userProfile.nickname
        : null;

      if (!currentDJName) {
        await postMessage({
          room,
          message: `${senderName}, could not fetch the current DJ's name.`
        });
        throw new Error('Could not fetch the current DJ\'s name.');
      }

      // Post the message with the sender's and DJ's names
      await postMessage({
        room,
        message: `@${senderName} gives @${currentDJName} a million ice cold beers!!! 🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺`
      });
    } catch (error) {
      console.error('Error handling /getdjdrunk command:', error);
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
        const args = payload.message.split(' ');
        const option = args[1]; // Check if 'auto' was provided

        if (option === 'auto') {
            await roomBot.enableAutoDJ();
            console.log('Auto DJ enabled');

            // Now add the bot as DJ
            await roomBot.addDJ(true);
            console.log('Added Auto DJ');
        } else {
            await roomBot.addDJ();
            //console.log('DJ added normally');
        }
    } catch (error) {
        console.error('Error adding DJ:', error);
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
      const userUuid = payload.sender;  

      if (usersToBeRemoved[userUuid]) {
        await postMessage({
          room,
          message: `${payload.senderName}, you're already set to be removed after your current song.`
        });
        return;
      }
      usersToBeRemoved[userUuid] = true;

      await postMessage({
        room,
        message: `${payload.senderName}, you will be removed from the stage after your next song ends.`
      });
    } catch (error) {
      console.error('Error handling /escortme command:', error);
    }
  /// /////////////// Secret Commands /////////////////////
} else if (payload.message.startsWith('/secret')) {
  await postMessage({
    room,
    message: 'Sssshhhhhh be very quiet. These are top secret\n- /bark\n- /barkbark\n- /djbeers\n- /getdjdrunk\n- /jam\n- /ass\n- /azz\n- /cam\n- /shirley\n- /berad\n- /ello\n- /art\n- /ello\n- /allen\n- /art'
  })
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
        'https://media.giphy.com/media/sA8nO56Gj9RHq/giphy.gif?cid=790b7611h6b5ihdlko5foubqcifo0e3h0i7e6p1vo2h8znzj&ep=v1_gifs_search&rid=giphy.gif&ct=g'
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
  } else if (payload.message.startsWith('/props')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa280ZGd3Y25iajJ3MXF1Nm8wbG15dHFseWZmNGhrNzJrYjJ6YXpmZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/MaJ7An3EUgLCCh4lXS/giphy.gif'
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
  } else if (payload.message.startsWith('/titties')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/e3ju7ALSHtJmM/giphy.gif?cid=790b7611cyxzebyly4t75g8ozzbf00q5l4u9afsklnpc7qvh&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/13lIl3lZmDtwNq/giphy.gif?cid=790b7611cyxzebyly4t75g8ozzbf00q5l4u9afsklnpc7qvh&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/Hri053BSFUkRa/giphy.gif?cid=ecf05e47ivnowgc3ezif52b7a9mlfr5hg6wn4okbemd1t4zl&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/qPj2kjakDOPQY/giphy.gif?cid=ecf05e47nbx8btyqq37pl0qtf18gdbr6ijbs4297kg8d7e39&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/28A92fQr8uG6Q/giphy.gif?cid=790b7611cyxzebyly4t75g8ozzbf00q5l4u9afsklnpc7qvh&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/h0yZVLoXKJKb6/giphy.gif?cid=ecf05e47ivnowgc3ezif52b7a9mlfr5hg6wn4okbemd1t4zl&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExY3l4emVieWx5NHQ3NWc4b3p6YmYwMHE1bDR1OWFmc2tsbnBjN3F2aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/tGbhyv8Wmi4EM/giphy.gif'
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
  } else if (payload.message.startsWith('/gifs')) {
    await postMessage({
      room,
      message: 'Randomly selected GIFs:\n- /burp\n- /dance\n- /party\n- /beer\n- /fart\n- /tomatoes\n- /cheers'
    })
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
/////////////////////// VIRTUAL CASINO ////////////////////////

/////////////////////// ROULETTE ///////////////////////////////
if (payload.message.startsWith('/roulette start')) {
  // Check if the roulette game is already active
  if (!rouletteGameActive) {
      await startRouletteGame(payload); // Start the roulette game
  } else {
      await postMessage({
          room: room,
          message: 'A roulette game is already active! Please wait for it to finish before starting a new one.'
      });
  }
} else if (payload.message.startsWith('/roulette')) {
  // Send detailed instructions for the roulette game
  await postMessage({
      room: room,
      message: 'Welcome to Roulette! Use `/roulette start` to begin the game.\n' +
               'To place a bet, use one of the following commands:\n' +
               '- `/red <amount>`: Bet on red numbers.\n' +
               '- `/black <amount>`: Bet on black numbers.\n' +
               '- `/odd <amount>`: Bet on odd numbers.\n' +
               '- `/even <amount>`: Bet on even numbers.\n' +
               '- `/high <amount>`: Bet on high numbers (19-36).\n' +
               '- `/low <amount>`: Bet on low numbers (1-18).\n' +
               '- `/number <number> <amount>`: Bet on a specific number (0-36).\n' +
               '- `/dozen <1|2|3> <amount>`: Bet on the first (1), second (2), or third dozen of numbers.\n' +
               '- `/column <1|2|3> <amount>`: Bet on one of the three vertical columns of numbers.\n\n' +
               'The `<amount>` specifies how much you want to wager from your balance. Use `/balance` to check your wallet balance.'
  });
} else if (rouletteGameActive && (
  payload.message.startsWith('/red') ||
  payload.message.startsWith('/black') ||
  payload.message.startsWith('/green') ||
  payload.message.startsWith('/odd') ||
  payload.message.startsWith('/even') ||
  payload.message.startsWith('/high') ||
  payload.message.startsWith('/low') ||
  payload.message.startsWith('/number') ||  // Still support /number
  (!isNaN(payload.message.split(' ')[0].substring(1)) && parseInt(payload.message.split(' ')[0].substring(1), 10) >= 0 && parseInt(payload.message.split(' ')[0].substring(1), 10) <= 36) || // Handle /25 (number bet directly)
  payload.message.startsWith('/dozen') ||
  payload.message.startsWith('/column') ||
  payload.message.startsWith('/two') ||   // Include two numbers
  payload.message.startsWith('/three') || // Include three numbers
  payload.message.startsWith('/four') ||  // Include four numbers
  payload.message.startsWith('/five') ||  // Include five numbers
  payload.message.startsWith('/six')       // Include six numbers
)) {
  // Use the original payload directly
  await handleRouletteBet(payload); // Handle the user's bet
}

function formatBalance(balance) {
  return balance > 999 ? balance.toLocaleString() : balance.toString();
}

if (payload.message.startsWith('/balance')) {
  const userId = payload.sender; // Get the user's ID from the payload
  
  // Await the nickname to ensure it resolves to a string
  const nickname = await getUserNickname(userId);
  
  // Load the wallets from persistent storage
  const wallets = await loadWallets(); // Ensure you have this function defined to load wallets

  // Retrieve the user's wallet object
  const userWallet = wallets[userId];

  if (userWallet && userWallet.balance !== undefined) {
      // Access the balance property directly
      const balance = userWallet.balance; 
      const formattedBalance = formatBalance(balance); // Format the balance with commas

      await postMessage({
          room: process.env.ROOM_UUID,
          message: `@${nickname}, your current balance is $${formattedBalance}.`
      });
  } else {
      await postMessage({
          room: process.env.ROOM_UUID,
          message: `@${nickname}, you do not have a wallet yet. You can use /getwallet`
      });
  }
}

if (payload.message.startsWith('/getwallet')) {
  const userId = payload.sender; // Get the user's ID from the payload
  const nickname = await getUserNickname(userId); // Get the user's nickname

  // Load the wallets from persistent storage
  const wallets = await loadWallets();

  // Check if the user already has a wallet
  if (wallets[userId]) {
      await postMessage({
          room,
          message: `@${nickname}, you already have a wallet with $${wallets[userId].balance}.`
      });
  } else {
      // Initialize the wallet with a default balance
      const defaultBalance = 50;
      wallets[userId] = { balance: defaultBalance };

      // Save the updated wallets to persistent storage
      await saveWallets(wallets);

      await postMessage({
          room,
          message: `@${nickname}, your wallet has been initialized with $${defaultBalance}.`
      });
  }
}

// Command to handle balance request for another user
if (payload.message.startsWith('/checkbalance')) {
  const args = payload.message.split(' ').slice(1); // Get arguments after the command

  if (args.length !== 1) {
      await postMessage({
          room,
          message: 'Usage: /checkbalance <nickname>'
      });
      return; // Exit if arguments are not valid
  }

  const nickname = args[0]; // Get the nickname from the arguments
  const balance = await getBalanceByNickname(nickname); // Get the balance

  if (balance === null) {
      await postMessage({
          room,
          message: `User with nickname ${nickname} does not exist.`
      });
  } else {
      await postMessage({
          room,
          message: `${nickname}'s current balance is $${balance}.`
      });
  }
}
if (payload.message.startsWith('/bankroll')) {
  try {
      const bankroll = await getNicknamesFromWallets(); // Fetch the bankroll information

      // Sort the bankroll by balance in descending order
      const sortedBankroll = bankroll
          .sort((a, b) => b.balance - a.balance) // Sort descending by balance
          .slice(0, 5) // Only take the top 5 wallets
          .map((user, index) => 
              `${index + 1}. ${user.nickname}: $${Math.round(user.balance).toLocaleString()}` // Round balance and format with commas
          );

      // Create the final message with a heading and the sorted leaderboard
      const finalMessage = `🏆 **Top Wallet Leaders** 🏆\n\n${sortedBankroll.join('\n')}`;

      // Post the message to the chat
      await postMessage({
          room: room,
          message: finalMessage // Send the formatted message
      });
  } catch (error) {
      console.error('Error fetching bankroll information:', error);

      // Send an error message using postMessage
      await postMessage({
          room: room,
          message: 'There was an error fetching the bankroll information.' // Error message
      });
  }
}

if (payload.message.startsWith('/lottowinners')) {
  try {
    // Fetch the list of lottery winners
    const winners = await getLotteryWinners();

    if (winners.length === 0) {
      // If there are no winners, send an appropriate message
      await postMessage({
        room: process.env.ROOM_UUID,
        message: 'No lottery winners found at this time.'
      });
      return;
    }

    // Format the list of winners
    const formattedWinners = winners.map((winner, index) => 
      `${index + 1}. ${winner.nickname}: Won $${Math.round(winner.amountWon).toLocaleString()} with number ${winner.winningNumber} on ${winner.date}`
    );

    // Create the final message
    const finalMessage = `💰 💵 **Lottery Winners List** 💵 💰\n\n${formattedWinners.join('\n')}`;

    // Post the message to the chat
    await postMessage({
      room: process.env.ROOM_UUID,
      message: finalMessage // Send the formatted winners list
    });
  } catch (error) {
    console.error('Error fetching or displaying lottery winners:', error);

    // Send an error message
    await postMessage({
      room: process.env.ROOM_UUID,
      message: 'There was an error fetching the lottery winners list.'
    });
  }
}

//////////////////////// SLOTS //////////////////////////////
if (payload.message.startsWith('/slots')) {
  try {
      const args = payload.message.trim().split(' ');
      let betAmount = 1; // Default bet amount

      if (args.length > 1) {
          betAmount = parseFloat(args[1]);
          if (isNaN(betAmount) || betAmount <= 0) {
              // Handle invalid bet amount
              await postMessage({
                  room: room,
                  message: 'Please provide a valid bet amount.'
              });
              return;
          }
      }

      const userUUID = payload.sender; // Adjust this based on how you get userUUID

      const response = await handleSlotsCommand(userUUID, betAmount); // Pass bet amount
      await postMessage({
          room: room,
          message: response
      });
  } catch (err) {
      console.error('Error processing the /slots command:', err);
      await postMessage({
          room: room,
          message: 'An error occurred while processing your slots game.'
      });
  }
}
else if (payload.message.startsWith('/slotinfo')) {
  // Create a message that contains information about the slots scoring system
  const infoMessage = `
    🎰 **Slots Scoring System Info** 🎰

    **Slot Symbols:**
    - 🍒: Cherries
    - 🍋: Lemons
    - 🍊: Oranges
    - 🍉: Watermelons
    - 🔔: Bells
    - ⭐: Stars
    - 💎: Diamonds

    **Payouts for 3 Matching Symbols:**
    - 🍊🍊🍊: 3x
    - 🍋🍋🍋: 4x
    - 🍒🍒🍒: 5x
    - 🍉🍉🍉: 6x
    - 🔔🔔🔔: 8x
    - ⭐⭐⭐: 10x
    - 💎💎💎: 20x

    **Payouts for 2 Matching Symbols:**
    - 🍊🍊: 1.2x
    - 🍋🍋: 1.5x
    - 🍉🍉: 2.5x
    - 🍒🍒: 2x
    - 🔔🔔: 3x
    - ⭐⭐: 4x
    - 💎💎: 5x

    **Jackpot Contribution:**
    - 5% of your bet contributes to the progressive jackpot! 🎉
  `;

  // Send the slot information as a message
  await postMessage({
    room,
    message: infoMessage
  });
}


else if (payload.message.startsWith('/jackpot')) {
  // Get the current jackpot value
  const jackpotValue = getJackpotValue();
  
  // Round the jackpot value to two decimal places
  const roundedJackpotValue = jackpotValue.toFixed(2); 

  // Send the jackpot value as a message
  await postMessage({
    room,
    message: `🎰 The current progressive jackpot is: $${roundedJackpotValue}!`
  });
}

 ///////////////////// BLACKJACK /////////////////////////
 if (payload.message.startsWith('/blackjack')) {
  const userUUID = payload.sender;  
  const nickname = payload.senderName; 
  const room = process.env.ROOM_UUID;

  if (getBlackjackGameActive()) {
      await postMessage({ room: room, message: "A blackjack game is already active! Use /join to join the table." });
  } else {
    
      setBlackjackGameActive(true); 

      await postMessage({ room: room, message: "Blackjack game is starting in 30 seconds! Use /join to join the table" });

      if (!tableUsers.includes(userUUID)) {
        await joinTable(userUUID, nickname); 
    }
      setTimeout(async () => {

          await postMessage({ room: room, message: "Blackjack game started!\n All users please place your bets using /bet [amount]." });
          
          
          preventFurtherJoins(); 
      }, 30000); 
  }
  return;
}


if (payload.message.startsWith('/bet')) {
  const userUUID = payload.sender;
  const nickname = payload.senderName; // Get the user's nickname
  const betAmount = parseInt(payload.message.split(' ')[1], 10);
  const room = process.env.ROOM_UUID;

  // Check if the user is at the table
  if (!tableUsers.includes(userUUID)) {
      await postMessage({ room: room, message: "You must join the blackjack table first using /blackjack." });
      return;
  }

  // Check if a game is active before allowing bets
  if (!getBlackjackGameActive()) {
      await postMessage({ room: room, message: "No active blackjack game. Start one with /blackjack." });
      return;
  }

  // Validate bet amount
  if (isNaN(betAmount) || betAmount <= 0) {
      await postMessage({ room: room, message: "Please enter a valid bet amount." });
      return;
  }

  // Retrieve the user's wallet before processing the bet
  const userWallet = await getUserWallet(userUUID);
  const userBalance = userWallet !== undefined ? userWallet : 0;

  console.log(`User ${nickname} wallet balance before bet: $${userBalance}`);

  // Ensure the user has enough funds to place the bet
  if (betAmount > userBalance) {
      await postMessage({ room: room, message: `Sorry ${nickname}, you do not have enough funds to place that bet. Your current balance is $${userBalance}.` });
      return;
  }

  // Remove the bet amount from the user's wallet
  const successfulRemoval = await removeFromUserWallet(userUUID, betAmount);
  if (!successfulRemoval) {
      await postMessage({ room: room, message: `Sorry ${nickname}, we couldn't process your bet.` });
      return;
  }

  // Log the successful wallet update
  const updatedUserWallet = await getUserWallet(userUUID);
  const updatedBalance = updatedUserWallet.balance;
  console.log(`User ${nickname} successfully placed a bet of $${betAmount}. New balance: $${updatedBalance}`);

  // Pass the nickname to the handleBlackjackBet function
  await handleBlackjackBet(userUUID, betAmount, nickname);
  return;
}






// Player hits
if (payload.message.startsWith('/hit')) {
  const userUUID = payload.sender;
  const nickname = payload.senderName; // Get the user's nickname
  const room = process.env.ROOM_UUID;

  // Check if user is at the table
  if (!tableUsers.includes(userUUID)) {
      await postMessage({ room: room, message: "You must join the blackjack table first." });
      return;
  }

  // Pass the userUUID and nickname to handleHit
  await handleHit(userUUID, nickname); // Pass nickname
  return;
}


// Player stands
if (payload.message.startsWith('/stand')) {
  const userId = payload.sender;
  const nickname = payload.senderName; // Get the user's nickname
  const room = process.env.ROOM_UUID;

  // Check if user is at the table
  if (!tableUsers.includes(userId)) {
      await postMessage({ room: room, message: "You must join the blackjack table first." });
      return;
  }

  await handleStand(userId, nickname); // Pass the nickname to the function
  return;
}

if (payload.message.startsWith('/join')) {
  const userId = payload.sender;
  const nickname = payload.senderName; // Get the user's nickname
  const room = process.env.ROOM_UUID;

  if (!getBlackjackGameActive()) {
      await postMessage({ room: room, message: "No active blackjack game. Start one with /blackjack." });
      return;
  }

  await joinTable(userId, nickname); // Pass the nickname to joinTable
  return;
}

  /// ////////////// MOD Commands ///////////////////////////
  if (payload.message.startsWith('/mod')) {
  await postMessage({
    room,
    message: 'Moderator commands are:\n- /settheme: Set room theme\n----- Albums\n----- Covers\n----- Rock\n----- Country\n----- Rap\n- /removetheme: Remove room theme\n- /addsong: Add current song to bot playlist\n- /removesong: Remove song from bot playlist\n- /addDJ: Bot DJs from main playlist\n- /addDJ auto: Bot DJs from Spotify Recs\n- /removeDJ: Remove bot as DJ\n\n ----- BOT TOGGLES -----\n- /status: Shows bot toggles status\n- /songstatson: Turns song stats on\n- /songstatsoff: Turns song stats off\n\n- /bopoff: Turns bot auto like off\n- /bopon: Turns bot auto like back on\n\n- /autodjoff: Turns off auto DJ\n- /autodjon: Turns on auto DJ\n\n- /greeton: Turns on expanded user greeting\n- /greetoff: Turns off expanded user greeting\n\n -/audiostatson: Turns on audio stats\n -/audiostatsoff: Turns off audio stats'
  })
 }
 if (payload.message.startsWith('/addmoney')) {
  const senderUuid = payload.sender; 
  const userIsOwner = await isUserOwner(senderUuid, ttlUserToken); // Renamed variable
  
  if (!userIsOwner) { // Use the new variable name here
      await postMessage({
          room,
          message: 'Only Rsmitty can use this command.'
      });
      return; // Exit if the user is not authorized
  }

  // Split the message to extract nickname and amount
  const args = payload.message.split(' ').slice(1); // Get arguments after the command
  if (args.length !== 2) {
      await postMessage({
          room,
          message: 'Usage: /addmoney <nickname> <amount>'
      });
      return; // Exit if the arguments are not valid
  }

  const nickname = args[0]; // First argument is the nickname
  const amount = parseFloat(args[1]); // Second argument is the amount

  // Check if the amount is valid
  if (isNaN(amount) || amount <= 0) {
      await postMessage({
          room,
          message: 'Please provide a valid amount greater than zero.'
      });
      return; // Exit if the amount is invalid
  }

  // Call the addDollarsByNickname function
  await addDollarsByNickname(nickname, amount);
  
  // Confirm to the user that the amount has been added
  await postMessage({
      room,
      message: `Added $${amount} to ${nickname}'s wallet.`
  });
}
  //////////////////// BOT PROFILE UPDATES //////////////////////
 else if (payload.message.startsWith('/bot1')) {
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

      // Define the request body for the POST request
      const requestBody = {
          color: "#04D9FF",
          avatarId: "bot-01"
      };

      // Make the POST request to the endpoint
      const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ttlUserToken}` // Assuming you have a token to include
          },
          body: JSON.stringify(requestBody)
      });

      // Handle the response
      if (response.ok) {
          const data = await response.json();
          await postMessage({
              room,
              message: 'Bot profile updating!'
          });
      } else {
          const errorData = await response.json();
          await postMessage({
              room,
              message: `Failed to update bot profile: ${errorData.message || 'Unknown error'}`
          });
      }

  } catch (error) {
      console.error('Error in /bot1 command:', error);
      await postMessage({
          room,
          message: 'There was an error processing the command. Please try again later.'
      });
  }
}
else if (payload.message.startsWith('/bot2')) {
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

      // Define the request body for the POST request
      const requestBody = {
          color: "#FF5F1F",
          avatarId: "bot-2"
      };

      // Make the POST request to the endpoint
      const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ttlUserToken}` // Assuming you have a token to include
          },
          body: JSON.stringify(requestBody)
      });

      // Handle the response
      if (response.ok) {
          const data = await response.json();
          await postMessage({
              room,
              message: 'Bot profile updating!'
          });
      } else {
          const errorData = await response.json();
          await postMessage({
              room,
              message: `Failed to update bot profile: ${errorData.message || 'Unknown error'}`
          });
      }

  } catch (error) {
      console.error('Error in /bot2 command:', error);
      await postMessage({
          room,
          message: 'There was an error processing the command. Please try again later.'
      });
  }
}
else if (payload.message.startsWith('/botpenguin')) {
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

      // Define the request body for the POST request
      const requestBody = {
          color: "#B026FF",
          avatarId: "pinguclub-03"
      };

      // Make the POST request to the endpoint
      const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ttlUserToken}` // Assuming you have a token to include
          },
          body: JSON.stringify(requestBody)
      });

      // Handle the response
      if (response.ok) {
          const data = await response.json();
          await postMessage({
              room,
              message: 'Bot profile updating!'
          });
      } else {
          const errorData = await response.json();
          await postMessage({
              room,
              message: `Failed to update bot profile: ${errorData.message || 'Unknown error'}`
          });
      }

  } catch (error) {
      console.error('Error in /botpenguin command:', error);
      await postMessage({
          room,
          message: 'There was an error processing the command. Please try again later.'
      });
  }
}
else if (payload.message.startsWith('/botwalrus')) {
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

      // Define the request body for the POST request
      const requestBody = {
          color: "#8de2ff",
          avatarId: "winter-07"
      };

      // Make the POST request to the endpoint
      const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ttlUserToken}` // Assuming you have a token to include
          },
          body: JSON.stringify(requestBody)
      });

      // Handle the response
      if (response.ok) {
          const data = await response.json();
          await postMessage({
              room,
              message: 'Bot profile updating!'
          });
      } else {
          const errorData = await response.json();
          await postMessage({
              room,
              message: `Failed to update bot profile: ${errorData.message || 'Unknown error'}`
          });
      }

  } catch (error) {
      console.error('Error in /botwalrus command:', error);
      await postMessage({
          room,
          message: 'There was an error processing the command. Please try again later.'
      });
  }
}
else if (payload.message.startsWith('/botalien2')) {
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

      // Define the request body for the POST request
      const requestBody = {
          color: "#39FF14",
          avatarId: "stadiumseason-01"
      };

      // Make the POST request to the endpoint
      const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ttlUserToken}` // Assuming you have a token to include
          },
          body: JSON.stringify(requestBody)
      });

      // Handle the response
      if (response.ok) {
          const data = await response.json();
          await postMessage({
              room,
              message: 'Bot profile updating!'
          });
      } else {
          const errorData = await response.json();
          await postMessage({
              room,
              message: `Failed to update bot profile: ${errorData.message || 'Unknown error'}`
          });
      }

  } catch (error) {
      console.error('Error in /botalien2 command:', error);
      await postMessage({
          room,
          message: 'There was an error processing the command. Please try again later.'
      });
  }
}
else if (payload.message.startsWith('/botalien1')) {
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

      // Define the request body for the POST request
      const requestBody = {
          color: "#39FF14",
          avatarId: "season-0001-underground-thehuman"
      };

      // Make the POST request to the endpoint
      const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ttlUserToken}` // Assuming you have a token to include
          },
          body: JSON.stringify(requestBody)
      });

      // Handle the response
      if (response.ok) {
          const data = await response.json();
          await postMessage({
              room,
              message: 'Bot profile updating!'
          });
      } else {
          const errorData = await response.json();
          await postMessage({
              room,
              message: `Failed to update bot profile: ${errorData.message || 'Unknown error'}`
          });
      }

  } catch (error) {
      console.error('Error in /botalien1 command:', error);
      await postMessage({
          room,
          message: 'There was an error processing the command. Please try again later.'
      });
  }
}
else if (payload.message.startsWith('/botduck')) {
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

      // Define the request body for the POST request
      const requestBody = {
          color: "#FFDE21",
          avatarId: "stadiumseason-02"
      };

      // Make the POST request to the endpoint
      const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ttlUserToken}` // Assuming you have a token to include
          },
          body: JSON.stringify(requestBody)
      });

      // Handle the response
      if (response.ok) {
          const data = await response.json();
          await postMessage({
              room,
              message: 'Bot profile updating!'
          });
      } else {
          const errorData = await response.json();
          await postMessage({
              room,
              message: `Failed to update bot profile: ${errorData.message || 'Unknown error'}`
          });
      }

  } catch (error) {
      console.error('Error in /botduck command:', error);
      await postMessage({
          room,
          message: 'There was an error processing the command. Please try again later.'
      });
  }
}
else if (payload.message.startsWith('/botdino')) {
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

      // Define the request body for the POST request
      const requestBody = {
          color: "#8B6C5C",
          avatarId: "jurassic-05"
      };

      // Make the POST request to the endpoint
      const response = await fetch('https://gateway.prod.tt.fm/api/user-service/users/profile', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${ttlUserToken}` // Assuming you have a token to include
          },
          body: JSON.stringify(requestBody)
      });

      // Handle the response
      if (response.ok) {
          const data = await response.json();
          await postMessage({
              room,
              message: 'Bot profile updating!'
          });
      } else {
          const errorData = await response.json();
          await postMessage({
              room,
              message: `Failed to update bot profile: ${errorData.message || 'Unknown error'}`
          });
      }

  } catch (error) {
      console.error('Error in /botdino command:', error);
      await postMessage({
          room,
          message: 'There was an error processing the command. Please try again later.'
      });
  }
}

///////////////////////// Themes ////////////////////////////////////
else if (payload.message.startsWith('/settheme')) {
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

      const theme = payload.message.replace('/settheme', '').trim();
      roomThemes[room] = theme;

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
      } else if (["country"].includes(themeLower)) {
          updatePayload = {
            design: "BARN",
            numberOfDjs: 4
          };
      } else if (["rock"].includes(themeLower)) {
        updatePayload = {
          design: "UNDERGROUND",
          numberOfDjs: 4
        };
      } else if (["happy hour"].includes(themeLower)) {
        updatePayload = {
          design: "TOMORROWLAND",
          numberOfDjs: 5
        };
      } else if (["rap"].includes(themeLower)) {
      updatePayload = {
        design: "CLUB",
        numberOfDjs: 4
        };
      }

      if (updatePayload) {
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

      delete roomThemes[room];

      const updatePayload = {
          design: "YACHT",
          numberOfDjs: 3,
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
}
else if (payload.message.startsWith('/room')) {
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

      const theme = payload.message.replace('/room', '').trim();
      if (!theme) {
          await postMessage({
              room,
              message: 'Please specify a room design. Available options: Barn, Festival, Underground, Tomorrowland, Classic.'
          });
          return;
      }

      const roomLower = theme.toLowerCase();
      let updatePayload = null;
      
      const designMap = {
          "barn": "BARN",
          "festival": "FESTIVAL",
          "underground": "UNDERGROUND",
          "tomorrowland": "TOMORROWLAND",
          "classic": "CLUB",
          "turntable classic": "CLUB",
          "ferry" : "FERRY_BUILDING",
          "ferry building" : "FERRY_BUILDING",
          "stadium" : "STADIUM",
          "theater" : "THEATER",
          "lights" : "CHAT_ONLY",
          "dark" : "CHAT_ONLY"
      };

      if (designMap[roomLower]) {
          updatePayload = { design: designMap[roomLower] };
      } else {
          await postMessage({
              room,
              message: `Invalid room design: ${theme}. Available options: Barn, Festival, Underground, Tomorrowland, Classic.`
          });
          return;
      }

      // Apply the design update
      await updateRoomInfo(updatePayload);

      await postMessage({
          room,
          message: `Room design updated to: ${designMap[roomLower]}`
      });

  } catch (error) {
      console.error('Error updating room design:', error);
      await postMessage({
          room,
          message: `Error: ${error.message}`
      });
  }
 
} else if (payload.message.startsWith('/addsong')) {
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
      const playlistId = process.env.DEFAULT_PLAYLIST_ID
      const snapshotId = await addTracksToPlaylist(playlistId, [trackUri]);

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
} else if (payload.message.startsWith('/removesong')) {
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

  } else if (payload.message.startsWith('/status')) {
    try {
      const autobopStatus = roomBot.autobop ? 'enabled' : 'disabled'
      const autoDJStatus = roomBot.autoDJ ? 'enabled' : 'disabled'
      const songStatsStatus = songStatsEnabled ? 'enabled' : 'disabled'
      const greetUserStatus = greetingMessagesEnabled ? 'enabled' : 'disabled'
      const audioStatsStatus = roomBot.audioStatsEnabled ? 'enabled' : 'disabled'
      const statusMessage = `Bot Mod Toggles:\n- Autobop: ${autobopStatus}\n- Auto DJ: ${autoDJStatus}\n- Song stats: ${songStatsStatus}\n- Greet users: ${greetUserStatus}\n- Audio Stats: ${audioStatsStatus}`
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
  } else if (payload.message.startsWith('/autodjon')) {
    try {
      await roomBot.enableAutoDJ()
      await postMessage({
        room,
        message: 'AutoDJ enabled.'
      })
    } catch (error) {
      console.error('Error enabling autoDJ:', error)
      await postMessage({
        room,
        message: 'An error occurred while enabling autoDJ. Please try again.'
      })
    }
  } else if (payload.message.startsWith('/autodjoff')) {
    try {
      await roomBot.disableAutoDJ()
      await postMessage({
        room,
        message: 'AutoDJ disabled.'
      })
    } catch (error) {
      console.error('Error disabling autoDJ:', error)
      await postMessage({
        room,
        message: 'An error occurred while disabling autoDJ. Please try again.'
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
      const songDetails = `Track Name: ${currentSong.trackName}\nArtist Name: ${currentSong.artistName}\n${currentSong.spotifyUrl}\nSong Duration: ${currentSong.songDuration}\n Song ID: ${currentSong.songId}`
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
  } else if (payload.message.startsWith('/suggestsongs')) {
    console.log("Processing /suggestsongs command...");

    const recentSongs = readRecentSongs();
    console.log("Recent Songs Data:", recentSongs);

    if (!recentSongs || recentSongs.length === 0) {
        await postMessage({
            room,
            message: "I don't have any recent songs to suggest right now."
        });
        return;
    }

    // Format song details for the AI question
    const songList = recentSongs.map(song => {
        return `Track: *${song.trackName}* | Artist: *${song.artistName}*`;
    }).join('\n');
    console.log("Formatted Song List for AI:", songList);

    // Create a question prompt for the AI
    const question = `Here is a list of songs i've listened to recently. \n ${songList}. Can you suggest about 5 similar songs that you think I may enjoy? Please follow this format strictly:\n\nTrack: <Track Name> | Artist: <Artist Name>\n\nFor each song suggestion, use a new line, and do not include any extra commentary or notes outside of this format.`;

    console.log("AI Question:", question);

    // Get AI's response
    const aiResponse = await askQuestion(question);
    console.log("AI Response:", aiResponse);

    // Clean up and split the response
    const songSuggestions = aiResponse.split("\n").map(item => {
        const parts = item.split("|"); // Split by " | "

        // If the response is in the right format
        if (parts.length === 2) {
            let trackName = parts[0].replace('Track: ', '').trim(); // Remove 'Track: ' from the front
            let artistName = parts[1].replace('Artist: ', '').trim(); // Remove 'Artist: ' from the front

            // Clean up track and artist names (removing extra spaces or characters)
            trackName = cleanName(trackName);
            artistName = cleanName(artistName);

            console.log(`Parsed track: ${trackName}, artist: ${artistName}`);
            return { trackName, artistName };
        }
        return null;  // Handle malformed lines
    }).filter(Boolean);  // Remove null values from malformed lines

    // Clean function to remove unwanted characters
    function cleanName(name) {
        return name.replace(/[^a-zA-Z0-9\s&'\-]/g, '').trim();  // Allow spaces, letters, numbers, and simple punctuation
    }

    // Create an array to hold the custom data payload
    const customDataSongs = [];

    // Search Spotify for each song suggestion
    for (let suggestion of songSuggestions) {
        const { trackName, artistName } = suggestion;

        if (trackName && artistName) {
            const trackDetails = await searchSpotify(artistName, trackName);

            if (trackDetails && trackDetails.spotifyUrl) {
                // Fetch additional data for the song
                const songData = await fetchSongData(trackDetails.spotifyUrl);

                // Transform the song data
                const transformedSongData = {
                    ...songData,
                    musicProviders: songData.musicProvidersIds, // Ensure this matches the expected structure
                    status: "SUCCESS"
                };

                // Push the transformed song data to the customData array
                customDataSongs.push({
                    song: transformedSongData
                });
            }
        }
    }

    // If we have custom data songs, send them
    if (customDataSongs.length > 0) {
        const customData = {
            songs: customDataSongs
        };

        // Send the custom data to the room
        await postMessage({
            room,
            message: 'Here are some song suggestions:',
            customData: customData  // Attach custom data here
        });
    } else {
        await postMessage({
            room,
            message: 'Sorry, I couldn\'t find any song suggestions.'
        });
    }

    ////////////////// SPECIAL //////////////////////////
  } else if (payload.message.startsWith('/afk')) {
    const userId = payload.sender; // Get the user UUID from the payload

    // Check if the user is AFK authorized
    if (!isUserAfkAuthorized(userId)) {
        await postMessage({
            room,
            message: 'You are not authorized to use this command.'
        });
        return; // Exit if the user does not have a token
    }

    // Handling the /afkon and /afkoff commands
    if (payload.message.startsWith('/afkon')) {
        // Update AFK status to ON
        updateAfkStatus(userId, true);
        await postMessage({
            room,
            message: 'AFK status is now ON.'
        });
    } else if (payload.message.startsWith('/afkoff')) {
        // Update AFK status to OFF
        updateAfkStatus(userId, false);
        await postMessage({
            room,
            message: 'AFK status is now OFF.'
        });
    }
    
  
    /// /////////////  Trivia Stuff /////////////////////////////
  } else if (payload.message.startsWith('/triviastart')) {
    await handleTriviaStart(room)
  } else if ((payload.message.startsWith('/a') && payload.message.length === 2) || 
  (payload.message.startsWith('/b') && payload.message.length === 2) || 
  (payload.message.startsWith('/c') && payload.message.length === 2) || 
  (payload.message.startsWith('/d') && payload.message.length === 2)) {
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
