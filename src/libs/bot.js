import fastJson from 'fast-json-patch'
import { SocketClient } from 'ttfm-socket'
import { joinChat, getMessages, postMessage } from './cometchat.js'
import { logger } from '../utils/logging.js'
import { handlers } from '../handlers/index.js'
import { fetchSpotifyPlaylistTracks, fetchCurrentUsers, spotifyTrackInfo, fetchAudioFeatures, fetchCurrentlyPlayingSong, fetchSpotifyRecommendations } from '../utils/API.js'
import { postVoteCountsForLastSong, songStatsEnabled } from '../utils/voteCounts.js'
import { usersToBeRemoved } from '../handlers/message.js'
import { escortUserFromDJStand } from '../utils/escortDJ.js'
import handleUserJoinedWithStatePatch from '../handlers/userJoined.js'
import { handleAlbumTheme, handleCoversTheme } from '../handlers/playedSong.js'
import { checkAndPostAudioFeatures, addHappySongsToPlaylist, addDanceSongsToPlaylist } from '../utils/audioFeatures.js'

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
    this.autoDJ = false
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

updateRecentSpotifyTrackIds(trackId) {
    // Get the current DJ
    const currentDJ = getCurrentDJ(this.state);

    // Check if the bot is the current DJ
    if (currentDJ === process.env.BOT_USER_UUID) {
        console.log('Bot is the current DJ; not updating recentSpotifyTrackIds.');
        return;
    }

    // Update recent track IDs only if the bot is not the current DJ
    if (this.recentSpotifyTrackIds.length >= 5) {
        this.recentSpotifyTrackIds.pop(); // Remove the oldest ID from the end
    }

    this.recentSpotifyTrackIds.unshift(trackId); // Add the new ID to the beginning
    console.log(`Updated recentSpotifyTrackIds: ${JSON.stringify(this.recentSpotifyTrackIds)}`);
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
              try {
                await addHappySongsToPlaylist(spotifyTrackId); // Adding happy songs to the playlist if they meet the criteria
              } catch (error) {
                console.error('Error adding happy songs to playlist:', error);
              }
              try {
                await addDanceSongsToPlaylist(spotifyTrackId); // Adding happy songs to the playlist if they meet the criteria
              } catch (error) {
                console.error('Error adding Dance songs to playlist:', error);
              }
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

  async getRandomSong(useSuggestions = false) {
    try {
        let tracks;

        // Check if suggestions are to be used
        if (useSuggestions) {
            const recentTracks = this.recentSpotifyTrackIds.slice(0, 5);
            console.log('Fetching Spotify recommendations using recent tracks:', recentTracks);
            tracks = await fetchSpotifyRecommendations([], [], recentTracks, 5);
        } else {
            const playlistId = process.env.DEFAULT_PLAYLIST_ID; // Ensure this is set in your environment
            console.log(`Fetching tracks for playlist ID: ${playlistId}`);
            tracks = await fetchSpotifyPlaylistTracks(playlistId); // Pass the playlist ID here
        }

        if (!tracks || tracks.length === 0) {
            throw new Error('No tracks found in the selected source.');
        }

        const randomTrackIndex = Math.floor(Math.random() * tracks.length);
        const randomTrack = tracks[randomTrackIndex];

        // Use the convertTracks function for consistency
        const song = await this.convertTracks(randomTrack);

        console.log('Generated song:', song);

        return song;
    } catch (error) {
        console.error('Error getting random song:', error);
        throw error;
    }
}

  
async updateNextSong() {
  try {
      logger.debug('Attempting to update the next song...');

      if (!this.socket) {
          throw new Error('SocketClient not initialized. Please call connect() first.');
      }

      // Check if the bot is currently a DJ
      if (!this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
          logger.warn('Bot is not a DJ, skipping song update.');
          return;
      }

      let tracks;

      // Use this.autoDJ to determine whether to use recommendations or playlist
      if (this.autoDJ) {
          const recentTracks = this.recentSpotifyTrackIds.slice(0, 3);
          logger.debug('Fetching Spotify recommendations using recent tracks:', recentTracks);
          tracks = await fetchSpotifyRecommendations([], [], recentTracks, 5);
      } else {
          const playlistId = process.env.DEFAULT_PLAYLIST_ID;
          logger.debug(`Fetching tracks for playlist ID: ${playlistId}`);
          tracks = await fetchSpotifyPlaylistTracks(playlistId);
      }

      if (!tracks || tracks.length === 0) {
          logger.warn('No tracks found. Please check your playlist or recommendation settings.');
          return;
      }

      // Select a random track from the fetched tracks
      const randomTrackIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomTrackIndex];

      // Extract the Spotify URI from the track object
      const spotifyUri = randomTrack.track ? randomTrack.track.uri : randomTrack.uri;

      if (!spotifyUri) {
          logger.error('Invalid track object:', JSON.stringify(randomTrack, null, 2));
          throw new Error('Random track selection failed or track object is invalid.');
      }

      // Construct the song object for updating the next song
      const song = {
          musicProviders: {
              spotify: spotifyUri
          }
      };

      // Send the song update action to the room
      await this.socket.action('updateNextSong', {
          roomUuid: process.env.ROOM_UUID,
          song: song,
          userUuid: process.env.BOT_USER_UUID
      });

      logger.debug('Next song updated successfully.');
  } catch (error) {
      logger.error('Error updating next song:', error);
  }
}

  convertTracks(track) {
    try {
        // Check if the track object is valid and contains necessary data
        if (!track || !track.name || !track.artists || !track.id) {
            throw new Error('Invalid track item received.');
        }
  
        // Assuming the conversion process requires track name, artist, and track ID
        const song = {
            title: track.name,
            artist: track.artists[0].name,  // You may want to add validation for multiple artists
            trackId: track.id,
            durationMs: track.duration_ms,
            album: track.album.name,
            artworkUrl: track.album.images[0]?.url, // Optional chaining in case the artwork doesn't exist
            spotifyUri: `spotify:track:${track.id}` // Construct the Spotify URI
        };
  
        return song;
  
    } catch (error) {
        logger.error('Error converting track:', error.message);
        throw error;
    }
}

