// src/libs/bot.js
import fastJson from 'fast-json-patch'
import { SocketClient } from 'ttfm-socket'
import { joinChat, getMessages, postMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
import { handlers } from '../handlers/index.js'
import {
  fetchSpotifyPlaylistTracks,
  fetchCurrentUsers,
  spotifyTrackInfo,
  fetchCurrentlyPlayingSong,
  fetchSongData
} from '../utils/API.js'
import { postVoteCountsForLastSong } from '../utils/voteCounts.js'
import { usersToBeRemoved, roomThemes } from '../handlers/message.js'
import { escortUserFromDJStand } from '../utils/escortDJ.js'
import handleUserJoinedWithStatePatch from '../handlers/userJoined.js'
import { handleAlbumTheme } from '../handlers/playedSong.js'
import { songPayment } from '../database/dbwalletmanager.js'
import { updateRecentSongs } from '../database/dbrecentsongsmanager.js'
import { getPopularSpotifyTrackID } from '../utils/autoDJ.js'
import { getMarkedUser, unmarkUser } from '../utils/removalQueue.js'
import { logCurrentSong, updateLastPlayed } from '../database/dbroomstatsmanager.js'
import * as themeManager from '../utils/themeManager.js'
import { announceNowPlaying } from '../utils/announceNowPlaying.js'
import { scheduleLetterChallenge, scoreLetterChallenge, parseDurationToMs } from '../handlers/songNameGame.js'
import { addTrackedUser } from '../utils/trackedUsers.js'
import { saveCurrentState } from '../database/dbcurrent.js'
import { askQuestion } from './ai.js'
import db from '../database/db.js'

// ───────────────────────────────────────────────────────────
// Ephemeral baseline & identity
// ───────────────────────────────────────────────────────────
const startTimeStamp = Math.floor(Date.now() / 1000) // seconds (baseline "now")
const botUUID = process.env.BOT_USER_UUID

// ───────────────────────────────────────────────────────────
// Theme resolution (DB-first) + album predicate
// ───────────────────────────────────────────────────────────
const ALBUM_THEMES = new Set(['album monday', 'albums', 'album day', 'album'])

function getThemeFromDB(roomUUID) {
  try {
    const row = db.prepare(`SELECT theme FROM themes WHERE roomId = ?`).get(roomUUID)
    if (row?.theme) return String(row.theme)
  } catch (e) {
    console.warn('[Theme][DB] lookup error:', e?.message || e)
  }
  return null
}

function resolveRoomTheme(roomUUID) {
  const dbTheme = getThemeFromDB(roomUUID)
  if (dbTheme) { console.log(`[Theme] resolved from DB: "${dbTheme}"`); return dbTheme }

  const tm = themeManager.getTheme(roomUUID)
  if (tm) { console.log(`[Theme] resolved from themeManager: "${tm}"`); return tm }

  const rt = roomThemes[roomUUID]
  if (rt) { console.log(`[Theme] resolved from roomThemes: "${rt}"`); return rt }

  console.log('[Theme] no theme found, defaulting to empty')
  return ''
}

export function isAlbumThemeActive(roomUUID) {
  if (['1','true','yes','on'].includes(String(process.env.FORCE_ALBUM_THEME || '').toLowerCase())) {
    console.log('[Theme] FORCE_ALBUM_THEME=on → albumActive=true')
    return true
  }
  const raw = resolveRoomTheme(roomUUID)
  const t = raw.toLowerCase().trim()
  const active = ALBUM_THEMES.has(t) || /\balbums?\b/.test(t)
  console.log(`[Theme] resolved="${t}" → albumActive=${active}`)
  return active
}

// ───────────────────────────────────────────────────────────
// AI blurb helpers
// ───────────────────────────────────────────────────────────
export function buildSongBlurbPrompt(song, tone = 'neutral') {
  const {
    trackName, artistName, albumName, releaseDate, isrc, popularity,
    bpm, key, genres, notes
  } = song || {}
  const toneLine = tone === 'playful'
    ? 'Tone: playful, 1 tasteful emoji allowed.'
    : tone === 'nerd'
      ? 'Tone: nerdy—include one micro fact (sample, key, or label).'
      : 'Tone: neutral, informative.'

  return `You are a music room bot. Write ONE ultra-brief blurb (max 160 characters) about the current song.
Only include facts you are highly confident in (>=90%) such as year, subgenre, if it is a remix/cover/sample, notable chart peak, country of origin, or producer.
If unsure, skip the fact and describe the vibe/genre succinctly. No links, no hashtags, no quotes, no extra lines. Output ONLY the blurb text.
${toneLine}

Song metadata:
Title: ${trackName || 'Unknown'}
Artist: ${artistName || 'Unknown'}
Album: ${albumName || 'Unknown'}
Release: ${releaseDate || 'Unknown'}
ISRC: ${isrc || 'Unknown'}
Spotify popularity: ${popularity ?? 'Unknown'}
Optional: BPM ${bpm ?? 'Unknown'}, Key ${key ?? 'Unknown'}, Genres ${genres ?? 'Unknown'}, Notes ${notes ?? ''}`
}

function extractText(reply) {
  if (!reply) return null
  if (typeof reply === 'string') return reply
  if (reply.text) return reply.text
  if (reply.candidates?.[0]?.content?.parts?.[0]?.text) return reply.candidates[0].content.parts[0].text
  return null
}

async function safeAskQuestion(prompt) {
  try {
    const result = await Promise.race([
      askQuestion(prompt),
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), 15000))
    ])
    const txt = extractText(result)
    if (!txt) throw new Error('AI_EMPTY_RESPONSE')
    return txt.trim()
  } catch (err) {
    logger.error(`[AI] ${err.message || err}`)
    return null
  }
}

