// src/libs/bot.js
import fastJson from 'fast-json-patch'
import { SocketClient } from 'ttfm-socket'
import {
  joinChat,
  getMessages,
  postMessage,
  sendDirectMessage,
  getDirectMessagesForPeers,
  getConfiguredDMPeers
} from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
import messageHandler from '../handlers/message.js'
import {
  fetchSpotifyPlaylistTracks,
  fetchCurrentUsers,
  spotifyTrackInfo,
  fetchCurrentlyPlayingSong,
  fetchSongData,
  getUserNicknameByUuid
} from '../utils/API.js'
import { postVoteCountsForLastSong } from '../utils/voteCounts.js'
import { escortUserFromDJStand } from '../utils/escortDJ.js'
import handleUserJoinedWithStatePatch from '../handlers/userJoined.js'
import { handleAlbumTheme } from '../handlers/playedSong.js'
import { songPayment, addOrUpdateUser } from '../database/dbwalletmanager.js'
import { formatPrestigeUnlockLines } from '../database/dbprestige.js'
import { updateRecentSongs } from '../database/dbrecentsongsmanager.js'
import { getPopularSpotifyTrackID } from '../utils/autoDJ.js'
import { getMarkedUser, unmarkUser } from '../utils/removalQueue.js'
import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import http from 'http'
import { usersToBeRemoved } from '../utils/usersToBeRemoved.js'
import { logCurrentSong, updateLastPlayed } from '../database/dbroomstatsmanager.js'
import * as themeManager from '../utils/themeManager.js'
import { announceNowPlaying } from '../utils/announceNowPlaying.js'
import { scheduleLetterChallenge, scoreLetterChallenge, parseDurationToMs } from '../handlers/songNameGame.js'
import { saveCurrentState } from '../database/dbcurrent.js'
import { handleSongChainPlay } from '../games/songChainGame/songChainGame.js'
import db from '../database/db.js'
import { env } from '../config.js'

// ───────────────────────────────────────────────────────────
// Tunables (env overrides)
// ───────────────────────────────────────────────────────────
const SEEN_TTL_MS = env.botSeenTtlMs
const SEEN_MAX = env.botSeenMax
const DM_MAX_MERGED = env.botDmMaxMerged
const POLL_YIELD_EVERY = env.botPollYieldEvery
const STARTUP_BACKLOG_GRACE_S = env.botStartupGraceS

// ───────────────────────────────────────────────────────────
// Ephemeral baseline & identity
// ───────────────────────────────────────────────────────────
const startTimeStamp = Math.floor(Date.now() / 1000)

// ───────────────────────────────────────────────────────────
// Theme resolution (DB-first via themeManager) + album predicate
// ───────────────────────────────────────────────────────────
const ALBUM_THEMES = new Set(['album monday', 'albums', 'album day', 'album'])

function resolveRoomTheme (roomUUID) {
  return themeManager.getTheme(roomUUID)
}

export function isAlbumThemeActive (roomUUID) {
  if (['1', 'true', 'yes', 'on'].includes(String(env.themeForce || '').toLowerCase())) {
    return true
  }
  const raw = resolveRoomTheme(roomUUID)
  const t = raw.toLowerCase().trim()
  const active = ALBUM_THEMES.has(t) || /\balbums?\b/.test(t)
  return active
}

// ───────────────────────────────────────────────────────────
// AI blurb helpers
// ───────────────────────────────────────────────────────────
export function buildSongBlurbPrompt (song, tone = 'neutral') {
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

// ───────────────────────────────────────────────────────────
// Polling helpers
// ───────────────────────────────────────────────────────────
function toSec (ts) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return 0
  return n > 2e10 ? Math.floor(n / 1000) : Math.floor(n)
}

function normalizeMessages (raw) {
  if (!raw) return []
  const body = (raw && typeof raw === 'object' && 'data' in raw && !Array.isArray(raw.data))
    ? raw.data
    : raw
  if (Array.isArray(body)) return body
  if (Array.isArray(body.data)) return body.data
  if (Array.isArray(body.messages)) return body.messages
  if (Array.isArray(body.items)) return body.items
  if (Array.isArray(body.results)) return body.results
  if (Array.isArray(body?.data?.messages)) return body.data.messages
  if (Array.isArray(body?.data?.items)) return body.data.items
  if (Array.isArray(body?.result?.messages)) return body.result.messages
  if (Array.isArray(body?.data?.data)) return body.data.data
  if (typeof body === 'object' && (body.id || body.message || body.text)) return [body]
  return []
}

// ───────────────────────────────────────────────────────────
// Safe normaliser
// ───────────────────────────────────────────────────────────
function isMsg (m) {
  return !!(m && (m.id || m._id || m.guid || m.messageId))
}

const getUid = (x) => {
  if (!x) return null
  if (typeof x === 'string') return x
  return x.uid || x.id || x.user?.uid || x.user || null
}

const getSentAt = (m) => {
  const c =
    m?.sentAt ??
    m?.sent_at ??
    m?.timestamp ??
    m?.sent_at_ms ??
    m?.data?.sentAt ??
    m?.data?.sent_at ??
    0
  return toSec(c)
}

