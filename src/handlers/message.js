// message.js
import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { askQuestion, setCurrentSong } from '../libs/ai.js'
import { handleTriviaStart, handleTriviaEnd, handleTriviaSubmit, displayTriviaInfo } from '../handlers/triviaCommands.js'
import { logger } from '../utils/logging.js'
import { getAlbumsByArtist, getAlbumTracks, isUserAuthorized, fetchSpotifyPlaylistTracks, fetchUserData, fetchSongData, updateRoomInfo, isUserOwner, searchSpotify, getMLBScores, getNHLScores, getNBAScores, getSimilarTracks, getTopChartTracks, addSongsToCrate, getUserToken, clearUserQueueCrate, getUserQueueCrateId, getRandomDogImage, getSpotifyUserId, getUserPlaylists, getPlaylistTracks } from '../utils/API.js'
import { handleLotteryCommand, handleLotteryNumber, handleTopLotteryStatsCommand, handleSingleNumberQuery, handleLotteryCheck, LotteryGameActive, getLotteryWinners } from '../database/dblotterymanager.js'
import { formatMention } from '../utils/names.js'
import { enableSongStats, disableSongStats, isSongStatsEnabled, saveSongReview, getAverageRating } from '../utils/voteCounts.js'
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
  getBalanceByNickname,
  getNicknamesFromWallets,
  addDollarsByUUID,
  loadWallets,
  removeFromUserWallet,
  getUserWallet,
  transferTip,
  addOrUpdateUser,
  getLifetimeNet
} from '../database/dbwalletmanager.js'
import { getJackpotValue, handleSlotsCommand, formatBalance } from './slots.js'
import {
  openBetting, joinTable, leaveTable,
  handleBlackjackBet, handleHit, handleStand, handleDouble, handleSurrender, handleSplit,
  getFullTableView, getPhase
} from '../games/blackjack/blackJack.js'
import { handleDinoCommand, handleBotDinoCommand, handleRandomAvatarCommand, handleBotRandomAvatarCommand, handleSpaceBearCommand, handleBotDuckCommand, handleBotAlien2Command, handleBotAlienCommand, handleWalrusCommand, handleBotWalrusCommand, handleBotPenguinCommand, handleBot2Command, handleBot1Command, handleDuckCommand, handleRandomCyberCommand, handleVibesGuyCommand, handleFacesCommand, handleDoDoCommand, handleFlowerPowerCommand, handleDumDumCommand, handleRandomCosmicCommand, handleRandomLovableCommand, handleBot3Command, handleAnonCommand, handleGhostCommand, handleTeacupCommand, handleBouncerCommand, handleSpookyCommand, handleRecordGuyCommand, handleJukeboxCommand, handleBotSpookyCommand, handleAlienCommand, handleAlien2Command, handleRoyCommand, handleGrimehouseCommand, handleBotStaffCommand, handleBearPartyCommand, handleWinterCommand, handleBotWinterCommand, handleGayCamCommand } from './avatarCommands.js'
import { markUser, getMarkedUser } from '../utils/removalQueue.js'
import { extractUserFromText, isLotteryQuestion } from '../database/dblotteryquestionparser.js'
import { askMagic8Ball } from './magic8Ball.js'
import { storeItems } from '../libs/jamflowStore.js'
import { saveAlbumReview, getTopAlbumReviews, getUserAlbumReviews } from '../database/dbalbumstatsmanager.js'
import { placeSportsBet, resolveCompletedBets } from '../utils/sportsBet.js'
import { handleThemeCommand } from '../database/dbtheme.js'
import { getUserSongReviews } from '../database/dbroomstatsmanager.js'
import { fetchOddsForSport, formatOddsMessage } from '../utils/sportsBetAPI.js'
import { saveOddsForSport, getOddsForSport } from '../utils/bettingOdds.js'
import { startHorseRace, handleHorseBet, isWaitingForEntries, handleHorseEntryAttempt, handleHorseHelpCommand, handleHorseStatsCommand, handleTopHorsesCommand, handleMyHorsesCommand, handleHofPlaqueCommand } from '../games/horserace/handlers/commands.js'
import { QueueManager } from '../utils/queueManager.js'
import db from '../database/db.js'
import { handleAddAvatarCommand } from './addAvatar.js'
import { handleRemoveAvatarCommand } from './removeAvatar.js'
import { enableNowPlayingInfoBlurb, disableNowPlayingInfoBlurb, isNowPlayingInfoBlurbEnabled, setNowPlayingInfoBlurbTone, getNowPlayingInfoBlurbTone } from '../utils/announceNowPlaying.js'
import { routeCrapsMessage } from '../games/craps/craps.single.js'
import { dispatchCommand } from './commandRegistry.js'
import { handleDirectMessage } from './dmHandler.js'
import { getCurrentState } from '../database/dbcurrent.js'
import { usersToBeRemoved } from '../utils/usersToBeRemoved.js'
import { parseTipAmount, randomTipGif, splitEvenly, naturalJoin, getSenderNickname } from '../utils/helpers.js'
import { handleBuyHorse } from '../games/horserace/horseManager.js'
import { handleAddMoneyCommand } from './addMoney.js'

const ttlUserToken = process.env.TTL_USER_TOKEN
export const /* deprecated_roomThemes */roomThemes = {}
const userstagedive = {}

const queueManager = new QueueManager(
  'src/data/djQueue.json', // your file path
  getUserNickname // optional nickname fetcher
)

export async function getUserNickname (userId) {
  return `<@uid:${userId}>`
}

function buildModSheet () {
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
    '- /addDJ   (Bot DJs from the default playlist)',
    '- /addDJ auto (Bot DJs from AI recommendations)',
    '- /addDJ discover (Bot DJs from discover playlists)',
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
    '- /faces'
  ].join('\n')
}

/*
 * The DM admin allow list, helper functions and the DM command handler have
 * been moved to src/handlers/dmHandler.js. Keeping them here would bloat
 * message.js and make maintenance more difficult. See dmHandler.js for the
 * implementation of handleDirectMessage, parseUidFromMention, isDmAdmin and
 * related helpers.
 */

