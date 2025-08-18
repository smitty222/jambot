// message.js
import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { askQuestion, setCurrentSong } from '../libs/ai.js'
import { handleTriviaStart, handleTriviaEnd, handleTriviaSubmit, displayTriviaInfo } from '../handlers/triviaCommands.js'
import { logger } from '../utils/logging.js'
import { getAlbumsByArtist, getAlbumTracks, isUserAuthorized, fetchSpotifyPlaylistTracks, fetchUserData, fetchSongData, updateRoomInfo, isUserOwner, searchSpotify, getSenderNickname, getMLBScores, getNHLScores, getNBAScores, getTopHomeRunLeaders, getSimilarTracks, getTopChartTracks, addSongsToCrate, getUserToken, clearUserQueueCrate, getUserQueueCrateId} from '../utils/API.js'
import { handleLotteryCommand, handleLotteryNumber, handleTopLotteryStatsCommand, handleSingleNumberQuery, handleLotteryCheck, LotteryGameActive, getLotteryWinners } from '../database/dblotterymanager.js'
import { enableSongStats, disableSongStats, isSongStatsEnabled, saveSongReview, getAverageRating} from '../utils/voteCounts.js'
import {
  enableGreetingMessages,
  disableGreetingMessages,
  greetingMessagesEnabled,
  enableAIGreeting,
  disableAIGreeting,
  aiGreetingEnabled
} from '../handlers/userJoined.js'
import { getCurrentDJ, getCurrentDJUUIDs } from '../libs/bot.js'
import { readRecentSongs } from '../database/dbrecentsongsmanager.js'
import { addTracksToPlaylist, removeTrackFromPlaylist } from '../utils/playlistUpdate.js'
import {
  startRouletteGame,
  handleRouletteBet,
  handleBalanceCommand,
  showAllBets,
  rouletteGameActive
} from './roulette.js'
import { getBalanceByNickname, getNicknamesFromWallets, addDollarsByUUID, loadWallets, removeFromUserWallet, getUserWallet } from '../database/dbwalletmanager.js'
import { getJackpotValue, handleSlotsCommand } from './slots.js'
import { joinTable, handleBlackjackBet, handleHit, handleStand, gameState, canSplitHand } from '../handlers/blackJack.js'
import { updateAfkStatus, isUserAfkAuthorized, userTokens } from './afk.js'
import { handleDinoCommand, handleBotDinoCommand, handleRandomAvatarCommand, handleBotRandomAvatarCommand, handleSpaceBearCommand, handleBotDuckCommand, handleBotAlien2Command, handleBotAlienCommand, handleWalrusCommand, handleBotWalrusCommand, handleBotPenguinCommand, handleBot2Command, handleBot1Command, handleDuckCommand, handleRandomCyberCommand, handleVibesGuyCommand, handleFacesCommand } from './avatarCommands.js'
import { markUser, getMarkedUser} from '../utils/removalQueue.js'
import {extractUserFromText, isLotteryQuestion} from '../database/dblotteryquestionparser.js'
import { askMagic8Ball } from './magic8Ball.js'
import { storeItems } from '../libs/jamflowStore.js'
import { saveAlbumReview, getTopAlbumReviews, getUserAlbumReviews } from '../database/dbalbumstatsmanager.js'
import { placeSportsBet, resolveCompletedBets } from '../utils/sportsBet.js'
import { handleThemeCommand } from '../database/dbtheme.js'
import { getUserSongReviews } from '../database/dbroomstatsmanager.js'
import { fetchOddsForSport, formatOddsMessage } from '../utils/sportsBetAPI.js'
import { saveOddsForSport, getOddsForSport } from '../utils/bettingOdds.js'
import { startHorseRace, handleHorseBet, isWaitingForEntries, handleHorseEntryAttempt, handleHorseHelpCommand, handleHorseStatsCommand, handleTopHorsesCommand, handleMyHorsesCommand } from '../games/horserace/handlers/commands.js'
import { QueueManager } from '../utils/queueManager.js'
import db from '../database/db.js'
import { handleAddAvatarCommand } from './addAvatar.js'
import { enableNowPlayingInfoBlurb, disableNowPlayingInfoBlurb, isNowPlayingInfoBlurbEnabled, setNowPlayingInfoBlurbTone, getNowPlayingInfoBlurbTone } from '../utils/announceNowPlaying.js'
import { routeCrapsMessage } from '../games/craps/craps.single.js'
import '../games/craps/craps.single.js'


const ttlUserToken = process.env.TTL_USER_TOKEN
export const roomThemes = {}
const usersToBeRemoved = {}
const userstagedive = {}

const queueManager = new QueueManager(
  'src/data/djQueue.json',   // your file path
  getUserNickname            // optional nickname fetcher
)

export async function getUserNickname(userId) {
  return `<@uid:${userId}>`
}

function buildModSheet() {
  return [
    '🛠️ Moderator Commands',

    '--- Room Look ---',
    '- /room classic',
    '- /room ferry',
    '- /room barn',
    '- /room yacht',
    '- /room festival',
    '- /room stadium',
    '- /room theater',

    '--- Room Theme ---',
    '- /settheme <Albums|Covers|Rock|Country|Rap|...>',
    '- /removetheme',

    '--- Bot DJ Lineup ---',
    '- /addDJ   (Bot DJs from AI recommendations)',
    '- /removeDJ',

    '--- Bot Toggles ---',
    '- /status',
    '- /bopon | /bopoff',
    '- /autodjon | /autodjoff',
    '- /songstatson | /songstatsoff',
    '- /greeton | /greetoff',
    '- /infoon | /infooff | /infotoggle',
    '- /infotone <neutral|playful|cratedigger|hype|classy|chartbot|djtech|vibe>',

    '--- Avatars ---',
    'Bot:',
    '- /bot1',
    '- /botduck',
    '- /botdino',
    '- /botpenguin',
    '- /botwalrus',
    '- /botalien1',
    '- /botalien2',
    '- /botrandom',
    'User:',
    '- /randomavatar',
    '- /walrus',
    '- /dino',
    '- /spacebear',
    '- /duck',
    '- /cyber',
    '- /vibesguy',
    '- /faces',
  ].join('\n')
}


export async function handleDirectMessage(payload) {
  const sender = payload.sender
  const text = payload.data?.text?.trim() || ''

  console.log(`[DM] from ${sender}: ${text}`)

  if (text.startsWith('/help')) {
    await sendAuthenticatedDM(sender, `Here are some things I can do:\n• /balance\n• /lottery\n• /help`)
  } else if (text.startsWith('/balance')) {
    const balance = 1000
    await sendAuthenticatedDM(sender, `💰 Your balance is $${balance}`)
  } else {
    await sendAuthenticatedDM(sender, `🤖 Unknown DM command: "${text}"`)
  }
}

export default async (payload, room, state, roomBot) => {
  console.log('[MessageHandler]', payload)

  if (!payload?.message) return

  const txt = payload.message.trim();


  // 🔧 sanity check route
  if (/^\/ping\b/i.test(txt)) {
    const room = payload.receiverType === 'user' ? roomOrPeer : roomOrPeer; // both work
    await postMessage({ room, message: 'pong ✅' });
    return;
  }

   // ─── HORSE‐RACE ENTRY & COMMANDS ────────────────────────────────────────

  // A) If we're in the 30s entry window, ANY non‐slash chat is an entry
  if (isWaitingForEntries() && !payload.message.startsWith('/')) {
    console.log('▶ dispatch → entryAttempt');
    await handleHorseEntryAttempt(payload);
    return; // no other logic should run
  }

  // B) Start a new race
  if (payload.message.startsWith('/horserace')) {
    console.log('▶ dispatch → startHorseRace');
    startHorseRace().catch(console.error);
    return;
  }

  // C) Place a bet
  if (/^\/horse\d+\s+\d+/.test(payload.message)) {
    console.log('▶ dispatch → handleHorseBet');
    await handleHorseBet(payload);
    return;
  }

  // D) Other horse commands
  if (payload.message.startsWith('/buyhorse'))    return handleBuyHorse(payload);
  if (payload.message.startsWith('/myhorses'))    return handleMyHorsesCommand(payload);
  if (payload.message.startsWith('/horsehelp'))   { await handleHorseHelpCommand(payload); return; }
  if (payload.message.startsWith('/horserules'))  { await handleHorseHelpCommand(payload); return; }
  if (payload.message.startsWith('/horseinfo'))   { await handleHorseHelpCommand(payload); return; }
  if (payload.message.startsWith('/horsestats'))  { await handleHorseStatsCommand(payload); return; }
  if (payload.message.startsWith('/tophorses'))   return handleTopHorsesCommand(payload);

  // ─── END HORSE‐RACE BLOCK ────────────────────────────────────────────────


 // Send ALL craps-related commands straight to the router.
// The router/service will validate timing, funds, shooter-only roll, etc.
if (/^\/(craps|join|roll|pass|dontpass|come|place|removeplace)\b/i.test(txt)) {
  console.log('▶ dispatch → routeCrapsMessage');
  return routeCrapsMessage(payload);
}


// ─── END CRAPS BLOCK ──────────────────────────

  // Handle Gifs Sent in Chat
  if (payload.message.type === 'ChatGif') {
    logger.info('Received a GIF message:', payload.message)
    return
  }



  // --- AI helpers -----------------------------------------------------------
function expandSongQuestion(rawQ, song) {
  if (!song) return rawQ
  const parts = []
  if (song.trackName) parts.push(`Track: ${song.trackName}`)
  if (song.artistName) parts.push(`Artist: ${song.artistName}`)
  if (song.albumName && song.albumName !== 'Unknown') parts.push(`Album: ${song.albumName}`)
  if (song.releaseDate && song.releaseDate !== 'Unknown') parts.push(`Release: ${song.releaseDate}`)
  if (song.isrc) parts.push(`ISRC: ${song.isrc}`)
  if (song.popularity != null) parts.push(`Spotify popularity: ${song.popularity}`)
  const links = song?.links?.spotify?.url || song?.links?.appleMusic?.url || song?.links?.youtube?.url
  const linkLine = links ? `Link: ${links}` : ''

  const songCard = `${parts.join(' | ')}${linkLine ? `\n${linkLine}` : ''}`

  // replace common phrasings; keep the user’s tone around it
  let q = rawQ
    .replace(/\b(tell me about|what is|what's|info on|details about)\s+(this song)\b/gi, '$1 THE_SONG')
    .replace(/\b(this song|this track|current song|song that is playing)\b/gi, 'THE_SONG')

  return q.replace(/THE_SONG/g, `this song:\n${songCard}\n\nPlease give a short, fun blurb with notable facts (samples, origin, chart peaks, vibe), then 1 similar-track rec.`);
}

function extractText(reply) {
  if (!reply) return null
  if (typeof reply === 'string') return reply
  if (reply.text) return reply.text
  if (reply.candidates?.[0]?.content?.parts?.[0]?.text) return reply.candidates[0].content.parts[0].text
  return null
}

async function safeAskQuestion(prompt, askFn, logger) {
  try {
    const result = await Promise.race([
      askFn(prompt),
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), 15000))
    ])
    const txt = extractText(result)
    if (!txt) throw new Error('AI_EMPTY_RESPONSE')
    return txt.trim()
  } catch (err) {
    logger?.error?.(`[AI] ${err.message || err}`, { err })
    return "My AI brain buffered too long. Try again in a sec. 😅"
  }
}


  // Safer bot-mention check stays the same