// ───────────────────────────────────────────────────────────
// Polling helpers
// ───────────────────────────────────────────────────────────
function toSec(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return 0
  return n > 2e10 ? Math.floor(n / 1000) : Math.floor(n) // ms → sec
}

function normalizeMessages(raw) {
  if (!raw) return []
  const body = (raw && typeof raw === 'object' && 'data' in raw && !Array.isArray(raw.data)) ? raw.data : raw
  if (Array.isArray(body)) return body
  if (Array.isArray(body.data)) return body.data
  if (Array.isArray(body.messages)) return body.messages
  if (Array.isArray(body.items)) return body.items
  if (Array.isArray(body.results)) return body.results
  if (Array.isArray(body?.data?.messages)) return body.data.messages
  if (Array.isArray(body?.data?.items))    return body.data.items
  if (Array.isArray(body?.result?.messages)) return body.result.messages
  if (Array.isArray(body?.data?.data)) return body.data.data
  if (typeof body === 'object' && (body.id || body.message || body.text)) return [body]
  return []
}

// ───────────────────────────────────────────────────────────
// In-memory TTL de-dupe (prevents unbounded Set growth)
// ───────────────────────────────────────────────────────────
class TTLSeenSet {
  constructor(ttlMs = 10 * 60 * 1000, max = 5000) {
    this.ttl = ttlMs
    this.max = max
    this.map = new Map()
    this._pruneTimer = setInterval(() => this.prune(), Math.min(60_000, ttlMs))
    this._pruneTimer.unref?.()
  }
  has(id) { const v = id && this.map.get(id); return !!v && v > Date.now() }
  add(id) {
    if (!id) return
    if (this.map.size >= this.max) {
      const drop = Math.ceil(this.max * 0.1)
      for (const k of this.map.keys()) { this.map.delete(k); if (this.map.size <= this.max - drop) break }
    }
    this.map.set(id, Date.now() + this.ttl)
  }
  prune() { const now = Date.now(); for (const [k, exp] of this.map.entries()) if (exp <= now) this.map.delete(k) }
  clear() { clearInterval(this._pruneTimer); this.map.clear() }
}

