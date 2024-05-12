import fastJson from 'fast-json-patch';
import { SocketClient} from 'ttfm-socket';
import { joinChat, getMessages } from './cometchat.js';
import { logger } from '../utils/logging.js';
import { handlers } from '../handlers/index.js';
import { fetchSpotifyPlaylistTracks } from '../utils/spotifyAPI.js';

export class Bot {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.accessToken = null;
    this.refreshToken = null;
    this.roomUUID = process.env.ROOM_UUID;
    this.tokenRole = process.env.TOKEN_ROLE;
    this.userUUID = process.env.BOT_USER_UUID;
    this.lastMessageIDs = {};
    this.currentTheme = '';
    this.socket = null; // Initialize socket as null
    this.playlistId = process.env.DEFAULT_PLAYLIST_ID; // Add default playlist ID
    this.spotifyCredentials = process.env.SPOTIFY_CREDENTIALS; 
    this.lastPlayedTrackURI = null;
  }

  
  async connect() {
    logger.debug('Connecting to room');
    try {
      await joinChat(process.env.ROOM_UUID);

      this.socket = new SocketClient('https://socket.prod.tt.fm');

      const connection = await this.socket.joinRoom(process.env.TTL_USER_TOKEN, {
        roomUuid: process.env.ROOM_UUID
      });
      this.state = connection.state;
    } catch (error) {
      logger.error('Error connecting to room:', error);
    }
  }

  async processNewMessages() {
    try {
      const response = await getMessages(process.env.ROOM_UUID, this.lastMessageIDs?.fromTimestamp);
      if (response?.data) {
        const messages = response.data;
        if (messages?.length) {
          for (const message in messages) {
            this.lastMessageIDs.fromTimestamp = messages[message].sentAt + 1;
            const customMessage = messages[message]?.data?.customData?.message ?? '';
            if (!customMessage) return;
            const sender = messages[message]?.sender ?? '';
  
            // Log the sender's ID and the message
            console.log(`Sender: ${sender}, Message: ${customMessage}`);
  
            // Check if the sender is the bot itself
            if (sender === process.env.BOT_USER_UUID) continue; // Skip processing if sender is bot
  
            if ([process.env.CHAT_USER_ID, process.env.CHAT_REPLY_ID].includes(sender)) return;
            handlers.message(
              {
                message: customMessage,
                sender,
                senderName: messages[message]?.data?.customData?.userName
              },
              process.env.ROOM_UUID
            );
          }
        }
      }
    } catch (error) {
      logger.error('Error processing new messages:', error);
    }
  }
  
  
  configureListeners() {
    const self = this;
    logger.debug('Setting up listeners');
    this.socket.on('statefulMessage', (payload) => {
      self.state = fastJson.applyPatch(self.state, payload.statePatch).newDocument;
      logger.debug(`State updated for ${payload.name}`);
      if (handlers[payload.name]) handlers[payload.name](self.state, process.env.ROOM_UUID);
  
      if (payload.name === 'playedSong') {
        self.updateNextSong();
      }
    });
  }
  
  
  getSocketInstance() {
    return this.socket;
  }

  setSocketClient(socketClient) {
    this.socket = socketClient;
  }

  async getRandomSong() {
    try {
      const tracks = await fetchSpotifyPlaylistTracks();
  
      if (!tracks || tracks.length === 0) {
        throw new Error('No tracks found in the Spotify playlist.');
      }
  
      console.log('Fetched tracks:', tracks); 
  
      const randomTrackIndex = Math.floor(Math.random() * tracks.length);
      const randomTrack = tracks[randomTrackIndex];
  
      console.log('Random track:', randomTrack); 
  
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
      };
  
      console.log('Generated song:', song); 
  
      return song;
    } catch (error) {
      console.error('Error getting random song:', error);
      throw error;
    }
  }
  
  
  async addDJ() {
    try {
      logger.debug('Attempting to add DJ...');
  
      if (this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
        logger.debug('Bot is already a DJ.');
        return;
      }
  
      logger.debug('Bot is not currently a DJ. Adding as DJ...');
  
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.');
      }
  
      const randomSong = await this.getRandomSong(); 
  
      logger.debug('Random song selected:', randomSong);
  
      await this.socket.action('addDj', {
        roomUuid: process.env.ROOM_UUID,
        song: randomSong,
        tokenRole: 'bot',
        userUuid: process.env.BOT_USER_UUID
      });
  
      logger.debug('DJ added successfully.');
    } catch (error) {
      logger.error('Error adding DJ:', error);
    }
  }
  


async updateNextSong() {
  try {
    if (!this.socket) {
      throw new Error('SocketClient not initialized. Please call connect() first.');
    }

    if (!this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
      console.log('Bot is not currently a DJ. Skipping updateNextSong.');
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 500)); // Add a delay to ensure smooth operation

    const randomSong = await this.getRandomSong(); // Fetch a random song

    const actionPayload = {
      roomUuid: process.env.ROOM_UUID,
      userUuid: process.env.BOT_USER_UUID,
      song: randomSong 
    };

    await this.socket.action('updateNextSong', actionPayload); // Update the next song with the random song
  } catch (error) {
    console.error('Error updating next song:', error);
  }
}

  
  async convertTracks() {
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
        spotify: "spotify:track:" + item.track.id,
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
  };
  return convertedTrack;
  }


  async removeDJ() {
    try {
      if (!this.state?.djs.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
        logger.debug('Bot is not a DJ.');
        return;
      }

      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.');
      }

      await this.socket.action('removeDj', {
        roomUuid: process.env.ROOM_UUID,
        userUuid: process.env.BOT_USER_UUID
      });
    } catch (error) {
      logger.error('Error removing DJ:', error);
    }
  }

  async voteOnSong(roomUuid, songVotes, userUuid) {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.');
      }

      const actionPayload = {
        roomUuid,
        songVotes,
        userUuid
      };

      // Call the voteOnSong action with the prepared payload
      await this.socket.action('voteOnSong', actionPayload);
    } catch (error) {
      logger.error('Error voting on song:', error);
    }
  }

  async scheduleLikeSong(roomUuid, userUuid) {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.');
      }

      // Set a timeout to trigger the "/like" action after 5 seconds
      setTimeout(async () => {
        try {
          await this.voteOnSong(process.env.ROOM_UUID, { like: true }, process.env.BOT_USER_UUID);
        } catch (error) {
          logger.error('Error voting on song', error);
        }
      }, 5000); // 5 seconds delay
    } catch (error) {
      logger.error('Error scheduling song vote', error);
    }
  }

}