const isMentioned = (message) => {
  if (typeof message !== 'string') return false
  return (
    message.includes(`<@uid:${process.env.BOT_USER_UUID}>`) ||
    message.includes(`@${process.env.CHAT_NAME}`)
  )
}

if (
  isMentioned(payload.message) &&
  payload.sender &&
  payload.sender !== process.env.BOT_USER_UUID &&   // ✅ compare directly to UUID
  !payload.message.includes('played')
) {
  try {
    const question = payload.message
      .replace(`<@uid:${process.env.BOT_USER_UUID}>`, '')
      .replace(`@${process.env.CHAT_NAME}`, '')
      .trim()
      .toLowerCase()

    console.log(`Received question: "${question}"`)
    logger.info(`Received question: "${question}" from ${payload.sender}`)

    // quick one-offs (also fix the OR bug in includes)
    if (question === 'you good?') {
      await postMessage({ room, message: "Couldn't be better" })
      return
    }

    if (question === 'hide') {
      try {
        await handleBotRandomAvatarCommand(room, postMessage, process.env.TTL_USER_TOKEN)
      } catch (err) {
        console.error('Error updating bot avatar for hide command:', err)
        await postMessage({ room, message: "I tried to hide but tripped over my own code. 🤕" })
      }
      return
    }

    if (question.includes('dj with us') || question.includes('dj with me')) {
      await postMessage({ room, message: "Let's get it" })
      await roomBot.enableAutoDJ()
      await roomBot.addDJ(true)
      return
    }

    if (question.includes('get tf off the stage') || question.includes('stop djing')) {
      await postMessage({ room, message: 'Damn...alright' })
      await roomBot.removeDJ(process.env.BOT_USER_UUID)
      return
    }

    if (question.includes('9+10') || question.includes('9 + 10')) {  // ✅
      await postMessage({ room, message: '21...are you stoopid?' })
      return
    }

    if (question.includes('are you a bot?') || question.includes('are you a bot')) { // ✅
      await postMessage({ room, message: 'I am not' })
      return
    }

    if (isLotteryQuestion(question)) {
      const userInput = extractUserFromText(question)
      if (userInput) {
        await handleLotteryCheck(room, userInput)
        return
      } else {
        await postMessage({ room, message: "Who do you want me to check?" })
        return
      }
    }

    if (question.includes('spin the wheel') || question.includes('spin that wheel')) {
      await startRouletteGame(payload)
      return
    }
 
    // --- SONG INTENT -----------------------------------------------------
    if (
      question.includes('song is this') ||
      question.includes('this song') ||
      question.includes('song is playing') ||
      question.includes('what’s this song') || question.includes("what's this song")
    ) {
      const currentSong = roomBot.currentSong
      if (!currentSong) {
        await postMessage({ room, message: 'No song is currently playing.' })
        return
      }

      console.log(`Current song details: ${JSON.stringify(currentSong)}`)
      logger.info(`Current song details: ${JSON.stringify(currentSong)}`)

      setCurrentSong(currentSong)

      const prompt = expandSongQuestion(question, currentSong)
      console.log('Expanded prompt for AI:', prompt)
      logger.info('Expanded prompt for AI prepared')

      const aiReplyText = await safeAskQuestion(prompt, askQuestion, logger)
      console.log('AI Reply:', aiReplyText)
      logger.info(`AI Reply: ${aiReplyText}`)

      await postMessage({ room, message: aiReplyText })
      return
    }

    // --- OTHER CONTEXT (e.g., popularity explanation) -------------------
    if (question.includes('yankees')) {
      await postMessage({ room, message: "Who cares?" })
      return
    }

    // default: ask AI with timeout
    const responseText = await safeAskQuestion(question, askQuestion, logger)
    console.log('AI Reply:', responseText)
    logger.info(`AI Reply: ${responseText}`)
    await postMessage({ room, message: responseText })

  } catch (err) {
    console.error('AI mention handler failed:', err)
    logger.error(`AI mention handler failed: ${err?.message || err}`)
    await postMessage({ room, message: "My AI hiccuped. Try again." })
  }


   } else if (payload.message.startsWith('/searchalbum')) {
  const args = payload.message.split(' ').slice(1)
  const artistName = args.join(' ')

  if (!artistName) {
    await postMessage({
      room,
      message: 'Please provide an artist name. Usage: `/searchalbums Mac Miller`'
    })
    return
  }

  const albums = await getAlbumsByArtist(artistName)

  if (!albums.length) {
    await postMessage({
      room,
      message: `No albums found for "${artistName}".`
    })
    return
  }

  const albumList = albums.map((album, index) => {
  return `\`${index + 1}.\` *${album.name}* — \`ID: ${album.id}\``;
}).join('\n');

  await sendDirectMessage(payload.sender,`🎶 Albums for "${artistName}":\n${albumList}`)
  await postMessage({
    room,
    message: `<@uid:${payload.sender}> I sent you a private message`
  })
  } else if (payload.message.startsWith('/qalbum')) {
  const albumId = payload.message.split(' ')[1]?.trim();
  const room = process.env.ROOM_UUID;

  if (!albumId) {
    await postMessage({
      room,
      message:
`⚠️ *Missing Album ID*

Please provide a valid Spotify album ID.  
Example: \`/qalbum 4aawyAB9vmqN3uQ7FjRGTy\``
    });
    return;
  }

  const token = getUserToken(payload.sender);
  if (!token) {
    await postMessage({
      room,
      message:
`🔐 *Spotify account not linked*

We couldn’t find your access token.  
Please contact an admin to link your account to use this command.`
    });
    return;
  }

  try {
    // Step 1: Clear user queue
    await postMessage({
      room,
      message: `📁 *Clearing your current queue...*\n📡 Fetching album from Spotify...`
    });

    await clearUserQueueCrate(payload.sender);

    // Step 2: Get fresh queue ID
    const crateInfo = await getUserQueueCrateId(payload.sender);
    const crateId = crateInfo?.crateUuid;
    if (!crateId) {
      await postMessage({
        room,
        message: `❌ *Failed to retrieve your queue ID. Please try again later.*`
      });
      return;
    }

    // Step 3: Fetch album tracks
    const tracks = await getAlbumTracks(albumId);
    if (!tracks || tracks.length === 0) {
      await postMessage({
        room,
        message: `❌ *No tracks found for album \`${albumId}\`.*`
      });
      return;
    }

    // Step 4: Format for queue
    const formattedTracks = tracks.map(track => ({
      musicProvider: 'spotify',
      songId: track.id,
      artistName: track.artists.map(a => a.name).join(', '),
      trackName: track.name,
      duration: Math.floor(track.duration_ms / 1000),
      explicit: track.explicit,
      isrc: track.external_ids?.isrc || '',
      playbackToken: '',
      genre: ''
    }));

    // Step 5: Add to queue
    await addSongsToCrate(crateId, formattedTracks, true, token);

    await postMessage({
      room,
      message:
`✅ *Album Queued!*

🎵 Added *${formattedTracks.length} track(s)* from album \`${albumId}\` to your queue.  
Please refresh your page for tha queue to update`
    });

  } catch (error) {
    await postMessage({
      room,
      message:
`❌ *Something went wrong while queuing your album*  
\`\`\`${error.message}\`\`\``
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

  } else if (payload.message.startsWith('/lottostats')) {
      await handleTopLotteryStatsCommand(room)

  } else if (/^\/lotto\s+#?\d{1,3}/.test(payload.message)) {
     console.log('Routing to handleSingleNumberQuery with message:', payload.message)
    await handleSingleNumberQuery(room, payload.message)
    
    // ===== /commands (readable overview with hyphens) =====
} else if (/^\/commands\b/i.test(payload.message)) {
  try {
    const isMod = await isUserAuthorized(payload.sender, ttlUserToken)
    const arg = payload.message.trim().split(/\s+/)[1]?.toLowerCase()
    const wantModInline = /^(mod|mods|moderator|admin)$/.test(arg || '')
    const showAll = /^(all|everything)$/.test(arg || '')

    const sections = []

    // Essentials
    sections.push([
      '— Essentials —',
      '- `/theme` — Show current room theme',
      '- `/games` — List available games',
      '- `/escortme` — Stagedive after your next song',
      '- `/dive` — Stagedive now',
      '- `/djbeer` — Give the DJ a beer 🍺',
    ].join('\n'))

    // Music & Stats
    sections.push([
      '— Music & Stats —',
      '- `/album` — Album info for the current song',
      '- `/score` — Spotify popularity score',
      '- `/reviewhelp` — How to review songs ⭐',
      '- `/suggestsongs` — Songs suggested by Allen',
    ].join('\n'))

    // Wallet / Lotteries
    sections.push([
      '— Wallet & Lotto —',
      '- `/bankroll` — Top wallet leaders 💰',
      '- `/lottowinners` — Lottery ball winners 🎱',
      '- `/lottostats` - Most Drawn Lotto Numbers',
    ].join('\n'))

    // Fun / GIFs
    sections.push([
      '— Fun —',
      '- `/gifs` — Show GIF commands',
      '- `/djbeer` — Beer again (because, priorities) 🍺',
    ].join('\n'))

    // Mod teaser (only show if mod or explicitly requested)
    if (isMod || wantModInline || showAll) {
      sections.push([
        '— Moderator Quick Toggles —',
        '- `/status` — Show bot toggles status',
        '- `/bopon` | `/bopoff` — Auto-like on/off',
        '- `/songstatson` | `/songstatsoff`',
        '- `/greeton` | `/greetoff` — Greeting on/off',
        '- `/infoon` | `/infooff` | `/infotoggle` — Info blurb on/off',
        '- `/infotone <tone>` — Set info blurb tone (neutral, playful, cratedigger, hype, classy, chartbot, djtech, vibe)',
        '- `/settheme <name>` | `/removetheme`',
        '- `/room <style>` — Change room look (classic, ferry, barn, yacht, festival, stadium, theater)',
        '- `/addDJ` | `/removeDJ`',
      ].join('\n'))
    } else {
      sections.push('— Moderator Commands —\n- Mods can DM `/mod` to receive the full list.')
    }

    const message = ['📖 Commands', ...sections].join('\n\n')
    await postMessage({ room, message })

    // If a mod asked `/commands mod`, also DM them the full sheet
    if (wantModInline && isMod) {
      const modSheet = buildModSheet()
      await sendDirectMessage(payload.sender, modSheet)
      await postMessage({ room, message: 'Mod Commands sent via DM' })
    }
  } catch (err) {
    console.error('Error in /commands:', err)
    await postMessage({ room, message: 'Error showing commands.' })
  }

// ===== /mod (DM full moderator sheet, grouped & de-duped) =====
} else if (payload.message.startsWith('/mod')) {
  try {
    const isAuthorized = await isUserAuthorized(payload.sender, ttlUserToken)
    if (!isAuthorized) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
    const modMessage = buildModSheet()
    await sendDirectMessage(payload.sender, modMessage)
    await postMessage({ room, message: 'Mod Commands sent via DM' })
  } catch (error) {
    console.error('Error sending /mod sheet:', error)
    await postMessage({ room, message: 'Error sending mod commands.' })
  }

// ===== /gifs (simple readable list with hyphens) =====
} else if (payload.message.startsWith('/gifs')) {
  await postMessage({
    room,
    message:
`🎞️ GIF Commands
- /burp
- /dance
- /party
- /beer
- /fart
- /tomatoes
- /cheers`
  })
    
  /////////////// YAY SPORTS!! ////////////////////////
  } else if (payload.message===('/MLB')) {
    const parts = payload.message.trim().split(' ');
    const requestedDate = parts[1]; // optional, format: YYYY-MM-DD
  
    try {
      // Ensure getMLBScores is properly called and returns a response
      const response = await getMLBScores(requestedDate);
      await postMessage({
        room,
        message: response // Send the response here
      });
    } catch (err) {
      console.error('Error fetching MLB scores:', err);
      await postMessage({
        room,
        message: 'There was an error fetching MLB scores. Please try again later.'
      });
    }  
  } else if (payload.message.startsWith('/homerun')) {
    try {
      const response = await getTopHomeRunLeaders();
      await postMessage({
        room,
        message: response
      });
    } catch (err) {
      console.error('Error fetching home run leaders:', err);
      await postMessage({
        room,
        message: 'There was an error fetching home run leaders. Please try again later.'
      });
    }  
  } else if (payload.message.startsWith('/derby-create')) {
    try {
      await generateDerbyTeamsJSON();
      await postMessage({
        room,
        message: '🏟️ Home Run Derby teams have been created and saved!'
      });
    } catch (err) {
      console.error('Error creating derby teams:', err);
      await postMessage({
        room,
        message: '⚠️ Error creating derby teams. Please try again later.'
      });
    }
  } else if (payload.message.startsWith('/derby-update')) {
    try {
      await updateDerbyTeamsFromJSON();
      await postMessage({
        room,
        message: '📈 Derby teams updated with the latest home run totals!'
      });
    } catch (err) {
      console.error('Error updating derby teams:', err);
      await postMessage({
        room,
        message: '⚠️ Error updating derby teams. Make sure they are created first.'
      });
    }
  } else if (payload.message.startsWith('/derby-standings')) {
    try {
      const standingsMessage = await getDerbyStandings();
      await postMessage({
        room,
        message: standingsMessage
      });
    } catch (err) {
      console.error('Error getting derby standings:', err);
      await postMessage({
        room,
        message: '⚠️ Could not retrieve derby standings. Make sure teams are created first.'
      });
    }
  
  
    
  } else if (payload.message.startsWith('/NHL')) {
    const parts = payload.message.trim().split(' ');
    const requestedDate = parts[1]; // optional, format: YYYY-MM-DD
  
    try {
      // Ensure getNHLscores is properly called and returns a response
      const response = await getNHLScores(requestedDate);
      await postMessage({
        room,
        message: response // Send the response here
      });
    } catch (err) {
      console.error('Error fetching NHL scores:', err);
      await postMessage({
        room,
        message: 'There was an error fetching NHL scores. Please try again later.'
      });
    }  
  } else if (payload.message.startsWith('/NBA')) {
    const parts = payload.message.trim().split(' ');
    const requestedDate = parts[1]; // optional, format: YYYY-MM-DD
  
    try {
      // Ensure getNBAscores is properly called and returns a response
      const response = await getNBAScores(requestedDate);
      await postMessage({
        room,
        message: response // Send the response here
      });
    } catch (err) {
      console.error('Error fetching NBA scores:', err);
      await postMessage({
        room,
        message: 'There was an error fetching NBA scores. Please try again later.'
      });
    }  

    ////////////////////////////// SPORTS ODDS /////////////////////////////
  } else if (payload.message === '/mlbodds') {
    try {
      const sport = 'baseball_mlb';
      const data = await fetchOddsForSport(sport);
      if (!data) throw new Error('No data returned');
  
      saveOddsForSport(sport, data);
  
      const oddsMsg = formatOddsMessage(data, sport);
      await postMessage({ room, message: oddsMsg });
    } catch (error) {
      console.error('Error fetching or posting MLB odds:', error);
      console.log(oddsMsg)
      await postMessage({ room, message: 'Sorry, something went wrong fetching MLB odds.' });
    }  

  } else if (payload.message.startsWith('/sportsbet')) {
    const args = payload.message.trim().split(/\s+/);
    const senderUUID = payload.sender;
    const nickname = await getSenderNickname(senderUUID);
    const room = process.env.ROOM_UUID;
  
    console.log('⚡ /sportsbet command received');
    console.log('Arguments:', args);
  
    if (args.length < 6) {
      await postMessage({
        room,
        message: 'Usage: /sportsbet SPORT INDEX TEAM TYPE AMOUNT\nExample: /sportsbet mlb 2 NYY ml 50'
      });
      return;
    }
  
    const sportAlias = args[1].toLowerCase();
    const sportMap = {
      mlb: 'baseball_mlb',
      nba: 'basketball_nba',
      nfl: 'americanfootball_nfl',
      nhl: 'icehockey_nhl'
    };
    const sport = sportMap[sportAlias];
  
    if (!sport) {
      await postMessage({ room, message: 'Unsupported sport. Try: mlb, nba, nfl, nhl' });
      return;
    }
  
    const rawIndex = parseInt(args[2], 10);
    const index = rawIndex - 1; // convert to 0-based index
    const team = args[3];
    const betType = args[4].toLowerCase(); // 'ml' or 'spread'
    const amount = parseFloat(args[5]);
  
    if (isNaN(index) || !team || isNaN(amount) || amount <= 0) {
      await postMessage({
        room,
        message: 'Please enter a valid command: /sportsbet SPORT INDEX TEAM TYPE AMOUNT\nExample: /sportsbet mlb 2 NYY ml 50'
      });
      return;
    }
  
    const oddsData = getOddsForSport(sport);
    if (!oddsData || index < 0 || index >= oddsData.length) {
      await postMessage({
        room,
        message: 'Invalid game index. Use /odds SPORT to see available games.'
      });
      return;
    }
  
    const balance = await getUserWallet(senderUUID);
    if (amount > balance) {
      await postMessage({
        room,
        message: `Insufficient funds, ${nickname}. Your balance is $${balance}.`
      });
      return;
    }
  
    const result = await placeSportsBet(senderUUID, index, team, betType, amount, sport);
  
    if (typeof result === 'string' && result.startsWith('✅')) {
      await removeFromUserWallet(senderUUID, amount);
    }
  
    console.log('Bet Result:', result);
    await postMessage({ room, message: result });

  } else if (payload.message.startsWith('/resolvebets')) {
    await resolveCompletedBets();
    await postMessage({
      room,
      message: 'Open bets have been resolved'
    });
    return;
  
    //////////////////////////// ////////////////////////////
    } else if (payload.message.startsWith('/test')) {
      await postMessage({
        room,
        message: `testing!`
      });

    
  } else if (payload.message.startsWith('/crapsrecord')) {
    const row = db.prepare(`
      SELECT maxRolls, shooterNickname, shooterId, achievedAt
      FROM craps_records
      WHERE roomId = ?
    `).get(room);

    const count = row?.maxRolls ?? 0;
    let who = row?.shooterNickname || '—';
    if (!row?.shooterNickname && row?.shooterId) {
      who = await getUserNickname(row.shooterId).catch(() => 'Someone');
    }
    const when = row?.achievedAt || '—';

    return postMessage({
      room: room,
      message: `🏆 **Current record:** ${count} roll(s) by **${who}**\n🗓️ Set: ${when}`
    });
  
    /// /////////////// General Commands ////////////////
  } else if (payload.message.startsWith('/games')) {
    await postMessage({
      room,
      message: 'Games:\n- /trivia: Play Trivia\n- /lottery: Play the Lottery\n- /roulette: Play Roulette\n- /slots: Play Slots\n- /blackjack: Play Blackjack\n- /horserace\n- /slotinfo: Display slots payout info\n- /lotto (#):Insert number to get amount of times won\n- /lottostats: Get most won lottery numbers \n- /jackpot: Slots progressive jackpot value'
    })
} else if (/^(\/theme|\/settheme|\/removetheme)\b/i.test(payload.message.trim())) {
  console.log('[MessageHandler] routing to theme handler:', payload.message)
  try {
    await handleThemeCommand({
      sender:  payload.sender,
      room,
      message: payload.message
    })
  } catch (err) {
    console.error('[MessageHandler] theme handler threw:', err)
    await postMessage({ room, message: '⚠️ Theme command failed—please try again.' })
  }
  return

  } else if (payload.message.startsWith('/djbeers')) {
  try {
    const senderUUID = payload.sender;
    const currentDJUUIDs = getCurrentDJUUIDs(state);

    if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
      await postMessage({
        room,
        message: `<@uid:${senderUUID}>, there is no DJ currently playing.`
      });
      return;
    }

    const mentionText = currentDJUUIDs.map(uuid => `<@uid:${uuid}>`).join(' and ');

    await postMessage({
      room,
      message: `<@uid:${senderUUID}> gives ${mentionText} two ice cold beers!! 🍺🍺`
    });
  } catch (error) {
    console.error('Error handling /djbeers command:', error);
  }

 } else if (payload.message.startsWith('/djbeer')) {
  try {
    const senderUUID = payload.sender;
    const currentDJUUIDs = getCurrentDJUUIDs(state);

    if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
      await postMessage({
        room,
        message: `<@uid:${senderUUID}>, there is no DJ currently playing.`
      });
      return;
    }

    await postMessage({
      room,
      message: `<@uid:${senderUUID}> gives <@uid:${currentDJUUIDs[0]}> an ice cold beer! 🍺`
    });
  } catch (error) {
    console.error('Error handling /djbeer command:', error);
  }

  } else if (payload.message.startsWith('/getdjdrunk')) {
  try {
    const senderUUID = payload.sender;
    const currentDJUUIDs = getCurrentDJUUIDs(state);

    if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
      await postMessage({
        room,
        message: `<@uid:${senderUUID}>, there is no DJ currently playing.`
      });
      return;
    }

    await postMessage({
      room,
      message: `<@uid:${senderUUID}> gives <@uid:${currentDJUUIDs[0]}> a million ice cold beers!!! 🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺`
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
  const senderUUID = payload.sender;
  const nickname = getUserNickname(senderUUID);
  const isAuthorized = await isUserAuthorized(senderUUID, ttlUserToken);

  if (!isAuthorized) {
    await postMessage({
      room,
      message: `Don't tell me what to do, @${nickname}`
    });
    return;
  }

  try {
    await roomBot.voteOnSong(process.env.ROOM_UUID, { like: false }, process.env.BOT_USER_UUID);
  } catch (error) {
    console.error('Error Voting on Song', error);
  }


  } else if (payload.message.startsWith('/addDJ')) {
    try {
      const args = payload.message.split(' ')
      const option = args[1] // Check if 'auto' was provided

      if (option === 'auto') {
        await roomBot.enableAutoDJ()
        console.log('Auto DJ enabled')

        // Now add the bot as DJ
        await roomBot.addDJ(true)
        console.log('Added Auto DJ')
      } else {
        await roomBot.addDJ()
        // console.log('DJ added normally');
      }
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


   } else if (payload.message.startsWith('/q+')) {
  const result = await queueManager.joinQueue(payload.sender)
  const mention = `<@uid:${payload.sender}>`

  await postMessage({
    room,
    message: result.success
      ? `${mention}; you joined the queue.`
      : `${mention}; you're already in the queue.`,
  })

} else if (payload.message.startsWith('/q-')) {
  const queue = await queueManager.getQueue()
  const userInQueue = queue.find(u => u.userId === payload.sender)

  const mention = `<@uid:${payload.sender}>`

  if (!userInQueue) {
    await postMessage({ room, message: `${mention}; you're not in the queue.` })
    return
  }

  const removed = await queueManager.leaveQueue(payload.sender)

  if (removed) {
    await postMessage({ room, message: `${mention}; you left the queue.` })
  } else {
    await postMessage({ room, message: `${mention}; failed to remove you from the queue.` })
  }

} else if (payload.message.startsWith('/q')) {
  const queue = await queueManager.getQueue()
  const { currentIndex = 0 } = await queueManager.loadQueue()

  if (!queue || queue.length === 0) {
    await postMessage({ room, message: 'The queue is empty.' })
    return
  }

  const list = queue.map((user, index) => {
    const marker = index === currentIndex ? ' (up next)' : ''
    return `${index + 1}. ${user.username}${marker}`
  }).join('\n')

  await postMessage({ room, message: `🎶 Current Queue:\n${list}` })
}

    
   else if (payload.message.startsWith('/dive')) {
      try {
        const userUuid = payload.sender
        const senderName = await getSenderNickname(userUuid)
    
        // Get the UUID of the DJ currently playing a song
        const currentDJ = getCurrentDJ(state) // This returns a UUID
    
        if (userUuid === currentDJ) {
          // They're playing the current song, mark them for removal after it ends
          if (getMarkedUser() === userUuid) {
            await postMessage({
              room,
              message: `${senderName}, you're already set to dive after your current song. 🫧`
            })
          } else {
            markUser(userUuid)  // Store UUID for post-song removal
    
            await postMessage({
              room,
              message: `${senderName}, you'll dive off stage after this track. 🌊`
            })
          }
        } else {
          // They're not playing right now, remove them immediately
          await roomBot.removeDJ(userUuid)
        }
      } catch (error) {
        console.error('Error handling /dive command:', error)
      }
    
  } else if (payload.message.startsWith('/escortme')) {
    try {
      const senderUUID = payload.sender
      const senderName = await getSenderNickname(senderUUID)
      const userUuid = payload.sender

      if (usersToBeRemoved[userUuid]) {
        await postMessage({
          room,
          message: `${senderName}, you're already set to be removed after your current song.`
        })
        return
      }
      usersToBeRemoved[userUuid] = true

      await postMessage({
        room,
        message: `${senderName}, you will be removed from the stage after your next song ends.`
      })
    } catch (error) {
      console.error('Error handling /escortme command:', error)
    }
  /// /////////////// Secret Commands /////////////////////
  } else if (payload.message.startsWith('/secret')) {
    const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
      if (!isAuthorized) {
        await postMessage({
          room,
          message: 'I cant reveal my secrets to you. I dont make the rules. Talk to Rsmitty'
        })
        return
      }
    const secretmessage = 'Sssshhhhhh be very quiet. These are top secret\n- /bark\n- /barkbark\n- /djbeers\n- /getdjdrunk\n- /jam\n- /ass\n- /azz\n- /cam\n- /shirley\n- /berad\n- /ello\n- /art\n- /ello\n- /allen\n- /art'
    await sendDirectMessage(payload.sender,secretmessage)
    await postMessage({
      room,
      message: '🕵️‍♂️ Psst… look in your messages.'
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

    } else if (payload.message.startsWith('/shred')) {
    try {
      const danceImageOptions = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZTIxczIxamNnbHpyajFyMmFhZmVwZnR4OTdhN3IwaDM0NGp4ZGhrbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/0VwKnH9W96meBS9NAv/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd295ajQ1cmJtdGZhMWQ4eWQ4cXhtNmV5eGphODBxNnV0anI5b3F0ZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/9D8SldWd6lmVbHwRB1/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExdzd1MnlzNnZsN2Z0NWZ3ajU4bTJ3NnJmZHh1bzAweHFrbnA5eDY5YiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/7aLx6EHBGyTZTNOt5G/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ3oyN2phaXN1emk4aXN0eHJwb3BhODZpdDU0a2hxNmd3NGVsZWs4eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/U23XuUNi3XdW93JM0b/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd3l4a2hlNzk0Y2dlYm9sOTZ4ajFvOTFjOTdqOTU4ZW15ZjU1OGRlaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7P4DBaIJG4n8DzNK/giphy.gif',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExa2JleHNweGkwZGtpcXo4dm9sZGo1ZTB2ZmoxbGJqb2IweTlpZ3c4ZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mI3J3e2v97T8Y/giphy.gif'
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
  /// //////////////////// VIRTUAL CASINO ////////////////////////

  /////////////////////// ROULETTE ///////////////////////////////

// Helper to detect if message is a direct number bet like "/7 10"
function isDirectNumberBet(message) {
  const command = message.trim().split(' ')[0].substring(1)
  const number = parseInt(command, 10)
  return !isNaN(number) && number >= 0 && number <= 36
}

// Start roulette game
if (payload.message.startsWith('/roulette start')) {
  if (!rouletteGameActive) {
    await startRouletteGame(payload)
  } else {
    await postMessage({
      room,
      message: '🎰 A roulette game is already active! Please wait for it to finish.'
    })
  }

// Roulette instructions
} else if (payload.message.startsWith('/roulette')) {
  await postMessage({
    room,
    message:
      '🎡 Welcome to Roulette! Use `/roulette start` to begin.\n\n' +
      '🎯 Place bets using:\n' +
      '- `/red <amount>` or `/black <amount>`\n' +
      '- `/odd <amount>` or `/even <amount>`\n' +
      '- `/high <amount>` or `/low <amount>`\n' +
      '- `/number <number> <amount>` or `/<number> <amount>`\n' +
      '- `/dozen <1|2|3> <amount>`\n\n' +
      '💰 Use `/balance` to check your wallet.\n' +
      '🧾 Use `/bets` to see all current bets.'
  })

// Show all bets
} else if (payload.message.startsWith('/bets') && rouletteGameActive) {
  await showAllBets()

// Check wallet balance
} else if (payload.message.startsWith('/balance')) {
  await handleBalanceCommand(payload)

// Handle bets (color, number, dozen, direct number)
} else if (
  rouletteGameActive &&
  (
    payload.message.startsWith('/red') ||
    payload.message.startsWith('/black') ||
    payload.message.startsWith('/green') ||
    payload.message.startsWith('/odd') ||
    payload.message.startsWith('/even') ||
    payload.message.startsWith('/high') ||
    payload.message.startsWith('/low') ||
    payload.message.startsWith('/number') ||
    payload.message.startsWith('/dozen') ||
    isDirectNumberBet(payload.message)
  )
) {
  await handleRouletteBet(payload)
}

/////////////////////////// Wallet Stuff ////////////////////////////////////

  if (payload.message.startsWith('/balance')) {
    const userId = payload.sender // Get the user's ID from the payload

    // Await the nickname to ensure it resolves to a string
    const nickname = await getUserNickname(userId)

    // Load the wallets from persistent storage
    const wallets = await loadWallets() // Ensure you have this function defined to load wallets

    // Retrieve the user's wallet object
    const userWallet = wallets[userId]

    if (userWallet && userWallet.balance !== undefined) {
      // Access the balance property directly
      const balance = userWallet.balance
      const formattedBalance = formatBalance(balance) // Format the balance with commas

      await postMessage({
        room: process.env.ROOM_UUID,
        message: `${nickname}, your current balance is $${formattedBalance}.`
      })
    } else {
      await postMessage({
        room: process.env.ROOM_UUID,
        message: `${nickname}, you do not have a wallet yet. You can use /getwallet`
      })
    }
  }

  if (payload.message.startsWith('/getwallet')) {
    const userId = payload.sender // Get the user's ID from the payload
    const nickname = await getUserNickname(userId) // Get the user's nickname

    // Load the wallets from persistent storage
    const wallets = await loadWallets()

    // Check if the user already has a wallet
    if (wallets[userId]) {
      await postMessage({
        room,
        message: `${nickname}, you already have a wallet with $${wallets[userId].balance}.`
      })
    } else {
      // Initialize the wallet with a default balance
      const defaultBalance = 50
      wallets[userId] = { balance: defaultBalance }


      await postMessage({
        room,
        message: `${nickname}, your wallet has been initialized with $${defaultBalance}.`
      })
    }
  }

  // Command to handle balance request for another user
  if (payload.message.startsWith('/checkbalance')) {
    const args = payload.message.split(' ').slice(1) // Get arguments after the command

    if (args.length !== 1) {
      await postMessage({
        room,
        message: 'Usage: /checkbalance <nickname>'
      })
      return // Exit if arguments are not valid
    }

    const nickname = args[0] // Get the nickname from the arguments
    const balance = await getBalanceByNickname(nickname) // Get the balance

    if (balance === null) {
      await postMessage({
        room,
        message: `User with nickname ${nickname} does not exist.`
      })
    } else {
      await postMessage({
        room,
        message: `${nickname}'s current balance is $${balance}.`
      })
    }
  }
  ///////////////////////////////////////////////////////////////////////////
  if (payload.message.startsWith('/bankroll')) {
  try {
    const bankroll = getNicknamesFromWallets()

    console.log('[BANKROLL] Raw bankroll data:', bankroll)

    const sortedBankroll = bankroll
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5)
      .map((user, index) =>
        `${index + 1}. <@uid:${user.uuid}>: $${Math.round(user.balance).toLocaleString()}`
      )

    console.log('[BANKROLL] Top 5 formatted:', sortedBankroll)

    const finalMessage = `🏆 **Top Wallet Leaders** 🏆\n\n${sortedBankroll.join('\n')}`

    await postMessage({
      room,
      message: finalMessage
    })

  } catch (error) {
    console.error('Error fetching bankroll information:', error)

    await postMessage({
      room,
      message: 'There was an error fetching the bankroll information.'
    })
  }
}



  if (payload.message.startsWith('/lottowinners')) {
  try {
    const winners = getLotteryWinners()
    console.log('[lottowinners] keys:', winners.map(w => Object.keys(w)))


    if (!winners || winners.length === 0) {
      await postMessage({ room: process.env.ROOM_UUID, message: 'No lottery winners found at this time.' })
      return
    }

    // Oldest → newest
    winners.sort((a, b) => new Date(a.date) - new Date(b.date))

    const formattedWinners = winners.map((w, i) => {
      const uid = w.userId ?? w.userID ?? w.uid // primary: userId
      const userDisplay = uid ? `<@uid:${uid}>` : 'Unknown user'
      const amount = Math.round(Number(w.amountWon) || 0).toLocaleString()
      const num = (w.winningNumber ?? '?')
      const dateStr = w.date || 'unknown date'
      return `${i + 1}. ${userDisplay}: Won $${amount} with number ${num} on ${dateStr}`
    })

    const finalMessage = `💰 💵 **Lottery Winners List** 💵 💰\n\n${formattedWinners.join('\n')}`
    await postMessage({ room: process.env.ROOM_UUID, message: finalMessage })
  } catch (error) {
    console.error('Error fetching or displaying lottery winners:', error)
    await postMessage({ room: process.env.ROOM_UUID, message: 'There was an error fetching the lottery winners list.' })
  }
}

  /// ///////////////////// SLOTS //////////////////////////////
  if (payload.message.startsWith('/slots')) {
    try {
      const args = payload.message.trim().split(' ')
      let betAmount = 1 // Default bet amount

      if (args.length > 1) {
        betAmount = parseFloat(args[1])
        if (isNaN(betAmount) || betAmount <= 0) {
          // Handle invalid bet amount
          await postMessage({
            room,
            message: 'Please provide a valid bet amount.'
          })
          return
        }
      }

      const userUUID = payload.sender // Adjust this based on how you get userUUID

      const response = await handleSlotsCommand(userUUID, betAmount) // Pass bet amount
      await postMessage({
        room,
        message: response
      })
    } catch (err) {
      console.error('Error processing the /slots command:', err)
      await postMessage({
        room,
        message: 'An error occurred while processing your slots game.'
      })
    }
  } else if (payload.message.startsWith('/slotinfo')) {
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
  `

    // Send the slot information as a message
    await postMessage({
      room,
      message: infoMessage
    })
  } else if (payload.message.startsWith('/jackpot')) {
  // Get the current jackpot value
    const jackpotValue = getJackpotValue()

    // Round the jackpot value to two decimal places
    const roundedJackpotValue = jackpotValue.toFixed(2)

    // Send the jackpot value as a message
    await postMessage({
      room,
      message: `🎰 The current progressive jackpot is: $${roundedJackpotValue}!`
    })
  }

  /// ////////////////// BLACKJACK /////////////////////////

if (payload.message.startsWith('/blackjack')) {
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)
  const room = process.env.ROOM_UUID

  if (gameState.active) {
    await postMessage({ room, message: 'A blackjack game is already in progress! Please wait for the next round.' })
    return
  }

  await postMessage({ room, message: '🃏 Blackjack game starting in 30 seconds! Type /join to sit at the table.' })

  if (!gameState.tableUsers.includes(userUUID)) {
    await joinTable(userUUID, nickname)
  }

  gameState.canJoinTable = true

  setTimeout(async () => {
    gameState.canJoinTable = false
    await postMessage({ room, message: 'All players please place your bets using /bet [amount].' })
  }, 30000)

  return
}

// Player joins
if (payload.message.startsWith('/join')) {
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)
  const room = process.env.ROOM_UUID

  if (!gameState.active && !gameState.canJoinTable) {
    await postMessage({ room, message: 'No active blackjack lobby. Start one with /blackjack.' })
    return
  }

  await joinTable(userUUID, nickname)
  return
}

// Player leaves (optional command)
if (payload.message.startsWith('/leave')) {
  const userUUID = payload.sender
  await leaveTable(userUUID)
  return
}

// Place bet
if (payload.message.startsWith('/bet')) {
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)
  const room = process.env.ROOM_UUID
  const amountStr = payload.message.split(' ')[1]
  const betAmount = parseInt(amountStr, 10)

  if (gameState.active) {
    await postMessage({ room, message: 'Game already started. Please wait for the next round.' })
    return
  }

  if (!gameState.tableUsers.includes(userUUID)) {
    await postMessage({ room, message: 'You must join the blackjack table first using /join.' })
    return
  }

  if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
    await postMessage({ room, message: 'Please enter a valid bet amount (e.g. /bet 50).' })
    return
  }

  await handleBlackjackBet(userUUID, betAmount, nickname)
  return
}

// Player hits
if (payload.message.startsWith('/hit')) {
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)

  if (!gameState.tableUsers.includes(userUUID)) {
    await postMessage({ room: process.env.ROOM_UUID, message: 'You must join the blackjack table first using /join.' })
    return
  }

  await handleHit(userUUID, nickname)
  return
}

// Player stands
if (payload.message.startsWith('/stand')) {
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)

  if (!gameState.tableUsers.includes(userUUID)) {
    await postMessage({ room: process.env.ROOM_UUID, message: 'You must join the blackjack table first using /join.' })
    return
  }

  await handleStand(userUUID, nickname)
  return
}

if (payload.message.startsWith('/split')) {
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)
  const room = process.env.ROOM_UUID

  if (!gameState.tableUsers.includes(userUUID)) {
    await postMessage({ room, message: 'You must join the blackjack table first using /join.' })
    return
  }

  const hand = gameState.playerHands[userUUID]
  if (!hand || !canSplitHand(hand)) {
    await postMessage({ room, message: `${nickname}, you can only split if you have two cards of the same value.` })
    return
  }

  const extraBet = gameState.playerBets[userUUID]
  const balance = await getUserWallet(userUUID)
  if (balance < extraBet) {
    await postMessage({ room, message: `${nickname}, you don't have enough money to split (requires another $${extraBet}).` })
    return
  }

  await removeFromUserWallet(userUUID, extraBet)
  const card1 = hand[0]
  const card2 = hand[1]

  // Create two hands, each gets 1 extra card
  const newHand1 = [card1, gameState.deck.pop()]
  const newHand2 = [card2, gameState.deck.pop()]

  gameState.splitHands[userUUID] = [newHand1, newHand2]
  gameState.splitIndex[userUUID] = 0
  gameState.playerBets[userUUID] = extraBet // each hand treated as full bet
  gameState.playerHands[userUUID] = newHand1

  await postMessage({ room, message: `${nickname} has split their hand! Playing first hand:` })
  await postMessage({ room, message: formatHandWithValue(newHand1) })
  return
}


// Player surrenders
if (payload.message.startsWith('/surrender')) {
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)

  if (!gameState.tableUsers.includes(userUUID)) {
    await postMessage({ room: process.env.ROOM_UUID, message: 'You must join the blackjack table first using /join.' })
    return
  }

  await handleSurrender(userUUID, nickname)
  return
}

// Player doubles down
if (payload.message.startsWith('/double')) {
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)

  if (!gameState.tableUsers.includes(userUUID)) {
    await postMessage({ room: process.env.ROOM_UUID, message: 'You must join the blackjack table first using /join.' })
    return
  }

  await handleDouble(userUUID, nickname)
  return
}

// Show table state
if (payload.message.startsWith('/table')) {
  const room = process.env.ROOM_UUID
  const tableMessage = getFullTableView()
  await postMessage({ room, message: tableMessage || '🪑 No one is at the table yet.' })
  return
}

  /// ////////////// MOD Commands ///////////////////////////
   else if (payload.message.startsWith('/addmoney')) {
  const senderUuid = payload.sender;
  const userIsOwner = await isUserOwner(senderUuid, ttlUserToken);

  if (!userIsOwner) {
    await postMessage({
      room,
      message: 'Only Rsmitty can use this command...You greedy bastard!'
    });
    return;
  }

  const args = payload.message.split(' ').slice(1);
  if (args.length !== 2) {
    await postMessage({
      room,
      message: 'Usage: /addmoney <@User> <amount>'
    });
    return;
  }

  const mention = args[0];
  const amount = parseFloat(args[1]);

  if (isNaN(amount) || amount <= 0) {
    await postMessage({
      room,
      message: 'Please provide a valid amount greater than zero.'
    });
    return;
  }

  // Extract the UID from the format <UID:uuid>
  const uidMatch = mention.match(/<@uid:([\w-]+)>/i);
  if (!uidMatch) {
    await postMessage({
      room,
      message: 'Please mention a user like this: @User'
    });
    return;
  }

  const userUuid = uidMatch[1];

  // Call the addDollarsByUUID function
  await addDollarsByUUID(userUuid, amount);

  // Confirm to the room
  await postMessage({
    room,
    message: `💸 Added $${amount} to user <@uid:${userUuid}>'s wallet.`
  });
  
  /// ///////////////// BOT PROFILE UPDATES //////////////////////
} else if (payload.message.startsWith('/bot1')) {
  await handleBot1Command(room, postMessage, isUserAuthorized, payload.sender, ttlUserToken)

} else if (payload.message.startsWith('/bot2')) {
  await handleBot2Command(room, postMessage, isUserAuthorized, payload.sender, ttlUserToken)

  } else if (payload.message.startsWith('/botpenguin')) {
    await handleBotPenguinCommand(room, postMessage, isUserAuthorized, payload.sender, ttlUserToken)
  
  } else if (payload.message.startsWith('/botwalrus')) {
    await handleBotWalrusCommand(room, postMessage, isUserAuthorized, payload.sender, ttlUserToken)
  
  } else if (payload.message.startsWith('/botalien2')) {
    await handleBotAlien2Command(room, postMessage, isUserAuthorized, payload.sender, ttlUserToken)
  
  } else if (payload.message.startsWith('/botalien1')) {
    await handleBotAlienCommand(room, postMessage, isUserAuthorized, payload.sender, ttlUserToken)
  
  } else if (payload.message.startsWith('/botduck')) {
    await handleBotDuckCommand(room, postMessage, isUserAuthorized, payload.sender, ttlUserToken)
  
  } else if (payload.message.startsWith('/botdino')) {
      await handleBotDinoCommand(room, postMessage, isUserAuthorized, payload.sender, ttlUserToken)
    }
////////////////////// USER AVATAR UPDATES /////////////////////////////////

  else if (payload.message.startsWith('/dino')) {
    await handleDinoCommand(payload.sender, room, postMessage)
  }
  else if (payload.message.startsWith('/walrus')) {
    await handleWalrusCommand(payload.sender, room, postMessage)
  }
  else if (payload.message.startsWith('/vibeguy')) {
    await handleVibesGuyCommand(payload.sender, room, postMessage)
  }
  else if (payload.message.startsWith('/vibesguy')) {
    await handleVibesGuyCommand(payload.sender, room, postMessage)
  }
  else if (payload.message.startsWith('/faceguy')) {
    await handleFacesCommand(payload.sender, room, postMessage)
  }
  else if (payload.message.startsWith('/duck')) {
    await handleDuckCommand(payload.sender, room, postMessage)
  }

  else if (payload.message.startsWith('/spacebear')) {
    await handleSpaceBearCommand(payload.sender, room, postMessage)
  }
  else if (payload.message.startsWith('/cyber')) {
    await handleRandomCyberCommand(payload.sender, room, postMessage)
  }

else if (payload.message.startsWith('/randomavatar')) {
  await handleRandomAvatarCommand(payload.sender, room, postMessage)
}

////////////////////////// Add Avatar //////////////////////////
else if (payload.message.startsWith('/addavatar')) {
  await handleAddAvatarCommand(payload.sender, room, postMessage)
}
  else if (payload.message === '/reviewhelp') {
    const helpMessage = `🎧 **How Reviews Work**  
  You can rate each song from **1 to 6** while it plays. 
  Each number has a specific meaning:
  
  1️⃣ – **Terrible**: Actively disliked it  
  2️⃣ – **Bad**: Not for me  
  3️⃣ – **Okay**: Meh, it's fine  
  4️⃣ – **Good**: I liked it  
  5️⃣ – **Great**: Really enjoyed it  
  6️⃣ – **Banger**: Loved it, elite track
  
  📝 **Commands**:  
  /review <1-6> – Submit a review for the current song  
  /rating – See the average rating for the current song
  /topsongs – See the top 5 highest rated songs 
  /reviewhelp – Show this review guide  
  /albumreview <1-6> – Submit a review for the albums
  /topalbums – See the top 5 highest rated albums 
  /mytopalbums – See your personal top 5 highest rated albums 

  Reviews contribute to the song’s overall score in the stats. Thanks for sharing your taste! 🎶`
  
    await postMessage({
      room,
      message: helpMessage
    })
  }

   else if (payload.message.startsWith('/review')) {
  const rating = parseInt(payload.message.replace('/review', '').trim(), 10);
  const sender = payload.sender;

  if (isNaN(rating) || rating < 1 || rating > 6) {
    await postMessage({
      room,
      message: `${await getUserNickname(sender)} please enter a number between 1 and 6 to review the song.`
    });
    return;
  }

  // 1️⃣ Try in-memory first
  let song = (roomBot.currentSong && roomBot.currentSong.trackName && roomBot.currentSong.artistName)
    ? roomBot.currentSong
    : null;

  // 2️⃣ Fall back to DB if needed
  if (!song) {
    const row = getCurrentState();
    if (row && row.trackName && row.artistName) {
      song = {
        songId:     row.songId,
        trackName:  row.trackName,
        artistName: row.artistName,
        albumName:  row.albumName,
        // any other fields your saveSongReview needs…
      };
    }
  }

  if (!song) {
    await postMessage({
      room,
      message: `No song is currently playing. Try again in a moment.`
    });
    return;
  }

  // Call your existing review saver
  const result = await saveSongReview({
    currentSong: song,
    rating,
    userId: sender
  });

  if (result.success) {
    await postMessage({
      room,
      message: `<@uid:${sender}> thanks! Your ${rating}/6 song review has been saved.`
    });
  } else if (result.reason === 'duplicate') {
    await postMessage({
      room,
      message: `<@uid:${sender}> you've already reviewed this song.`
    });
  } else if (result.reason === 'not_found') {
    await postMessage({
      room,
      message: `Song not found in stats.`
    });
  } else {
    await postMessage({
      room,
      message: `Oops! Couldn't save your review. Try again later.`
    });
  }
  }
  else if (payload.message.startsWith('/topsongs')) {
  try {
    const topReviewedSongs = db.prepare(`
      SELECT 
        rs.trackName,
        rs.artistName,
        rs.spotifyTrackId,
        AVG(sr.rating) AS averageReview,
        COUNT(sr.rating) AS reviewCount
      FROM room_stats rs
      JOIN song_reviews sr ON rs.songId = sr.songId
      WHERE rs.spotifyTrackId IS NOT NULL
      GROUP BY rs.songId
      HAVING reviewCount > 0
      ORDER BY averageReview DESC
      LIMIT 5
    `).all()

    if (topReviewedSongs.length === 0) {
      await postMessage({ room, message: 'No reviewed songs found yet.' })
      return
    }

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']
    const customDataSongs = []

    for (let i = 0; i < topReviewedSongs.length; i++) {
      const song = topReviewedSongs[i]
      const emoji = numberEmojis[i] || `#${i + 1}`

      try {
        const songData = await fetchSongData(song.spotifyTrackId)

        const reviewText = `${parseFloat(song.averageReview).toFixed(1)}⭐ from ${song.reviewCount} review${song.reviewCount > 1 ? 's' : ''}`
        const songLabel = `*${song.artistName} – ${song.trackName}*`

        await postMessage({
          room,
          message: `${emoji} ${songLabel} (${reviewText})`,
          customData: {
            songs: [
              {
                song: {
                  ...songData,
                  musicProviders: songData.musicProvidersIds,
                  status: 'SUCCESS'
                }
              }
            ]
          }
        })

      } catch (err) {
        console.error(`❌ Failed to fetch song data for ${song.trackName}:`, err.message)
      }
    }
  } catch (err) {
    console.error('❌ Error generating /topsongs:', err.message)
    await postMessage({
      room,
      message: 'Error loading top songs. Please try again later.'
    })
  }
}
  
  else if (payload.message.startsWith('/mytopsongs')) {
    const userId = payload.sender
    const topSongs = getUserSongReviews(userId, 5)
  
    if (!topSongs.length) {
      await postMessage({
        room,
        message: `${await getUserNickname(userId)} you haven't rated any songs yet. Start rating with /songreview! 🎵`
      })
      return
    }
  
    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']
    const customDataSongs = []
  
    for (let i = 0; i < topSongs.length; i++) {
      const song = topSongs[i]
      const emoji = numberEmojis[i] || `#${i + 1}`
  
      try {
        const songData = await fetchSongData(song.spotifyTrackId)
  
        const songLabel = `*${song.artistName} – ${song.trackName}*`
        const ratingText = `Your rating: ${song.rating}/6 ⭐`
  
        // Send each song message with custom data
        await postMessage({
          room,
          message: `${emoji} ${songLabel} (${ratingText})`,
          customData: {
            songs: [
              {
                song: {
                  ...songData,
                  musicProviders: songData.musicProvidersIds,
                  status: 'SUCCESS'
                }
              }
            ]
          }
        })
  
        // Optionally collect for bulk post later
        customDataSongs.push({
          song: {
            ...songData,
            musicProviders: songData.musicProvidersIds,
            status: 'SUCCESS'
          }
        })
  
      } catch (err) {
        console.error(`Failed to fetch song data for ${song.trackName}:`, err.message)
      }
    }
  
  
  
} else if (payload.message.startsWith('/topalbums')) {
  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']
  const topAlbums =  getTopAlbumReviews(5)

  if (!topAlbums || topAlbums.length === 0) {
    await postMessage({
      room,
      message: `🎵 No album reviews found yet! Start rating albums with /albumreview to get featured here! 🎵`
    })
    return
  }

  await postMessage({
    room,
    message: `🎶 *Top Album Reviews* 🎶`
  })

  for (const [i, album] of topAlbums.entries()) {
    const rankEmoji = numberEmojis[i] || `${i + 1}.`
    const avg = typeof album.averageReview === 'number' ? album.averageReview.toFixed(2) : 'N/A'
    const reviewCount = album.reviews?.length || 0

    await postMessage({
      room,
      message: `${rankEmoji} *"${album.albumName}"* by *${album.artistName}*\n   ➤ ⭐ Average Rating: ${avg}/6 (${reviewCount} review${reviewCount === 1 ? '' : 's'})`
    })

    if (album.albumArt) {
      await postMessage({
        room,
        message: `🖼️ Cover Art for "${album.albumName}"`,
        images: [album.albumArt]
      })
    }
  }


} else if (payload.message.startsWith('/mytopalbums')) {
  const userId = payload.sender
  const userAlbums = getUserAlbumReviews(userId, 5)

  if (!userAlbums || userAlbums.length === 0) {
    await postMessage({
      room,
      message: `🎵 ${await getUserNickname(userId)} you haven't rated any albums yet! Use /albumreview to start rating.`
    })
    return
  }

  await postMessage({
    room,
    message: `🎶 *Your Top Album Ratings* 🎶`
  })

  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']

  for (const [i, album] of userAlbums.sort((a, b) => b.rating - a.rating).entries()) {
    const rankEmoji = numberEmojis[i] || `${i + 1}.`
    await postMessage({
      room,
      message: `${rankEmoji} *"${album.albumName}"* by *${album.artistName}*\n   ➤ ⭐ Your Rating: ${album.rating}/6`
    })

    if (album.albumArt) {
      await postMessage({
        room,
        message: `🖼️ Cover Art for "${album.albumName}"`,
        images: [album.albumArt]
      })
    }
  }


 } else if (payload.message === '/rating') {
    const currentSong = roomBot.currentSong
    if (!currentSong || !currentSong.trackName || !currentSong.artistName) {
      await postMessage({
        room,
        message: `No song is currently playing. Try again in a moment.`
      })
      return
    }
  
    const ratingInfo = await getAverageRating(currentSong)
  
    if (!ratingInfo.found) {
      await postMessage({
        room,
        message: `No reviews for "${currentSong.trackName}" by ${currentSong.artistName} yet.`
      })
    } else {
      await postMessage({
        room,
        message: `"${currentSong.trackName}" by ${currentSong.artistName} has an average rating of ${ratingInfo.average}/6 from ${ratingInfo.count} review${ratingInfo.count === 1 ? '' : 's'}.`
      })
    }
  


 } else if (payload.message.startsWith('/albumreview')) {
  const rating = parseInt(payload.message.replace('/albumreview', '').trim(), 10);
  const sender = payload.sender;

  // 1️⃣ Validate rating
  if (isNaN(rating) || rating < 1 || rating > 6) {
    await postMessage({
      room,
      message: `${await getUserNickname(sender)} please enter a number between 1 and 6 to rate the album.`
    });
    return;
  }

  // 2️⃣ Try in-memory first
  let album = (roomBot.currentAlbum && roomBot.currentAlbum.albumID && roomBot.currentAlbum.albumName)
    ? roomBot.currentAlbum
    : null;

  // 3️⃣ Fallback to DB if needed
  if (!album) {
    const row = getCurrentState();  // from dbcurrent.js
    if (row && row.albumAlbumID && row.albumNameField) {
      album = {
        albumID:    row.albumAlbumID,
        albumName:  row.albumNameField,
        artistName: row.albumArtistName,
        trackCount: row.totalTracks,         // or row.trackCount if you stored it
        albumArt:   row.albumArtField
      };
    }
  }

  // 4️⃣ If still no album, abort
  if (!album) {
    await postMessage({
      room,
      message: `No album info is available to rate. Wait until the next album starts.`
    });
    return;
  }

  // 5️⃣ Save the review
  const result = await saveAlbumReview({
    albumId:    album.albumID,
    albumName:  album.albumName,
    albumArt:   album.albumArt,
    artistName: album.artistName,
    trackCount: album.trackCount,
    userId:     sender,
    rating
  });

  // 6️⃣ Respond
  if (result.success) {
    await postMessage({
      room,
      message: `${await getUserNickname(sender)} thanks! Your album review (${rating}/6) was saved. Current avg: ${result.average}/6.`
    });
  } else {
    await postMessage({
      room,
      message: `Something went wrong saving your album review. Try again later.`
    });
  }
}
      
   else if (payload.message.startsWith('/room')) {
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

      const theme = payload.message.replace('/room', '').trim()
      if (!theme) {
        await postMessage({
          room,
          message: 'Please specify a room design. Available options: Barn, Festival, Underground, Tomorrowland, Classic.'
        })
        return
      }

      const roomLower = theme.toLowerCase()
      let updatePayload = null

      const designMap = {
        yacht: 'YACHT',
        barn: 'BARN',
        festival: 'FESTIVAL',
        underground: 'UNDERGROUND',
        tomorrowland: 'TOMORROWLAND',
        classic: 'CLUB',
        'turntable classic': 'CLUB',
        ferry: 'FERRY_BUILDING',
        'ferry building': 'FERRY_BUILDING',
        stadium: 'STADIUM',
        theater: 'THEATER',
        lights: 'CHAT_ONLY',
        dark: 'CHAT_ONLY'
      }

      if (designMap[roomLower]) {
        updatePayload = { design: designMap[roomLower] }
      } else {
        await postMessage({
          room,
          message: `Invalid room design: ${theme}. Available options: Yacht, Barn, Festival, Underground, Tomorrowland, Classic, Ferry, Stadium, Theater, or Dark.`
        })
        return
      }

      // Apply the design update
      await updateRoomInfo(updatePayload)

      await postMessage({
        room,
        message: `Room design updated to: ${designMap[roomLower]}`
      })
    } catch (error) {
      console.error('Error updating room design:', error)
      await postMessage({
        room,
        message: `Error: ${error.message}`
      })
    }
  } else if (payload.message.startsWith('/addsong')) {
  try {
    const isBeachCommand = payload.message.trim().toLowerCase() === '/addsong beach';

    const spotifyTrackId = roomBot.currentSong?.spotifyTrackId;
    console.log('Current song track ID:', spotifyTrackId);

    if (!spotifyTrackId) {
      await postMessage({
        room,
        message: 'No track is currently playing or track ID is invalid.'
      });
      return;
    }

    const trackUri = `spotify:track:${spotifyTrackId}`;
    console.log('Track URI:', trackUri);

    // Choose playlist ID based on command type
    const playlistId = isBeachCommand
      ? process.env.BEACH_PLAYLIST_ID
      : process.env.DEFAULT_PLAYLIST_ID;

    if (!playlistId) {
      await postMessage({
        room,
        message: 'Playlist ID is missing from environment variables.'
      });
      return;
    }

    const playlistTracks = await fetchSpotifyPlaylistTracks(playlistId);
    const playlistTrackURIs = playlistTracks.map(track => track.track.uri);

    if (playlistTrackURIs.includes(trackUri)) {
      await postMessage({
        room,
        message: 'Track is already in the playlist!'
      });
    } else {
      const snapshotId = await addTracksToPlaylist(playlistId, [trackUri]);
      if (snapshotId) {
        await postMessage({
          room,
          message: `Track added to ${isBeachCommand ? 'beach' : 'default'} playlist!`
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

    const isBeachCommand = payload.message.trim().toLowerCase() === '/removesong beach';
    const playlistId = isBeachCommand
      ? process.env.BEACH_PLAYLIST_ID
      : process.env.DEFAULT_PLAYLIST_ID;

    // Get track ID from currently playing song
    const spotifyTrackId = roomBot.currentSong?.spotifyTrackId;
    if (!spotifyTrackId) {
      await postMessage({
        room,
        message: 'No track is currently playing or track ID is invalid.'
      });
      return;
    }

    const trackUri = `spotify:track:${spotifyTrackId}`;

    const snapshotId = await removeTrackFromPlaylist(playlistId, trackUri);

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

 } else if (/^\/infotone\b/i.test(payload.message)) {
  try {
    const senderUuid = payload.sender
    const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isAuthorized) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }

    const VALID_TONES = ['neutral','playful','cratedigger','hype','classy','chartbot','djtech','vibe']
    const ALIAS = {
      // legacy + shortcuts
      nerd: 'cratedigger', crate: 'cratedigger', digger: 'cratedigger',
      n: 'neutral', neutral: 'neutral',
      p: 'playful', fun: 'playful', playful: 'playful',
      hype: 'hype', amp: 'hype',
      classy: 'classy', formal: 'classy',
      chart: 'chartbot', charts: 'chartbot', chartbot: 'chartbot',
      tech: 'djtech', djtech: 'djtech',
      vibe: 'vibe', chill: 'vibe'
    }

    const args = payload.message.trim().split(/\s+/).slice(1)
    const current = getNowPlayingInfoBlurbTone()

    // No args or help → show current + options
    if (args.length === 0 || /^(help|\?)$/i.test(args[0] || '')) {
      const tones = VALID_TONES
      const aliases = ['nerd→cratedigger','fun→playful','chart→chartbot','tech→djtech','chill→vibe']
      await postMessage({
        room,
        message:
`ℹ️ Info Blurb Tone
- Current: ${current}
- Available: ${tones.join(', ')}
- Set: /infotone <tone>`
      })
      return
    }

    // Resolve desired tone
    const raw = String(args[0] || '').toLowerCase()
    const wanted = ALIAS[raw] || raw

    if (!VALID_TONES.includes(wanted)) {
      await postMessage({
        room,
        message:
`Invalid tone.
- Available: ${VALID_TONES.join(', ')}
- Try: /infotone neutral`
      })
      return
    }

    if (wanted === current) {
      await postMessage({ room, message: `Info blurb tone is already set to ${current}.` })
      return
    }

    setNowPlayingInfoBlurbTone(wanted) // persists to DB
    await postMessage({ room, message: `Info blurb tone set to ${wanted}.` })
  } catch (error) {
    console.error('Error setting info blurb tone:', error)
    await postMessage({ room, message: 'Error setting info blurb tone. Try again.' })
  }

  } else if (payload.message.startsWith('/status')) {
  try {
    const autobopStatus     = roomBot.autobop ? 'enabled' : 'disabled'
    const songStatsStatus   = isSongStatsEnabled() ? 'enabled' : 'disabled'
    const greetUserStatus   = greetingMessagesEnabled ? 'enabled' : 'disabled'
    const infoBlurbStatus  = isNowPlayingInfoBlurbEnabled() ? 'enabled' : 'disabled'
    const infoTone         = getNowPlayingInfoBlurbTone()

    const statusMessage =
      `Bot Mod Toggles:
      - Autobop: ${autobopStatus}
      - Song stats: ${songStatsStatus}
      - Greet users: ${greetUserStatus}
      - Info blurb: ${infoBlurbStatus} (tone: ${infoTone})`

    await postMessage({ room, message: statusMessage })
  } catch (error) {
    console.error('Error getting status:', error)
    await postMessage({ room, message: 'An error occurred while getting status. Please try again.' })
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
       enableSongStats()
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

       disableSongStats()
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
} else if (/^\/greet(\b|$)/i.test(payload.message)) {
  const room = process.env.ROOM_UUID
  const parts = payload.message.trim().split(/\s+/)
  const sub = (parts[1] || '').toLowerCase()

  if (sub === 'standard') {
    enableGreetingMessages()
    disableAIGreeting()
    await postMessage({
      room,
      message: '👋 Greeting mode: **STANDARD** (Standard=ON, AI=OFF). Custom greets still take priority.'
    })
    return
  }

  if (sub === 'ai') {
    // AI greets first; standard stays ON for fallback
    enableGreetingMessages()
    enableAIGreeting()
    await postMessage({
      room,
      message: '🧠 Greeting mode: **AI** (AI=ON, Standard=ON as fallback). Custom greets still take priority.'
    })
    return
  }

  if (sub === 'status') {
    await postMessage({
      room,
      message:
        `📊 Greeting status:\n` +
        `• Standard: ${greetingMessagesEnabled ? 'ON' : 'OFF'}\n` +
        `• AI: ${aiGreetingEnabled ? 'ON' : 'OFF'}\n` +
        `Precedence: custom > AI (if ON) > standard (if ON)`
    })
    return
  }

  if (sub === 'off' || payload.message.toLowerCase() === '/greetoff') {
    disableAIGreeting()
    disableGreetingMessages()
    await postMessage({
      room,
      message: '🙈 Greeting mode: **OFF** (Standard=OFF, AI=OFF). Custom greets still fire if configured.'
    })
    return
  }

  // Help / usage
  await postMessage({
    room,
    message:
      `Usage:\n` +
      `• /greet standard — Standard greeting ON, AI OFF\n` +
      `• /greet ai — AI greeting ON (standard kept ON as fallback)\n` +
      `• /greet status — Show current settings\n` +
      `• /greetoff — Turn both OFF\n\n` +
      `Current: Standard=${greetingMessagesEnabled ? 'ON' : 'OFF'}, AI=${aiGreetingEnabled ? 'ON' : 'OFF'}`
  })
  return

    // --- Info blurb ON ---
} else if (/^\/infoon\b/i.test(payload.message)) {
  try {
    const senderUuid = payload.sender
    const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isAuthorized) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
    enableNowPlayingInfoBlurb()
    await postMessage({ room, message: 'Info blurb enabled.' })
  } catch (error) {
    console.error('Error enabling info blurb:', error)
    await postMessage({ room, message: `Error: ${error.message}` })
  }

// --- Info blurb OFF ---
} else if (/^\/infooff\b/i.test(payload.message)) {
  try {
    const senderUuid = payload.sender
    const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isAuthorized) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
    disableNowPlayingInfoBlurb()
    await postMessage({ room, message: 'Info blurb disabled.' })
  } catch (error) {
    console.error('Error disabling info blurb:', error)
    await postMessage({ room, message: `Error: ${error.message}` })
  }

// --- One-command toggle ---
} else if (/^\/infotoggle\b/i.test(payload.message)) {
  try {
    const senderUuid = payload.sender
    const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isAuthorized) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
    if (isNowPlayingInfoBlurbEnabled()) {
      disableNowPlayingInfoBlurb()
      await postMessage({ room, message: 'Info blurb disabled.' })
    } else {
      enableNowPlayingInfoBlurb()
      await postMessage({ room, message: 'Info blurb enabled.' })
    }
  } catch (error) {
    console.error('Error toggling info blurb:', error)
    await postMessage({ room, message: `Error: ${error.message}` })
  }

// --- Set tone: /infotone neutral|playful|nerd ---
} else if (/^\/infotone\b/i.test(payload.message)) {
  try {
    const senderUuid = payload.sender
    const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isAuthorized) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }

    const args = payload.message.trim().split(/\s+/).slice(1)
    const current = getNowPlayingInfoBlurbTone()

    // No args → show current + usage
    if (args.length === 0) {
  const tones = ['- neutral\n','- playful\n','- cratedigger\n','- hype\n','- classy\n','- chartbot\n','- djtech\n','- vibe\n'];
  const aliases = ['nerd→cratedigger','fun→playful','chart→chartbot','tech→djtech','chill→vibe'];

  await postMessage({
    room,
    message:
      `ℹ️ Info Blurb Tone
      • Current: ${current}
      • Available: ${tones.join(', ')}
      • Set: /infotone <tone>`
  });
  return;
}


    // aliases
    const alias = {
      n: 'neutral', neutral: 'neutral',
      p: 'playful', fun: 'playful', playful: 'playful',
      nerd: 'nerd', geek: 'nerd'
    }
    const wanted = alias[args[0].toLowerCase()]

    if (!wanted) {
      await postMessage({ room, message: 'Usage: /infotone neutral|playful|nerd' })
      return
    }

    setNowPlayingInfoBlurbTone(wanted) // persists to DB
    await postMessage({ room, message: `Info blurb tone set to **${wanted}**.` })
  } catch (error) {
    console.error('Error setting info blurb tone:', error)
    await postMessage({ room, message: 'Error setting info blurb tone. Try again.' })
  }
  
    /// ////////////// SPOTIFY STUFF ////////////////////////////
  
  } else if (payload.message.startsWith('/song')) {
  // 1) Try in-memory first
  let song = roomBot.currentSong && roomBot.currentSong.trackName
    ? roomBot.currentSong
    : null;

  // new fallback (correct)
if (!song) {
  const row = getCurrentState();
  if (row?.currentSong?.trackName) {
    const cs = row.currentSong;
    song = {
      trackName:    cs.trackName,
      artistName:   cs.artistName,
      spotifyUrl:   cs.spotifyUrl,
      songDuration: cs.songDuration,
      songId:       cs.songId
    };
  }
}

  if (song) {
    const details = [
      `🎵 Track: ${song.trackName}`,
      `👤 Artist: ${song.artistName}`,
      song.spotifyUrl,
      `⏱ Duration: ${song.songDuration}`,
      `🆔 Song ID: ${song.songId}`
    ].join('\n');

    await postMessage({ room, message: details });
  } else {
    await postMessage({
      room,
      message: 'No song is currently playing.'
    });
  }

  } else if (payload.message.startsWith('/stats')) {
  const currentSong = roomBot.currentSong

  if (!currentSong || !currentSong.songId) {
    await postMessage({
      room,
      message: 'No song is currently playing or missing songId.'
    })
    return
  }

  try {
    const songStats = db
      .prepare('SELECT * FROM room_stats WHERE songId = ?')
      .get(currentSong.songId)

    if (songStats) {
      const message = `📊 Stats for "${songStats.trackName}" by ${songStats.artistName}\n\n` +
        `🟢 Plays: ${songStats.playCount}\n` +
        `👍 Likes: ${songStats.likes}\n` +
        `👎 Dislikes: ${songStats.dislikes}\n` +
        `⭐ Stars: ${songStats.stars || 0}\n` +
        `🕒 Last Played: ${new Date(songStats.lastPlayed).toLocaleString()}`

      await postMessage({ room, message })
    } else {
      await postMessage({
        room,
        message: 'No stats found for this song yet.'
      })
    }
  } catch (error) {
    console.error('Error querying song stats from DB:', error.message)
    await postMessage({
      room,
      message: 'Error retrieving song stats.'
    })
  }
  } else if (payload.message.startsWith('/mostplayed')) {
  try {
    const topPlayed = db.prepare(`
      SELECT trackName, artistName, playCount
      FROM room_stats
      WHERE LOWER(trackName) != 'unknown'
      ORDER BY playCount DESC
      LIMIT 5
    `).all()

    if (topPlayed.length === 0) {
      await postMessage({ room, message: 'No play history found.' })
      return
    }

    const message = `📈 **Most Played Songs:**\n\n` +
      topPlayed.map((song, i) =>
        `${i + 1}. "${song.trackName}" by ${song.artistName} — ${song.playCount} play${song.playCount !== 1 ? 's' : ''}`
      ).join('\n')

    await postMessage({ room, message })
  } catch (error) {
    console.error('❌ Error loading most played songs:', error.message)
    await postMessage({
      room,
      message: 'Error retrieving play count stats.'
    })
  }

  } else if (payload.message.startsWith('/topliked')) {
  try {
    const topLiked = db.prepare(`
      SELECT trackName, artistName, likes
      FROM room_stats
      WHERE LOWER(trackName) != 'unknown'
      ORDER BY likes DESC
      LIMIT 5
    `).all()

    if (topLiked.length === 0) {
      await postMessage({ room, message: 'No like history found.' })
      return
    }

    const message = `❤️ **Top Liked Songs:**\n\n` +
      topLiked.map((song, i) =>
        `${i + 1}. "${song.trackName}" by ${song.artistName} — 👍 ${song.likes}`
      ).join('\n')

    await postMessage({ room, message })
  } catch (error) {
    console.error('❌ Error loading top liked songs:', error.message)
    await postMessage({
      room,
      message: 'Error retrieving like stats.'
    })
  }

  } else if (payload.message === '/album') {
  // 1) In-memory first
  let album = roomBot.currentAlbum?.albumName
    ? roomBot.currentAlbum
    : null;

  // 2) DB fallback
  if (!album) {
    const row = getCurrentState();
    if (row?.currentAlbum?.albumName) {
      album = row.currentAlbum;
    }
  }

  if (album?.albumName) {
    // Build text payload (no image URL in here)
    const lines = [
      `💿 Album: ${album.albumName}`,
      `👤 Artist: ${album.artistName}`,
      album.releaseDate ? `📅 Released: ${album.releaseDate}` : null
    ].filter(Boolean);
    await postMessage({ room, message: lines.join('\n') });

    // Send only the image
    if (album.albumArt) {
      await postMessage({ room, images: [ album.albumArt ] });
    }
  } else {
    await postMessage({
      room,
      message: 'No album is currently playing or album info is missing.'
    });
  }

} else if (payload.message.startsWith('/art')) {
  // 1️⃣ In‐memory first
  let artUrl = roomBot.currentSong?.albumArt || null;

  // 2️⃣ DB fallback
  if (!artUrl) {
    const row = getCurrentState();
    artUrl = row?.albumArt || null;
  }

  if (artUrl) {
    await postMessage({ room, images: [artUrl] });
  } else {
    await postMessage({
      room,
      message: 'No album art available right now.'
    });
  }

  } else if (payload.message.startsWith('/score')) {
  // 1️⃣ In-memory first
  let song = (roomBot.currentSong && roomBot.currentSong.trackName)
    ? roomBot.currentSong
    : null;

  // 2️⃣ DB fallback
  if (!song) {
    const row = getCurrentState();
    if (row && row.trackName) {
      song = {
        trackName:  row.trackName,
        artistName: row.artistName,
        popularity: row.popularity
      };
    }
  }

  if (song) {
    const msg = `🎵 ${song.trackName} by ${song.artistName} has a current popularity score of ${song.popularity} out of 100.`;
    await postMessage({ room, message: msg });
  } else {
    await postMessage({
      room,
      message: 'No song is currently playing or track info is missing.'
    });
  }

  } else if (payload.message.startsWith('/suggestsongs')) {
  
    const recentSongs = readRecentSongs();
  
    if (!recentSongs || recentSongs.length === 0) {
      await postMessage({
        room,
        message: "I don't have any recent songs to suggest right now."
      });
      return;
    }
  
    const suggestedTracks = [];
    const seenArtists = new Set();
    const seenTracks = new Set();
  
    for (const song of recentSongs.slice(0, 5)) {
      const { artistName, trackName } = song;
      const similar = await getSimilarTracks(artistName, trackName);
  
      for (const suggestion of similar) {
        const artist = suggestion.artistName.trim().toLowerCase();
        const track = suggestion.trackName.trim().toLowerCase();
        const uniqueKey = `${artist} - ${track}`;
  
        if (seenArtists.has(artist) || seenTracks.has(uniqueKey)) continue;
  
        seenArtists.add(artist);
        seenTracks.add(uniqueKey);
        suggestedTracks.push(suggestion);
  
        if (suggestedTracks.length >= 5) break;
      }
  
      if (suggestedTracks.length >= 5) break;
    }
  
    const customDataSongs = [];
  
    for (const { trackName, artistName } of suggestedTracks) {
      try {
        const trackDetails = await searchSpotify(artistName, trackName);
        if (trackDetails && trackDetails.spotifyUrl) {
          const songData = await fetchSongData(trackDetails.spotifyTrackID);
          customDataSongs.push({
            song: {
              ...songData,
              musicProviders: songData.musicProvidersIds,
              status: 'SUCCESS'
            }
          });
        }
      } catch (err) {
        console.warn(`❌ Failed to process ${trackName} by ${artistName}:`, err.message);
      }
    }
  
    if (customDataSongs.length > 0) {
      await postMessage({
        room,
        message: '🎧 Here are 5 new songs you might enjoy:',
        customData: { songs: customDataSongs }
      });
    } else {
      await postMessage({
        room,
        message: "Sorry, I couldn't find any playable suggestions from Last.fm."
      });
    }  
    ////////////////// BLACKLIST  //////////////////////////////

  } else if (payload.message.startsWith('/blacklist+')) {
    try {
      const currentSong = roomBot.currentSong
  
      if (!currentSong || !currentSong.trackName || !currentSong.artistName) {
        await postMessage({
          room,
          message: '⚠️ No current song playing or track data unavailable.'
        })
        return
      }
  
      const fs = await import('fs')
      const path = await import('path')
      const blacklistPath = path.join(process.cwd(), 'src/data/songBlacklist.json')
  
      const fullName = `${currentSong.artistName} - ${currentSong.trackName}`
  
      let blacklist = []
      if (fs.existsSync(blacklistPath)) {
        const raw = fs.readFileSync(blacklistPath, 'utf8')
        blacklist = JSON.parse(raw)
      }
  
      if (blacklist.includes(fullName)) {
        await postMessage({
          room,
          message: `⛔️ "${fullName}" is already on the blacklist.`
        })
      } else {
        blacklist.push(fullName)
        fs.writeFileSync(blacklistPath, JSON.stringify(blacklist, null, 2))
        await postMessage({
          room,
          message: `✅ Added "${fullName}" to the blacklist.`
        })
      }
    } catch (err) {
      console.error('Error adding to blacklist:', err)
      await postMessage({
        room,
        message: '🚫 Failed to update blacklist.'
      })
    }
    
   /// /////////////  Trivia Stuff /////////////////////////////
} else if (payload.message.startsWith('/triviastart')) {
  const parts = payload.message.trim().split(' ')
  const rounds = parts[1] ? parseInt(parts[1]) : 1
  await handleTriviaStart(room, rounds)
} else if (['/a', '/b', '/c', '/d'].includes(payload.message.trim().toLowerCase())) {
  await handleTriviaSubmit(payload, room, payload.sender)
} else if (payload.message === '/triviaend') {
  await handleTriviaEnd(room)
} else if (payload.message === '/trivia') {
  await displayTriviaInfo(room)
////////////////////////////////// JAMFLOW STORE ///////////////////////////////////

} else if (payload.message.startsWith('/store')) {
  let storeMessage = '🛒 **Welcome to the JamFlow Store** 🛒\n\nHere’s what you can spend your hard-earned dollars on today:\n';

  for (const [command, value] of Object.entries(storeItems)) {
    if (command.startsWith('---')) {
      storeMessage += `\n\n__**${command.replace(/---/g, '').trim()}**__\n_${value}_\n`;
    } else {
      const costText = typeof value.cost === 'number' ? `$${value.cost}` : value.cost;
      storeMessage += `\`${command}\` — ${value.desc} (${costText})\n`;
    }
  }

  storeMessage += `\n🧾 Type any command to get started.`;

  await postMessage({
    room: payload.room || process.env.ROOM_UUID,
    message: storeMessage
  });

  await postMessage({ room, message: storeMessage })
} else if (payload.message.startsWith('/8ball')) {
  const input = payload.message.trim();
  const args = input.split(' ').slice(1).join(' ').trim(); // get everything after '/8ball'

  if (!args) {
    // User typed only '/8ball' with no question
    await postMessage({
      room,
      message: `🎱 You need to ask a question after the command! Try: /8ball Will I win today?`
    });
    return; // Do NOT charge
  }

  const { cost } = storeItems['/8ball'];
  const uuid = payload.sender;

  // Check balance
  const balance = await getUserWallet(uuid);
  if (balance < cost) {
    await postMessage({
      room,
      message: `💸 Not enough funds! You need $${cost}, but you only have $${balance}.`
    });
    return;
  }

  // Deduct cost
  await removeFromUserWallet(uuid, cost);

  // Get nickname and answer
  const nickname = await getUserNickname(uuid);
  const answer = await askMagic8Ball(uuid, args);

  await postMessage({
    room,
    message: `🎱 ${nickname} \nMagic 8-Ball says: *${answer}*(Cost: $${cost})`
  });
}
  }


export { usersToBeRemoved, userstagedive }