// ───────────────────────────────────────────────────────────
// Bot
// ───────────────────────────────────────────────────────────
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

    // Ephemeral cursors: start "now" for both group & DM streams
    this.lastMessageIDs = {
      room: startTimeStamp,
      dm:   startTimeStamp
    }

    this.currentTheme = themeManager.getTheme(this.roomUUID) || ''
    this.socket = null
    this._listenersConfigured = false

    this.playlistId = process.env.DEFAULT_PLAYLIST_ID
    this.spotifyCredentials = process.env.SPOTIFY_CREDENTIALS

    this.recentSpotifyTrackIds = []
    this.autobop = true
    this.autoDJ = false
    this.audioStatsEnabled = true

    this.currentSong = {
      trackName: 'Unknown', spotifyTrackId: '', songId: '', spotifyUrl: '',
      artistName: 'Unknown', albumName: 'Unknown', releaseDate: 'Unknown',
      albumType: 'Unknown', trackNumber: 'Unknown', totalTracks: 'Unknown',
      songDuration: 'Unknown', albumArt: '', popularity: 0, previewUrl: '',
      isrc: 'Unknown', albumID: 'Unknown'
    }

    this.currentAlbum = {
      albumID: 'Unknown', albumName: null, artistName: 'Unknown',
      releaseDate: 'Unknown', albumType: 'Unknown', trackNumber: 'Unknown',
      totalTracks: 'Unknown', albumArt: '', previewUrl: '', isrc: 'Unknown'
    }

    this.lastPlayedSong = { songId: null, timestamp: 0 }

    this._lastAlbumThemeSongId = null
    this._lastBlurbBySongId = new Map()

    // De-dupe cache, startup guard, and reconnect backoff
    this._seen = new TTLSeenSet()
    this._startupTimeMs = Date.now()
    this._reconnectBackoffMs = 1000
    this._maxBackoffMs = 30_000
  }

  // Readiness bits for /ready (if you use them)
  isConnected() { return !!this.socket }
  canSend() { return !!this.socket }

  async connect() {
    logger.debug('Connecting to room')
    try {
      await joinChat(this.roomUUID)

      // fresh socket
      try { this.socket?.removeAllListeners?.() } catch {}
      try { this.socket?.close?.() } catch {}
      this.socket = new SocketClient('https://socket.prod.tt.fm')

      // reconnect handler with backoff
      this.socket.on?.('disconnect', () => this._scheduleReconnect())

      // join the room
      const connection = await this.socket.joinRoom(process.env.TTL_USER_TOKEN, { roomUuid: this.roomUUID })
      this.state = connection.state

      // configure listeners exactly once
      this.configureListeners()

      // reset backoff on success
      this._reconnectBackoffMs = 1000
      logger.info('[bot] connected and ready (ephemeral cursor)')
    } catch (error) {
      logger.error('Error connecting to room:', error)
      this._scheduleReconnect()
    }
  }

  _scheduleReconnect() {
    const jitter = (ms) => Math.floor(ms * (0.75 + Math.random() * 0.5))
    const wait = jitter(this._reconnectBackoffMs)
    logger.warn(`[bot] scheduling reconnect in ~${wait}ms`)
    setTimeout(() => {
      this.connect().catch((err) => {
        logger.error('[bot] reconnect failed', { err })
        this._reconnectBackoffMs = Math.min(this._reconnectBackoffMs * 2, this._maxBackoffMs)
        this._scheduleReconnect()
      })
    }, wait)
  }

  getCurrentSpotifyUrl() {
    return this.currentSong?.spotifyUrl || null
  }

  updateRecentSpotifyTrackIds(trackId) {
    const currentDJ = getCurrentDJ(this.state)
    if (currentDJ === this.userUUID) {
      console.log('Bot is the current DJ; not updating recentSpotifyTrackIds.')
      return
    }
    if (!trackId) return
    if (this.recentSpotifyTrackIds.length >= 5) this.recentSpotifyTrackIds.pop()
    this.recentSpotifyTrackIds.unshift(trackId)
  }

  async getRandomSong() {
    try {
      const playlistId = process.env.DEFAULT_PLAYLIST_ID
      const tracks = await fetchSpotifyPlaylistTracks(playlistId)
      if (!tracks || tracks.length === 0) throw new Error('No tracks found in the selected source.')
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)]
      const song = (this.convertTracks ? await this.convertTracks(randomTrack) : randomTrack)
      return song
    } catch (error) {
      console.error('Error getting random song:', error)
      throw error
    }
  }

  // NOTE: unified generateSongPayload (removed duplicate definition)
  async generateSongPayload() {
    const spotifyTrackId = await getPopularSpotifyTrackID()
    if (!spotifyTrackId) throw new Error('No popular Spotify track ID found.')
    const songData = await fetchSongData(spotifyTrackId)
    if (!songData || !songData.id) throw new Error('Invalid song data received.')
    return {
      songId: songData.id,
      trackName: songData.trackName,
      artistName: songData.artistName,
      duration: songData.duration,
      isrc: songData.isrc || '',
      explicit: songData.explicit || false,
      genre: songData.genre || '',
      links: songData.links || {},
      musicProviders: songData.musicProviders || {},
      thumbnails: songData.thumbnails || {},
      playbackToken: songData.playbackToken || null,
      album: songData.album || {},
      artist: songData.artist || {},
      status: songData.status || 'PENDING_UPLOAD',
      updatedAt: songData.updatedAt
    }
  }

  /**
   * Robust poller (ephemeral): no DB cursor, no history replay.
   * Uses a small lookback when idle but never earlier than startup.
   */
  async processNewMessages() {
    if (this._processingMessages) return
    this._processingMessages = true
    this._emptyPolls = this._emptyPolls ?? 0

    try {
      const handleStream = async (scope) => {
        const isGroup = scope === 'group'
        const sinceSec = toSec(isGroup ? this.lastMessageIDs.room : this.lastMessageIDs.dm)

        // On idle, look back slightly to catch clock skew – but never before startup.
        const lookbackSec = Math.max(
          this._emptyPolls >= 3 ? (sinceSec - 120) : sinceSec,
          startTimeStamp
        )

        const who = isGroup ? this.roomUUID : botUUID
        const raw = await getMessages(who, lookbackSec, scope)
        const msgs = normalizeMessages(raw?.data ?? raw)

        let gotAny = false
        let maxSec = sinceSec
        let processed = 0

        for (const m of msgs) {
          try {
            const id = m?.id ?? m?._id ?? m?.guid ?? m?.messageId ?? m?.meta?.id
            const sentAtSec = toSec(m?.sentAt ?? m?.timestamp ?? m?.createdAt ?? m?.data?.sentAt)
            const text = (m?.data?.text ?? m?.text ?? m?.message ?? '').trim()
            const sender =
              m?.sender ?? m?.senderId ?? m?.from ?? m?.ownerUid ??
              m?.entities?.sender?.uid ?? m?.entities?.sender?.id

            if (!id || !sentAtSec || !text) continue

            // In-run de-dupe (TTL)
            if (this._seen.has(id)) continue
            this._seen.add(id)

            // Ignore messages older than startup by >60s (belt & suspenders)
            if (sentAtSec < Math.floor(this._startupTimeMs / 1000) - 60) continue

            maxSec = Math.max(maxSec, sentAtSec + 1)
            gotAny = true
            processed++

            // Skip our own messages (CometChat/Turntable echoes)
            if (!sender || sender === botUUID) continue
            if ([botUUID, process.env.CHAT_REPLY_ID].includes(sender)) continue

            if (isGroup) {
              await handlers.message(
                { message: text, sender, receiverType: 'group' },
                this.roomUUID,
                this.state,
                this
              )
            } else {
              const senderName =
                m?.data?.entities?.sender?.name ??
                m?.senderName ??
                'Unknown'

              addTrackedUser(sender)

              await handlers.message(
                { message: text, sender, senderName, receiverType: 'user' },
                sender,
                this.state
              )
            }
          } catch (err) {
            logger.error(`processNewMessages[${scope}] per-message error`, { err })
          }
        }

        // advance ephemeral cursor if progressed (no DB writes)
        if (isGroup && maxSec !== sinceSec) this.lastMessageIDs.room = maxSec
        if (!isGroup && maxSec !== sinceSec) this.lastMessageIDs.dm = maxSec

        logger.debug(`poll[${scope}] processed=${processed} emptyPolls=${this._emptyPolls} since=${sinceSec} -> ${maxSec}`)
        return gotAny
      }

      const gotGroup = await handleStream('group')
      const gotDMs   = await handleStream('user')

      this._emptyPolls = (gotGroup || gotDMs) ? 0 : Math.min(this._emptyPolls + 1, 10)
    } catch (err) {
      logger.error('Error in processNewMessages:', err)
    } finally {
      this._processingMessages = false
    }
  }

  // Socket listeners
  configureListeners() {
    if (this._listenersConfigured || !this.socket) return
    this._listenersConfigured = true

    const self = this
    logger.debug('Setting up listeners')

    this.socket.on('statefulMessage', async (payload) => {
      try {
        for (const op of payload.statePatch) {
          if (!op.path || !op.path.startsWith('/')) continue
          const parts = op.path.split('/').slice(1)
          let obj = self.state
          for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i]
            const isNextIndex = /^\d+$/.test(parts[i + 1])
            if (obj[key] === undefined) obj[key] = isNextIndex ? [] : {}
            obj = obj[key]
          }
        }
        self.state = fastJson.applyPatch(self.state, payload.statePatch).newDocument
      } catch (err) {
        logger.error('Error applying state patch:', err)
        logger.error('Payload that caused it:', JSON.stringify(payload, null, 2))
        return
      }

      if (payload.name !== 'votedOnSong') logger.debug(`State updated for ${payload.name}`)

      if (payload.name === 'addedDj') {
        const addedDjPatch = payload.statePatch.find(p => p.path.includes('/djs/') && p.op === 'add' && p.value?.uuid)
        if (addedDjPatch) console.log(`DJ added: ${addedDjPatch.value.uuid}`)
      }

      if (payload.name === 'userJoined') {
        try { await handleUserJoinedWithStatePatch(payload) } catch (error) {
          logger.error('Error handling userJoined event:', error)
        }
      }

      if (payload.name === 'playedSong') {
        const currentDJs = getCurrentDJUUIDs(this.state)
        if (currentDJs.length === 0) {
          console.log('No DJs on stage, skipping playedSong processing.')
          return
        }

        try {
          const currentlyPlaying = await fetchCurrentlyPlayingSong()

          this.currentSong = {
            trackName:      currentlyPlaying.trackName || payload.data?.song?.trackName || 'Unknown',
            artistName:     currentlyPlaying.artistName || payload.data?.song?.artistName || 'Unknown',
            songId:         currentlyPlaying.songId || payload.data?.song?.songId || '',
            songDuration:   currentlyPlaying.duration || payload.data?.song?.duration || 'Unknown',
            isrc:           currentlyPlaying.isrc || 'Unknown',
            explicit:       currentlyPlaying.explicit || false,
            albumName:      currentlyPlaying.albumName || 'Unknown',
            releaseDate:    currentlyPlaying.releaseDate || 'Unknown',
            thumbnails:     currentlyPlaying.thumbnails || {},
            links:          currentlyPlaying.links || {},
            musicProviders: currentlyPlaying.musicProviders || {},
            playbackToken:  currentlyPlaying.playbackToken || null,
            status:         currentlyPlaying.status || null,
            spotifyTrackId: '',
            albumType:      'Unknown',
            trackNumber:    'Unknown',
            totalTracks:    'Unknown',
            popularity:     0,
            previewUrl:     '',
            albumID:        'Unknown',
            albumArt:       ''
          }

          const songDurationMs = parseDurationToMs(this.currentSong.songDuration)
          this.currentSong.challengeStartMs = Math.max(0, songDurationMs - 40000)

          if (this.currentSong.musicProviders.spotify) {
            const spotifyTrackId = this.currentSong.musicProviders.spotify
            const spotifyDetails = await spotifyTrackInfo(spotifyTrackId)
            if (spotifyDetails) {
              this.currentSong = {
                ...this.currentSong,
                spotifyTrackId,
                albumType:   spotifyDetails.spotifyAlbumType   || 'Unknown',
                trackNumber: spotifyDetails.spotifyTrackNumber || 'Unknown',
                totalTracks: spotifyDetails.spotifyTotalTracks || 'Unknown',
                popularity:  spotifyDetails.spotifyPopularity  || 0,
                previewUrl:  spotifyDetails.spotifyPreviewUrl  || '',
                isrc:        spotifyDetails.spotifyIsrc        || this.currentSong.isrc,
                albumID:     spotifyDetails.spotifyAlbumID     || 'Unknown',
                albumArt:    spotifyDetails.spotifyAlbumArt    || ''
              }
              this.currentAlbum = {
                albumID:     spotifyDetails.spotifyAlbumID,
                albumName:   spotifyDetails.spotifyAlbumName,
                artistName:  spotifyDetails.spotifyArtistName,
                releaseDate: spotifyDetails.spotifyReleaseDate,
                albumArt:    spotifyDetails.spotifyAlbumArt,
                trackCount:  spotifyDetails.spotifyTotalTracks
              }
            }
          }

          try { saveCurrentState({ currentSong: this.currentSong, currentAlbum: this.currentAlbum }) }
          catch (err) { console.error('Failed to save current state:', err) }

          const albumActive = await isAlbumThemeActive(this.roomUUID)
          const songIdForDedupe = this.currentSong.songId || this.currentSong.spotifyTrackId || this.currentSong.trackName
          console.log(`[AlbumTheme] active=${albumActive} | song="${this.currentSong.trackName}" id="${songIdForDedupe}"`)

          if (albumActive) {
            if (this._lastAlbumThemeSongId !== songIdForDedupe) {
              handleAlbumTheme({ roomUUID: this.roomUUID, rawPayload: payload })
                .catch(err => console.error('[AlbumTheme] handleAlbumTheme error:', err))
              this._lastAlbumThemeSongId = songIdForDedupe
            }
          } else {
            announceNowPlaying(this.roomUUID).catch(err =>
              logger.error('announceNowPlaying failed:', err)
            )
          }

          try { logCurrentSong(this.currentSong, 0, 0, 0) } catch (error) {
            console.error('Error logging current song to roomStats DB:', error)
          }
          updateLastPlayed(this.currentSong)

          try {
            const djType = whoIsCurrentDJ(this.state)
            const s = this.currentSong
            await updateRecentSongs({
              trackName: s.trackName || 'Unknown',
              artistName: s.artistName || 'Unknown',
              albumName: s.albumName || 'Unknown',
              releaseDate: s.releaseDate || 'Unknown',
              spotifyUrl: s.spotifyUrl || '',
              popularity: s.popularity || 0,
              dj: djType
            })
          } catch (error) {
            console.error('Error updating recent songs:', error)
          }

          const djList = getCurrentDJUUIDs(this.state)
          const botIndex = djList.indexOf(this.userUUID)
          if (djList.length === 1 && djList[0] === this.userUUID) {
            await self.updateNextSong()
          } else if (botIndex === 1) {
            await self.updateNextSong()
          }

          self.scheduleLikeSong(this.roomUUID, this.userUUID)
          setTimeout(() => postVoteCountsForLastSong(this.roomUUID), 9500)
        } catch (error) {
          logger.error('Error handling playedSong event:', error)
        }

        const currentDJ = getCurrentDJ(self.state)
        if (currentDJ && usersToBeRemoved[currentDJ]) {
          await escortUserFromDJStand(currentDJ)
          delete usersToBeRemoved[currentDJ]
        }
        const markedUUID = getMarkedUser()
        if (markedUUID) {
          await this.removeDJ(markedUUID)
          unmarkUser()
        }
        await songPayment()
        try {
          await scoreLetterChallenge(this)
          scheduleLetterChallenge(this)
        } catch (err) {
          logger.error('Error running Name Game scoring or scheduling:', err)
        }
      }
    })
  }

  async storeCurrentRoomUsers() {
    try {
      const currentUsers = await fetchCurrentUsers()
      this.currentRoomUsers = currentUsers
    } catch (error) {
      console.error('Error fetching and storing current room users:', error.message)
    }
  }

  async updateNextSong(userUuid) {
    try {
      const songPayload = await this.generateSongPayload()
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')

      const targetUuid = (typeof userUuid === 'string' && userUuid.length > 10) ? userUuid : this.userUUID
      logger.debug(`Updating next song for DJ: ${targetUuid} to: ${songPayload.trackName}`)

      await this.socket.action('updateNextSong', {
        roomUuid: process.env.ROOM_UUID,
        userUuid: targetUuid,
        song: songPayload
      })
    } catch (error) {
      logger.error('Error updating next song for DJ:', error)
    }
  }

  async addDJ(userUuid, tokenRole = 'DJ') {
    try {
      const currentDJs = getCurrentDJUUIDs(this.state)
      if (currentDJs.includes(userUuid)) { console.log(`User ${userUuid} is already on stage as a DJ.`); return false }

      const spotifyTrackId = await getPopularSpotifyTrackID()
      if (!spotifyTrackId) throw new Error('No popular Spotify track ID found.')

      const songData = await fetchSongData(spotifyTrackId)
      if (!songData || !songData.id) throw new Error('Invalid song data received.')

      const songPayload = {
        songId: songData.id,
        trackName: songData.trackName,
        artistName: songData.artistName,
        duration: songData.duration,
        isrc: songData.isrc || '',
        explicit: songData.explicit || false,
        genre: songData.genre || '',
        links: songData.links || {},
        musicProviders: songData.musicProviders || {},
        thumbnails: songData.thumbnails || {},
        playbackToken: songData.playbackToken || null,
        album: songData.album || {},
        artist: songData.artist || {},
        status: songData.status || 'PENDING_UPLOAD',
        updatedAt: songData.updatedAt
      }

      if (!this.socket) throw new Error('SocketClient not initialized.')
      await this.socket.action('addDj', { roomUuid: process.env.ROOM_UUID, userUuid, song: songPayload, tokenRole })
      return true
    } catch (error) {
      logger.error('Error adding DJ:', error)
      return false
    }
  }

  async removeDJ(userUuid) {
    try {
      const djUuid = (userUuid === process.env.BOT_USER_UUID) ? null : userUuid
      if (djUuid === null && !this.state?.djs?.some(dj => dj.uuid === process.env.BOT_USER_UUID)) {
        logger.debug('Bot is not a DJ, no action required.')
        return
      }
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')
      logger.debug(`Removing DJ: ${djUuid || 'Bot'} from the lineup.`)
      await this.socket.action('removeDj', {
        roomUuid: process.env.ROOM_UUID,
        userUuid: process.env.BOT_USER_UUID,
        djUuid
      })
    } catch (error) {
      logger.error(`Error removing user ${userUuid || 'Bot'} from DJ:`, error)
    }
  }

  async voteOnSong(roomUuid, songVotes, userUuid) {
    try {
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')
      await this.socket.action('voteOnSong', { roomUuid, songVotes, userUuid })
    } catch (error) {
      logger.error('Error voting on song:', error)
    }
  }

  async playOneTimeAnimation(animation, roomUuid, userUuid, emoji = null) {
    try {
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')
      const payload = { animation, roomUuid, userUuid }
      if (animation === 'emoji' && emoji) payload.emoji = emoji
      await this.socket.action('playOneTimeAnimation', payload)
    } catch (error) {
      logger.error('Error playing animation:', error)
    }
  }

  async scheduleLikeSong(roomUuid, userUuid) {
    try {
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')
      if (!this.autobop) return
      setTimeout(async () => {
        try { await this.voteOnSong(process.env.ROOM_UUID, { like: true }, process.env.BOT_USER_UUID) }
        catch (error) { logger.error('Error voting on song', error) }
      }, 5000)
    } catch (error) {
      logger.error('Error scheduling song vote', error)
    }
  }
}

// helpers
export function getCurrentDJUUIDs(state) {
  if (!state) return []
  const visible = Array.isArray(state.visibleDjs) ? state.visibleDjs : []
  const fallback = Array.isArray(state.djs) ? state.djs : []
  const djsToUse = visible.length > 0 ? visible : fallback
  return djsToUse.map(dj => dj.uuid)
}

export function getCurrentDJ(state) {
  const currentDJs = getCurrentDJUUIDs(state)
  return currentDJs.length > 0 ? currentDJs[0] : null
}

export function isUserDJ(senderUuid, state) {
  return getCurrentDJUUIDs(state).includes(senderUuid)
}

export function whoIsCurrentDJ(state) {
  const currentDJUuid = getCurrentDJ(state)
  return currentDJUuid === process.env.BOT_USER_UUID ? 'bot' : 'user'
}
