import fastJson from 'fast-json-patch'
import { SocketClient } from 'ttfm-socket'
import { joinChat, getMessages, startTimeStamp } from './cometchat.js'
import { logger } from '../utils/logging.js'
import { handlers } from '../handlers/index.js'
import { fetchSpotifyPlaylistTracks, fetchCurrentUsers, spotifyTrackInfo, fetchCurrentlyPlayingSong, fetchSongData, getSimilarArtists, getSimilarTracks, getArtistTags, getTopArtistTracks } from '../utils/API.js'
import { postVoteCountsForLastSong } from '../utils/voteCounts.js'
import { usersToBeRemoved, roomThemes } from '../handlers/message.js'
import { escortUserFromDJStand } from '../utils/escortDJ.js'
import handleUserJoinedWithStatePatch from '../handlers/userJoined.js'
import { handleAlbumTheme, handleCoversTheme } from '../handlers/playedSong.js'
// import { checkAndPostAudioFeatures, addHappySongsToPlaylist, addDanceSongsToPlaylist } from '../utils/audioFeatures.js'
import { songPayment } from './walletManager.js'
import { checkArtistAndNotify } from '../handlers/artistChecker.js'
import { getPopularSpotifyTrackID } from '../utils/autoDJ.js'
import { getMarkedUser, unmarkUser } from '../utils/removalQueue.js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs'
import { logCurrentSong, updateLastPlayed } from './roomStats.js'
import * as themeManager from '../utils/themeManager.js'
import { announceNowPlaying } from '../utils/voteCounts.js'
import { parseDurationToMs, scheduleLetterChallenge } from '../handlers/songNameGame.js'
import { addTrackedUser } from '../utils/trackedUsers.js'


const botUUID = process.env.BOT_USER_UUID

export function getCurrentDJUUIDs(state) {
  if (!state) return [];

  const visible = Array.isArray(state.visibleDjs) ? state.visibleDjs : [];
  const fallback = Array.isArray(state.djs) ? state.djs : [];

  const djsToUse = visible.length > 0 ? visible : fallback;

  return djsToUse.map(dj => dj.uuid);
}



export function getCurrentSpotifyUrl () {
  if (this.currentSong && this.currentSong.spotifyUrl) {
    return this.currentSong.spotifyUrl
  } else {
    console.warn('Current Spotify URL not available.')
    return null
  }
}

export function isUserDJ(senderUuid, state) {
  const currentDJs = getCurrentDJUUIDs(state);
  return currentDJs.includes(senderUuid);
}

export function whoIsCurrentDJ(state) {
  const currentDJUuid = getCurrentDJ(state);
  return currentDJUuid === process.env.BOT_USER_UUID ? "bot" : "user";
}




