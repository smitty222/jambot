import fastJson from 'fast-json-patch'
import { SocketClient } from 'ttfm-socket'
import { joinChat, getMessages, postMessage } from './cometchat.js'
import { logger } from '../utils/logging.js'
import { handlers } from '../handlers/index.js'
import { fetchSpotifyPlaylistTracks, fetchCurrentUsers, spotifyTrackInfo, fetchAudioFeatures, fetchCurrentlyPlayingSong } from '../utils/API.js'
import { postVoteCountsForLastSong, songStatsEnabled } from '../utils/voteCounts.js'
import { usersToBeRemoved } from '../handlers/message.js'
import { escortUserFromDJStand } from '../utils/escortDJ.js'
import handleUserJoinedWithStatePatch from '../handlers/userJoined.js'
import { handleAlbumTheme, handleCoversTheme } from '../handlers/playedSong.js'
import { checkAndPostAudioFeatures } from '../utils/audioFeatures.js'

export function getCurrentDJUUIDs (state) {
  if (!state?.djs) {
    return []
  }
  return state.djs.map(dj => dj.uuid)
}

export function getCurrentSpotifyUrl () {
  if (this.currentSong && this.currentSong.spotifyUrl) {
    return currentSong.spotifyUrl
  } else {
    console.warn('Current Spotify URL not available.')
    return null
  }
}

function isUserDJ (senderUuid, state) {
  const currentDJs = getCurrentDJUUIDs(state) // Get the list of DJ UUIDs
  return currentDJs.includes(senderUuid) //
}