async addDJ(useSuggestions = false) {
  try {
    
      if (this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
          logger.debug('Bot is already a DJ.');
          return;
      }

      logger.debug('Bot is not currently a DJ. Adding as DJ...');

      if (!this.socket) {
          throw new Error('SocketClient not initialized. Please call connect() first.');
      }

      let tracks;

      if (useSuggestions) {
          const recentTracks = this.recentSpotifyTrackIds.slice(0, 3);
          logger.debug('Fetching Spotify recommendations using recent tracks:', recentTracks);
          tracks = await fetchSpotifyRecommendations([], [], recentTracks, 5);
      } else {
          const playlistId = process.env.DEFAULT_PLAYLIST_ID;
          logger.debug(`Fetching tracks for playlist ID: ${playlistId}`);
          tracks = await fetchSpotifyPlaylistTracks(playlistId);
      }

      if (!tracks || tracks.length === 0) {
          logger.warn('No tracks found. Please check your playlist or recommendation settings.');
          return;
      }


      const randomTrackIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomTrackIndex];

      // Adjust the path to the Spotify URI depending on track structure
      const spotifyUri = randomTrack.track ? randomTrack.track.uri : randomTrack.uri;

      if (!spotifyUri) {
          logger.error('Invalid track object:', JSON.stringify(randomTrack, null, 2));
          throw new Error('Random track selection failed or track object is invalid.');
      }

      const song = {
          musicProviders: {
              spotify: spotifyUri
          }
      };

      await this.socket.action('addDj', {
          roomUuid: process.env.ROOM_UUID,
          song: song,
          tokenRole: 'bot',
          userUuid: process.env.BOT_USER_UUID
      });

      logger.debug('DJ added successfully.');
  } catch (error) {
      logger.error('Error adding DJ:', error);
  }
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