// Function to get the UUID of the current DJ (the one playing the song)
export function getCurrentDJ (state) {
  const currentDJs = getCurrentDJUUIDs(state)
  return currentDJs.length > 0 ? currentDJs[0] : null
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const recentSongsFilePath = join(__dirname, 'recentSongs.json')

export const readRecentSongs = () => {
  try {
    const data = fs.readFileSync(recentSongsFilePath, 'utf8')
    const parsedData = JSON.parse(data)

    // Ensure parsedData.songs is an array before returning
    return Array.isArray(parsedData.songs) ? parsedData.songs : []
  } catch (error) {
    console.error('Error reading recent songs:', error)
    return []
  }
}

const updateRecentSongs = async (newSong) => {
  try {
    const recentSongs = readRecentSongs();

    // === STEP 1: Populate similarTracks ===
    const similarTracks = await getSimilarTracks(newSong.artistName, newSong.trackName);

    if (similarTracks?.length > 0) {
      newSong.similarTracks = similarTracks
        .filter(t => t?.trackName && t?.artistName)
        .slice(0, 3);
    } else {
      const similarArtists = await getSimilarArtists(newSong.artistName);
      const fallbackTracks = [];

      for (const artistName of similarArtists.slice(0, 3)) {
        const topTracks = await getTopArtistTracks(artistName);
        const validTracks = topTracks.filter(t => t?.trackName);

        if (validTracks.length > 0) {
          const randomIndex = Math.floor(Math.random() * Math.min(10, validTracks.length));
          fallbackTracks.push({
            trackName: validTracks[randomIndex].trackName,
            artistName: artistName
          });
        }
      }

      newSong.similarTracks = fallbackTracks;
    }

    // === STEP 2: Add to recentSongs list ===
    recentSongs.unshift(newSong);

    if (recentSongs.length > 30) {
      recentSongs.length = 30;
    }

    fs.writeFileSync(
      recentSongsFilePath,
      JSON.stringify({ songs: recentSongs }, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('❌ Error updating recent songs:', error);
  }
};




export class Bot {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.redirectUri = redirectUri
    this.accessToken = null
    this.refreshToken = null
    this.roomUUID = process.env.ROOM_UUID
    this.tokenRole = process.env.TOKEN_ROLE
    this.userUUID = process.env.BOT_USER_UUID
    this.lastMessageIDs = {}
    this.currentTheme = themeManager.getTheme(this.roomUUID) || ''
    this.socket = null
    this.playlistId = process.env.DEFAULT_PLAYLIST_ID
    this.spotifyCredentials = process.env.SPOTIFY_CREDENTIALS
    this.lastPlayedTrackURI = null
    this.currentRoomUsers = []
    this.autobop = true
    this.autoDJ = false
    this.audioStatsEnabled = true
    this.recentSpotifyTrackIds = []
    this.currentSong = {
      trackName: 'Unknown',
      spotifyTrackId: '',
      songId: '',
      spotifyUrl: '',
      artistName: 'Unknown',
      albumName: 'Unknown',
      releaseDate: 'Unknown',
      albumType: 'Unknown',
      trackNumber: 'Unknown',
      totalTracks: 'Unknown',
      songDuration: 'Unknown',
      albumArt: '',
      popularity: 0,
      previewUrl: '',
      isrc: 'Unknown',
      albumID: 'Unknown'
    }
    this.currentAlbum = {
      albumID: 'Unknown',
      albumName: null,
      artistName: 'Unknown',
      releaseDate: 'Unknown',
      albumType: 'Unknown',
      trackNumber: 'Unknown',
      totalTracks: 'Unknown',
      albumArt: '',
      previewUrl: '',
      isrc: 'Unknown'
    }
    this.lastPlayedSong = {
    songId: null,
  timestamp: 0
}

  }

  // --- AutoBop / AutoDJ toggles ---
  async enableAutoBop() { this.autobop = true }
  async disableAutoBop() { this.autobop = false }
  async enableAutoDJ() { this.autoDJ = true }
  async disableAutoDJ() { this.autoDJ = false }

  // --- Connect to room and setup socket ---
  async connect() {
    logger.debug('Connecting to room')
    try {
      await joinChat(this.roomUUID)

      this.socket = new SocketClient('https://socket.prod.tt.fm')
      const connection = await this.socket.joinRoom(process.env.TTL_USER_TOKEN, {
        roomUuid: this.roomUUID
      })
      this.state = connection.state
    } catch (error) {
      logger.error('Error connecting to room:', error)
    }
  }

  // --- Update recent Spotify track IDs (used for AutoDJ or suggestions) ---
  updateRecentSpotifyTrackIds(trackId) {
    const currentDJ = getCurrentDJ(this.state)
    if (currentDJ === this.userUUID) {
      console.log('Bot is the current DJ; not updating recentSpotifyTrackIds.')
      return
    }

    if (this.recentSpotifyTrackIds.length >= 5) {
      this.recentSpotifyTrackIds.pop()
    }
    this.recentSpotifyTrackIds.unshift(trackId)
    console.log(`Updated recentSpotifyTrackIds: ${JSON.stringify(this.recentSpotifyTrackIds)}`)
  }

async processNewMessages() {
  try {
    // --- Group chat messages ---
    const groupMessages = await getMessages(this.roomUUID, this.lastMessageIDs?.room || startTimeStamp, 'group')
    if (groupMessages?.data?.length) {
      for (const message of groupMessages.data) {
        if (!message.sentAt || !message.data?.text) continue

        this.lastMessageIDs.room = Math.max(this.lastMessageIDs.room || 0, message.sentAt + 1)

        const textMessage = message.data.text.trim()
        if (!textMessage) continue

        const sender = message.sender
        if (!sender || sender === process.env.BOT_USER_UUID) continue

        // Skip messages from other bots
        if ([process.env.BOT_USER_UUID, process.env.CHAT_REPLY_ID].includes(sender)) continue

        await handlers.message(
          {
            message: textMessage,
            sender,
            receiverType: 'group'
          },
          this.roomUUID,
          this.state
        )
      }
    }

    // --- Direct messages to bot ---
    const dmMessages = await getMessages(process.env.BOT_USER_UUID, this.lastMessageIDs?.dm || startTimeStamp, 'user')
    if (dmMessages?.data?.length) {
      for (const message of dmMessages.data) {
        if (!message.sentAt) continue

        console.log('[RAW DM]', JSON.stringify(message, null, 2))

        if (!message.data?.text) continue

        this.lastMessageIDs.dm = Math.max(this.lastMessageIDs.dm || 0, message.sentAt + 1)

        const textMessage = message.data.text.trim()
        if (!textMessage) continue

        const sender = message.sender
        if (!sender || sender === process.env.BOT_USER_UUID) continue

        addTrackedUser(sender)

        console.log(`[DM] Message from ${sender}: ${textMessage}`)

        await handlers.message(
          {
            message: textMessage,
            sender,
            senderName: message?.data?.entities?.sender?.name ?? 'Unknown',
            receiverType: 'user'
          },
          sender,
          this.state
        )
      }
    }
  } catch (error) {
    console.error('Error processing new messages:', error)
  }
}




  // --- Setup socket event listeners ---
  configureListeners() {
    const self = this
    logger.debug('Setting up listeners')

    this.socket.on('statefulMessage', async (payload) => {
      try {
        // Defensive initialization for nested paths before applying patch
        for (const op of payload.statePatch) {
          if (!op.path || !op.path.startsWith('/')) continue
          const parts = op.path.split('/').slice(1)
          let obj = self.state
          for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i]
            const isNextIndex = /^\d+$/.test(parts[i + 1])
            if (obj[key] === undefined) {
              obj[key] = isNextIndex ? [] : {}
            }
            obj = obj[key]
          }
        }
        // Apply patch
        self.state = fastJson.applyPatch(self.state, payload.statePatch).newDocument
      } catch (err) {
        logger.error('Error applying state patch:', err)
        logger.error('Payload that caused it:', JSON.stringify(payload, null, 2))
        return
      }

      logger.debug('Received payload:', JSON.stringify(payload, null, 2))

      if (payload.name === 'votedOnSong') {
        logger.debug('Payload details:', JSON.stringify(payload, null, 2))
      } else {
        logger.debug(`State updated for ${payload.name}`)
      }


  if (payload.name === 'addedDj') {
    // The user who joined as DJ should be somewhere in the state patch,
    // usually as the uuid added to the djs array.
    // Let's extract it:

    // Find the patch entry that added a DJ UUID (usually path like "/djs/NN/uuid")
    const addedDjPatch = payload.statePatch.find(patch => patch.path.includes('/djs/') && patch.op === 'add' && patch.value?.uuid);

    if (addedDjPatch) {
      const addedUuid = addedDjPatch.value.uuid;
      console.log(`DJ added: ${addedUuid}`);
    } else {
      console.log('Added DJ payload received but could not find added UUID.');
    }
  }

      // Handle userJoined event
      if (payload.name === 'userJoined') {
        try {
          await handleUserJoinedWithStatePatch(payload)
        } catch (error) {
          logger.error('Error handling userJoined event:', error)
        }
      }

      // --- Handle playedSong event ---
      if (payload.name === 'playedSong') {

        const currentDJs = getCurrentDJUUIDs(this.state);

          if (currentDJs.length === 0) {
          console.log('No DJs on stage, skipping playedSong processing.');
          return;
          }
        try {
          // Fetch full song info from room-service API
          const currentlyPlaying = await fetchCurrentlyPlayingSong()

          // Set currentSong using full data, fallback to payload data if missing
          this.currentSong = {
            trackName: currentlyPlaying.trackName || payload.data?.song?.trackName || 'Unknown',
            artistName: currentlyPlaying.artistName || payload.data?.song?.artistName || 'Unknown',
            songId: currentlyPlaying.songId || payload.data?.song?.songId || '',
            songDuration: currentlyPlaying.duration || payload.data?.song?.duration || 'Unknown',
            isrc: currentlyPlaying.isrc || 'Unknown',
            explicit: currentlyPlaying.explicit || false,
            albumName: currentlyPlaying.albumName || 'Unknown',
            releaseDate: currentlyPlaying.releaseDate || 'Unknown',
            thumbnails: currentlyPlaying.thumbnails || {},
            links: currentlyPlaying.links || {},
            musicProviders: currentlyPlaying.musicProviders || {},
            playbackToken: currentlyPlaying.playbackToken || null,
            status: currentlyPlaying.status || null,
            spotifyTrackId: '',
            albumType: 'Unknown',
            trackNumber: 'Unknown',
            totalTracks: 'Unknown',
            albumArt: '',
            popularity: 0,
            previewUrl: '',
            albumID: 'Unknown'
          }

          const songDurationMs = parseDurationToMs(this.currentSong.songDuration);
          const challengeStartMs = Math.max(0, songDurationMs - 40000); // 30 seconds before end

          this.currentSong.challengeStartMs = challengeStartMs;

          // If Spotify info exists, enrich currentSong further
          if (this.currentSong.musicProviders.spotify) {
            const spotifyTrackId = this.currentSong.musicProviders.spotify
            const spotifyDetails = await spotifyTrackInfo(spotifyTrackId)

            if (spotifyDetails) {
              this.currentSong = {
                ...this.currentSong,
                spotifyTrackId,
                albumType: spotifyDetails.spotifyAlbumType || 'Unknown',
                trackNumber: spotifyDetails.spotifyTrackNumber || 'Unknown',
                totalTracks: spotifyDetails.spotifyTotalTracks || 'Unknown',
                popularity: spotifyDetails.spotifyPopularity || 0,
                previewUrl: spotifyDetails.spotifyPreviewUrl || '',
                isrc: spotifyDetails.spotifyIsrc || this.currentSong.isrc || 'Unknown',
                albumID: spotifyDetails.spotifyAlbumID || 'Unknown',
                albumArt: spotifyDetails.spotifyAlbumArt || ''
              }

              // Album theme logic (optional)
              if (roomThemes[this.roomUUID]?.toLowerCase().includes('album')) {
                if (
                  this.currentSong.trackNumber === 1 ||
                  !this.currentAlbum ||
                  this.currentAlbum.albumID !== this.currentSong.albumID
                ) {
                  this.currentAlbum = {
                    albumID: spotifyDetails.spotifyAlbumID,
                    albumName: spotifyDetails.spotifyAlbumName,
                    albumArt: spotifyDetails.spotifyAlbumArt,
                    artistName: spotifyDetails.spotifyArtistName,
                    trackCount: spotifyDetails.spotifyTotalTracks,
                    releaseDate: spotifyDetails.spotifyReleaseDate
                  }
                  console.log('Set new album review data:', this.currentAlbum)
                }
              }
            }
          }

          // Announce now playing
          await announceNowPlaying(this.roomUUID)

          // Log the song stats
          try {
            await logCurrentSong(this.currentSong, 0, 0, 0)
            console.log(`Logged song to roomStats.json: ${this.currentSong.trackName} by ${this.currentSong.artistName}`)
          } catch (error) {
            console.error('Error logging current song to roomStats.json:', error)
          }

          // Update last played timestamp
          await updateLastPlayed(this.currentSong)

          // Update recent songs with DJ info
          try {
            const djType = whoIsCurrentDJ(this.state)
            const song = this.currentSong

            const newSong = {
              trackName: song.trackName || 'Unknown',
              artistName: song.artistName || 'Unknown',
              albumName: song.albumName || 'Unknown',
              releaseDate: song.releaseDate || 'Unknown',
              spotifyUrl: song.spotifyUrl || '',
              popularity: song.popularity || 0,
              dj: djType
            }

            await updateRecentSongs(newSong)
          } catch (error) {
            console.error('Error updating recent songs:', error)
          }

          // AutoDJ: check DJ lineup and update next song if needed
          const currentDJs = getCurrentDJUUIDs(this.state)
          const botUUID = this.userUUID
          const botIndex = currentDJs.indexOf(botUUID)
          if (currentDJs.length === 1 && currentDJs[0] === botUUID) {
          console.log('🤖 Bot is solo DJ — triggering updateNextSong...');
           await self.updateNextSong(true)
          } else if (botIndex === 1) {
          console.log('🤖 Bot is 2nd DJ — preparing next song...');
          await self.updateNextSong(true)
          }


          // Schedule bot to like the song (autobop)
          self.scheduleLikeSong(this.roomUUID, this.userUUID)

          // Post vote counts after delay
          setTimeout(() => {
            postVoteCountsForLastSong(this.roomUUID)
          }, 9500)
        } catch (error) {
          logger.error('Error handling playedSong event:', error)
        }

        // Get current theme and check for 'Name Game'
          //const currentTheme = getTheme(this.roomUUID)?.toLowerCase()

          //if (currentTheme === 'name game') {
           // console.log('🎯 Name Game theme active. Scheduling letter challenge...')
            //scheduleLetterChallenge.call(this) // Make sure to bind the bot context
         // }

        // Optional: album or covers theme event handlers
        try {
          await handleAlbumTheme(payload)
          await handleCoversTheme(payload)
        } catch (error) {
          logger.error('Error handling album or covers theme event:', error)
        }

        // Remove users marked for removal after song ends
        const currentDJ = getCurrentDJ(self.state)
        if (currentDJ && usersToBeRemoved[currentDJ]) {
          await escortUserFromDJStand(currentDJ)
          delete usersToBeRemoved[currentDJ]
          console.log(`User ${currentDJ} removed from DJ stand after their song ended.`)
        }

        // Remove marked user from DJ stand if applicable
        const markedUUID = getMarkedUser()
        if (markedUUID) {
          console.log(`Removing marked DJ after song end: ${markedUUID}`)
          await this.removeDJ(markedUUID)
          unmarkUser()
        }

        // Process song payments
        await songPayment()
      }
    })
  }

  // --- Getter and setter for socket ---
  getSocketInstance() {
    return this.socket
  }

  setSocketClient(socketClient) {
    this.socket = socketClient
  }

  // --- Store current room users ---
  async storeCurrentRoomUsers() {
    try {
      const currentUsers = await fetchCurrentUsers()
      this.currentRoomUsers = currentUsers
      console.log('Current room users stored successfully:', currentUsers)
    } catch (error) {
      console.error('Error fetching and storing current room users:', error.message)
    }
  }

  async getRandomSong (useSuggestions = false) {
    try {      let tracks

      // Check if suggestions are to be used
      if (useSuggestions) {
        const recentTracks = this.recentSpotifyTrackIds.slice(0, 5)
        console.log('Fetching Spotify recommendations using recent tracks:', recentTracks)
        tracks = await fetchSpotifyRecommendations([], [], recentTracks, 5)
      } else {
        const playlistId = process.env.DEFAULT_PLAYLIST_ID // Ensure this is set in your environment
        console.log(`Fetching tracks for playlist ID: ${playlistId}`)
        tracks = await fetchSpotifyPlaylistTracks(playlistId) // Pass the playlist ID here
      }

      if (!tracks || tracks.length === 0) {
        throw new Error('No tracks found in the selected source.')
      }

      const randomTrackIndex = Math.floor(Math.random() * tracks.length)
      const randomTrack = tracks[randomTrackIndex]

      // Use the convertTracks function for consistency
      const song = await this.convertTracks(randomTrack)

      console.log('Generated song:', song)

      return song
    } catch (error) {
      console.error('Error getting random song:', error)
      throw error
    }
  }

  async updateNextSong (userUuid) {
    try {
    // Fetch a popular Spotify track ID
      const spotifyTrackId = await getPopularSpotifyTrackID()

      if (!spotifyTrackId) {
        throw new Error('No popular Spotify track ID found.')
      }

      // Fetch song data using the track ID
      const songData = await fetchSongData(spotifyTrackId)

      if (!songData || !songData.id) {
        throw new Error('Invalid song data received.')
      }

      // Prepare the songPayload using the fetched data
      const songPayload = {
        songId: songData.id, // Unique ID for the song
        trackName: songData.trackName,
        artistName: songData.artistName,
        duration: songData.duration,
        isrc: songData.isrc || '', // Handle missing ISRC gracefully
        explicit: songData.explicit || false, // Default to false if not provided
        genre: songData.genre || '', // Default to empty string if no genre is available
        links: songData.links || {}, // Ensure links are included
        musicProviders: songData.musicProviders || {}, // Include all music providers
        thumbnails: songData.thumbnails || {}, // Include thumbnails
        playbackToken: songData.playbackToken || null, // Default to null if missing
        album: songData.album || {}, // Include album info (may be empty)
        artist: songData.artist || {}, // Include artist info (may be empty)
        status: songData.status || 'PENDING_UPLOAD', // Default to 'PENDING_UPLOAD'
        updatedAt: songData.updatedAt // Include the update timestamp
      }

      // Ensure socket is initialized
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      // Log the DJ's next song update with the song details
      logger.debug(`Updating next song for DJ: ${userUuid} to: ${songPayload.trackName}`)

      // Call the updateNextSong action with the songPayload and other parameters
      await this.socket.action('updateNextSong', {
        roomUuid: process.env.ROOM_UUID, // Room UUID from environment variables
        userUuid, // The user UUID of the DJ whose next song is being updated
        song: songPayload // The song object
      })
    } catch (error) {
      logger.error('Error updating next song for DJ:', error)
    }
  }

  async addDJ (userUuid, tokenRole = 'DJ') {
    try {
    // Fetch a popular Spotify track ID
      const spotifyTrackId = await getPopularSpotifyTrackID()

      if (!spotifyTrackId) {
        throw new Error('No popular Spotify track ID found.')
      }

      // Fetch song data using the track ID
      const songData = await fetchSongData(spotifyTrackId)

      if (!songData || !songData.id) {
        throw new Error('Invalid song data received.')
      }

      // Prepare the songPayload using the fetched data
      const songPayload = {
        songId: songData.id, // Unique ID for the song
        trackName: songData.trackName,
        artistName: songData.artistName,
        duration: songData.duration,
        isrc: songData.isrc || '', // Handle missing ISRC gracefully
        explicit: songData.explicit || false, // Default to false if not provided
        genre: songData.genre || '', // Default to empty string if no genre is available
        links: songData.links || {}, // Ensure links are included
        musicProviders: songData.musicProviders || {}, // Include all music providers
        thumbnails: songData.thumbnails || {}, // Include thumbnails
        playbackToken: songData.playbackToken || null, // Default to null if missing
        album: songData.album || {}, // Include album info (may be empty)
        artist: songData.artist || {}, // Include artist info (may be empty)
        status: songData.status || 'PENDING_UPLOAD', // Default to 'PENDING_UPLOAD'
        updatedAt: songData.updatedAt // Include the update timestamp
      }

      // Ensure socket is initialized
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      // Log the DJ being added with the song details
      logger.debug(`Adding DJ: ${userUuid} to the lineup with song: ${songPayload.trackName}`)

      // Call the addDJ action with the songPayload and other parameters
      await this.socket.action('addDj', {
        roomUuid: process.env.ROOM_UUID, // Room UUID from environment variables
        userUuid, // The user UUID of the DJ being added
        song: songPayload, // The song object
        tokenRole // The role assigned to the user, default is 'DJ'
      })
    } catch (error) {
      logger.error('Error adding DJ:', error)
    }
  }

  async removeDJ (userUuid) {
    try {
      const djUuid = (userUuid === process.env.BOT_USER_UUID) ? null : userUuid

      // Check if the bot is already a DJ, if not, log and return
      if (djUuid === null && !this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
        logger.debug('Bot is not a DJ, no action required.')
        return
      }

      // Check if the socket is initialized
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      // Log which user is being removed and whether it's the bot or another DJ
      logger.debug(`Removing DJ: ${djUuid || 'Bot'} from the lineup.`)

      // Call the removeDJ action
      await this.socket.action('removeDj', {
        roomUuid: process.env.ROOM_UUID,
        userUuid: process.env.BOT_USER_UUID, // Always use bot's UUID for removing the bot as DJ
        djUuid // If null, remove the bot as DJ, otherwise remove the provided djUuid
      })
    } catch (error) {
      logger.error(`Error removing user ${userUuid || 'Bot'} from DJ:`, error)
    }
  }
 
  async voteOnSong (roomUuid, songVotes, userUuid) {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      const actionPayload = {
        roomUuid,
        songVotes,
        userUuid
      }

      // Call the voteOnSong action with the prepared payload
      await this.socket.action('voteOnSong', actionPayload)
    } catch (error) {
      logger.error('Error voting on song:', error)
    }
  }

  async playOneTimeAnimation (animation, roomUuid, userUuid, emoji = null) {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      const actionPayload = {
        animation,
        roomUuid,
        userUuid
      }

      if (animation === 'emoji' && emoji) {
        actionPayload.emoji = emoji
      }

      await this.socket.action('playOneTimeAnimation', actionPayload)
      console.log('Animation played successfully')
    } catch (error) {
      logger.error('Error playing animation:', error)
    }
  }

  async scheduleLikeSong (roomUuid, userUuid) {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }
      if (!this.autobop) {
        return
      }

      setTimeout(async () => {
        try {
          await this.voteOnSong(process.env.ROOM_UUID, { like: true }, process.env.BOT_USER_UUID)
        } catch (error) {
          logger.error('Error voting on song', error)
        }
      }, 5000) // 5 seconds delay
    } catch (error) {
      logger.error('Error scheduling song vote', error)
    }
  }
}