export default async (payload, room, state, roomBot) => {
  // 🚦 Route DMs straight to the DM handler and exit
  const rt = (payload?.receiverType ?? payload?.receiver_type ?? '')
    .toString()
    .toLowerCase()

  if (rt === 'user') {
    try {
      await handleDirectMessage(payload)
    } catch (err) {
      console.error('DM handler error:', err)
    }
    return // important: skip group logic for DMs
  }

  // ── group/room path ───────────────────────────────────────────
  const txt = (payload?.message ?? payload?.data?.text ?? '').trim()
  if (!txt) return

  // 🔧 sanity check route
  if (/^\/ping\b/i.test(txt)) {
    await postMessage({ room, message: 'pong ✅' })
    return
  }

  // ─── HORSE‐RACE ENTRY & COMMANDS ────────────────────────────────────────

  // A) If we're in the 30s entry window, ANY non‐slash chat is an entry
  if (isWaitingForEntries() && typeof payload.message === 'string' && !payload.message.startsWith('/')) {
    console.log('▶ dispatch → entryAttempt')
    await handleHorseEntryAttempt(payload)
    return // no other logic should run
  }

  // B) Start a new race
  if (typeof payload.message === 'string' && payload.message.startsWith('/horserace')) {
    console.log('▶ dispatch → startHorseRace')
    startHorseRace().catch(console.error)
    return
  }

  // C) Place a bet
  // Allow both "/horse[number] [amount]" and "/horse [number] [amount]" forms.
  // The optional whitespace after `/horse` lets users type `/horse2 100` or `/horse 2 100`.
  if (typeof payload.message === 'string' && /^\/horse\s*\d+\s+\d+/.test(payload.message)) {
    console.log('▶ dispatch → handleHorseBet')
    await handleHorseBet(payload)
    return
  }

  // D) Other horse commands
  if (typeof payload.message === 'string' && payload.message.startsWith('/buyhorse')) return handleBuyHorse(payload)
  if (typeof payload.message === 'string' && payload.message.startsWith('/myhorses')) return handleMyHorsesCommand(payload)
  if (typeof payload.message === 'string' && payload.message.startsWith('/horsehelp')) { await handleHorseHelpCommand(payload); return }
  if (typeof payload.message === 'string' && payload.message.startsWith('/horserules')) { await handleHorseHelpCommand(payload); return }
  if (typeof payload.message === 'string' && payload.message.startsWith('/horseinfo')) { await handleHorseHelpCommand(payload); return }
  if (typeof payload.message === 'string' && payload.message.startsWith('/horsestats')) { await handleHorseStatsCommand(payload); return }
  if (typeof payload.message === 'string' && payload.message.startsWith('/tophorses')) return handleTopHorsesCommand(payload)
  if (typeof payload.message === 'string' && payload.message.startsWith('/hof')) {
    await handleHofPlaqueCommand(payload)
    return
  }

  // ─── END HORSE‐RACE BLOCK ────────────────────────────────────────────────

  if (
    /^\/craps\b/i.test(txt) ||
  /^\/(roll|pass|dontpass|come|place|removeplace)\b/i.test(txt) ||
  /^\/join\s+(craps|cr)\b/i.test(txt)
  ) {
    console.log('▶ dispatch → routeCrapsMessage')
    return routeCrapsMessage(payload)
  }

  // ─── END CRAPS BLOCK ──────────────────────────

  // Handle Gifs Sent in Chat
  if (payload?.message?.type === 'ChatGif') {
    logger.info('Received a GIF message:', payload.message)
    return
  }

  // 🎯 Fast path: handle numeric lottery picks immediately
  try {
    if (LotteryGameActive && /^\d{1,3}$/.test(txt.trim())) {
      await handleLotteryNumber(payload)
      return
    }
  } catch (err) {
    logger.error('Error in lottery fast path:', err?.message || err)
  }

  // 🗺️ Central command dispatcher
  try {
    const dispatched = await dispatchCommand(txt, payload, room)
    if (dispatched) return
  } catch (e) {
    logger.error('[Dispatcher] Error dispatching command:', e?.message || e)
  }

  // --- AI helpers -----------------------------------------------------------
  function expandSongQuestion (rawQ, song) {
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
    const q = rawQ
      .replace(/\b(tell me about|what is|what's|info on|details about)\s+(this song)\b/gi, '$1 THE_SONG')
      .replace(/\b(this song|this track|current song|song that is playing)\b/gi, 'THE_SONG')

    return q.replace(
      /THE_SONG/g,
    `this song:\n${songCard}\n\nPlease give a short, fun blurb with notable facts (samples, origin, chart peaks, vibe), then 1 similar-track rec.`
    )
  }
  // Put near expandSongQuestion
  function expandAlbumQuestion (rawQ, albumName, artistName) {
    if (!albumName && !artistName) return rawQ

    const parts = []
    if (albumName) parts.push(`Album: ${albumName}`)
    if (artistName) parts.push(`Artist: ${artistName}`)
    const albumCard = parts.join(' | ')

    const q = rawQ
      .replace(/\u2019/g, "'") // normalize curly apostrophes
      .replace(/\b(tell me about|what is|what's|info on|details about)\s+(this (album|record|lp|ep))\b/gi, '$1 THE_ALBUM')
      .replace(/\b(this (album|record|lp|ep)|current album|album that is playing|the album)\b/gi, 'THE_ALBUM')

    return q.replace(
      /THE_ALBUM/g,
    `this album:\n${albumCard}\n\nPlease give a short, fun blurb (context/era, standout tracks, reception), then 1 similar-album recommendation.`
    )
  }
  function isAlbumQuery (q) {
    const s = (q || '').toLowerCase().replace(/\u2019/g, "'")
    return /\b(what's|what is|tell me about|info on|details about)\s+this\s+(album|record|lp|ep)\b/.test(s) ||
      /\b(this\s+(album|record|lp|ep)|current album|album that is playing)\b/.test(s)
  }

  function extractText (reply) {
    if (!reply) return null
    if (typeof reply === 'string') return reply
    if (reply.text) return reply.text
    if (reply.candidates?.[0]?.content?.parts?.[0]?.text) return reply.candidates[0].content.parts[0].text
    return null
  }

  async function safeAskQuestion (prompt, askFn, logger) {
    try {
      const result = await Promise.race([
        askFn(prompt),
        new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), 45000))
      ])
      const txt = extractText(result)
      if (!txt) throw new Error('AI_EMPTY_RESPONSE')
      return txt.trim()
    } catch (err) {
      logger?.error?.(`[AI] ${err.message || err}`, { err })
      return 'My AI brain buffered too long. Try again in a sec. 😅'
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
  payload.sender !== process.env.BOT_USER_UUID && // ✅ compare directly to UUID
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
          await postMessage({ room, message: 'I tried to hide but tripped over my own code. 🤕' })
        }
        return
      }

      if (question.includes('dj with us') || question.includes('dj with me')) {
        await postMessage({ room, message: "Let's get it" })
        // Engage auto-discover DJ when users ask the bot to DJ with them
        {
          const discoverIdsEnv = process.env.DISCOVER_PLAYLIST_IDS || ''
          let discoverIds = discoverIdsEnv.split(',').map((s) => s.trim()).filter(Boolean)
          if (discoverIds.length === 0) {
            discoverIds = [
              '37i9dQZF1DX4JAvHpjipBk',
              '37i9dQZF1DX5trt9i14X7j',
              '37i9dQZF1DWVqfgj8NZEp1'
            ]
          }
          // Use discover DJ mode when invited to DJ with users.  Enable
          // discover mode on the bot and add the bot to the DJ lineup.  The
          // enableDiscoverDJ method initializes the playlist queue, and
          // addDJ() will draw from that queue.
          if (typeof roomBot.enableDiscoverDJ === 'function') {
            await roomBot.enableDiscoverDJ(discoverIds)
          }
          await roomBot.addDJ()
        }
        return
      }

      if (question.includes('get tf off the stage') || question.includes('stop djing')) {
        await postMessage({ room, message: 'Damn...alright' })
        await roomBot.removeDJ(process.env.BOT_USER_UUID)
        return
      }

      if (question.includes('9+10') || question.includes('9 + 10')) { // ✅
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
          await postMessage({ room, message: 'Who do you want me to check?' })
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

      // --- ALBUM INTENT -----------------------------------------------------

      if (isAlbumQuery(question)) {
        // Try a dedicated album object first; fall back to the song’s album fields
        const currentAlbumName = roomBot.currentAlbum?.albumName ?? roomBot.currentSong?.albumName
        const currentArtistName = roomBot.currentAlbum?.artistName ?? roomBot.currentSong?.artistName

        if (!currentAlbumName && !currentArtistName) {
          await postMessage({ room, message: 'No album info available for the current track.' })
          return
        }

        // Optional: persist if you keep album state (mirrors setCurrentSong)
        if (typeof setCurrentAlbum === 'function') {
          setCurrentAlbum({ albumName: currentAlbumName, artistName: currentArtistName })
        }

        const prompt = expandAlbumQuestion(question, currentAlbumName, currentArtistName)
        console.log('Expanded album prompt for AI:', prompt)
        logger.info('Expanded album prompt for AI prepared')

        const aiReplyText = await safeAskQuestion(prompt, askQuestion, logger)
        console.log('AI Reply (album):', aiReplyText)
        logger.info(`AI Reply (album): ${aiReplyText}`)

        await postMessage({ room, message: aiReplyText })
        return
      }

      // --- OTHER CONTEXT (e.g., popularity explanation) -------------------
      if (question.includes('yankees')) {
        await postMessage({ room, message: 'Who cares?' })
        return
      }

      // default: ask AI with timeout. Use the full askQuestion response so
      // we can handle images as well as text. If images arrive, send them;
      // otherwise send the text (do NOT override text with an image error).
      try {
        const result = await Promise.race([
          askQuestion(question, {
          // ai.js only triggers this when isImageIntent(question) === true
            onStartImage: async () => {
              await postMessage({ room, message: '🎨 Generating image...' })
            }
          }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), 45000))
        ])

        const images = Array.isArray(result?.images)
          ? result.images.filter(u => typeof u === 'string' && u.trim().length > 0)
          : []
        const hasImage = images.length > 0
        const text = (typeof result?.text === 'string' ? result.text.trim() : '')

        if (hasImage) {
          const msg = text || 'Here’s your image!'
          console.log('AI Image Reply:', msg)
          logger.info(`AI Image Reply: ${msg}`, { hasImage: true, count: images.length })
          await postMessage({ room, message: msg, images })
        } else {
          if (text) {
            console.log('AI Text Reply:', text.slice(0, 160))
            logger.info('AI Text Reply', { chars: text.length })
            await postMessage({ room, message: text })
          } else {
            const fallback = 'I’m not sure yet—could you rephrase that?'
            console.log('AI Fallback Reply:', fallback)
            logger.info('AI Fallback Reply', { hasImage: false })
            await postMessage({ room, message: fallback })
          }
        }
      } catch (err) {
        console.error('[AI][default] Error:', err?.message || err)
        logger.error(`[AI][default] Error: ${err?.message || err}`)
        await postMessage({ room, message: 'My AI brain buffered too long. Try again in a sec. 😅' })
      }
    } catch (err) {
      console.error('AI mention handler failed:', err)
      logger.error(`AI mention handler failed: ${err?.message || err}`)
      await postMessage({ room, message: 'My AI hiccuped. Try again.' })
    }
    // ─── NON-MENTION COMMANDS (top-level else-if chain) ──────────────────────
  } if (payload.message.startsWith('/searchalbum')) {
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
      return `\`${index + 1}.\` *${album.name}* — \`ID: ${album.id}\``
    }).join('\n')

    await sendDirectMessage(payload.sender, `🎶 Albums for "${artistName}":\n${albumList}`)
    await postMessage({
      room,
      message: `<@uid:${payload.sender}> I sent you a private message`
    })
  } else if (payload.message.startsWith('/searchplaylist')) {
    const user = payload.sender
    const spotifyUserId = getSpotifyUserId(user)
    if (!spotifyUserId) {
      await postMessage({
        room,
        message: '🔍 *Spotify user ID not found*\n\nWe don\'t have a Spotify user ID associated with your account.  Ask an admin to update the mapping for your TT.fm UUID so you can use /searchplaylist.'
      })
      return
    }
    try {
      const playlists = await getUserPlaylists(spotifyUserId)
      if (!playlists || playlists.length === 0) {
        await postMessage({
          room,
          message: `❌ *No playlists found for your Spotify account \`${spotifyUserId}\`.*`
        })
        return
      }
      const playlistList = playlists.map((pl, index) => {
        return `\`${index + 1}.\` *${pl.name}* — \`ID: ${pl.id}\``
      }).join('\n')
      await sendDirectMessage(user, `📃 Playlists for your Spotify account:\n${playlistList}`)
      await postMessage({
        room,
        message: `<@uid:${user}> I sent you a private message`
      })
    } catch (error) {
      logger.error('Error fetching user playlists', { err: error })
      await postMessage({
        room,
        message: `❌ *Failed to fetch your playlists*\n\`${error.message}\``
      })
    }
  } else if (payload.message.startsWith('/qplaylist')) {
    const playlistId = payload.message.split(' ')[1]?.trim()
    if (!playlistId) {
      await postMessage({
        room,
        message: '⚠️ *Missing Playlist ID*\n\nPlease provide a valid Spotify playlist ID.  \nExample: \`/qplaylist 37i9dQZF1DXcBWIGoYBM5M\`'
      })
      return
    }
    const token = getUserToken(payload.sender)
    if (!token) {
      await postMessage({
        room,
        message: '🔐 *Spotify account not linked*\n\nWe couldn\'t find your access token.  \nPlease contact an admin to link your account to use this command.'
      })
      return
    }
    try {
      await postMessage({
        room,
        message: '📁 *Clearing your current queue...*\n📡 Fetching playlist from Spotify...'
      })
      await clearUserQueueCrate(payload.sender)
      const crateInfo = await getUserQueueCrateId(payload.sender)
      const crateId = crateInfo?.crateUuid
      if (!crateId) {
        await postMessage({
          room,
          message: '❌ *Failed to retrieve your queue ID. Please try again later.*'
        })
        return
      }
      const tracks = await getPlaylistTracks(playlistId)
      if (!tracks || tracks.length === 0) {
        await postMessage({
          room,
          message: `❌ *No tracks found for playlist \`${playlistId}\`.*`
        })
        return
      }
      const formattedTracks = tracks.map(track => ({
        musicProvider: 'spotify',
        songId: track.id,
        artistName: Array.isArray(track.artists) ? track.artists.map(a => a.name).join(', ') : '',
        trackName: track.name,
        duration: Math.floor((track.duration_ms || 0) / 1000),
        explicit: track.explicit,
        isrc: track.external_ids?.isrc || '',
        playbackToken: '',
        genre: ''
      }))
      await addSongsToCrate(crateId, formattedTracks, true, token)
      await postMessage({
        room,
        message: `✅ *Playlist Queued!*\n\n🎵 Added *${formattedTracks.length} track(s)* from playlist \`${playlistId}\` to your queue.  \nPlease refresh your page for the queue to update`
      })
    } catch (error) {
      await postMessage({
        room,
        message: `❌ *Something went wrong while queuing your playlist*  \n\`${error.message}\``
      })
    }
  } else if (payload.message.startsWith('/qalbum')) {
    const albumId = payload.message.split(' ')[1]?.trim()

    if (!albumId) {
      await postMessage({
        room,
        message:
`⚠️ *Missing Album ID*

Please provide a valid Spotify album ID.  
Example: \`/qalbum 4aawyAB9vmqN3uQ7FjRGTy\``
      })
      return
    }

    const token = getUserToken(payload.sender)
    if (!token) {
      await postMessage({
        room,
        message:
`🔐 *Spotify account not linked*

We couldn’t find your access token.  
Please contact an admin to link your account to use this command.`
      })
      return
    }

    try {
      // Step 1: Clear user queue
      await postMessage({
        room,
        message: '📁 *Clearing your current queue...*\n📡 Fetching album from Spotify...'
      })

      await clearUserQueueCrate(payload.sender)

      // Step 2: Get fresh queue ID
      const crateInfo = await getUserQueueCrateId(payload.sender)
      const crateId = crateInfo?.crateUuid
      if (!crateId) {
        await postMessage({
          room,
          message: '❌ *Failed to retrieve your queue ID. Please try again later.*'
        })
        return
      }

      // Step 3: Fetch album tracks
      const tracks = await getAlbumTracks(albumId)
      if (!tracks || tracks.length === 0) {
        await postMessage({
          room,
          message: `❌ *No tracks found for album \`${albumId}\`.*`
        })
        return
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
      }))

      // Step 5: Add to queue
      await addSongsToCrate(crateId, formattedTracks, true, token)

      await postMessage({
        room,
        message:
`✅ *Album Queued!*

🎵 Added *${formattedTracks.length} track(s)* from album \`${albumId}\` to your queue.  
Please refresh your page for the queue to update`
      })
    } catch (error) {
      await postMessage({
        room,
        message:
`❌ *Something went wrong while queuing your album*  
\`\`\`${error.message}\`\`\``
      })
    }

    /// //////////// LOTTERY GAME ////////////////////////////////////////////
  } else if (payload.message.startsWith('/lottery')) {
    try {
      const GifUrl = 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm11bGZ0M3RraXg5Z3Z4ZzZpNjU4ZDR4Y2QwMzc0NWwyaWFlNWU4byZlcD12MV9naWZzX3NlYXJjaCZjdT1n/Ps8XflhsT5EVa/giphy.gif'
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
      const wantModInline = /^(mod|mods|moderator|admin|sheet)$/.test(arg || '')
      const showAll = /^(all|everything)$/.test(arg || '')

      const sections = []

      // Essentials
      sections.push([
        '— Essentials —',
        '- `/theme` — Show current room theme',
        '- `/games` — List available games',
        '- `/escortme` — Stagedive after your next song',
        '- `/dive` — Stagedive now',
        '- `/djbeer` — Give the DJ a beer 🍺'
      ].join('\n'))

      // Music & Stats
      sections.push([
        '— Music & Stats —',
        '- `/album` — Album info for the current song',
        '- `/score` — Spotify popularity score',
        '- `/reviewhelp` — How to review songs ⭐',
        '- `/suggestsongs` — Songs suggested by Allen'
      ].join('\n'))

      // Wallet / Lotteries
      sections.push([
        '— Wallet & Lotto —',
        '- `/bankroll` — Top wallet leaders 💰',
        '- `/lottowinners` — Lottery ball winners 🎱',
        '- `/lottostats` - Most Drawn Lotto Numbers'
      ].join('\n'))

      // Fun / GIFs
      sections.push([
        '— Fun —',
        '- `/gifs` — Show GIF commands',
        '- `/djbeer` — Beer again (because, priorities) 🍺'
      ].join('\n'))

      // Moderator section: show inline only if mod or explicitly asked
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
          '- `/addDJ` | `/removeDJ`'
        ].join('\n'))
      } else {
        sections.push('— Moderator Commands —\n- Mods can DM `/mod` to receive the full list.')
      }

      // Post the assembled commands list
      const message = ['📖 Commands', ...sections].join('\n\n')
      await postMessage({ room, message })

      // If a mod asked `/commands mod`, also DM them the full sheet
      if (wantModInline && isMod) {
        const modSheet = buildModSheet() // assumes you have this helper
        await sendDirectMessage(payload.sender, modSheet)
        await postMessage({ room, message: 'Mod Commands sent via DM' })
      }
    } catch (err) {
      console.error('/commands error:', err)
      await postMessage({ room, message: 'Could not build the commands list.' })
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
  }

  // ===== /gifs (simple readable list with hyphens) =====
  else if (payload.message.startsWith('/gifs')) {
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

  /// //////////// YAY SPORTS!! ////////////////////////
  } else if (payload.message === ('/MLB')) {
    const parts = payload.message.trim().split(' ')
    const requestedDate = parts[1] // optional, format: YYYY-MM-DD

    try {
      // Ensure getMLBScores is properly called and returns a response
      const response = await getMLBScores(requestedDate)
      await postMessage({
        room,
        message: response // Send the response here
      })
    } catch (err) {
      console.error('Error fetching MLB scores:', err)
      await postMessage({
        room,
        message: 'There was an error fetching MLB scores. Please try again later.'
      })
    }
  } else if (payload.message.startsWith('/NHL')) {
    const parts = payload.message.trim().split(' ')
    const requestedDate = parts[1] // optional, format: YYYY-MM-DD

    try {
      // Ensure getNHLscores is properly called and returns a response
      const response = await getNHLScores(requestedDate)
      await postMessage({
        room,
        message: response // Send the response here
      })
    } catch (err) {
      console.error('Error fetching NHL scores:', err)
      await postMessage({
        room,
        message: 'There was an error fetching NHL scores. Please try again later.'
      })
    }
  } else if (payload.message.startsWith('/NBA')) {
    const parts = payload.message.trim().split(' ')
    const requestedDate = parts[1] // optional, format: YYYY-MM-DD

    try {
      // Ensure getNBAscores is properly called and returns a response
      const response = await getNBAScores(requestedDate)
      await postMessage({
        room,
        message: response // Send the response here
      })
    } catch (err) {
      console.error('Error fetching NBA scores:', err)
      await postMessage({
        room,
        message: 'There was an error fetching NBA scores. Please try again later.'
      })
    }

    /// /////////////////////////// SPORTS ODDS /////////////////////////////
  } else if (payload.message === '/mlbodds') {
    try {
      const sport = 'baseball_mlb'
      const data = await fetchOddsForSport(sport)
      if (!data) throw new Error('No data returned')

      saveOddsForSport(sport, data)

      const oddsMsg = formatOddsMessage(data, sport)
      await postMessage({ room, message: oddsMsg })
    } catch (error) {
      console.error('Error fetching or posting MLB odds:', error)
      console.log(oddsMsg)
      await postMessage({ room, message: 'Sorry, something went wrong fetching MLB odds.' })
    }
  } else if (payload.message.startsWith('/sportsbet')) {
    const args = payload.message.trim().split(/\\s+/)
    const senderUUID = payload.sender
    const nickname = await getSenderNickname(senderUUID)
    const room = process.env.ROOM_UUID

    console.log('⚡ /sportsbet command received')
    console.log('Arguments:', args)

    if (args.length < 6) {
      await postMessage({
        room,
        message: 'Usage: /sportsbet SPORT INDEX TEAM TYPE AMOUNT\nExample: /sportsbet mlb 2 NYY ml 50'
      })
      return
    }

    const sportAlias = args[1].toLowerCase()
    const sportMap = {
      mlb: 'baseball_mlb',
      nba: 'basketball_nba',
      nfl: 'americanfootball_nfl',
      nhl: 'icehockey_nhl'
    }
    const sport = sportMap[sportAlias]

    if (!sport) {
      await postMessage({ room, message: 'Unsupported sport. Try: mlb, nba, nfl, nhl' })
      return
    }

    const rawIndex = parseInt(args[2], 10)
    const index = rawIndex - 1 // convert to 0-based index
    const team = args[3]
    const betType = args[4].toLowerCase() // 'ml' or 'spread'
    const amount = parseFloat(args[5])

    if (isNaN(index) || !team || isNaN(amount) || amount <= 0) {
      await postMessage({
        room,
        message: 'Please enter a valid command: /sportsbet SPORT INDEX TEAM TYPE AMOUNT\nExample: /sportsbet mlb 2 NYY ml 50'
      })
      return
    }

    const oddsData = await getOddsForSport(sport)
    if (!oddsData || index < 0 || index >= oddsData.length) {
      await postMessage({
        room,
        message: 'Invalid game index. Use /odds SPORT to see available games.'
      })
      return
    }

    const balance = await getUserWallet(senderUUID)
    if (amount > balance) {
      await postMessage({
        room,
        message: `Insufficient funds, ${nickname}. Your balance is $${balance}.`
      })
      return
    }

    const result = await placeSportsBet(senderUUID, index, team, betType, amount, sport)

    if (typeof result === 'string' && result.startsWith('✅')) {
      await removeFromUserWallet(senderUUID, amount)
    }

    console.log('Bet Result:', result)
    await postMessage({ room, message: result })
  } else if (payload.message.startsWith('/resolvebets')) {
    await resolveCompletedBets()
    await postMessage({
      room,
      message: 'Open bets have been resolved'
    })
    return

    /// ///////////////////////// ////////////////////////////
  } else if (payload.message.startsWith('/test')) {
    await postMessage({
      room,
      message: 'testing!'
    })
  } else if (payload.message.startsWith('/crapsrecord')) {
    // Fetch the current record, preferring the stored nickname in the
    // users table when available. If both the craps_records nickname and
    // users.nickname are empty, fall back to the shooterId.
    const row = db.prepare(`
      SELECT cr.maxRolls,
             COALESCE(NULLIF(cr.shooterNickname, ''), u.nickname, cr.shooterId) AS displayName,
             cr.achievedAt
      FROM craps_records cr
      LEFT JOIN users u ON u.uuid = cr.shooterId
      WHERE cr.roomId = ?
    `).get(room)
    const count = row?.maxRolls ?? 0
    const who = row?.displayName || '—'
    const when = row?.achievedAt || '—'
    return postMessage({
      room,
      message: `🏆 **Current record:** ${count} roll(s) by **${who}**\n🗓️ Set: ${when}`
    })

    /// /////////////// General Commands ////////////////
  } else if (payload.message === '/site') {
    await postMessage({ room, message: 'Jamflow Bot Hub → https://dev.jambot-e72.pages.dev/' })
  } else if (payload.message.startsWith('/tip')) {
    try {
      const senderUUID = payload.sender
      const parts = payload.message.trim().split(/\s+/)

      if (parts.length < 2) {
        await postMessage({ room, message: 'Usage: /tip <amount>' })
        return
      }

      const rawAmountStr = parts.slice(1).join(' ')
      // Strict amount validation: only digits with optional one or two decimal places
      if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(rawAmountStr)) {
        await postMessage({ room, message: 'Please specify a valid dollar amount with up to 2 decimal places (e.g., /tip 5 or /tip 2.50).' })
        return
      }
      const amount = parseTipAmount(rawAmountStr)
      // Enforce minimum and maximum allowed amounts
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
        await postMessage({ room, message: 'Tip amount must be between 0 and 10000 dollars.' })
        return
      }

      // Use the same API you use for /djbeers, then pick the *now-playing* DJ
      const currentDJUUIDs = getCurrentDJUUIDs(state)
      if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
        await postMessage({ room, message: `<@uid:${senderUUID}>, there is no DJ currently playing.` })
        return
      }

      // Convention: index 0 is the currently playing DJ
      const recipientUUID = currentDJUUIDs[0]

      // Prevent tipping yourself
      if (!recipientUUID || recipientUUID === senderUUID) {
        await postMessage({ room, message: 'You cannot tip yourself.' })
        return
      }

      // Verify balance
      const balance = await getUserWallet(senderUUID)
      const numericBalance = Number(balance) || 0
      if (!Number.isFinite(numericBalance) || numericBalance < amount) {
        await postMessage({ room, message: `Insufficient funds. Your balance is $${numericBalance.toFixed(2)}.` })
        return
      }

      // Perform atomic transfer. Ensure the recipient exists in the users table
      try {
        await addOrUpdateUser(recipientUUID)
        transferTip({ fromUuid: senderUUID, toUuid: recipientUUID, amount })
      } catch (err) {
        if (err?.message === 'INSUFFICIENT_FUNDS') {
          await postMessage({ room, message: `Insufficient funds. Your balance is $${numericBalance.toFixed(2)}.` })
        } else {
          console.error('Tip transfer error:', err)
          await postMessage({ room, message: 'Could not complete the tip. Your funds were returned.' })
        }
        return
      }

      // Nice formatting
      const fromName = await getSenderNickname(senderUUID).catch(() => `<@uid:${senderUUID}>`)
      const toMention = `<@uid:${recipientUUID}>`
      const gif = randomTipGif()

      await postMessage({
        room,
        message: `💸 ${fromName} tipped $${amount.toFixed(2)} to ${toMention}!`
      })
      await postMessage({ room, message: '', images: [gif] })
    } catch (error) {
      console.error('Error handling /tip command:', error)
      await postMessage({ room, message: 'An error occurred processing the tip.' })
    }
  } else if (payload.message.startsWith('/addmoney')) {
    const sender = payload.sender
    const parts = payload.message.trim().split(/\s+/)
    const roomId = room // usually comes from payload or your existing scope

    // Only allow in main chat and only from you
    if (roomId !== process.env.ROOM_UUID) return
    if (sender !== process.env.SMITTY_UUID) {
      await postMessage({ room, message: '⛔ /addmoney is restricted.' })
      return
    }

    if (parts.length < 3) {
      await postMessage({ room, message: 'Usage: /addmoney <@User> <amount>' })
      return
    }

    const whoRaw = parts[1]
    const amountRaw = parts[2]
    const match = /<@uid:([\w-]+)>/i.exec(whoRaw)
    const userUuid = match?.[1]
    const amount = Number(amountRaw)

    if (!userUuid || !Number.isFinite(amount) || amount <= 0) {
      await postMessage({
        room,
        message: 'Usage: /addmoney <@User> <amount> (use a proper tag + positive number)'
      })
      return
    }

    try {
      const { addDollarsByUUID } = await import('../database/dbwalletmanager.js')
      await addDollarsByUUID(userUuid, amount)
      await postMessage({
        room,
        message: `💸 Admin credited $${amount} to <@uid:${userUuid}>`
      })
    } catch (err) {
      await postMessage({
        room,
        message: `❌ Failed to add money: ${err?.message || err}`
      })
    }
  } else if (payload.message.startsWith('/games')) {
    await postMessage({
      room,
      message: 'Games:\n- /trivia: Play Trivia\n- /lottery: Play the Lottery\n- /roulette: Play Roulette\n- /slots: Play Slots\n- /blackjack: Play Blackjack\n- /horserace\n- /slotinfo: Display slots payout info\n- /lotto (#):Insert number to get amount of times won\n- /lottostats: Get most won lottery numbers \n- /jackpot: Slots progressive jackpot value'
    })
  } else if (/^\/(?:theme|settheme|removetheme)\b/i.test(payload.message.trim())) {
    console.log('[MessageHandler] routing to theme handler:', payload.message)
    try {
      await handleThemeCommand({
        sender: payload.sender,
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
      const senderUUID = payload.sender
      const currentDJUUIDs = getCurrentDJUUIDs(state)

      if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
        await postMessage({
          room,
          message: `<@uid:${senderUUID}>, there is no DJ currently playing.`
        })
        return
      }

      const mentionText = currentDJUUIDs.map(uuid => `<@uid:${uuid}>`).join(' and ')

      await postMessage({
        room,
        message: `<@uid:${senderUUID}> gives ${mentionText} two ice cold beers!! 🍺🍺`
      })
    } catch (error) {
      console.error('Error handling /djbeers command:', error)
    }
  } else if (payload.message.startsWith('/djbeer')) {
    try {
      const senderUUID = payload.sender
      const currentDJUUIDs = getCurrentDJUUIDs(state)

      if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
        await postMessage({
          room,
          message: `<@uid:${senderUUID}>, there is no DJ currently playing.`
        })
        return
      }

      await postMessage({
        room,
        message: `<@uid:${senderUUID}> gives <@uid:${currentDJUUIDs[0]}> an ice cold beer! 🍺`
      })
    } catch (error) {
      console.error('Error handling /djbeer command:', error)
    }
  } else if (payload.message.startsWith('/getdjdrunk')) {
    try {
      const senderUUID = payload.sender
      const currentDJUUIDs = getCurrentDJUUIDs(state)

      if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
        await postMessage({
          room,
          message: `<@uid:${senderUUID}>, there is no DJ currently playing.`
        })
        return
      }

      await postMessage({
        room,
        message: `<@uid:${senderUUID}> gives <@uid:${currentDJUUIDs[0]}> a million ice cold beers!!! 🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺`
      })
    } catch (error) {
      console.error('Error handling /getdjdrunk command:', error)
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
    const senderUUID = payload.sender
    const nickname = getUserNickname(senderUUID)
    const isAuthorized = await isUserAuthorized(senderUUID, ttlUserToken)

    if (!isAuthorized) {
      await postMessage({
        room,
        message: `Don't tell me what to do, @${nickname}`
      })
      return
    }

    try {
      await roomBot.voteOnSong(process.env.ROOM_UUID, { like: false }, process.env.BOT_USER_UUID)
    } catch (error) {
      console.error('Error Voting on Song', error)
    }
  } else if (payload.message.startsWith('/addDJ')) {
    try {
      // Split by whitespace and normalise the option to lowercase.  If no
      // second argument is provided, option will be an empty string.
      const args = payload.message.trim().split(/\s+/)
      const option = (args[1] || '').toLowerCase()

      if (option === 'auto') {
        // Auto DJ: use AI/popular recommendation logic.  Ensure discover
        // mode is disabled so that addDJ falls back to recommendation
        // selection instead of playlist‑based logic.
        try {
          if (typeof roomBot.disableDiscoverDJ === 'function') {
            roomBot.disableDiscoverDJ()
          }
          await roomBot.addDJ()
          await postMessage({
            room: process.env.ROOM_UUID,
            message: '🎵 *Auto DJ added!*\n\nThe bot will now play AI‑recommended songs.'
          })
        } catch (error) {
          console.error('Error adding auto DJ:', error)
        }
      } else if (option === 'discover') {
        // Discover DJ: pull songs from configured playlists.  Load
        // playlist IDs from environment or use a fallback set.
        const discoverIdsEnv = process.env.DISCOVER_PLAYLIST_IDS || ''
        let discoverIds = discoverIdsEnv.split(',').map((s) => s.trim()).filter(Boolean)
        if (discoverIds.length === 0) {
          discoverIds = [
            '37i9dQZF1DX4JAvHpjipBk',
            '37i9dQZF1DX5trt9i14X7j',
            '37i9dQZF1DWVqfgj8NZEp1'
          ]
        }
        // Enable discover mode using the correct API.
        if (typeof roomBot.enableDiscoverDJ === 'function') {
          await roomBot.enableDiscoverDJ(discoverIds)
        }
        await roomBot.addDJ()
        await postMessage({
          room: process.env.ROOM_UUID,
          message: `🎶 *Discover DJ added!*\n\nThe bot will now play tracks from ${discoverIds.length} curated playlist(s) and avoid repeats.`
        })
      } else {
        // Default behaviour: use the default playlist from the environment.
        try {
          if (typeof roomBot.disableDiscoverDJ === 'function') {
            roomBot.disableDiscoverDJ()
          }
          await roomBot.addDJFromDefaultPlaylist()
          await postMessage({
            room: process.env.ROOM_UUID,
            message: '🎧 *DJ added from default playlist!*\n\nThe bot will now play songs from the configured default playlist.'
          })
        } catch (error) {
          console.error('Error adding DJ from default playlist:', error)
        }
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
        : `${mention}; you're already in the queue.`
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
  } else if (payload.message.startsWith('/dive')) {
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
          markUser(userUuid) // Store UUID for post-song removal

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
    await sendDirectMessage(payload.sender, secretmessage)
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
  } else if (payload.message.startsWith('/dog')) {
    try {
    // Optional breed args: "/dog", "/dog shiba", "/dog hound afghan"
      const parts = payload.message.trim().split(/\s+/).slice(1)
      const breed =
      parts.length === 0
        ? null
        : parts.length === 1
          ? parts[0].toLowerCase()
          : `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`

      // Fetch image URL from dog.ceo (your API helper)
      const imgUrl = await getRandomDogImage(breed || undefined)

      if (!imgUrl) {
        await postMessage({
          room,
          message: '🐶 Could not fetch a pup right now — try again in a bit!'
        })
        return
      }

      // Send as an image (no text), matching your /burp style
      await postMessage({
        room,
        images: [imgUrl]
      })
    } catch (error) {
      console.error('Error processing /dog command:', error.message)
      await postMessage({
        room,
        message: 'An error occurred while fetching a dog. Please try again.'
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
  } else if (payload.message.startsWith('/trash')) {
    try {
      const trashOptions = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNW15MDZnb2hiNHhiajNrY2xnOTNwMmQxMWNvcW1laXY5bXl5NTZzaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/QVP7DawXZitKYg3AX5/giphy.gif' }, // replace
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNW15MDZnb2hiNHhiajNrY2xnOTNwMmQxMWNvcW1laXY5bXl5NTZzaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/bQvTkpRYa4CF0lX3Zg/giphy.gif' }, // replace
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNW15MDZnb2hiNHhiajNrY2xnOTNwMmQxMWNvcW1laXY5bXl5NTZzaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/NHs9GJQzKh3uU/giphy.gif' }, // replace
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeXNxd3BtOGV1cGhlaHRwbm0waWczZ2thOHBtZnA2cnc3aGM5MXFjYSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/05wBfiXHq4U6dfHeeP/giphy.gif' },
        { type: 'emoji', value: '🗑️🔥💀' }
      ]

      const randomTrashOption =
      trashOptions[Math.floor(Math.random() * trashOptions.length)]

      if (randomTrashOption.type === 'gif') {
        await postMessage({
          room,
          message: '',
          images: [randomTrashOption.value]
        })
      } else {
        await postMessage({
          room,
          message: randomTrashOption.value
        })
      }
    } catch (err) {
      console.error('Error handling /trash command:', err)
    }
  } else if (payload.message.startsWith('/bonk')) {
    try {
      const bonkOptions = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2U3dnhvdm1oZWVyMjJ4cGJ2NnU1cnV3eWFyZ3RvYzdtaTFwc2VwbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/30lxTuJueXE7C/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb2U3dnhvdm1oZWVyMjJ4cGJ2NnU1cnV3eWFyZ3RvYzdtaTFwc2VwbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/HxMhuDg7O4pKOhhcRC/giphy.gif' }
      ]

      const randomBonkOption =
      bonkOptions[Math.floor(Math.random() * bonkOptions.length)]

      if (randomBonkOption.type === 'gif') {
        await postMessage({
          room,
          message: '',
          images: [randomBonkOption.value]
        })
      } else {
        await postMessage({
          room,
          message: randomBonkOption.value
        })
      }
    } catch (err) {
      console.error('Error handling /bonk command:', err)
    }
  } else if (payload.message.startsWith('/rigged')) {
    try {
      const riggedOptions = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWw3eDRlMmJxdTR1b3ppM240bmkxbWhoaDFpZ3czaG1wZDByb3hjMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/mJhRSYXxzq6CA0ldkh/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWw3eDRlMmJxdTR1b3ppM240bmkxbWhoaDFpZ3czaG1wZDByb3hjMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/fUpocChFusfX0sCkuG/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExeWw3eDRlMmJxdTR1b3ppM240bmkxbWhoaDFpZ3czaG1wZDByb3hjMiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IWzAC2lMELuPQE1wWv/giphy.gif' }
      ]

      const randomRiggedOption =
      riggedOptions[Math.floor(Math.random() * riggedOptions.length)]

      if (randomRiggedOption.type === 'gif') {
        await postMessage({
          room,
          message: '',
          images: [randomRiggedOption.value]
        })
      } else {
        await postMessage({
          room,
          message: randomRiggedOption.value
        })
      }
    } catch (err) {
      console.error('Error handling /rigged command:', err)
    }
  } else if (payload.message.startsWith('/banger')) {
    try {
      const bangerOptions = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDlteDB1cmIwZjcxajBzcTVhc2x3dzkya3NzOW5mZTV4ZnA5M291aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/YOqbsB7Ega18s/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDlteDB1cmIwZjcxajBzcTVhc2x3dzkya3NzOW5mZTV4ZnA5M291aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vwcnDMKml1udSvcNUx/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3NDYzdGdvMXFhdWNnY2Vsa3B2bnpkMmEyYjRkZjVjazZvY2pkY3V3ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Op5wF3ZF35900Zjmdr/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDlteDB1cmIwZjcxajBzcTVhc2x3dzkya3NzOW5mZTV4ZnA5M291aCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xDA8aFqZuAlWuu69Ed/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3NDYzdGdvMXFhdWNnY2Vsa3B2bnpkMmEyYjRkZjVjazZvY2pkY3V3ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/7AVv1sSY7quBwZSmCj/giphy.gif' }
      ]

      const randomBangerOption =
      bangerOptions[Math.floor(Math.random() * bangerOptions.length)]

      if (randomBangerOption.type === 'gif') {
        await postMessage({
          room,
          message: '',
          images: [randomBangerOption.value]
        })
      } else {
        await postMessage({
          room,
          message: randomBangerOption.value
        })
      }
    } catch (err) {
      console.error('Error handling /banger command:', err)
    }
  } else if (payload.message.startsWith('/peace')) {
    try {
      const peaceOptions = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbWs3ZWRvZHJpZ2YyZXE2MGUwNnd6dDRybDB6OHRheWRxYzIydHkyOSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/rrLt0FcGrDeBq/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbWs3ZWRvZHJpZ2YyZXE2MGUwNnd6dDRybDB6OHRheWRxYzIydHkyOSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/iVJEhiEdcMNQ4/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2NhMmhlYThiZ3Nhd2NrNDhhOHJuN3hscjdvd2swZDRqMWpudXVhNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/QoesEe6tCbLyw/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2NhMmhlYThiZ3Nhd2NrNDhhOHJuN3hscjdvd2swZDRqMWpudXVhNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/w89ak63KNl0nJl80ig/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExd2NhMmhlYThiZ3Nhd2NrNDhhOHJuN3hscjdvd2swZDRqMWpudXVhNCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7qDEq2bMbcbPRQ2c/giphy.gif' }
      ]

      const randomPeaceOption =
      peaceOptions[Math.floor(Math.random() * peaceOptions.length)]

      if (randomPeaceOption.type === 'gif') {
        await postMessage({
          room,
          message: '',
          images: [randomPeaceOption.value]
        })
      } else {
        await postMessage({
          room,
          message: randomPeaceOption.value
        })
      }
    } catch (err) {
      console.error('Error handling /peace command:', err)
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

  /// //////////////////////// Wallet Stuff ////////////////////////////////////

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
  if (payload.message.startsWith('/career')) {
  // Look up the user's lifetime net win/loss (positive or negative)
    const userId = payload.sender
    const nickname = await getUserNickname(userId)
    const net = getLifetimeNet(userId)

    // Round to whole dollars and format with sign and commas
    const rounded = Math.round(net)
    const absNet = Math.abs(rounded).toLocaleString('en-US')
    const sign = rounded >= 0 ? '+' : '-'

    await postMessage({
      room: process.env.ROOM_UUID,
      message: `${nickname}, your career gambling net total is ${sign}$${absNet}.`
    })
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
  /// ////////////////////////////////////////////////////////////////////////
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
        // Compose a mention for chat messages. We ignore the display name
        // here because the bot should tag the winner via their UUID.
        const name = w.userId ? formatMention(w.userId) : (w.nickname || 'Unknown user')
        const amount = Math.round(Number(w.amountWon) || 0).toLocaleString()
        const num = (w.winningNumber ?? '?')
        const dateStr = w.date || 'unknown date'
        return `${i + 1}. ${name}: Won $${amount} with number ${num} on ${dateStr}`
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
    console.error('[SLOTS HIT]', payload.message)
    await postMessage({ room, message: 'SLOTS HANDLER HIT ✅' })

    try {
      const args = payload.message.trim().split(/\s+/)
      const sub = (args[1] || '').toLowerCase()

      const userUUID = payload.sender

      // ✅ Handle feature commands BEFORE numeric parsing
      console.log('[SLOTS DEBUG]', { raw: payload.message, sub })

      if (sub === 'free' || sub === 'bonus') {
        const response = await handleSlotsCommand(userUUID, sub)
        await postMessage({ room, message: response })
        return
      }

      // Default bet amount
      let betAmount = 1

      // Numeric bet (optional)
      if (args.length > 1) {
        betAmount = parseFloat(args[1])
        if (isNaN(betAmount) || betAmount <= 0) {
          await postMessage({
            room,
            message: 'Please provide a valid bet amount.'
          })
          return
        }
      }

      const response = await handleSlotsCommand(userUUID, betAmount)
      await postMessage({ room, message: response })
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
    const jackpotValue = getJackpotValue()

    // Round to whole dollars and format with commas
    const formattedJackpot = Math.round(jackpotValue).toLocaleString('en-US')

    await postMessage({
      room,
      message: `🎰 The current progressive jackpot is: $${formattedJackpot}!`
    })
  }

  /// ////////////////// BLACKJACK /////////////////////////

  // inside your onMessage handler:
  const userUUID = payload.sender
  const nickname = await getSenderNickname(userUUID)

  // Define ctx BEFORE any usage; add tableId to isolate per-room game state
  const ctx = { room, tableId: `blackjack:${room}` }

  // 1) Primary command: "/blackjack" (alias "/bj") opens the table + auto-seats caller
  if (/^\/(blackjack|bj)\b$/i.test(txt)) {
    await openBetting(ctx) // starts JOIN window if idle
    await joinTable(userUUID, nickname, ctx)
    return
  }

  // 2) Subcommands: "/blackjack join", "/bj join", etc.
  if (/^\/(blackjack|bj)\s+join\b/i.test(txt)) {
    await joinTable(userUUID, nickname, ctx)
    return
  }

  if (/^\/(blackjack|bj)\s+leave\b/i.test(txt)) {
    await leaveTable(userUUID, ctx)
    return
  }

  if (/^\/(blackjack|bj)\s+bet\b/i.test(txt)) {
    const amountStr = txt.split(/\s+/)[2] ?? '' // keep it as string
    await handleBlackjackBet(userUUID, amountStr, nickname, ctx)
    return
  }

  if (/^\/(blackjack|bj)\s+hit\b/i.test(txt)) { await handleHit(userUUID, nickname, ctx); return }
  if (/^\/(blackjack|bj)\s+stand\b/i.test(txt)) { await handleStand(userUUID, nickname, ctx); return }
  if (/^\/(blackjack|bj)\s+double\b/i.test(txt)) { await handleDouble(userUUID, nickname, ctx); return }
  if (/^\/(blackjack|bj)\s+surrender\b/i.test(txt)) { await handleSurrender(userUUID, nickname, ctx); return }
  if (/^\/(blackjack|bj)\s+split\b/i.test(txt)) { await handleSplit(userUUID, nickname, ctx); return }

  if (/^\/(blackjack|bj)\s+table\b/i.test(txt)) {
    const tableMessage = getFullTableView(ctx)
    await postMessage({ room, message: tableMessage || '🪑 No one is at the table yet.' })
    return
  }

  // 3) Gentle router for plain "/join" and "/bet" so users don't have to type the alias
  //    We only claim them if Blackjack is actually in the appropriate phase.
  if (/^\/join\b/i.test(txt) && getPhase(ctx) === 'join') {
    await joinTable(userUUID, nickname, ctx)
    return
  }

  if (/^\/bet\b/i.test(txt) && getPhase(ctx) === 'betting') {
    const amountStr = txt.split(/\s+/)[1] ?? ''
    await handleBlackjackBet(userUUID, amountStr, nickname, ctx)
    return
  }

  // 4) Shortcuts (only if we're in BJ acting phase)
  if (/^\/(hit|stand|double|surrender|split)\b/i.test(txt) && getPhase(ctx) === 'acting') {
    const cmd = /^\/(\w+)/.exec(txt)[1].toLowerCase()
    if (cmd === 'hit') return await handleHit(userUUID, nickname, ctx)
    if (cmd === 'stand') return await handleStand(userUUID, nickname, ctx)
    if (cmd === 'double') return await handleDouble(userUUID, nickname, ctx)
    if (cmd === 'surrender') return await handleSurrender(userUUID, nickname, ctx)
    if (cmd === 'split') return await handleSplit(userUUID, nickname, ctx)
  }

  /// /////////////////////// BOT AVATAR UPDATES //////////////////////////
  else if (payload.message.startsWith('/botrandom')) {
  // signature: (room, postMessage, ttlUserToken)
    await handleBotRandomAvatarCommand(
      room,
      postMessage,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botdino')) {
  // signature: (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
    await handleBotDinoCommand(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botduck')) {
    await handleBotDuckCommand(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botalien')) {
    await handleBotAlienCommand(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botalien2')) {
    await handleBotAlien2Command(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botwalrus')) {
    await handleBotWalrusCommand(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botpenguin')) {
    await handleBotPenguinCommand(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/bot1')) {
    await handleBot1Command(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/bot2')) {
    await handleBot2Command(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/bot3')) {
    await handleBot3Command(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botspooky')) {
    await handleBotSpookyCommand(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botstaff')) {
    await handleBotStaffCommand(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  } else if (payload.message.startsWith('/botwinter')) {
    await handleBotWinterCommand(
      room,
      postMessage,
      isUserAuthorized,
      payload.sender,
      ttlUserToken
    )
  }

  /// /////////////////////// USER AVATAR UPDATES //////////////////////////

  else if (payload.message.startsWith('/dino')) {
    await handleDinoCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/teacup')) {
    await handleTeacupCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/alien2')) {
    await handleAlien2Command(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/alien')) {
    await handleAlienCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/roy')) {
    await handleRoyCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/spooky')) {
    await handleSpookyCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/bouncer')) {
    await handleBouncerCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/duck')) {
    await handleDuckCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/record' || 'recordguy')) {
    await handleRecordGuyCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/jukebox' || 'jukeboxguy')) {
    await handleJukeboxCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/spacebear')) {
    await handleSpaceBearCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/walrus')) {
    await handleWalrusCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/vibesguy' || 'vibeguy')) {
    await handleVibesGuyCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/faces')) {
    await handleFacesCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/dodo')) {
    await handleDoDoCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/dumdum' || '/dumbdumb')) {
    await handleDumDumCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/flowerpower' || '/flower')) {
    await handleFlowerPowerCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/anon' || '/anonymous')) {
    await handleAnonCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/cyber')) {
    await handleRandomCyberCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/ghost')) {
    await handleGhostCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/cosmic')) {
    await handleRandomCosmicCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/lovable')) {
    await handleRandomLovableCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/grime')) {
    await handleGrimehouseCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/bearparty' || '/bear')) {
    await handleBearPartyCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/winter')) {
    await handleWinterCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/gaycam')) {
    await handleGayCamCommand(payload.sender, room, postMessage)
  } else if (payload.message.startsWith('/randomavatar')) {
    await handleRandomAvatarCommand(payload.sender, room, postMessage)
  }

  /// /////////////////////// Add Avatar //////////////////////////
  else if (/^\/addavatar\b/i.test(payload.message)) {
    const roomId = payload.room ?? process.env.ROOM_UUID

    try {
      await handleAddAvatarCommand(
        { sender: payload.sender, message: payload.message, room: roomId },
        postMessage
      )
    } catch (err) {
      console.error('[router]/addavatar failed:', err)
      await postMessage({ room: roomId, message: '❌ /addavatar crashed — check logs.' })
    }
  } else if (/^\/removeavatar\b/i.test(payload.message)) {
    const roomId = payload.room ?? process.env.ROOM_UUID
    await handleRemoveAvatarCommand(
      { sender: payload.sender, message: payload.message, room: roomId },
      postMessage
    )
  } else if (payload.message === '/reviewhelp') {
    const helpMessage = [
      '🎧 **How Reviews Work**',
      'You can rate each song from **1 to 10** ',
      '',
      '📝 **Commands**:',
      '/review <1-10> – Submit a review for the current song',
      '/rating – See the average rating for the current song',
      '/topsongs – See the top 5 highest rated songs',
      '/reviewhelp – Show this review guide',
      '/albumreview <1-10> – Submit a review for the album',
      '/topalbums – See the top 5 highest rated albums',
      '/mytopalbums – See your personal top 5 highest rated albums',
      '',
      'Reviews contribute to the song’s overall score in the stats. Thanks for sharing your taste! 🎶'
    ].join('\n')
    await postMessage({ room, message: helpMessage })
    // Backward-compat alias: /review -> /songreview
  } else if (/^\/review\b/i.test(payload.message)) {
    const rest = payload.message.slice('/review'.length)
    payload.message = `/songreview${rest}`

    // Primary: /songreview <1–10> (one decimal allowed)
  } else if (/^\/songreview\b/i.test(payload.message)) {
    const sender = payload.sender

    // Parse rating from "/songreview 7.8" or "/songreview7.8"
    const ratingStr = payload.message.slice('/songreview'.length).trim()
    const m = ratingStr.match(/^(10(?:\.0)?|[1-9](?:\.[0-9])?)$/)
    const rating = m ? Math.round(parseFloat(m[1]) * 10) / 10 : NaN

    if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
      try {
        const nick = await getSenderNickname(sender)
        await postMessage({
          room,
          message: `${nick} please enter a number between 1 and 10 (one decimal allowed) to review the song.`
        })
      } catch {
        await postMessage({
          room,
          message: 'Please enter a number between 1 and 10 (one decimal allowed) to review the song.'
        })
      }
      return
    }

    // 1) DB-backed current_state first
    let song = null
    try {
      const row = await Promise.resolve(getCurrentState?.())
      if (row?.trackName && row?.artistName) {
        song = {
          songId: row.songId ?? null,
          trackName: row.trackName,
          artistName: row.artistName,
          albumName: row.albumName ?? null
        }
      }
    } catch {}

    // 2) Fallback to in-memory now playing
    if (!song && roomBot?.currentSong?.trackName && roomBot?.currentSong?.artistName) {
      const s = roomBot.currentSong
      song = {
        songId: s.songId ?? null,
        trackName: s.trackName,
        artistName: s.artistName,
        albumName: s.albumName ?? null
      }
    }

    if (!song) {
      await postMessage({ room, message: 'No song is currently playing. Try again in a moment.' })
      return
    }

    try {
      const result = await saveSongReview({
        currentSong: song,
        rating,
        userId: sender
      })

      if (result?.success === true) {
        const nick = await getSenderNickname(sender).catch(() => `<@uid:${sender}>`)
        await postMessage({
          room,
          message: `${nick} thanks! Your ${rating.toFixed(1)}/10 song review has been saved.`
        })
      } else if (result?.reason === 'duplicate') {
        const nick = await getSenderNickname(sender).catch(() => `<@uid:${sender}>`)
        await postMessage({ room, message: `${nick} you've already reviewed this song.` })
      } else if (result?.reason === 'not_found') {
        await postMessage({ room, message: 'Song not found in stats.' })
      } else if (result?.reason === 'bad_input') {
        await postMessage({ room, message: 'That rating looks off. Please use 1–10 (one decimal allowed).' })
      } else {
        await postMessage({ room, message: 'Couldn’t save your review, please try again later.' })
      }
    } catch (e) {
      console.error('[songreview] save error:', e?.message || e)
      await postMessage({ room, message: 'Couldn’t save your review, please try again later.' })
    }
  } else if (payload.message.startsWith('/topsongs')) {
    try {
    // 🔧 Removed spotifyTrackId filter so songs without that field aren't dropped
      const topReviewedSongs = db.prepare(`
      SELECT 
        rs.trackName,
        rs.artistName,
        rs.spotifyTrackId,
        AVG(sr.rating) AS averageReview,
        COUNT(sr.rating) AS reviewCount
      FROM room_stats rs
      JOIN song_reviews sr ON rs.songId = sr.songId
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

      for (let i = 0; i < topReviewedSongs.length; i++) {
        const song = topReviewedSongs[i]
        const emoji = numberEmojis[i] || `#${i + 1}`

        try {
        // If we have a spotifyTrackId, enrich the card; else post plain text
          if (song.spotifyTrackId) {
            const songData = await fetchSongData(song.spotifyTrackId)
            const reviewText = `${parseFloat(song.averageReview).toFixed(1)}/10 ⭐ from ${song.reviewCount} review${song.reviewCount > 1 ? 's' : ''}`
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
          } else {
            const reviewText = `${parseFloat(song.averageReview).toFixed(1)}/10 ⭐ from ${song.reviewCount} review${song.reviewCount > 1 ? 's' : ''}`
            const songLabel = `*${song.artistName} – ${song.trackName}*`
            await postMessage({ room, message: `${emoji} ${songLabel} (${reviewText})` })
          }
        } catch (err) {
          console.error(`❌ Failed to fetch song data for ${song.trackName}:`, err.message)
          // Fallback to text if the fetch fails
          const reviewText = `${parseFloat(song.averageReview).toFixed(1)}/10 ⭐ from ${song.reviewCount} review${song.reviewCount > 1 ? 's' : ''}`
          const songLabel = `*${song.artistName} – ${song.trackName}*`
          await postMessage({ room, message: `${emoji} ${songLabel} (${reviewText})` })
        }
      }
    } catch (err) {
      console.error('❌ Error generating /topsongs:', err.message)
      await postMessage({
        room,
        message: 'Error loading top songs. Please try again later.'
      })
    }
  } else if (payload.message.startsWith('/mytopsongs')) {
    const userId = payload.sender
    const topSongs = getUserSongReviews(userId, 5)

    if (!topSongs.length) {
      await postMessage({
        room,
        message: `${await getUserNickname(userId)} you haven't rated any songs yet. Start rating with /review! 🎵`
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
        const ratingText = `Your rating: ${song.rating}/10 ⭐`

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
    const topAlbums = getTopAlbumReviews(5)

    if (!topAlbums || topAlbums.length === 0) {
      await postMessage({
        room,
        message: '🎵 No album reviews found yet! Start rating albums with /albumreview to get featured here! 🎵'
      })
      return
    }

    await postMessage({
      room,
      message: '🎶 *Top Album Reviews* 🎶'
    })

    for (const [i, album] of topAlbums.entries()) {
      const rankEmoji = numberEmojis[i] || `${i + 1}.`
      const avg = typeof album.averageReview === 'number' ? album.averageReview.toFixed(1) : 'N/A'
      const reviewCount = album.reviews?.length || 0

      await postMessage({
        room,
        message: `${rankEmoji} *"${album.albumName}"* by *${album.artistName}*\n   ➤ ⭐ Average Rating: ${avg}/10 (${reviewCount} review${reviewCount === 1 ? '' : 's'})`
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
      message: '🎶 *Your Top Album Ratings* 🎶'
    })

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']

    for (const [i, album] of userAlbums.sort((a, b) => b.rating - a.rating).entries()) {
      const rankEmoji = numberEmojis[i] || `${i + 1}.`
      await postMessage({
        room,
        message: `${rankEmoji} *"${album.albumName}"* by *${album.artistName}*\n   ➤ ⭐ Your Rating: ${album.rating}/10`
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
        message: 'No song is currently playing. Try again in a moment.'
      })
      return
    }

    // ✅ Ensure we resolve a songId before querying reviews
    let songId = currentSong.songId
    if (!songId) {
      const row = db.prepare(`
        SELECT songId
        FROM room_stats
        WHERE LOWER(TRIM(trackName)) = LOWER(TRIM(?))
          AND LOWER(TRIM(artistName)) = LOWER(TRIM(?))
        ORDER BY id DESC
        LIMIT 1
      `).get(currentSong.trackName, currentSong.artistName)
      songId = row?.songId
    }

    if (!songId) {
      await postMessage({
        room,
        message: `No reviews for "${currentSong.trackName}" by ${currentSong.artistName} yet.`
      })
      return
    }

    const ratingInfo = await getAverageRating({ songId }) // pass only songId as expected by util

    if (!ratingInfo.found) {
      await postMessage({
        room,
        message: `No reviews for "${currentSong.trackName}" by ${currentSong.artistName} yet.`
      })
    } else {
      await postMessage({
        room,
        message: `"${currentSong.trackName}" by ${currentSong.artistName} has an average rating of ${Number(ratingInfo.average).toFixed(1)}/10 from ${ratingInfo.count} review${ratingInfo.count === 1 ? '' : 's'}.`
      })
    }
  } else if (payload.message.startsWith('/albumreview')) {
    const __rStr = payload.message.replace('/albumreview', '').trim()
    const __m = __rStr.match(/(10(?:\.0)?|[1-9](?:\.[0-9])?)/)
    const rating = __m ? Math.round(parseFloat(__m[1]) * 10) / 10 : NaN
    const sender = payload.sender

    // 1️⃣ Validate rating
    if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
      await postMessage({
        room,
        message: `${await getUserNickname(sender)} please enter a number between 1 and 10 (one decimal allowed) to rate the album.`
      })
      return
    }

    // 2️⃣ Try in-memory first
    let album = (roomBot.currentAlbum && roomBot.currentAlbum.albumID && roomBot.currentAlbum.albumName)
      ? roomBot.currentAlbum
      : null

    // 3️⃣ Fallback to DB if needed
    if (!album) {
      const row = await Promise.resolve(getCurrentState?.())
      if (row && row.albumAlbumID && row.albumNameField) {
        album = {
          albumID: row.albumAlbumID,
          albumName: row.albumNameField,
          artistName: row.albumArtistName,
          trackCount: row.totalTracks, // or row.trackCount if you stored it
          albumArt: row.albumArtField
        }
      }
    }

    // 4️⃣ If still no album, abort
    if (!album) {
      await postMessage({
        room,
        message: 'No album info is available to rate. Wait until the next album starts.'
      })
      return
    }

    // 5️⃣ Save the review
    const result = await saveAlbumReview({
      albumId: album.albumID,
      albumName: album.albumName,
      albumArt: album.albumArt,
      artistName: album.artistName,
      trackCount: album.trackCount,
      userId: sender,
      rating
    })

    // 6️⃣ Respond
    if (result.success) {
      await postMessage({
        room,
        message: `${await getUserNickname(sender)} thanks! Your album review (${rating}/10) was saved. Current avg: ${result.average}/10.`
      })
    } else {
      await postMessage({
        room,
        message: 'Something went wrong saving your album review. Try again later.'
      })
    }
  } else if (payload.message.startsWith('/room')) {
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
      const isBeachCommand = payload.message.trim().toLowerCase() === '/addsong beach'

      const spotifyTrackId = roomBot.currentSong?.spotifyTrackId
      console.log('Current song track ID:', spotifyTrackId)

      if (!spotifyTrackId) {
        await postMessage({
          room,
          message: 'No track is currently playing or track ID is invalid.'
        })
        return
      }

      const trackUri = `spotify:track:${spotifyTrackId}`
      console.log('Track URI:', trackUri)

      // Choose playlist ID based on command type
      const playlistId = isBeachCommand
        ? process.env.BEACH_PLAYLIST_ID
        : process.env.DEFAULT_PLAYLIST_ID

      if (!playlistId) {
        await postMessage({
          room,
          message: 'Playlist ID is missing from environment variables.'
        })
        return
      }

      const playlistTracks = await fetchSpotifyPlaylistTracks(playlistId)
      const playlistTrackURIs = playlistTracks.map(track => track.track.uri)

      if (playlistTrackURIs.includes(trackUri)) {
        await postMessage({
          room,
          message: 'Track is already in the playlist!'
        })
      } else {
        const snapshotId = await addTracksToPlaylist(playlistId, [trackUri])
        if (snapshotId) {
          await postMessage({
            room,
            message: `Track added to ${isBeachCommand ? 'beach' : 'default'} playlist!`
          })
        } else {
          await postMessage({
            room,
            message: 'Failed to add the track to the playlist.'
          })
        }
      }
    } catch (error) {
      await postMessage({
        room,
        message: `Error adding track to playlist: ${error.message}`
      })
    }
  } else if (payload.message.startsWith('/removesong')) {
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

      const isBeachCommand = payload.message.trim().toLowerCase() === '/removesong beach'
      const playlistId = isBeachCommand
        ? process.env.BEACH_PLAYLIST_ID
        : process.env.DEFAULT_PLAYLIST_ID

      // Get track ID from currently playing song
      const spotifyTrackId = roomBot.currentSong?.spotifyTrackId
      if (!spotifyTrackId) {
        await postMessage({
          room,
          message: 'No track is currently playing or track ID is invalid.'
        })
        return
      }

      const trackUri = `spotify:track:${spotifyTrackId}`

      const snapshotId = await removeTrackFromPlaylist(playlistId, trackUri)

      if (snapshotId) {
        await postMessage({
          room,
          message: 'Track removed successfully!'
        })
      } else {
        await postMessage({
          room,
          message: 'Failed to remove the track from the playlist.'
        })
      }
    } catch (error) {
      await postMessage({
        room,
        message: `Error removing track from playlist: ${error.message}`
      })
    }
  } else if (/^\/infotone\\b/i.test(payload.message)) {
    try {
      const senderUuid = payload.sender
      const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
      if (!isAuthorized) {
        await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
        return
      }

      const VALID_TONES = ['neutral', 'playful', 'cratedigger', 'hype', 'classy', 'chartbot', 'djtech', 'vibe']
      const ALIAS = {
      // legacy + shortcuts
        nerd: 'cratedigger',
        crate: 'cratedigger',
        digger: 'cratedigger',
        n: 'neutral',
        neutral: 'neutral',
        p: 'playful',
        fun: 'playful',
        playful: 'playful',
        hype: 'hype',
        amp: 'hype',
        classy: 'classy',
        formal: 'classy',
        chart: 'chartbot',
        charts: 'chartbot',
        chartbot: 'chartbot',
        tech: 'djtech',
        djtech: 'djtech',
        vibe: 'vibe',
        chill: 'vibe'
      }

      const args = payload.message.trim().split(/\\s+/).slice(1)
      const current = getNowPlayingInfoBlurbTone()

      // No args or help → show current + options
      if (args.length === 0 || /^(help|\\?)$/i.test(args[0] || '')) {
        const tones = VALID_TONES
        const aliases = ['nerd→cratedigger', 'fun→playful', 'chart→chartbot', 'tech→djtech', 'chill→vibe']
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
      const autobopStatus = roomBot.autobop ? 'enabled' : 'disabled'
      const songStatsStatus = isSongStatsEnabled() ? 'enabled' : 'disabled'
      const greetUserStatus = greetingMessagesEnabled ? 'enabled' : 'disabled'
      const infoBlurbStatus = isNowPlayingInfoBlurbEnabled() ? 'enabled' : 'disabled'
      const infoTone = getNowPlayingInfoBlurbTone()

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
  } else if (/^\/greet(\\b|$)/i.test(payload.message)) {
    const room = process.env.ROOM_UUID
    const parts = payload.message.trim().split(/\\s+/)
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
        '📊 Greeting status:\n' +
        `• Standard: ${greetingMessagesEnabled ? 'ON' : 'OFF'}\n` +
        `• AI: ${aiGreetingEnabled ? 'ON' : 'OFF'}\n` +
        'Precedence: custom > AI (if ON) > standard (if ON)'
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
      'Usage:\n' +
      '• /greet standard — Standard greeting ON, AI OFF\n' +
      '• /greet ai — AI greeting ON (standard kept ON as fallback)\n' +
      '• /greet status — Show current settings\n' +
      '• /greetoff — Turn both OFF\n\n' +
      `Current: Standard=${greetingMessagesEnabled ? 'ON' : 'OFF'}, AI=${aiGreetingEnabled ? 'ON' : 'OFF'}`
    })

    // --- Info blurb ON ---
  } else if (/^\/infoon\\b/i.test(payload.message)) {
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
  } else if (/^\/infooff\\b/i.test(payload.message)) {
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
  } else if (/^\/infotoggle\\b/i.test(payload.message)) {
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

    // --- Set tone: /infotone [tone] ---
  } else if (/^\/infotone\b/i.test(txt)) {
    try {
      const senderUuid = payload.sender
      const isAuthorized = await isUserAuthorized(senderUuid, ttlUserToken)
      if (!isAuthorized) {
        await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
        return
      }

      const VALID_TONES = ['neutral', 'playful', 'cratedigger', 'hype', 'classy', 'chartbot', 'djtech', 'vibe']
      const ALIAS = {
      // friendly aliases
        n: 'neutral',
        neutral: 'neutral',
        p: 'playful',
        fun: 'playful',
        playful: 'playful',
        nerd: 'cratedigger',
        geek: 'cratedigger',
        crate: 'cratedigger',
        digger: 'cratedigger',
        chart: 'chartbot',
        charts: 'chartbot',
        chartbot: 'chartbot',
        tech: 'djtech',
        djtech: 'djtech',
        chill: 'vibe',
        vibe: 'vibe'
      }

      const args = txt.split(/\s+/).slice(1)
      const current = getNowPlayingInfoBlurbTone()

      // No args → show current + available
      if (args.length === 0) {
        await postMessage({
          room,
          message:
`ℹ️ Info Blurb Tone
• Current: ${current}
• Available: ${VALID_TONES.join(', ')}
Set with: /infotone <tone>`
        })
        return
      }

      const raw = (args[0] || '').toLowerCase()
      const wanted = ALIAS[raw] || raw

      if (!VALID_TONES.includes(wanted)) {
        await postMessage({
          room,
          message:
`Invalid tone.
• Current: ${current}
• Available: ${VALID_TONES.join(', ')}
Set with: /infotone <tone>`
        })
        return
      }

      setNowPlayingInfoBlurbTone(wanted) // persists to DB
      await postMessage({ room, message: `Info blurb tone set to ${wanted}.` })
    } catch (error) {
      console.error('Error setting info blurb tone:', error)
      await postMessage({ room, message: 'Error setting info blurb tone. Try again.' })
    }

    /// ////////////// SPOTIFY STUFF ////////////////////////////
  } else if (payload.message.startsWith('/song')) {
  // 1) Try in-memory first
    let song = roomBot.currentSong && roomBot.currentSong.trackName
      ? roomBot.currentSong
      : null

    // new fallback (correct)
    if (!song) {
      const row = await Promise.resolve(getCurrentState?.())
      if (row?.currentSong?.trackName) {
        const cs = row.currentSong
        song = {
          trackName: cs.trackName,
          artistName: cs.artistName,
          spotifyUrl: cs.spotifyUrl,
          songDuration: cs.songDuration,
          songId: cs.songId
        }
      }
    }

    if (song) {
      const details = [
      `🎵 Track: ${song.trackName}`,
      `👤 Artist: ${song.artistName}`,
      song.spotifyUrl,
      `⏱ Duration: ${song.songDuration}`,
      `🆔 Song ID: ${song.songId}`
      ].join('\n')

      await postMessage({ room, message: details })
    } else {
      await postMessage({
        room,
        message: 'No song is currently playing.'
      })
    }
  } else if (payload.message.startsWith('/stats')) {
    const currentSong = roomBot.currentSong

    if (!currentSong || !currentSong.songId) {
      await postMessage({ room, message: 'No song is currently playing or missing songId.' })
      return
    }

    // Helpers
    const TZ = 'America/New_York'
    const fmtDate = (iso) => {
      if (!iso) return '—'
      try { return new Date(iso).toLocaleString('en-US', { timeZone: TZ }) } catch { return String(iso) }
    }
    const pct = (num, den) => den > 0 ? Math.round((num / den) * 100) : 0
    const perPlay = (num, den) => den > 0 ? (num / den).toFixed(1) : '0.00'

    // Accept "mm:ss", seconds, or milliseconds; fallback to live song duration fields
    const formatDuration = (raw, fallbacks = []) => {
      let d = raw
      for (const fb of fallbacks) if (d == null || d === '' || d === '0') d = fb
      if (d == null) return '—'
      if (typeof d === 'string') {
        const s = d.trim()
        if (!s) return '—'
        if (s.includes(':')) return s // already mm:ss
        const n = Number(s)
        if (!Number.isFinite(n)) return '—'
        d = n
      }
      if (typeof d === 'number') {
        if (d <= 0) return '—'
        const totalSec = d < 1000 ? Math.round(d) : Math.round(d / 1000)
        const m = Math.floor(totalSec / 60)
        const s = String(totalSec % 60).padStart(2, '0')
        return `${m}:${s}`
      }
      return '—'
    }

    try {
    // Try by songId; fallback to names if needed
      let songStats = db.prepare(`
      SELECT trackName, artistName, songId, songDuration, playCount, likes, dislikes, stars, lastPlayed, averageReview
      FROM room_stats
      WHERE songId = ?
    `).get(currentSong.songId)

      if (!songStats && currentSong.trackName && currentSong.artistName) {
        songStats = db.prepare(`
        SELECT trackName, artistName, songId, songDuration, playCount, likes, dislikes, stars, lastPlayed, averageReview
        FROM room_stats
        WHERE LOWER(TRIM(trackName))  = LOWER(TRIM(?))
          AND LOWER(TRIM(artistName)) = LOWER(TRIM(?))
        ORDER BY id DESC
        LIMIT 1
      `).get(currentSong.trackName, currentSong.artistName)
      }

      if (!songStats) {
        await postMessage({ room, message: 'No stats found for this song yet.' })
        return
      }

      // Reviews count
      const reviewRow = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM song_reviews
      WHERE songId = ?
    `).get(songStats.songId ?? currentSong.songId)
      const reviewsCount = reviewRow?.cnt ?? 0

      // Live average from song_reviews (rounded 1 decimal)
      const avgRow = db.prepare(`
      SELECT ROUND(AVG(rating), 1) AS avg
      FROM song_reviews
      WHERE songId = ?
      `).get(songStats.songId ?? currentSong.songId)
      const avgLive = (avgRow?.avg != null) ? Number(avgRow.avg).toFixed(1) : null

      // First played (true all-time) — use append-only song_plays analytics log
      const bounds = db.prepare(`
        SELECT MIN(playedAt) AS firstPlayed
        FROM song_plays
        WHERE LOWER(TRIM(trackName))  = LOWER(TRIM(?))
         AND LOWER(TRIM(artistName)) = LOWER(TRIM(?))
      `).get(songStats.trackName, songStats.artistName) || {}

      const plays = songStats.playCount ?? 0
      const likes = songStats.likes ?? 0
      const dislikes = songStats.dislikes ?? 0
      const hearts = songStats.stars ?? 0 // "stars" column == ❤️
      const net = likes - dislikes // 👍 minus 👎
      const netPP = perPlay(net, plays)

      const likeRate = pct(likes, plays)
      const disRate = pct(dislikes, plays)
      const heartRate = pct(hearts, plays)
      const heartsPP = perPlay(hearts, plays)
      const engagePP = perPlay(likes + dislikes + hearts, plays)

      const avg = (avgLive != null)
        ? avgLive
        : (songStats.averageReview != null ? Number(songStats.averageReview).toFixed(1) : null)
      const durationStr = formatDuration(
        songStats.songDuration,
        [currentSong.songDuration, currentSong.duration]
      )

      const lines = [
      `📊 "${songStats.trackName}" — ${songStats.artistName}`,
      `⏱️ Duration: ${durationStr}`,
      `🟢 Plays: ${plays}`,
      `👍 Likes: ${likes}`,
      `👎 Dislikes: ${dislikes}`,
      `❤️ Hearts: ${hearts}`,
      `📈 Like%: ${likeRate}%`,
      `📉 Dislike%: ${disRate}%`,
      `⭐ Avg Review: ${avg ? `${avg}/10` : '—'}  (🧾 ${reviewsCount})`,
      `📆 First Played: ${fmtDate(bounds.firstPlayed)}`
      ]

      await postMessage({ room, message: lines.join('\n') })
    } catch (error) {
      console.error('Error retrieving song stats:', error)
      await postMessage({ room, message: 'Error retrieving song stats.' })
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

      const message = '📈 **Most Played Songs:**\n\n' +
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

      const message = '❤️ **Top Liked Songs:**\n\n' +
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
      ? { ...roomBot.currentAlbum }
      : null

    // 2) DB fallback (map fields from current_state singleton)
    if (!album) {
      const row = await Promise.resolve(getCurrentState?.())
      if (row && (row.albumNameField || row.albumAlbumID || row.albumArtistName)) {
        album = {
          albumID: row.albumAlbumID ?? row.albumID ?? null,
          albumName: row.albumNameField ?? row.albumName ?? null,
          artistName: row.albumArtistName ?? row.artistName ?? null,
          releaseDate: row.albumReleaseDate ?? row.releaseDate ?? null,
          albumArt: row.albumArtField ?? row.albumArt ?? null,
          trackCount: row.totalTracks ?? null
        }
      }
    }

    if (!album?.albumName || !album?.artistName) {
      await postMessage({
        room,
        message: 'No album is currently playing or album info is missing.'
      })
      return
    }

    // 3) Fetch avg + count if reviews exist
    let avgInfo = null
    try {
      const stats = db.prepare(`
      SELECT
        s.id AS id,
        ROUND(AVG(r.rating), 1) AS avg,
        COUNT(r.id)           AS cnt
      FROM album_stats s
      LEFT JOIN album_reviews r ON r.albumId = s.id
      WHERE s.albumName = ? AND s.artistName = ?
    `).get(album.albumName, album.artistName)

      if (stats && stats.cnt > 0 && stats.avg != null) {
        avgInfo = { avg: Number(stats.avg).toFixed(1), cnt: stats.cnt }
      }
    } catch (e) {
      console.error('[album] avg lookup failed:', e?.message || e)
    }

    // 4) Post details (with average line when present)
    const lines = [
    `💿 Album: ${album.albumName}`,
    `👤 Artist: ${album.artistName}`,
    album.releaseDate ? `📅 Released: ${album.releaseDate}` : null,
    avgInfo ? `⭐ Average Rating: ${avgInfo.avg}/10 (${avgInfo.cnt} review${avgInfo.cnt === 1 ? '' : 's'})` : null
    ].filter(Boolean)

    await postMessage({ room, message: lines.join('\n') })

    // 5) Post cover art if available
    if (album.albumArt) {
      await postMessage({ room, images: [album.albumArt] })
    }
  } else if (payload.message.startsWith('/art')) {
  // 1️⃣ In‐memory first
    let artUrl = roomBot.currentSong?.albumArt || null

    // 2️⃣ DB fallback
    if (!artUrl) {
      const row = await Promise.resolve(getCurrentState?.())
      artUrl = row?.albumArt || null
    }

    if (artUrl) {
      await postMessage({ room, images: [artUrl] })
    } else {
      await postMessage({
        room,
        message: 'No album art available right now.'
      })
    }
  } else if (payload.message.startsWith('/score')) {
  // 1️⃣ In-memory first
    let song = (roomBot.currentSong && roomBot.currentSong.trackName)
      ? roomBot.currentSong
      : null

    // 2️⃣ DB fallback
    if (!song) {
      const row = await Promise.resolve(getCurrentState?.())
      if (row && row.trackName) {
        song = {
          trackName: row.trackName,
          artistName: row.artistName,
          popularity: row.popularity
        }
      }
    }

    if (song) {
      const msg = `🎵 ${song.trackName} by ${song.artistName} has a current popularity score of ${song.popularity} out of 100.`
      await postMessage({ room, message: msg })
    } else {
      await postMessage({
        room,
        message: 'No song is currently playing or track info is missing.'
      })
    }
  } else if (payload.message.startsWith('/suggestsongs')) {
    const recentSongs = readRecentSongs()

    if (!recentSongs || recentSongs.length === 0) {
      await postMessage({
        room,
        message: "I don't have any recent songs to suggest right now."
      })
      return
    }

    const suggestedTracks = []
    const seenArtists = new Set()
    const seenTracks = new Set()

    for (const song of recentSongs.slice(0, 5)) {
      const { artistName, trackName } = song
      const similar = await getSimilarTracks(artistName, trackName)

      for (const suggestion of similar) {
        const artist = suggestion.artistName.trim().toLowerCase()
        const track = suggestion.trackName.trim().toLowerCase()
        const uniqueKey = `${artist} - ${track}`

        if (seenArtists.has(artist) || seenTracks.has(uniqueKey)) continue

        seenArtists.add(artist)
        seenTracks.add(uniqueKey)
        suggestedTracks.push(suggestion)

        if (suggestedTracks.length >= 5) break
      }

      if (suggestedTracks.length >= 5) break
    }

    const customDataSongs = []

    for (const { trackName, artistName } of suggestedTracks) {
      try {
        const trackDetails = await searchSpotify(artistName, trackName)
        if (trackDetails && trackDetails.spotifyUrl) {
          const songData = await fetchSongData(trackDetails.spotifyTrackID)
          customDataSongs.push({
            song: {
              ...songData,
              musicProviders: songData.musicProvidersIds,
              status: 'SUCCESS'
            }
          })
        }
      } catch (err) {
        console.warn(`❌ Failed to process ${trackName} by ${artistName}:`, err.message)
      }
    }

    if (customDataSongs.length > 0) {
      await postMessage({
        room,
        message: '🎧 Here are 5 new songs you might enjoy:',
        customData: { songs: customDataSongs }
      })
    } else {
      await postMessage({
        room,
        message: "Sorry, I couldn't find any playable suggestions from Last.fm."
      })
    }
    /// /////////////// BLACKLIST  //////////////////////////////
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
      try {
        // Use the promises API to read the blacklist asynchronously. If the
        // file does not exist, this will throw and fall through to the catch.
        const raw = await fs.promises.readFile(blacklistPath, 'utf8')
        blacklist = JSON.parse(raw)
      } catch {
        blacklist = []
      }

      if (blacklist.includes(fullName)) {
        await postMessage({
          room,
          message: `⛔️ "${fullName}" is already on the blacklist.`
        })
      } else {
        blacklist.push(fullName)
        try {
          await fs.promises.writeFile(blacklistPath, JSON.stringify(blacklist, null, 2))
        } catch (err) {
          console.error('Error writing to blacklist file:', err)
        }
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
    /// /////////////////////////////// JAMFLOW STORE ///////////////////////////////////
  } else if (payload.message.startsWith('/store')) {
    const roomId = payload.room ?? process.env.ROOM_UUID

    const lines = []
    lines.push('🛒 **Welcome to the JamFlow Store** 🛒')
    lines.push('')
    lines.push("Here's what you can spend your hard-earned dollars on today:")
    lines.push('')

    for (const [command, value] of Object.entries(storeItems)) {
      if (command.startsWith('---')) {
        lines.push('')
        lines.push(`__**${command.replace(/---/g, '').trim()}**__`)
        lines.push(`_${value}_`)
        lines.push('')
      } else {
        const costText = typeof value.cost === 'number' ? `$${value.cost}` : value.cost
        lines.push(`\`${command}\` — ${value.desc} (${costText})`)
      }
    }

    lines.push('')
    lines.push('🧾 Type any command to get started.')

    const storeMessage = lines.join('\n')
    await postMessage({ room: roomId, message: storeMessage })
  } else if (payload.message.startsWith('/8ball')) {
    const roomId = payload.room ?? process.env.ROOM_UUID

    const input = payload.message.trim()
    const args = input.split(' ').slice(1).join(' ').trim() // everything after '/8ball'

    if (!args) {
      await postMessage({
        room: roomId,
        message: '🎱 You need to ask a question after the command! Try: /8ball Will I win today?'
      })
      return // Do NOT charge
    }

    const { cost } = storeItems['/8ball']
    const uuid = payload.sender

    // Check balance
    const balance = await getUserWallet(uuid)
    if (balance < cost) {
      await postMessage({
        room: roomId,
        message: `💸 Not enough funds! You need $${cost}, but you only have $${balance}.`
      })
      return
    }

    // Deduct cost
    removeFromUserWallet(uuid, cost)

    // Get nickname and answer
    const nickname = await getUserNickname(uuid)
    const answer = await askMagic8Ball(uuid, args)

    await postMessage({
      room: roomId,
      message: `🎱 ${nickname}\nMagic 8-Ball says: *${answer}* (Cost: $${cost})`
    })
  }
}

export { usersToBeRemoved, userstagedive }
