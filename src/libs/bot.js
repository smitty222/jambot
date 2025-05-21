import fastJson from 'fast-json-patch'
import { SocketClient } from 'ttfm-socket'
import { joinChat, getMessages } from './cometchat.js'
import { logger } from '../utils/logging.js'
import { handlers } from '../handlers/index.js'
import { fetchSpotifyPlaylistTracks, fetchCurrentUsers, spotifyTrackInfo, fetchCurrentlyPlayingSong, fetchSongData } from '../utils/API.js'
import { postVoteCountsForLastSong } from '../utils/voteCounts.js'
import { usersToBeRemoved, userstagedive } from '../handlers/message.js'
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

export function getCurrentDJUUIDs (state) {
  if (!state?.djs) {
    return []
  }
  return state.djs.map(dj => dj.uuid)
}

export function getCurrentSpotifyUrl () {
  if (this.currentSong && this.currentSong.spotifyUrl) {
    return this.currentSong.spotifyUrl
  } else {
    console.warn('Current Spotify URL not available.')
    return null
  }
}

export async function isUserDJ (senderUuid, state) {
  const currentDJs = getCurrentDJUUIDs(state) // Get the list of DJ UUIDs
  return currentDJs.includes(senderUuid) //
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

const updateRecentSongs = (newSong) => {
  try {
    const recentSongs = readRecentSongs() // Read current recent songs
    recentSongs.unshift(newSong) // Add the new song to the beginning

    if (recentSongs.length > 5) {
      recentSongs.pop() // Keep only the last 5 songs
    }

    fs.writeFileSync(recentSongsFilePath, JSON.stringify({ songs: recentSongs }, null, 2), 'utf8')
    console.log('Recent songs updated successfully.')
  } catch (error) {
    console.error('Error updating recent songs:', error)
  }
}

export class Bot {
  constructor (clientId, clientSecret, redirectUri) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.redirectUri = redirectUri
    this.accessToken = null
    this.refreshToken = null
    this.roomUUID = process.env.ROOM_UUID
    this.tokenRole = process.env.TOKEN_ROLE
    this.userUUID = process.env.BOT_USER_UUID
    this.lastMessageIDs = {}
    this.currentTheme = ''
    this.socket = null // Initialize socket as null
    this.playlistId = process.env.DEFAULT_PLAYLIST_ID // Add default playlist ID
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
      isrc: 'Unknown'
    }
    this.nextSong = {
      trackName: 'Unknown',
      spotifyUrl: null,
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
      isrc: 'Unknown'
    }
  }

  async enableAutoBop () {
    this.autobop = true
  }

  async disableAutoBop () {
    this.autobop = false
  }

  async enableAutoDJ () {
    this.autoDJ = true
  }

  async disableAutoDJ () {
    this.autoDJ = false
  }

  async connect () {
    logger.debug('Connecting to room')
    try {
      await joinChat(process.env.ROOM_UUID)

      this.socket = new SocketClient('https://socket.prod.tt.fm')

      const connection = await this.socket.joinRoom(process.env.TTL_USER_TOKEN, {
        roomUuid: process.env.ROOM_UUID
      })
      this.state = connection.state
    } catch (error) {
      logger.error('Error connecting to room:', error)
    }
  }

  updateRecentSpotifyTrackIds (trackId) {
    // Get the current DJ
    const currentDJ = getCurrentDJ(this.state)

    // Check if the bot is the current DJ
    if (currentDJ === process.env.BOT_USER_UUID) {
      console.log('Bot is the current DJ; not updating recentSpotifyTrackIds.')
      return
    }

    // Update recent track IDs only if the bot is not the current DJ
    if (this.recentSpotifyTrackIds.length >= 5) {
      this.recentSpotifyTrackIds.pop() // Remove the oldest ID from the end
    }

    // Add the new track ID to the beginning
    this.recentSpotifyTrackIds.unshift(trackId)
    console.log(`Updated recentSpotifyTrackIds: ${JSON.stringify(this.recentSpotifyTrackIds)}`)
  }

  async processNewMessages () {
    try {
      const response = await getMessages(process.env.ROOM_UUID, this.lastMessageIDs?.fromTimestamp)

      if (response?.data?.length) {
        for (const message of response.data) {
          if (message.sentAt === undefined) continue

          this.lastMessageIDs.fromTimestamp = message.sentAt + 1
          const textMessage = message?.data?.text?.trim()
          if (!textMessage) continue

          const sender = message?.sender
          if (!sender || sender === process.env.BOT_USER_UUID) continue
          if ([process.env.CHAT_USER_ID, process.env.CHAT_REPLY_ID].includes(sender)) continue

          handlers.message(
            {
              message: textMessage,
              sender,
              senderName: message?.data?.entities?.sender?.name ?? 'Unknown'
            },
            process.env.ROOM_UUID,
            this.state
          )
        }
      }
    } catch (error) {
      console.error('Error processing new messages:', error)
    }
  }

  configureListeners () {
    const self = this
    logger.debug('Setting up listeners')

    this.socket.on('statefulMessage', async (payload) => {
      self.state = fastJson.applyPatch(self.state, payload.statePatch).newDocument

      // Log the full payload for debugging
      logger.debug('Received payload:', JSON.stringify(payload, null, 2))

      // Check for the 'votedOnSong' event (or similar name)
      if (payload.name === 'votedOnSong') {
        logger.debug('Payload details:', JSON.stringify(payload, null, 2)) // Log everything about the event
      } else {
        logger.debug(`State updated for ${payload.name}`)
      }

      if (payload.name === 'userJoined') {
        try {
          await handleUserJoinedWithStatePatch(payload)
        } catch (error) {
          logger.error('Error handling userJoined event:', error)
        }
      }

      if (payload.name === 'playedSong') {
        try {
          let spotifyTrackId = null
          let songId = null

          try {
            const currentlyPlaying = await fetchCurrentlyPlayingSong()
              spotifyTrackId = currentlyPlaying.spotifyTrackId
              songId = currentlyPlaying.songId
               } catch (error) {
              console.error(error)
                }       
          // Fetch additional track details using the Spotify Track ID
          if (spotifyTrackId) {
            const trackInfo = await spotifyTrackInfo(spotifyTrackId)

            if (trackInfo) {
              this.currentSong = {
                trackName: trackInfo.spotifyTrackName || 'Unknown',
                spotifyUrl: trackInfo.spotifySpotifyUrl || '',
                spotifyTrackId,
                songId,
                artistName: trackInfo.spotifyArtistName || 'Unknown',
                albumName: trackInfo.spotifyAlbumName || 'Unknown',
                releaseDate: trackInfo.spotifyReleaseDate || 'Unknown',
                albumType: trackInfo.spotifyAlbumType || 'Unknown',
                trackNumber: trackInfo.spotifyTrackNumber || 'Unknown',
                totalTracks: trackInfo.spotifyTotalTracks || 'Unknown',
                songDuration: trackInfo.spotifyDuration || 'Unknown',
                albumArt: trackInfo.spotifyAlbumArt || '',
                popularity: trackInfo.spotifyPopularity || 0,
                previewUrl: trackInfo.spotifyPreviewUrl || '',
                isrc: trackInfo.spotifyIsrc || 'Unknown'
              }
            }
          }

          try {
            const newSong = {
              trackName: this.currentSong.trackName,
              artistName: this.currentSong.artistName,
              albumName: this.currentSong.albumName,
              releaseDate: this.currentSong.releaseDate,
              spotifyUrl: this.currentSong.spotifyUrl,
              popularity: this.currentSong.popularity
            }

            const currentDJ = getCurrentDJ(this.state)
            if (currentDJ === process.env.BOT_USER_UUID) { return }
            updateRecentSongs(newSong)
          } catch (error) {
            console.error('Error updating recent songs:', error)
          }

          const currentDJs = getCurrentDJUUIDs(this.state)
          if (currentDJs.includes(process.env.BOT_USER_UUID)) {
            console.log('Bot is on stage, updating next song...')
            await self.updateNextSong(true)
          } else {
            console.log('Bot is not on stage, skipping next song update.')
          }

          self.scheduleLikeSong(process.env.ROOM_UUID, process.env.BOT_USER_UUID)
          setTimeout(() => {
              postVoteCountsForLastSong(process.env.ROOM_UUID)
          }, 9500)
        } catch (error) {
          logger.error('Error handling playedSong event:', error)
        }
        try {
          await handleAlbumTheme(payload)
          await handleCoversTheme(payload)
        } catch (error) {
          logger.error('Error handling album or covers theme event:', error)
        }
        const currentDJ = getCurrentDJ(self.state)
        if (currentDJ && usersToBeRemoved[currentDJ]) {
          await escortUserFromDJStand(currentDJ)
          delete usersToBeRemoved[currentDJ]
          console.log(`User ${currentDJ} removed from DJ stand after their song ended.`)
        }
        
        const markedUUID = getMarkedUser()
    if (markedUUID) {
      console.log(`Removing marked DJ after song end: ${markedUUID}`)

      // Remove the DJ from the stage
      await this.removeDJ(markedUUID)

      // Clear the mark so it doesn't remove again
      unmarkUser()
    }

        await songPayment()

        /*setTimeout(() => {
          console.log(`Checking artist match for: ${self.currentSong.artistName}`)
          checkArtistAndNotify(self.state, self.currentSong)
        }, 10000)*/

      }
    })
  }

  getSocketInstance () {
    return this.socket
  }

  setSocketClient (socketClient) {
    this.socket = socketClient
  }

  async storeCurrentRoomUsers () {
    try {
      const currentUsers = await fetchCurrentUsers() // Fetch current room users
      this.currentRoomUsers = currentUsers // Store the current room users in the bot instance
      console.log('Current room users stored successfully:', currentUsers)
    } catch (error) {
      console.error('Error fetching and storing current room users:', error.message)
    }
  }

  async getRandomSong (useSuggestions = false) {
    try {
      let tracks

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
