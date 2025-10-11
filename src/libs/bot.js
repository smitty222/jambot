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
import { handlers } from '../handlers/index.js'
import {
  fetchSpotifyPlaylistTracks,
  fetchCurrentUsers,
  spotifyTrackInfo,
  fetchCurrentlyPlayingSong,
  fetchSongData
} from '../utils/API.js'
import { postVoteCountsForLastSong } from '../utils/voteCounts.js'
// Import shared state from dedicated utilities instead of the message handler
import { roomThemes } from '../utils/roomThemes.js'
import { escortUserFromDJStand } from '../utils/escortDJ.js'
import handleUserJoinedWithStatePatch from '../handlers/userJoined.js'
import { handleAlbumTheme } from '../handlers/playedSong.js'
import { songPayment } from '../database/dbwalletmanager.js'
import { updateRecentSongs } from '../database/dbrecentsongsmanager.js'
import { getPopularSpotifyTrackID } from '../utils/autoDJ.js'
import { getMarkedUser, unmarkUser } from '../utils/removalQueue.js'
// Node built-in modules for persisting DM cursors
import fs from 'fs'
import path from 'path'
// Keep a handle on the usersToBeRemoved map from the message handler.
// This state indicates DJs that should be removed after their song finishes.
// TODO: extract this into a dedicated module to fully eliminate
// dependencies on the message handler.
// Import the DJ removal map from the dedicated module.  This avoids
// importing the entire message handler and eliminates a circular
// dependency.  See src/utils/usersToBeRemoved.js for details.
import { usersToBeRemoved } from '../utils/usersToBeRemoved.js'
import { logCurrentSong, updateLastPlayed } from '../database/dbroomstatsmanager.js'
import * as themeManager from '../utils/themeManager.js'
import { announceNowPlaying } from '../utils/announceNowPlaying.js'
import { scheduleLetterChallenge, scoreLetterChallenge, parseDurationToMs } from '../handlers/songNameGame.js'
import { addTrackedUser } from '../utils/trackedUsers.js'
import { saveCurrentState } from '../database/dbcurrent.js'
import { askQuestion } from './ai.js'
import db from '../database/db.js'

// ───────────────────────────────────────────────────────────
// Tunables (env overrides)
// ───────────────────────────────────────────────────────────
const SEEN_TTL_MS = Number(process.env.BOT_SEEN_TTL_MS ?? 10 * 60 * 1000)
const SEEN_MAX = Number(process.env.BOT_SEEN_MAX ?? 5000)
const DM_MAX_MERGED = Number(process.env.BOT_DM_MAX_MERGED ?? 400) // cap merged DM batch to avoid spikes
const POLL_YIELD_EVERY = Number(process.env.BOT_POLL_YIELD_EVERY ?? 50) // cooperative yield every N msgs
const STARTUP_BACKLOG_GRACE_S = Number(process.env.BOT_STARTUP_GRACE_S ?? 60)

// ───────────────────────────────────────────────────────────
// Ephemeral baseline & identity
// ───────────────────────────────────────────────────────────
const startTimeStamp = Math.floor(Date.now() / 1000) // seconds (baseline "now")
const botUUID = process.env.BOT_USER_UUID

// ───────────────────────────────────────────────────────────
// Theme resolution (DB-first) + album predicate
// ───────────────────────────────────────────────────────────
const ALBUM_THEMES = new Set(['album monday', 'albums', 'album day', 'album'])

function getThemeFromDB (roomUUID) {
  try {
    const row = db.prepare('SELECT theme FROM themes WHERE roomId = ?').get(roomUUID)
    if (row?.theme) return String(row.theme)
  } catch (e) {
    logger.error('[Theme][DB] lookup error:', e?.message || e)
  }
  return null
}

function resolveRoomTheme (roomUUID) {
  const dbTheme = getThemeFromDB(roomUUID)
  if (dbTheme) return dbTheme

  const tm = themeManager.getTheme(roomUUID)
  if (tm) return tm

  const rt = roomThemes[roomUUID]
  if (rt) return rt

  return ''
}

