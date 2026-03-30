import { postMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
import db from '../database/db.js'
import { getSpotifyUserAuth, updateSpotifyUserAuthTokens } from '../database/dbspotifyauth.js'
import { getFavorite, getFavorites, setFavorite, removeFavorite } from '../database/dbplaylistfavorites.js'
import { addTrackToPlaylistForUser, removeTrackFromPlaylistForUser } from '../utils/playlistUpdate.js'
import { extractSpotifyPlaylistId } from '../utils/spotifyHelpers.js'

export function createQueuePlaylistHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    db: database = db,
    addDollarsByUUID,
    readBlacklistFile,
    writeBlacklistFile
  } = deps

  const requireLinkedAccount = async (userId, room) => {
    const auth = getSpotifyUserAuth(userId)
    if (!auth?.refreshToken) {
      await post({
        room,
        message: '\uD83D\uDD10 *Spotify account not linked*\n\nUse `/spotifylink` to connect your Spotify account first.'
      })
      return null
    }
    return auth
  }

  const saveTokens = (userId, authResult, fallbackAuth) => {
    if (authResult?.accessToken) {
      updateSpotifyUserAuthTokens(userId, {
        accessToken: authResult.accessToken,
        refreshToken: authResult.refreshToken || fallbackAuth.refreshToken,
        expiresAt: authResult.expiresAt
      })
    }
  }

  return {
    site: async ({ room }) => {
      await post({ room, message: 'Jamflow Bot Hub \u2192 https://dev.jambot-e72.pages.dev/' })
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
      const who = row?.displayName || '\u2014'
      const when = row?.achievedAt || '\u2014'
      await post({
        room,
        message: `\uD83C\uDFC6 **Current record:** ${count} roll(s) by **${who}**\n\uD83D\uDDD3\uFE0F Set: ${when}`
      })
    },

    addmoney: async ({ payload, room }) => {
      const sender = payload.sender
      const parts = payload.message.trim().split(/\s+/)

      if (room !== process.env.ROOM_UUID) return
      if (sender !== process.env.SMITTY_UUID) {
        await post({ room, message: '\u26D4 /addmoney is restricted.' })
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
        await post({ room, message: `\uD83D\uDCB8 Admin credited $${amount} to <@uid:${userUuid}>` })
      } catch (err) {
        await post({ room, message: `\u274C Failed to add money: ${err?.message || err}` })
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

      await post({ room, message: `\uD83C\uDFB6 Current Queue:\n${list}` })
    },

    // /favplaylist <slot> <playlistId|url>
    favplaylist: async ({ payload, room, args }) => {
      const user = payload.sender
      const parts = (args || '').trim().split(/\s+/)
      const slot = Number(parts[0])
      const rawId = parts.slice(1).join(' ').trim()
      const playlistId = extractSpotifyPlaylistId(rawId)

      if (!slot || slot < 1 || slot > 9 || !Number.isInteger(slot)) {
        await post({ room, message: '\u26A0\uFE0F Usage: `/favplaylist <1-9> <playlistId|url>`' })
        return
      }

      if (!playlistId) {
        await post({ room, message: '\u26A0\uFE0F Please provide a valid Spotify playlist ID or URL.' })
        return
      }

      const auth = await requireLinkedAccount(user, room)
      if (!auth) return

      try {
        const { getSpotifyPlaylistName } = await import('../utils/API.js')
        const playlistName = await getSpotifyPlaylistName(playlistId, auth.accessToken) || playlistId

        setFavorite(user, slot, playlistId, playlistName)
        await post({
          room,
          message: `\u2764\uFE0F Slot *${slot}* set to *${playlistName}*\n\uD83C\uDD86 \`${playlistId}\``
        })
      } catch (err) {
        logger.error('[favplaylist] error setting favorite', { user, slot, playlistId, err })
        await post({ room, message: '\u274C Failed to save playlist favorite. Please try again.' })
      }
    },

    // /favplaylists — show your current favorites
    favplaylists: async ({ payload, room }) => {
      const user = payload.sender
      const favorites = getFavorites(user)

      if (!favorites.length) {
        await post({
          room,
          message: '\uD83D\uDCCB *No favorites set yet.*\n\nUse `/favplaylist <1-9> <playlistId>` to save a playlist to a slot.'
        })
        return
      }

      const list = favorites.map(f => {
        return `*${f.slot}.* ${f.playlistName}\n\uD83C\uDD86 \`${f.playlistId}\``
      }).join('\n\n')

      await post({
        room,
        message: `\u2764\uFE0F *Your Favorite Playlists:*\n\n${list}\n\n\u2795 \`/addsong <slot>\` to add the current track`
      })
    },

    // /unfavplaylist <slot>
    unfavplaylist: async ({ payload, room, args }) => {
      const user = payload.sender
      const slot = Number((args || '').trim())

      if (!slot || slot < 1 || slot > 9 || !Number.isInteger(slot)) {
        await post({ room, message: '\u26A0\uFE0F Usage: `/unfavplaylist <1-9>`' })
        return
      }

      const existing = getFavorite(user, slot)
      if (!existing) {
        await post({ room, message: `\u26A0\uFE0F Slot *${slot}* is already empty.` })
        return
      }

      removeFavorite(user, slot)
      await post({ room, message: `\u2705 Slot *${slot}* (*${existing.playlistName}*) cleared.` })
    },

    // /addsong <slot>
    addsong: async ({ payload, room, roomBot, args }) => {
      const user = payload.sender
      const slot = Number((args || '').trim())

      if (!slot || slot < 1 || slot > 9 || !Number.isInteger(slot)) {
        await post({ room, message: '\u26A0\uFE0F Usage: `/addsong <1-9>`\n\nSave playlists to slots with `/favplaylist <1-9> <playlistId>`.' })
        return
      }

      const spotifyTrackId = roomBot?.currentSong?.spotifyTrackId
      if (!spotifyTrackId) {
        await post({ room, message: '\u274C No track is currently playing or track ID is unavailable.' })
        return
      }

      const favorite = getFavorite(user, slot)
      if (!favorite) {
        await post({ room, message: `\u274C Slot *${slot}* is empty. Use \`/favplaylist ${slot} <playlistId>\` to set it.` })
        return
      }

      const auth = await requireLinkedAccount(user, room)
      if (!auth) return

      try {
        const trackUri = `spotify:track:${spotifyTrackId}`
        const { auth: updatedAuth } = await addTrackToPlaylistForUser(
          auth.refreshToken,
          favorite.playlistId,
          trackUri,
          { accessToken: auth.accessToken, expiresAt: auth.expiresAt }
        )
        saveTokens(user, updatedAuth, auth)

        const trackName = roomBot.currentSong?.trackName || 'current track'
        const artistName = roomBot.currentSong?.artistName
        const label = artistName ? `*${trackName}* by *${artistName}*` : `*${trackName}*`
        await post({ room, message: `\u2705 Added ${label} to *${favorite.playlistName}*` })
      } catch (err) {
        logger.error('[addsong] error adding track', { user, slot, playlistId: favorite.playlistId, err })
        await post({ room, message: '\u274C Failed to add the track. Please try again.' })
      }
    },

    // /removesong <slot>
    removesong: async ({ payload, room, roomBot, args }) => {
      const user = payload.sender
      const slot = Number((args || '').trim())

      if (!slot || slot < 1 || slot > 9 || !Number.isInteger(slot)) {
        await post({ room, message: '\u26A0\uFE0F Usage: `/removesong <1-9>`' })
        return
      }

      const spotifyTrackId = roomBot?.currentSong?.spotifyTrackId
      if (!spotifyTrackId) {
        await post({ room, message: '\u274C No track is currently playing or track ID is unavailable.' })
        return
      }

      const favorite = getFavorite(user, slot)
      if (!favorite) {
        await post({ room, message: `\u274C Slot *${slot}* is empty. Use \`/favplaylist ${slot} <playlistId>\` to set it.` })
        return
      }

      const auth = await requireLinkedAccount(user, room)
      if (!auth) return

      try {
        const trackUri = `spotify:track:${spotifyTrackId}`
        const { auth: updatedAuth } = await removeTrackFromPlaylistForUser(
          auth.refreshToken,
          favorite.playlistId,
          trackUri,
          { accessToken: auth.accessToken, expiresAt: auth.expiresAt }
        )
        saveTokens(user, updatedAuth, auth)

        const trackName = roomBot.currentSong?.trackName || 'current track'
        const artistName = roomBot.currentSong?.artistName
        const label = artistName ? `*${trackName}* by *${artistName}*` : `*${trackName}*`
        await post({ room, message: `\u2705 Removed ${label} from *${favorite.playlistName}*` })
      } catch (err) {
        logger.error('[removesong] error removing track', { user, slot, playlistId: favorite.playlistId, err })
        await post({ room, message: '\u274C Failed to remove the track. Please try again.' })
      }
    },

    'blacklist+': async ({ room, roomBot }) => {
      const currentSong = roomBot.currentSong

      if (!currentSong || !currentSong.trackName || !currentSong.artistName) {
        await post({ room, message: '\u26A0\uFE0F No current song playing or track data unavailable.' })
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
        await post({ room, message: `\u26D4\uFE0F "${fullName}" is already on the blacklist.` })
        return
      }

      blacklist.push(fullName)
      try {
        if (writeBlacklistFile) await writeBlacklistFile(blacklist)
      } catch (err) {
        console.error('Error writing to blacklist file:', err)
      }

      await post({ room, message: `\u2705 Added "${fullName}" to the blacklist.` })
    }
  }
}