export function safeNormalize (raw) {
  const arr = Array.isArray(raw) ? raw : normalizeMessages(raw)
  const filtered = arr.filter(isMsg)
  return filtered.map((m) => {
    const id = m.id ?? m._id ?? m.guid ?? m.messageId
    const senderUid = getUid(m.sender) ?? getUid(m.sender?.uid) ?? m.sender ?? null
    const receiverUid = getUid(m.receiver) ?? m.receiver ?? null
    const textRaw = m?.data?.text ?? m?.text ?? m?.message ?? ''
    const text = typeof textRaw === 'string' ? textRaw.trim() : ''
    return {
      id,
      sender: senderUid,
      receiver: receiverUid,
      text,
      sentAtSec: getSentAt(m) || 0,
      conversationId: m.conversationId || m.conversation_id || null
    }
  })
}

// ───────────────────────────────────────────────────────────
// In-memory TTL de-dupe
// ───────────────────────────────────────────────────────────
class TTLSeenSet {
  constructor (ttlMs = SEEN_TTL_MS, max = SEEN_MAX) {
    this.ttl = ttlMs
    this.max = max
    this.map = new Map()
    this._pruneTimer = setInterval(() => this.prune(), Math.min(60_000, ttlMs))
    this._pruneTimer.unref?.()
  }

  has (id) {
    const v = id && this.map.get(id)
    return !!v && v > Date.now()
  }

  add (id) {
    if (!id) return
    if (this.map.size >= this.max) {
      const drop = Math.ceil(this.max * 0.1)
      for (const k of this.map.keys()) {
        this.map.delete(k)
        if (this.map.size <= this.max - drop) break
      }
    }
    this.map.set(id, Date.now() + this.ttl)
  }

  prune () {
    const now = Date.now()
    for (const [k, exp] of this.map.entries()) {
      if (exp <= now) this.map.delete(k)
    }
  }

  clear () {
    clearInterval(this._pruneTimer)
    this.map.clear()
  }
}

// ───────────────────────────────────────────────────────────
// DM/group helpers
// ───────────────────────────────────────────────────────────
const COMETCHAT_BOT_UID = env.botUserUuid || env.chatUserId

// DM cursor persistence
const DM_CURSOR_FILE =
  env.dmCursorFile || path.join(process.cwd(), 'src/data/dm_since.json')

// Persisted last message IDs
const LAST_MESSAGE_FILE =
  env.lastMessageFile || path.join(process.cwd(), 'src/data/lastMessageIDs.json')

/**
 * Load persisted lastMessageIDs from disk.
 * Returns an object or null on failure.
 */
function loadLastMessageIDs () {
  try {
    const txt = fs.readFileSync(LAST_MESSAGE_FILE, 'utf-8')
    const obj = JSON.parse(txt)
    return (obj && typeof obj === 'object') ? obj : null
  } catch {
    return null
  }
}

function createBufferedJsonWriter (filePath, label) {
  let queuedValue = null
  let writing = false

  async function flush () {
    if (writing || queuedValue == null) return

    writing = true
    const value = queuedValue
    queuedValue = null

    try {
      await fsPromises.mkdir(path.dirname(filePath), { recursive: true })
      await fsPromises.writeFile(filePath, JSON.stringify(value, null, 2))
    } catch (e) {
      logger.warn(`[bot] failed to persist ${label}`, { err: e?.message || e })
    } finally {
      writing = false
      if (queuedValue != null) {
        queueMicrotask(flush)
      }
    }
  }

  return (value) => {
    queuedValue = value
    queueMicrotask(flush)
  }
}

const persistLastMessageIDs = createBufferedJsonWriter(LAST_MESSAGE_FILE, 'last message IDs')
const persistDmCursors = createBufferedJsonWriter(DM_CURSOR_FILE, 'DM cursors')

/**
 * Persist lastMessageIDs to disk.
 * Errors are logged but not thrown.
 * @param {Object} ids
 */
function saveLastMessageIDs (ids) {
  persistLastMessageIDs(ids)
}

/**
 * Wrap a promise with a timeout. If the timeout elapses before the promise
 * resolves, the returned promise rejects with a timeout Error.
 * @param {Promise} promise
 * @param {number} ms
 * @returns {Promise}
 */
function withTimeout (promise, ms) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('timeout after ' + ms + 'ms')), ms)
    )
  ])
}
function loadDmCursors () {
  try {
    const txt = fs.readFileSync(DM_CURSOR_FILE, 'utf-8')
    const obj = JSON.parse(txt)
    return (obj && typeof obj === 'object') ? obj : {}
  } catch {
    return {}
  }
}

function saveDmCursors (cursors) {
  persistDmCursors(cursors)
}

const guessReceiverType = (m) => {
  const rt = m?.receiverType || m?.receiver_type
  if (rt) return String(rt).toLowerCase()
  const cid = m?.conversationId || m?.conversation_id || ''
  if (cid.includes('_user_')) return 'user'
  const rec = m?.receiver || m?.to || m?.toUser || null
  if (rec && getUid(rec)) return 'user'
  return 'group'
}