export function isAlbumThemeActive (roomUUID) {
  if (['1', 'true', 'yes', 'on'].includes(String(process.env.FORCE_ALBUM_THEME || '').toLowerCase())) {
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

function extractText (reply) {
  if (!reply) return null
  if (typeof reply === 'string') return reply
  if (reply.text) return reply.text
  if (reply.candidates?.[0]?.content?.parts?.[0]?.text) return reply.candidates[0].content.parts[0].text
  return null
}

// ───────────────────────────────────────────────────────────
// Polling helpers
// ───────────────────────────────────────────────────────────
function toSec (ts) {
  const n = Number(ts)
  if (!Number.isFinite(n)) return 0
  return n > 2e10 ? Math.floor(n / 1000) : Math.floor(n) // ms → sec
}

function normalizeMessages (raw) {
  if (!raw) return []
  const body = (raw && typeof raw === 'object' && 'data' in raw && !Array.isArray(raw.data)) ? raw.data : raw
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
//
// The built-in normalizeMessages() helper returns a heterogeneous mix of
// message objects depending on the API shape. To harden inbound
// processing against undefined fields and edge cases, safeNormalize()
// filters for messages that contain a plausible identifier and then
// maps each entry to a canonical shape. If a required field is
// missing, the message is dropped. This reduces the risk of
// uncaught exceptions downstream when extracting IDs, senders or
// timestamps. See suggestions for further validation.
const REQUIRED_FIELDS = ['id', 'sender', 'sentAt']
function isMsg (m) {
  return !!(m && (m.id || m._id || m.guid || m.messageId))
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
// In-memory TTL de-dupe (prevents unbounded Set growth)
// ───────────────────────────────────────────────────────────
class TTLSeenSet {
  constructor (ttlMs = SEEN_TTL_MS, max = SEEN_MAX) {
    this.ttl = ttlMs
    this.max = max
    this.map = new Map()
    this._pruneTimer = setInterval(() => this.prune(), Math.min(60_000, ttlMs))
    this._pruneTimer.unref?.()
  }

  has (id) { const v = id && this.map.get(id); return !!v && v > Date.now() }
  add (id) {
    if (!id) return
    if (this.map.size >= this.max) {
      const drop = Math.ceil(this.max * 0.1)
      for (const k of this.map.keys()) { this.map.delete(k); if (this.map.size <= this.max - drop) break }
    }
    this.map.set(id, Date.now() + this.ttl)
  }

  prune () { const now = Date.now(); for (const [k, exp] of this.map.entries()) if (exp <= now) this.map.delete(k) }
  clear () { clearInterval(this._pruneTimer); this.map.clear() }
}

// ───────────────────────────────────────────────────────────
// DM/group classification helpers
// ───────────────────────────────────────────────────────────
const COMETCHAT_BOT_UID = process.env.BOT_USER_UUID || process.env.CHAT_USER_ID

// ───────────────────────────────────────────────────────────
// DM cursor persistence
//
// Persist the per-peer DM cursors to disk to avoid reprocessing old
// direct messages after a restart. The file location can be set via
// DM_CURSOR_FILE env. Defaults to src/data/dm_since.json relative
// to the project root. The cursors are loaded on Bot instantiation
// and saved whenever they are updated.
const DM_CURSOR_FILE = process.env.DM_CURSOR_FILE || path.join(process.cwd(), 'src/data/dm_since.json')

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
  try {
    fs.writeFileSync(DM_CURSOR_FILE, JSON.stringify(cursors, null, 2))
  } catch (e) {
    logger.warn('[bot] failed to persist DM cursors', { err: e?.message || e })
  }
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

    this.roomUUID = process.env.ROOM_UUID
    this.tokenRole = process.env.TOKEN_ROLE
    this.userUUID = process.env.BOT_USER_UUID

    // Ephemeral cursors: start "now" for both group & DM streams
    this.lastMessageIDs = {
      room: startTimeStamp,
      dm: startTimeStamp
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

    // De-dupe cache, startup guard, and reconnect backoff
    this._seen = new TTLSeenSet(SEEN_TTL_MS, SEEN_MAX)
    this._startupTimeMs = Date.now()
    this._reconnectBackoffMs = 1000
    this._maxBackoffMs = 30_000

    // DM infra
    this._processingMessages = false
    this._dmCandidates = new Set()
    this._dmPeers = new Set(getConfiguredDMPeers()) // from CHAT_DM_PEERS or fallbacks
    this._dmSinceByPeer = {}
    for (const p of this._dmPeers) this._dmSinceByPeer[p] = startTimeStamp

    this.lastDmUser = null

    // Load persisted DM cursors from disk. If present, these values
    // override the defaults and allow the bot to resume DM polling
    // from the last seen timestamps. Merge with the initial peers to
    // ensure new peers still start from the default baseline.
    try {
      const persisted = loadDmCursors()
      if (persisted && typeof persisted === 'object') {
        for (const [uid, ts] of Object.entries(persisted)) {
          const sec = Number(ts)
          if (Number.isFinite(sec)) this._dmSinceByPeer[uid] = sec
        }
      }
      // Adjust the global DM cursor to the maximum of all per-peer
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

  // Allow external code to register a DM peer (auto-discovery)
  addDMPeer (uid) {
    if (!uid || uid === COMETCHAT_BOT_UID) return
    this._dmPeers.add(uid)
    this._dmCandidates.add(uid)
    if (!this._dmSinceByPeer[uid]) this._dmSinceByPeer[uid] = toSec(this.lastMessageIDs.dm)
  }

  // Readiness bits for /ready
  isConnected () { return !!this.socket }
  canSend () { return !!this.socket }

  async connect () {
    try {
      await joinChat(this.roomUUID)

      try { this.socket?.removeAllListeners?.() } catch {}
      try { this.socket?.close?.() } catch {}
      this.socket = new SocketClient('https://socket.prod.tt.fm')

      this.socket.on?.('disconnect', () => this._scheduleReconnect())

      const connection = await this.socket.joinRoom(process.env.TTL_USER_TOKEN, { roomUuid: this.roomUUID })
      this.state = connection.state

      this.configureListeners()

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
        this._reconnectBackoffMs = Math.min(this._reconnectBackoffMs * 2, this._maxBackoffMs)
        this._scheduleReconnect()
      })
    }, wait)
  }

  getCurrentSpotifyUrl () { return this.currentSong?.spotifyUrl || null }

  updateRecentSpotifyTrackIds (trackId) {
    const currentDJ = getCurrentDJ(this.state)
    if (currentDJ === this.userUUID) return
    if (!trackId) return
    if (this.recentSpotifyTrackIds.length >= 5) this.recentSpotifyTrackIds.pop()
    this.recentSpotifyTrackIds.unshift(trackId)
  }

  async getRandomSong () {
    try {
      const playlistId = process.env.DEFAULT_PLAYLIST_ID
      const tracks = await fetchSpotifyPlaylistTracks(playlistId)
      if (!tracks || tracks.length === 0) throw new Error('No tracks found in the selected source.')
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)]
      const song = (this.convertTracks ? await this.convertTracks(randomTrack) : randomTrack)
      return song
    } catch (error) {
      logger.error('Error getting random song:', error)
      throw error
    }
  }

  // NOTE: unified generateSongPayload (removed duplicate definition)
  async generateSongPayload () {
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

  _isStale (sentAtSec, baselineSec) {
    const grace = STARTUP_BACKLOG_GRACE_S
    return sentAtSec < Math.floor(this._startupTimeMs / 1000) - grace || sentAtSec < baselineSec
  }

  async _cooperativeYieldIfNeeded (count, batchSize = 0) {
    // Cooperatively yield to the event loop every N messages or when
    // processing very large batches. This prevents event-loop
    // starvation on heavy message bursts.
    if (count % POLL_YIELD_EVERY === 0 || batchSize > 500) {
      await new Promise((r) => setImmediate(r))
    }
  }

  /**
   * Poller: group + DM inbox (bot) — robust DM handling via conversationId & candidates.
   * Includes cooperative yielding & batch caps to avoid event-loop starvation.
   */
  async processNewMessages () {
    if (this._processingMessages) return
    this._processingMessages = true

    // Seed from configured peers (CHAT_DM_PEERS or fallbacks)
    for (const u of getConfiguredDMPeers()) this.addDMPeer(u)

    try {
      // ───────────── GROUP ─────────────
      {
        const sinceSec = toSec(this.lastMessageIDs.room)
        const raw = await getMessages(this.roomUUID, sinceSec, 'group')
        // Use safeNormalize to filter and canonicalise incoming messages. This
        // protects against malformed data and undefined fields.
        const msgs = safeNormalize(raw)
        let maxSec = sinceSec
        let processed = 0
        const batchSize = msgs.length

        for (const m of msgs) {
          try {
            const { id, sentAtSec, text, sender } = m
            if (!id || !sentAtSec || !text) continue
            // De-dupe and staleness checks
            if (this._seen.has(id)) continue
            this._seen.add(id)
            if (this._isStale(sentAtSec, sinceSec)) continue
            maxSec = Math.max(maxSec, sentAtSec + 1)
            if (!sender || sender === COMETCHAT_BOT_UID) continue
            // auto-discover DM peers
            this.addDMPeer(sender)
            await handlers.message(
              { message: text, sender, receiverType: 'group' },
              this.roomUUID,
              this.state,
              this
            )
            processed++
            await this._cooperativeYieldIfNeeded(processed, batchSize)
          } catch (err) {
            logger.error('processNewMessages[group] per-message error', { err })
          }
        }
        if (maxSec !== sinceSec) this.lastMessageIDs.room = maxSec
      }

      // ───────────── DMs ─────────────
      {
        const globalSince = toSec(this.lastMessageIDs.dm)

        const peers = new Set([...this._dmPeers, ...this._dmCandidates])
        if (this.lastDmUser) peers.add(this.lastDmUser)

        let rawMessages = []
        let maxGlobal = globalSince

        if (peers.size > 0) {
          const sinceByPeer = {}
          for (const p of peers) sinceByPeer[p] = toSec(this._dmSinceByPeer[p] ?? globalSince)
          const { maxTsByPeer, flat } =
            await getDirectMessagesForPeers([...peers], sinceByPeer, globalSince)
          rawMessages = Array.isArray(flat) ? flat : []
          // Keep only the most recent N messages
          if (rawMessages.length > 1) rawMessages.sort((a, b) => getSentAt(a) - getSentAt(b))
          if (rawMessages.length > DM_MAX_MERGED) {
            rawMessages = rawMessages.slice(rawMessages.length - DM_MAX_MERGED)
          }
          for (const p of Object.keys(maxTsByPeer || {})) {
            const next = Math.max(globalSince, toSec(maxTsByPeer[p] || 0) + 1)
            this._dmSinceByPeer[p] = next
            if (next > maxGlobal) maxGlobal = next
          }
        } else {
          try {
            const arr = await getMessages(undefined, globalSince, 'user')
            rawMessages = Array.isArray(arr) ? arr : normalizeMessages(arr)
          } catch (e) {
            logger.error('DM poll (broad inbox) error', { e })
          }
        }

        // Normalise and filter messages
        const msgs = safeNormalize(rawMessages)
        if (msgs.length > 1) msgs.sort((a, b) => a.sentAtSec - b.sentAtSec)
        let processed = 0
        const batchSize = msgs.length

        for (const m of msgs) {
          try {
            const { id, sentAtSec, text, sender, receiver, conversationId } = m
            if (!id || !sentAtSec || !text) continue
            if (this._seen.has(id)) continue
            this._seen.add(id)
            if (this._isStale(sentAtSec, globalSince)) continue
            // Use conversationId to determine channel. Only handle user (DM) messages here.
            const channel = guessReceiverType(m)
            if (channel !== 'user') continue
            if (sender === COMETCHAT_BOT_UID) continue
            const peerUid = deriveDmPeer(m, sender && sender !== COMETCHAT_BOT_UID ? sender : null)
            if (!peerUid) continue
            this.addDMPeer(peerUid)
            this.lastDmUser = peerUid
            this._dmSinceByPeer[peerUid] = Math.max(this._dmSinceByPeer[peerUid] ?? globalSince, sentAtSec + 1)
            if (this._dmSinceByPeer[peerUid] > maxGlobal) maxGlobal = this._dmSinceByPeer[peerUid]
            // Fast path for ping
            if (text.length <= 5) {
              const lc = text.toLowerCase()
              if (lc === '/ping' || lc === 'ping') {
                try { await sendDirectMessage(peerUid, 'pong 🏓') } catch (e) { logger.error('Failed to send pong DM:', e) }
                processed++
                await this._cooperativeYieldIfNeeded(processed, batchSize)
                continue
              }
            }
            // The safe normaliser does not preserve senderName; default to Unknown
            const senderName = 'Unknown'
            await handlers.message(
              { message: text, sender: peerUid, senderName, receiverType: 'user' },
              peerUid,
              this.state
            )
            processed++
            await this._cooperativeYieldIfNeeded(processed, batchSize)
          } catch (err) {
            logger.error('processNewMessages[user] per-message error', { err })
          }
        }
        if (maxGlobal !== globalSince) this.lastMessageIDs.dm = maxGlobal
        // Persist DM cursors after processing
        saveDmCursors(this._dmSinceByPeer)
      }
    } catch (err) {
      logger.error('Error in processNewMessages:', err)
    } finally {
      this._processingMessages = false
    }
  }

  // Socket listeners
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

      if (payload.name === 'userJoined') {
        try { await handleUserJoinedWithStatePatch(payload) } catch (error) {
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

          try { saveCurrentState({ currentSong: this.currentSong, currentAlbum: this.currentAlbum }) } catch (err) { logger.error('Failed to save current state:', err) }

          const albumActive = await isAlbumThemeActive(this.roomUUID)
          const songIdForDedupe = this.currentSong.songId || this.currentSong.spotifyTrackId || this.currentSong.trackName

          if (albumActive) {
            if (this._lastAlbumThemeSongId !== songIdForDedupe) {
              handleAlbumTheme({ roomUUID: this.roomUUID, rawPayload: payload })
                .catch(err => logger.error('[AlbumTheme] handleAlbumTheme error:', err))
              this._lastAlbumThemeSongId = songIdForDedupe
            }
          } else {
            // Post the now playing announcement before updating play counts.
            // Await the announcement so that stats reflect the previous play.
            // Without awaiting, updateLastPlayed() may run before the
            // announcement queries room_stats, causing the lastPlayed timestamp
            // to be "less than a minute ago".
            try {
              await announceNowPlaying(this.roomUUID)
            } catch (err) {
              logger.error('announceNowPlaying failed:', err)
            }
          }

          // After announcing, increment play counts and persist the recent song.
          try {
            logCurrentSong(this.currentSong, 0, 0, 0)
          } catch (error) {
            logger.error('Error logging current song to roomStats DB:', error)
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

  async storeCurrentRoomUsers () {
    try {
      const currentUsers = await fetchCurrentUsers()
      this.currentRoomUsers = currentUsers
    } catch (error) {
      logger.error('Error fetching and storing current room users:', error?.message || error)
    }
  }

  async updateNextSong (userUuid) {
    try {
      const songPayload = await this.generateSongPayload()
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')

      const targetUuid = (typeof userUuid === 'string' && userUuid.length > 10) ? userUuid : this.userUUID

      await this.socket.action('updateNextSong', {
        roomUuid: process.env.ROOM_UUID,
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

  async removeDJ (userUuid) {
    try {
      const djUuid = (userUuid === process.env.BOT_USER_UUID) ? null : userUuid
      if (djUuid === null && !this.state?.djs?.some(dj => dj.uuid === process.env.BOT_USER_UUID)) return
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')
      await this.socket.action('removeDj', {
        roomUuid: process.env.ROOM_UUID,
        userUuid: process.env.BOT_USER_UUID,
        djUuid
      })
    } catch (error) {
      logger.error(`Error removing user ${userUuid || 'Bot'} from DJ:`, error)
    }
  }

  async voteOnSong (roomUuid, songVotes, userUuid) {
    try {
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')
      await this.socket.action('voteOnSong', { roomUuid, songVotes, userUuid })
    } catch (error) {
      logger.error('Error voting on song:', error)
    }
  }

  async playOneTimeAnimation (animation, roomUuid, userUuid, emoji = null) {
    try {
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')
      const payload = { animation, roomUuid, userUuid }
      if (animation === 'emoji' && emoji) payload.emoji = emoji
      await this.socket.action('playOneTimeAnimation', payload)
    } catch (error) {
      logger.error('Error playing animation:', error)
    }
  }

  async scheduleLikeSong (roomUuid, userUuid) {
    try {
      if (!this.socket) throw new Error('SocketClient not initialized. Please call connect() first.')
      if (!this.autobop) return
      setTimeout(async () => {
        try { await this.voteOnSong(process.env.ROOM_UUID, { like: true }, process.env.BOT_USER_UUID) } catch (error) { logger.error('Error voting on song', error) }
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
  return currentDJUuid === process.env.BOT_USER_UUID ? 'bot' : 'user'
}
