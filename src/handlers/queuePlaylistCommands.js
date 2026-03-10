import { postMessage } from '../libs/cometchat.js'
import db from '../database/db.js'
import { fetchSpotifyPlaylistTracks } from '../utils/API.js'
import { addTracksToPlaylist, removeTrackFromPlaylist } from '../utils/playlistUpdate.js'

export function createQueuePlaylistHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    db: database = db,
    fetchSpotifyPlaylistTracks: fetchPlaylistTracks = fetchSpotifyPlaylistTracks,
    addTracksToPlaylist: addTracks = addTracksToPlaylist,
    removeTrackFromPlaylist: removeTrack = removeTrackFromPlaylist,
    addDollarsByUUID,
    readBlacklistFile,
    writeBlacklistFile
  } = deps

  return {
    site: async ({ room }) => {
      await post({ room, message: 'Jamflow Bot Hub → https://dev.jambot-e72.pages.dev/' })
    },

    test: async ({ room }) => {
      await post({ room, message: 'testing!' })
    },

    crapsrecord: async ({ room }) => {
      const row = database.prepare(`
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
      await post({
        room,
        message: `🏆 **Current record:** ${count} roll(s) by **${who}**\n🗓️ Set: ${when}`
      })
    },

    addmoney: async ({ payload, room }) => {
      const sender = payload.sender
      const parts = payload.message.trim().split(/\s+/)

      if (room !== process.env.ROOM_UUID) return
      if (sender !== process.env.SMITTY_UUID) {
        await post({ room, message: '⛔ /addmoney is restricted.' })
        return
      }

      if (parts.length < 3) {
        await post({ room, message: 'Usage: /addmoney <@User> <amount>' })
        return
      }

      const match = /<@uid:([\w-]+)>/i.exec(parts[1])
      const userUuid = match?.[1]
      const amount = Number(parts[2])

      if (!userUuid || !Number.isFinite(amount) || amount <= 0) {
        await post({
          room,
          message: 'Usage: /addmoney <@User> <amount> (use a proper tag + positive number)'
        })
        return
      }

      try {
        await addDollarsByUUID(userUuid, amount)
        await post({ room, message: `💸 Admin credited $${amount} to <@uid:${userUuid}>` })
      } catch (err) {
        await post({ room, message: `❌ Failed to add money: ${err?.message || err}` })
      }
    },

    'q+': async ({ payload, room, queueManager }) => {
      const result = await queueManager.joinQueue(payload.sender)
      const mention = `<@uid:${payload.sender}>`
      await post({
        room,
        message: result.success
          ? `${mention}; you joined the queue.`
          : `${mention}; you're already in the queue.`
      })
    },

    'q-': async ({ payload, room, queueManager }) => {
      const mention = `<@uid:${payload.sender}>`
      const removed = await queueManager.leaveQueue(payload.sender)
      await post({
        room,
        message: removed
          ? `${mention}; you left the queue.`
          : `${mention}; you're not in the queue.`
      })
    },

    q: async ({ room, queueManager }) => {
      const queue = await queueManager.getQueue()
      if (!queue || queue.length === 0) {
        await post({ room, message: 'The queue is empty.' })
        return
      }

      const list = queue.map((user, index) => {
        const marker = index === 0 ? ' (up next)' : ''
        return `${index + 1}. ${user.username}${marker}`
      }).join('\n')

      await post({ room, message: `🎶 Current Queue:\n${list}` })
    },

    addsong: async ({ payload, room, roomBot }) => {
      const isBeachCommand = payload.message.trim().toLowerCase() === '/addsong beach'
      const spotifyTrackId = roomBot.currentSong?.spotifyTrackId

      if (!spotifyTrackId) {
        await post({ room, message: 'No track is currently playing or track ID is invalid.' })
        return
      }

      const trackUri = `spotify:track:${spotifyTrackId}`
      const playlistId = isBeachCommand ? process.env.BEACH_PLAYLIST_ID : process.env.DEFAULT_PLAYLIST_ID

      if (!playlistId) {
        await post({ room, message: 'Playlist ID is missing from environment variables.' })
        return
      }

      const playlistTracks = await fetchPlaylistTracks(playlistId)
      const playlistTrackUris = playlistTracks.map(track => track.track.uri)

      if (playlistTrackUris.includes(trackUri)) {
        await post({ room, message: 'Track is already in the playlist!' })
        return
      }

      const snapshotId = await addTracks(playlistId, [trackUri])
      await post({
        room,
        message: snapshotId
          ? `Track added to ${isBeachCommand ? 'beach' : 'default'} playlist!`
          : 'Failed to add the track to the playlist.'
      })
    },

    removesong: async ({ payload, room, roomBot, ttlUserToken, isUserAuthorized }) => {
      const ok = await isUserAuthorized(payload.sender, ttlUserToken)
      if (!ok) {
        await post({ room, message: 'You need to be a moderator to execute this command.' })
        return
      }

      const isBeachCommand = payload.message.trim().toLowerCase() === '/removesong beach'
      const playlistId = isBeachCommand ? process.env.BEACH_PLAYLIST_ID : process.env.DEFAULT_PLAYLIST_ID
      const spotifyTrackId = roomBot.currentSong?.spotifyTrackId

      if (!spotifyTrackId) {
        await post({ room, message: 'No track is currently playing or track ID is invalid.' })
        return
      }

      const trackUri = `spotify:track:${spotifyTrackId}`
      const snapshotId = await removeTrack(playlistId, trackUri)

      await post({
        room,
        message: snapshotId ? 'Track removed successfully!' : 'Failed to remove the track from the playlist.'
      })
    },

    'blacklist+': async ({ room, roomBot }) => {
      const currentSong = roomBot.currentSong

      if (!currentSong || !currentSong.trackName || !currentSong.artistName) {
        await post({ room, message: '⚠️ No current song playing or track data unavailable.' })
        return
      }

      const fullName = `${currentSong.artistName} - ${currentSong.trackName}`
      let blacklist = []
      try {
        blacklist = readBlacklistFile ? await readBlacklistFile() : []
      } catch {
        blacklist = []
      }

      if (blacklist.includes(fullName)) {
        await post({ room, message: `⛔️ "${fullName}" is already on the blacklist.` })
        return
      }

      blacklist.push(fullName)
      try {
        if (writeBlacklistFile) await writeBlacklistFile(blacklist)
      } catch (err) {
        console.error('Error writing to blacklist file:', err)
      }

      await post({ room, message: `✅ Added "${fullName}" to the blacklist.` })
    }
  }
}