const peerFromConversationId = (cid, botUid) => {
  if (!cid) return null
  const idx = cid.indexOf('_user_')
  if (idx === -1) return null
  const left = cid.slice(0, idx)
  const right = cid.slice(idx + '_user_'.length)
  if (left === botUid) return right
  if (right === botUid) return left
  return left !== botUid ? left : right
}

const deriveDmPeer = (m, hintedPeer) => {
  if (hintedPeer) return hintedPeer
  const sender = getUid(m?.sender)
  const receiver = getUid(m?.receiver)
  if (sender && sender !== COMETCHAT_BOT_UID) return sender
  if (receiver && receiver !== COMETCHAT_BOT_UID) return receiver
  const cid = m?.conversationId || m?.conversation_id
  const fromCid = peerFromConversationId(cid, COMETCHAT_BOT_UID)
  return fromCid || receiver || sender || null
}

function sendHeartbeat (port = env.port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/heartbeat',
        method: 'GET',
        timeout: 2000
      },
      (res) => {
        res.resume()
        resolve()
      }
    )
    req.on('error', () => {
      resolve()
    })
    req.end()
  })
}

// ───────────────────────────────────────────────────────────
// Bot
// ───────────────────────────────────────────────────────────
export class Bot {
  constructor (clientId, clientSecret, redirectUri) {
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.redirectUri = redirectUri
    this.accessToken = null
    this.refreshToken = null

    this.roomUUID = env.roomUuid
    this.tokenRole = env.tokenRole
    this.userUUID = env.botUserUuid

    // Initialize lastMessageIDs.  If a persisted state exists on disk, load it.
    {
      const persistedIds = loadLastMessageIDs()
      this.lastMessageIDs = persistedIds || {
        room: startTimeStamp,
        dm: startTimeStamp
      }
    }

    this.currentTheme = themeManager.getTheme(this.roomUUID) || ''
    this.socket = null
    this._listenersConfigured = false

    this.playlistId = env.defaultPlaylistId
    this.spotifyCredentials = env.spotifyCredentials

    this.recentSpotifyTrackIds = []
    this.autobop = true
    this.autoDJ = false
    this.audioStatsEnabled = true

    // ───────────────────────────────────────────────────────────
    // Discover DJ mode state
    // When enabled, the bot will draw songs from specified Spotify playlists
    // instead of the default recommendation logic.  Songs are queued from
    // the provided playlists, deduplicated across lists, and a history is
    // maintained to avoid repeats.  See enableDiscoverDJ()/disableDiscoverDJ().
    this.discoverMode = false
    this.discoverPlaylists = []
    this.discoverSongQueue = []
    this.discoverHistory = new Set()

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

    this.lastPlayedSong = { songId: null, timestamp: 0 }

    this._lastAlbumThemeSongId = null
    this._lastBlurbBySongId = new Map()

    this._seen = new TTLSeenSet(SEEN_TTL_MS, SEEN_MAX)
    this._startupTimeMs = Date.now()
    this._reconnectBackoffMs = 1000
    this._maxBackoffMs = 30_000

    this._processingMessages = false
    this._emptyPolls = 0
    this._dmCandidates = new Set()
    this._dmPeers = new Set(getConfiguredDMPeers())
    this._dmSinceByPeer = {}
    for (const p of this._dmPeers) this._dmSinceByPeer[p] = startTimeStamp

    this.lastDmUser = null

    // Load DM cursors
    try {
      const persisted = loadDmCursors()
      if (persisted && typeof persisted === 'object') {
        for (const [uid, ts] of Object.entries(persisted)) {
          const sec = Number(ts)
          if (Number.isFinite(sec)) this._dmSinceByPeer[uid] = sec
        }
      }
      const times = Object.values(this._dmSinceByPeer)
      if (times.length > 0) {
        const maxTs = Math.max(...times.map(Number))
        if (Number.isFinite(maxTs) && maxTs > this.lastMessageIDs.dm) {
          this.lastMessageIDs.dm = maxTs
        }
      }
    } catch (e) {
      logger.warn('[bot] failed to load DM cursors', { err: e?.message || e })
    }
  }

  addDMPeer (uid) {
    if (!uid || uid === COMETCHAT_BOT_UID) return
    this._dmPeers.add(uid)
    this._dmCandidates.add(uid)
    if (!this._dmSinceByPeer[uid]) {
      this._dmSinceByPeer[uid] = toSec(this.lastMessageIDs.dm)
    }
  }

  isConnected () { return !!this.socket }
  canSend () { return !!this.socket }

  async connect () {
    try {
      await joinChat(this.roomUUID)

      // Clean up previous socket (if any)
      try {
        this.socket?.removeAllListeners?.()
      } catch (err) {
        logger.debug('[bot] socket listener cleanup failed', { err: err?.message || err })
      }
      try {
        this.socket?.close?.()
      } catch (err) {
        logger.debug('[bot] socket close during reconnect failed', { err: err?.message || err })
      }

      // 🔑 Allow listeners to be rebound for the new socket
      this._listenersConfigured = false

      // Create new socket
      this.socket = new SocketClient('https://socket.prod.tt.fm')

      this.socket.on?.('disconnect', () => {
        logger.warn('[bot] socket disconnected; scheduling reconnect')
        this._scheduleReconnect()
      })

      const connection = await this.socket.joinRoom(
        env.ttlUserToken,
        { roomUuid: this.roomUUID }
      )
      this.state = connection.state

      // Attach listeners for this socket instance
      this.configureListeners()

      // Reset backoff on successful connect
      this._reconnectBackoffMs = 1000
    } catch (error) {
      logger.error('Error connecting to room:', error)
      this._scheduleReconnect()
    }
  }