// Function to get the UUID of the current DJ (the one playing the song)
export function getCurrentDJ (state) {
  const currentDJs = getCurrentDJUUIDs(state)
  return currentDJs.length > 0 ? currentDJs[0] : null
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
    this.audioStatsEnabled = true
    this.recentSpotifyTrackIds = []
    this.currentSong = {
      trackName: 'Unknown',
      spotifyTrackId: null,
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
      isrc: 'Unknown',
      audioFeatures: {
        acousticness: null,
        danceability: null,
        energy: null,
        instrumentalness: null,
        liveness: null,
        loudness: null,
        speechiness: null,
        tempo: null,
        valence: null
      }
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
    if (this.recentSpotifyTrackIds.length >= 5) {
      this.recentSpotifyTrackIds.shift() // Remove the oldest ID
    }
    this.recentSpotifyTrackIds.push(trackId) // Add the new ID
    console.log(`Updated recentSpotifyTrackIds: ${JSON.stringify(this.recentSpotifyTrackIds)}`)
  }

  async processNewMessages () {
    try {
      const response = await getMessages(process.env.ROOM_UUID, this.lastMessageIDs?.fromTimestamp)
      if (response?.data) {
        const messages = response.data
        if (messages?.length) {
          for (const message of messages) {
            if (message.sentAt === undefined) {
              console.error('Message is missing sentAt:', message)
              continue
            }

            this.lastMessageIDs.fromTimestamp = message.sentAt + 1
            const customMessage = message?.data?.customData?.message ?? ''
            if (!customMessage) return
            const sender = message?.sender ?? ''

            console.log(`Sender: ${sender}, Message: ${customMessage}`)

            if (sender === process.env.BOT_USER_UUID) continue

            if ([process.env.CHAT_USER_ID, process.env.CHAT_REPLY_ID].includes(sender)) return
            handlers.message(
              {
                message: customMessage,
                sender,
                senderName: message?.data?.customData?.userName
              },
              process.env.ROOM_UUID,
              this.state
            )
          }
        }
      }
    } catch (error) {
      logger.error('Error processing new messages:', error)
    }
  }

  configureListeners () {
    const self = this
    logger.debug('Setting up listeners')

    this.socket.on('statefulMessage', async (payload) => {
      self.state = fastJson.applyPatch(self.state, payload.statePatch).newDocument
      logger.debug(`State updated for ${payload.name}`)

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

          try {
            spotifyTrackId = await fetchCurrentlyPlayingSong() // Fetch the Spotify track ID from the API
          } catch (fetchError) {
            console.error('Error fetching Spotify Track ID:', fetchError.message)
          }
          // Fetch additional track details using the Spotify Track ID
          if (spotifyTrackId) {
            const trackInfo = await spotifyTrackInfo(spotifyTrackId)

            if (trackInfo) {
              // Fetch audio features for the track
              const audioFeatures = await fetchAudioFeatures(spotifyTrackId)

              this.currentSong = {
                trackName: trackInfo.spotifyTrackName || 'Unknown',
                spotifyUrl: trackInfo.spotifySpotifyUrl || '',
                spotifyTrackId,
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
                isrc: trackInfo.spotifyIsrc || 'Unknown',
                audioFeatures: {
                  acousticness: audioFeatures.acousticness,
                  analysis_url: audioFeatures.analysis_url,
                  danceability: audioFeatures.danceability,
                  duration_ms: audioFeatures.duration_ms,
                  energy: audioFeatures.energy,
                  id: audioFeatures.id,
                  instrumentalness: audioFeatures.instrumentalness,
                  key: audioFeatures.key,
                  liveness: audioFeatures.liveness,
                  loudness: audioFeatures.loudness,
                  mode: audioFeatures.mode,
                  speechiness: audioFeatures.speechiness,
                  tempo: audioFeatures.tempo,
                  time_signature: audioFeatures.time_signature,
                  track_href: audioFeatures.track_href,
                  type: audioFeatures.type,
                  uri: audioFeatures.uri,
                  valence: audioFeatures.valence
                }
              }

              self.updateRecentSpotifyTrackIds(spotifyTrackId)

              console.log(`Updated currentSong: ${JSON.stringify(self.currentSong.trackName)}`)
            }
          }
          self.scheduleLikeSong(process.env.ROOM_UUID, process.env.BOT_USER_UUID)
          self.updateNextSong()
          setTimeout(() => {
            if (songStatsEnabled) {
              postVoteCountsForLastSong(process.env.ROOM_UUID)
            }
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
        try {
          await checkAndPostAudioFeatures(this.currentSong, process.env.ROOM_UUID);
          console.log('Audio features check and post completed.');
        } catch (error) {
          console.error('Error during audio features check and post:', error);
        }
      }

      if (payload.name === 'updatedNextSong') {
        try {
          // Extract the Spotify Track ID from the payload
          const nextSongPatch = payload.statePatch.find(patch => patch.path === '/visibleDjs/0/nextSong')
          const spotifyTrackId = nextSongPatch ? nextSongPatch.value.musicProviders.spotify : null

          // If a Spotify Track ID is available, fetch additional track details
          if (spotifyTrackId) {
            const trackInfo = await spotifyTrackInfo(spotifyTrackId)

            if (trackInfo) {
              self.nextSong = {
                trackName: trackInfo.spotifyTrackName || 'Unknown',
                spotifyUrl: trackInfo.spotifySpotifyUrl || `https://open.spotify.com/track/${spotifyTrackId}`,
                spotifyTrackId,
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
          } else {
            console.log('Spotify Track ID not found in payload.')
          }
        } catch (error) {
          console.error('Error processing updatedNextSong payload:', error)
        }
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

  async getRandomSong () {
    try {
      const tracks = await fetchSpotifyPlaylistTracks()

      if (!tracks || tracks.length === 0) {
        throw new Error('No tracks found in the Spotify playlist.')
      }

      console.log('Fetched tracks:', tracks)

      const randomTrackIndex = Math.floor(Math.random() * tracks.length)
      const randomTrack = tracks[randomTrackIndex]

      console.log('Random track:', randomTrack)

      const song = {
        artistName: randomTrack.track.artists[0].name,
        trackName: randomTrack.track.name,
        genre: null,
        duration: Math.floor(randomTrack.track.duration_ms / 1000),
        isrc: randomTrack.track.external_ids.isrc || null,
        musicProviders: {
          spotify: `spotify:track:${randomTrack.track.id}`
        },
        playbackToken: null,
        thumbnails: {},
        songShortId: '',
        crateSongUuid: '',
        status: '',
        position: 0
      }

      console.log('Generated song:', song)

      return song
    } catch (error) {
      console.error('Error getting random song:', error)
      throw error
    }
  }

  async addDJ () {
    try {
      logger.debug('Attempting to add DJ...')

      if (this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
        logger.debug('Bot is already a DJ.')
        return
      }

      logger.debug('Bot is not currently a DJ. Adding as DJ...')

      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      const randomSong = await this.getRandomSong()

      await this.socket.action('addDj', {
        roomUuid: process.env.ROOM_UUID,
        song: randomSong,
        tokenRole: 'bot',
        userUuid: process.env.BOT_USER_UUID
      })

      logger.debug('DJ added successfully.')
    } catch (error) {
      logger.error('Error adding DJ:', error)
    }
  }

  async updateNextSong () {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      if (!this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
        return
      }

      await new Promise(resolve => setTimeout(resolve, 500)) // Add a delay to ensure smooth operation

      const randomSong = await this.getRandomSong() // Fetch a random song

      const actionPayload = {
        roomUuid: process.env.ROOM_UUID,
        userUuid: process.env.BOT_USER_UUID,
        song: randomSong
      }

      await this.socket.action('updateNextSong', actionPayload) // Update the next song with the random song
    } catch (error) {
      console.error('Error updating next song:', error)
    }
  }

  async convertTracks () {
    const convertedTrack = {
      artistName: item.track.artists[0].name,
      trackName: item.track.name,
      genre: null,
      duration: Math.floor(item.track.duration_ms / 1000),
      isrc: item.track.external_ids.isrc,
      musicProviders: {
        apple: null,
        audius: null,
        napster: null,
        soundCloudPublic: null,
        spotify: 'spotify:track:' + item.track.id,
        youtube: null,
        pandora: null,
        deezer: null,
        tidal: null,
        amazonMusic: null,
        yandex: null,
        spinrilla: null,
        uploadService: null,
        sevenDigital: null
      },
      playbackToken: null,
      thumbnails: {
        apple: null,
        audius: null,
        napster: null,
        soundCloudPublic: null,
        spotify: null,
        youtube: null,
        pandora: null,
        deezer: null,
        tidal: null,
        amazonMusic: null,
        yandex: null,
        spinrilla: null,
        uploadService: null,
        sevenDigital: null
      },
      songShortId: '',
      crateSongUuid: '',
      status: '',
      position: 0
    }
    return convertedTrack
  }

  async removeDJ (userUuid) {
    try {
      const djUuid = (userUuid === process.env.BOT_USER_UUID) ? null : userUuid

      if (djUuid === null && !this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
        logger.debug('Bot is not a DJ.')
        return
      }

      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      await this.socket.action('removeDj', {
        roomUuid: process.env.ROOM_UUID,
        userUuid: process.env.BOT_USER_UUID, // Always use bot's UUID for removing the bot as DJ
        djUuid // If null, the endpoint will remove the bot as DJ
      })
    } catch (error) {
      logger.error(`Error removing user ${userUuid} from DJ:`, error)
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

export { isUserDJ }