  _scheduleReconnect () {
    const jitter = (ms) => Math.floor(ms * (0.75 + Math.random() * 0.5))
    const wait = jitter(this._reconnectBackoffMs)

    setTimeout(() => {
      this.connect().catch((err) => {
        logger.error('[bot] reconnect failed', { err })
        this._reconnectBackoffMs = Math.min(
          this._reconnectBackoffMs * 2,
          this._maxBackoffMs
        )
        this._scheduleReconnect()
      })
    }, wait)
  }

  getCurrentSpotifyUrl () {
    return this.currentSong?.spotifyUrl || null
  }

  updateRecentSpotifyTrackIds (trackId) {
    const currentDJ = getCurrentDJ(this.state)
    if (currentDJ === this.userUUID) return
    if (!trackId) return
    if (this.recentSpotifyTrackIds.length >= 5) {
      this.recentSpotifyTrackIds.pop()
    }
    this.recentSpotifyTrackIds.unshift(trackId)
  }

  async getRandomSong () {
    try {
      const playlistId = env.defaultPlaylistId
      const tracks = await fetchSpotifyPlaylistTracks(playlistId)
      if (!tracks || tracks.length === 0) {
        throw new Error('No tracks found in the selected source.')
      }
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)]
      const song = (this.convertTracks
        ? await this.convertTracks(randomTrack)
        : randomTrack)
      return song
    } catch (error) {
      logger.error('Error getting random song:', error)
      throw error
    }
  }

  async generateSongPayload () {
    // Generate the next song payload.  If discover mode is active, attempt
    // to fetch the next track from the discover queue.  Otherwise fall back
    // to the popular track recommendation.  If the queue is exhausted, we
    // still fall back to the default recommendation so the bot never
    // stalls.
    let spotifyTrackId
    if (this.discoverMode) {
      try {
        spotifyTrackId = this.getNextDiscoverSongId()
      } catch (e) {
        spotifyTrackId = null
      }
      if (!spotifyTrackId) {
        // If discover mode runs out of songs, fall back to popular track
        spotifyTrackId = await getPopularSpotifyTrackID()
      }
    } else {
      spotifyTrackId = await getPopularSpotifyTrackID()
    }
    if (!spotifyTrackId) {
      throw new Error('No Spotify track ID found.')
    }
    const songData = await fetchSongData(spotifyTrackId)
    if (!songData || !songData.id) {
      throw new Error('Invalid song data received.')
    }
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

  _isStale (sentAtSec, baselineSec) {
    const grace = STARTUP_BACKLOG_GRACE_S
    return (
      sentAtSec < Math.floor(this._startupTimeMs / 1000) - grace ||
      sentAtSec < baselineSec
    )
  }

  async _cooperativeYieldIfNeeded (count, batchSize = 0) {
    if (count % POLL_YIELD_EVERY === 0 || batchSize > 500) {
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  // ───────────────────────────────────────────────────────────
  // Poller: group + DM inbox
  // ───────────────────────────────────────────────────────────
  async processNewMessages () {
    if (this._processingMessages) return
    this._processingMessages = true

    for (const u of getConfiguredDMPeers()) this.addDMPeer(u)

    try {
      let handledCount = 0
      // GROUP
      {
        // Fetch new group messages with a timeout.  If the fetch times out
        // or errors, treat it as returning no messages so the poll loop can
        // continue without stalling.
        const sinceSec = toSec(this.lastMessageIDs.room)
        let raw
        try {
          raw = await withTimeout(getMessages(this.roomUUID, sinceSec, 'group'), 900)
        } catch (err) {
          logger.error('Group message fetch timeout or error', { err })
          raw = []
        }
        const msgs = safeNormalize(raw)
        let maxSec = sinceSec
        let processed = 0
        const batchSize = msgs.length

        for (const m of msgs) {
          try {
            const { id, sentAtSec, text, sender } = m
            if (!id || !sentAtSec || !text) continue
            if (this._seen.has(id)) continue
            this._seen.add(id)
            if (this._isStale(sentAtSec, sinceSec)) continue
            maxSec = Math.max(maxSec, sentAtSec + 1)
            if (!sender || sender === COMETCHAT_BOT_UID) continue

            this.addDMPeer(sender)

            // Schedule message handling asynchronously so that long-running commands
            // do not block the poll loop.
            messageHandler(
              { message: text, sender, receiverType: 'group' },
              this.roomUUID,
              this.state,
              this
            ).catch((err) => {
              logger.error('processNewMessages[group] handler error', { err })
            })
            processed++
            handledCount++
            await this._cooperativeYieldIfNeeded(processed, batchSize)
          } catch (err) {
            logger.error('processNewMessages[group] per-message error', { err })
          }
        }
        if (maxSec !== sinceSec) {
          this.lastMessageIDs.room = maxSec
          // Persist updated room cursor to disk
          saveLastMessageIDs(this.lastMessageIDs)
        }
      }

      // DMs
      {
        const globalSince = toSec(this.lastMessageIDs.dm)

        const peers = new Set([...this._dmPeers, ...this._dmCandidates])
        if (this.lastDmUser) peers.add(this.lastDmUser)

        let rawMessages = []
        let maxGlobal = globalSince

        if (peers.size > 0) {
          const sinceByPeer = {}
          for (const p of peers) {
            sinceByPeer[p] = toSec(this._dmSinceByPeer[p] ?? globalSince)
          }
          // Fetch new direct messages for peers with a timeout.  If the fetch
          // times out or errors, treat as no messages.
          let dmFetchResult = { maxTsByPeer: {}, flat: [] }
          try {
            dmFetchResult = await withTimeout(
              getDirectMessagesForPeers([...peers], sinceByPeer, globalSince),
              5000
            )
          } catch (err) {
            logger.error('DM fetch timeout or error', { err })
            dmFetchResult = { maxTsByPeer: {}, flat: [] }
          }
          const { maxTsByPeer, flat } = dmFetchResult

          rawMessages = Array.isArray(flat) ? flat : []
          if (rawMessages.length > 1) {
            rawMessages.sort((a, b) => getSentAt(a) - getSentAt(b))
          }
          if (rawMessages.length > DM_MAX_MERGED) {
            rawMessages = rawMessages.slice(rawMessages.length - DM_MAX_MERGED)
          }

          for (const p of Object.keys(maxTsByPeer || {})) {
            const next = Math.max(
              globalSince,
              toSec(maxTsByPeer[p] || 0) + 1
            )
            this._dmSinceByPeer[p] = next
            if (next > maxGlobal) maxGlobal = next
          }
        } else {
          try {
            const arr = await withTimeout(getMessages(undefined, globalSince, 'user'), 5000)
            rawMessages = Array.isArray(arr) ? arr : normalizeMessages(arr)
          } catch (e) {
            logger.error('DM poll (broad inbox) error', { e })
          }
        }

        const msgs = safeNormalize(rawMessages)
        if (msgs.length > 1) {
          msgs.sort((a, b) => a.sentAtSec - b.sentAtSec)
        }

        let processed = 0
        const batchSize = msgs.length

        for (const m of msgs) {
          try {
            const {
              id,
              sentAtSec,
              text,
              sender
            } = m
            if (!id || !sentAtSec || !text) continue
            if (this._seen.has(id)) continue
            this._seen.add(id)
            if (this._isStale(sentAtSec, globalSince)) continue

            const channel = guessReceiverType(m)
            if (channel !== 'user') continue
            if (sender === COMETCHAT_BOT_UID) continue

            const peerUid = deriveDmPeer(
              m,
              sender && sender !== COMETCHAT_BOT_UID ? sender : null
            )
            if (!peerUid) continue

            this.addDMPeer(peerUid)
            this.lastDmUser = peerUid
            this._dmSinceByPeer[peerUid] = Math.max(
              this._dmSinceByPeer[peerUid] ?? globalSince,
              sentAtSec + 1
            )
            if (this._dmSinceByPeer[peerUid] > maxGlobal) {
              maxGlobal = this._dmSinceByPeer[peerUid]
            }

            if (text.length <= 5) {
              const lc = text.toLowerCase()
              if (lc === '/ping' || lc === 'ping') {
                try {
                  await sendDirectMessage(peerUid, 'pong 🏓')
                } catch (e) {
                  logger.error('Failed to send pong DM:', e)
                }
                processed++
                await this._cooperativeYieldIfNeeded(processed, batchSize)
                continue
              }
            }

            const senderName = 'Unknown'
            // Schedule DM handling asynchronously to avoid blocking on slow commands.
            messageHandler(
              { message: text, sender: peerUid, senderName, receiverType: 'user' },
              peerUid,
              this.state
            ).catch((err) => {
              logger.error('processNewMessages[user] handler error', { err })
            })

            processed++
            handledCount++
            await this._cooperativeYieldIfNeeded(processed, batchSize)
          } catch (err) {
            logger.error('processNewMessages[user] per-message error', { err })
          }
        }

        if (maxGlobal !== globalSince) {
          this.lastMessageIDs.dm = maxGlobal
          // Persist updated DM cursor to disk
          saveLastMessageIDs(this.lastMessageIDs)
        }

        saveDmCursors(this._dmSinceByPeer)
      }

      this._emptyPolls = handledCount > 0 ? 0 : ((this._emptyPolls || 0) + 1)
    } catch (err) {
      logger.error('Error in processNewMessages:', err)
    } finally {
      this._processingMessages = false
    }
  }

  // ───────────────────────────────────────────────────────────
  // Socket listeners
  // ───────────────────────────────────────────────────────────
  configureListeners () {
    if (this._listenersConfigured || !this.socket) return
    this._listenersConfigured = true

    const self = this

    this.socket.on('statefulMessage', async (payload) => {
      try {
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
        self.state = fastJson.applyPatch(self.state, payload.statePatch).newDocument
      } catch (err) {
        logger.error('Error applying state patch:', err)
        logger.error('Payload that caused it:', JSON.stringify(payload, null, 2))
        return
      }

      if (payload.name === 'userJoined') {
        try {
          await handleUserJoinedWithStatePatch(payload)
        } catch (error) {
          logger.error('Error handling userJoined event:', error)
        }
      }

      if (payload.name === 'playedSong') {
        const currentDJs = getCurrentDJUUIDs(this.state)
        if (currentDJs.length === 0) return

        try {
          const currentlyPlaying = await fetchCurrentlyPlayingSong()

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
            popularity: 0,
            previewUrl: '',
            albumID: 'Unknown',
            albumArt: ''
          }

          const songDurationMs = parseDurationToMs(this.currentSong.songDuration)
          this.currentSong.challengeStartMs = Math.max(0, songDurationMs - 40000)

          if (this.currentSong.musicProviders?.spotify) {
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
                isrc: spotifyDetails.spotifyIsrc || this.currentSong.isrc,
                albumID: spotifyDetails.spotifyAlbumID || 'Unknown',
                albumArt: spotifyDetails.spotifyAlbumArt || ''
              }
              this.currentAlbum = {
                albumID: spotifyDetails.spotifyAlbumID,
                albumName: spotifyDetails.spotifyAlbumName,
                artistName: spotifyDetails.spotifyArtistName,
                releaseDate: spotifyDetails.spotifyReleaseDate,
                albumArt: spotifyDetails.spotifyAlbumArt,
                trackCount: spotifyDetails.spotifyTotalTracks
              }
            }
          }

          try {
            saveCurrentState({
              currentSong: this.currentSong,
              currentAlbum: this.currentAlbum
            })
          } catch (err) {
            logger.error('Failed to save current state:', err)
          }

          const albumActive = await isAlbumThemeActive(this.roomUUID)
          const songIdForDedupe =
            this.currentSong.songId ||
            this.currentSong.spotifyTrackId ||
            this.currentSong.trackName

          if (albumActive) {
            if (this._lastAlbumThemeSongId !== songIdForDedupe) {
              handleAlbumTheme({ roomUUID: this.roomUUID, rawPayload: payload })
                .catch(err => logger.error('[AlbumTheme] handleAlbumTheme error:', err))
              this._lastAlbumThemeSongId = songIdForDedupe
            }
          } else {
            try {
              await announceNowPlaying(this.roomUUID)
            } catch (err) {
              logger.error('announceNowPlaying failed:', err)
            }
          }

          try {
            logCurrentSong(this.currentSong, 0, 0, 0)
          } catch (error) {
            logger.error('Error logging current song to roomStats DB:', error)
          }

          updateLastPlayed(this.currentSong)

          try {
            const s = this.currentSong

            // Determine the actual DJ UUID for this play.
            // In TT, getCurrentDJ(state) returns the UUID of the "current" DJ.
            const djUuid = getCurrentDJ(this.state) || null
            // Resolve a human nickname (best effort). This will also update users table.
            let djNickname = null
            if (djUuid) {
              try {
                djNickname = await getUserNicknameByUuid(djUuid)
                // Keep users table fresh for site display / joins
                try {
                  addOrUpdateUser(djUuid, djNickname)
                } catch (err) {
                  logger.debug('[bot] addOrUpdateUser failed for DJ metadata', {
                    err: err?.message || err,
                    djUuid
                  })
                }
              } catch (e) {
                // non-fatal
                djNickname = null
              }
            }

            await updateRecentSongs({
              trackName: s.trackName || 'Unknown',
              artistName: s.artistName || 'Unknown',
              albumName: s.albumName || 'Unknown',
              releaseDate: s.releaseDate || 'Unknown',
              spotifyUrl: s.spotifyUrl || '',
              popularity: s.popularity || 0,

              songId: s.songId || null,
              spotifyTrackId: s.spotifyTrackId || null,

              // ✅ critical for Wrapped
              djUuid: djUuid || null,
              djNickname: djNickname || null,

              // keep legacy field for recent_songs UX
              dj: djNickname || 'unknown'
            })
          } catch (error) {
            logger.error('Error updating recent songs:', error)
          }

          const djList = getCurrentDJUUIDs(this.state)
          const botIndex = djList.indexOf(this.userUUID)
          if (djList.length === 1 && djList[0] === this.userUUID) {
            await self.updateNextSong()
          } else if (botIndex === 1) {
            await self.updateNextSong()
          }

          self.scheduleLikeSong(this.roomUUID, this.userUUID)
          setTimeout(
            () => postVoteCountsForLastSong(this.roomUUID),
            9500
          )
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

        const songReward = await songPayment()
        if (songReward?.bonusAwarded > 0 && this.roomUUID) {
          await postMessage({
            room: this.roomUUID,
            message: `🎧 <@uid:${songReward.userUUID}> hit a DJ streak of ${songReward.streakCount} and earned **$${songReward.bonusAwarded}**.`
          })
        }
        if (this.roomUUID && songReward?.newPrestige) {
          const unlockLines = formatPrestigeUnlockLines(songReward.newPrestige)
          if (unlockLines.length) {
            await postMessage({
              room: this.roomUUID,
              message: `<@uid:${songReward.userUUID}>\n${unlockLines.join('\n')}`
            })
          }
        }
        sendHeartbeat().catch(() => {})

        // 🔡 Song Chain game (auto-runs only when theme includes "song chain")
        try {
          await handleSongChainPlay(this)
        } catch (err) {
          logger.error('[SongChain] handleSongChainPlay error:', err)
        }

        try {
          await scoreLetterChallenge(this)
          scheduleLetterChallenge(this)
        } catch (err) {
          logger.error(
            'Error running Name Game scoring or scheduling:',
            err
          )
        }
      }
    })
  }

  async storeCurrentRoomUsers () {
    try {
      const currentUsers = await fetchCurrentUsers()
      this.currentRoomUsers = currentUsers
    } catch (error) {
      logger.error(
        'Error fetching and storing current room users:',
        error?.message || error
      )
    }
  }

  async updateNextSong (userUuid) {
    try {
      const songPayload = await this.generateSongPayload()
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }

      const targetUuid =
        (typeof userUuid === 'string' && userUuid.length > 10)
          ? userUuid
          : this.userUUID

      await this.socket.action('updateNextSong', {
        roomUuid: env.roomUuid,
        userUuid: targetUuid,
        song: songPayload
      })
    } catch (error) {
      logger.error('Error updating next song for DJ:', error)
    }
  }

  async addDJ (userUuid, tokenRole = 'DJ') {
    try {
      const currentDJs = getCurrentDJUUIDs(this.state)
      if (currentDJs.includes(userUuid)) return false

      // Determine the initial track for the DJ.  If discover mode is active,
      // pull from the discover queue; otherwise use a recommended popular track.
      let spotifyTrackId
      if (this.discoverMode) {
        spotifyTrackId = this.getNextDiscoverSongId()
        // If discover mode has no more songs, fall back to the popular track
        if (!spotifyTrackId) {
          spotifyTrackId = await getPopularSpotifyTrackID()
        }
      } else {
        spotifyTrackId = await getPopularSpotifyTrackID()
      }
      if (!spotifyTrackId) throw new Error('No Spotify track ID found.')

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
      await this.socket.action('addDj', {
        roomUuid: env.roomUuid,
        userUuid,
        song: songPayload,
        tokenRole
      })
      return true
    } catch (error) {
      logger.error('Error adding DJ:', error)
      return false
    }
  }

  /**
   * Add the bot as a DJ using a track selected from the default playlist.
   *
   * When invoked, this method chooses a random song from the Spotify
   * playlist defined by the DEFAULT_PLAYLIST_ID environment variable,
   * looks up detailed metadata for that track, and then sends the
   * addDj action to the server.  This allows the bot to start DJing
   * from a curated playlist instead of relying on theme‑based or
   * AI recommendations.  If no default playlist is configured, or if
   * no tracks are available, an error will be logged and the call
   * will return false.
   *
   * @param {string} [userUuid] - optional user UUID to add as DJ; if
   * omitted the caller must ensure the bot's own UUID is implied.
   * @param {string} [tokenRole='DJ'] - role token for the addDj action
   * @returns {Promise<boolean>} true if the DJ was added successfully
   */
  async addDJFromDefaultPlaylist (userUuid, tokenRole = 'DJ') {
    try {
      const currentDJs = getCurrentDJUUIDs(this.state)
      if (currentDJs.includes(userUuid)) return false

      const playlistId = env.defaultPlaylistId
      if (!playlistId) {
        throw new Error('DEFAULT_PLAYLIST_ID is not set.')
      }
      const tracks = await fetchSpotifyPlaylistTracks(playlistId)
      if (!Array.isArray(tracks) || tracks.length === 0) {
        throw new Error('No tracks found in the default playlist.')
      }
      // Select a random track.  Spotify playlists returned via the
      // API may include items with nested track objects.  Prefer the
      // nested track ID when available.
      const randomItem = tracks[Math.floor(Math.random() * tracks.length)]
      const trackId = randomItem?.track?.id || randomItem?.id
      if (!trackId) {
        throw new Error('Invalid track object encountered; missing id.')
      }
      const songData = await fetchSongData(trackId)
      if (!songData || !songData.id) {
        throw new Error('Invalid song data received for default playlist track.')
      }
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
      if (!this.socket) {
        throw new Error('SocketClient not initialized.')
      }
      await this.socket.action('addDj', {
        roomUuid: env.roomUuid,
        userUuid,
        song: songPayload,
        tokenRole
      })
      return true
    } catch (error) {
      logger.error('Error adding DJ from default playlist:', error)
      return false
    }
  }

  /**
   * Enable discover DJ mode.  When enabled, the bot will play songs from the
   * provided Spotify playlists sequentially without repeats.  Pass either a
   * comma‑delimited string or an array of playlist IDs.  If omitted, the
   * environment variable DISCOVER_PLAYLIST_IDS will be used if defined.
   *
   * @param {string|string[]} playlists - playlist IDs to pull tracks from
   */
  async enableDiscoverDJ (playlists) {
    // normalise playlist IDs from input or environment
    let ids = []
    if (Array.isArray(playlists) && playlists.length > 0) {
      // Only use provided array if it has at least one playlist ID.  An empty
      // array indicates that no explicit playlists were supplied in the command.
      ids = playlists
    } else if (typeof playlists === 'string' && playlists.trim()) {
      ids = playlists.split(',')
    } else if (env.discoverPlaylistIds) {
      ids = String(env.discoverPlaylistIds).split(',')
    }
    this.discoverPlaylists = ids.map((id) => String(id).trim()).filter(Boolean)
    this.discoverMode = this.discoverPlaylists.length > 0
    this.discoverSongQueue = []
    this.discoverHistory = new Set()
    if (!this.discoverMode) return
    // fetch tracks from each playlist and deduplicate
    const trackIds = new Set()
    for (const pid of this.discoverPlaylists) {
      try {
        const tracks = await fetchSpotifyPlaylistTracks(pid)
        logger.info('[bot] Loaded discover playlist tracks', { playlistId: pid, count: tracks.length })
        if (Array.isArray(tracks)) {
          for (const item of tracks) {
            const tid = item?.track?.id || item?.id
            if (tid) trackIds.add(tid)
          }
        }
      } catch (err) {
        logger.error('Error fetching discover playlist tracks', { pid, err: err?.message || err })
      }
    }
    this.discoverSongQueue = Array.from(trackIds)
    logger.info('[bot] Discover queue refreshed', { count: this.discoverSongQueue.length })
  }

  /**
   * Disable discover DJ mode and clear any cached state.
   */
  disableDiscoverDJ () {
    this.discoverMode = false
    this.discoverPlaylists = []
    this.discoverSongQueue = []
    this.discoverHistory = new Set()
  }

  /**
   * Retrieve the next song ID from the discover queue, skipping songs that have
   * already been played.  Returns null if no eligible songs remain.
   *
   * @returns {string|null} The next Spotify track ID or null if exhausted.
   */
  getNextDiscoverSongId () {
    while (this.discoverSongQueue.length > 0) {
      const id = this.discoverSongQueue.shift()
      // Avoid repeats across history and recently played songs
      if (!this.discoverHistory.has(id) && !this.recentSpotifyTrackIds.includes(id)) {
        this.discoverHistory.add(id)
        return id
      }
    }
    return null
  }

  async removeDJ (userUuid) {
    try {
      const djUuid = (userUuid === env.botUserUuid) ? null : userUuid
      if (
        djUuid === null &&
        !this.state?.djs?.some(dj => dj.uuid === env.botUserUuid)
      ) return
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }
      await this.socket.action('removeDj', {
        roomUuid: env.roomUuid,
        userUuid: env.botUserUuid,
        djUuid
      })
    } catch (error) {
      logger.error(
        `Error removing user ${userUuid || 'Bot'} from DJ:`,
        error
      )
    }
  }

  async voteOnSong (roomUuid, songVotes, userUuid) {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }
      await this.socket.action('voteOnSong', { roomUuid, songVotes, userUuid })
    } catch (error) {
      logger.error('Error voting on song:', error)
    }
  }

  async playOneTimeAnimation (animation, roomUuid, userUuid, emoji = null) {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }
      const payload = { animation, roomUuid, userUuid }
      if (animation === 'emoji' && emoji) payload.emoji = emoji
      await this.socket.action('playOneTimeAnimation', payload)
    } catch (error) {
      logger.error('Error playing animation:', error)
    }
  }

  async scheduleLikeSong (roomUuid, userUuid) {
    try {
      if (!this.socket) {
        throw new Error('SocketClient not initialized. Please call connect() first.')
      }
      if (!this.autobop) return
      setTimeout(async () => {
        try {
          await this.voteOnSong(
            env.roomUuid,
            { like: true },
            env.botUserUuid
          )
        } catch (error) {
          logger.error('Error voting on song', error)
        }
      }, 5000)
    } catch (error) {
      logger.error('Error scheduling song vote', error)
    }
  }
}

// helpers
export function getCurrentDJUUIDs (state) {
  if (!state) return []
  const visible = Array.isArray(state.visibleDjs) ? state.visibleDjs : []
  const fallback = Array.isArray(state.djs) ? state.djs : []
  const djsToUse = visible.length > 0 ? visible : fallback
  return djsToUse.map(dj => dj.uuid)
}

export function getCurrentDJ (state) {
  const currentDJs = getCurrentDJUUIDs(state)
  return currentDJs.length > 0 ? currentDJs[0] : null
}

export function isUserDJ (senderUuid, state) {
  return getCurrentDJUUIDs(state).includes(senderUuid)
}

export function whoIsCurrentDJ (state) {
  const currentDJUuid = getCurrentDJ(state)
  return currentDJUuid === env.botUserUuid ? 'bot' : 'user'
}
