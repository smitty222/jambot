// src/handlers/albumManagementCommands.js
//
// Handlers for /albumadd, /albumremove, /albumlist
// These manage the "albums to queue on album Monday" list stored in SQLite.

import { postMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
import { getSpotifyAlbumInfo, getUserNicknameByUuid } from '../utils/API.js'
import { addQueuedAlbum, removeQueuedAlbum, listQueuedAlbums } from '../database/dbalbumqueue.js'

function extractSpotifyAlbumId (input) {
  const s = String(input || '').trim()
  if (/^[A-Za-z0-9]{15,30}$/.test(s)) return s
  const m1 = s.match(/open\.spotify\.com\/album\/([A-Za-z0-9]{15,30})/i)
  if (m1?.[1]) return m1[1]
  const m2 = s.match(/spotify:album:([A-Za-z0-9]{15,30})/i)
  if (m2?.[1]) return m2[1]
  return null
}

function looksLikeSpotifyId (s) {
  return !!extractSpotifyAlbumId(s)
}

export function createAlbumManagementHandlers () {
  return {
    albumadd: async ({ payload, room, args }) => {
      const albumId = extractSpotifyAlbumId(args)

      if (!albumId) {
        await postMessage({ room, message: 'Please specify a Spotify album ID. Usage: `/albumadd <spotifyAlbumId>`' })
        return
      }

      if (!looksLikeSpotifyId(albumId)) {
        await postMessage({ room, message: 'That does not look like a Spotify album ID. Example: `/albumadd 2v6ANhWhZBUKkg6pJJBs3B`' })
        return
      }

      try {
        const userId = payload?.sender || null
        const submitterNick = userId ? await getUserNicknameByUuid(userId) : null

        const info = await getSpotifyAlbumInfo(albumId)
        if (!info?.spotifyAlbumId) {
          await postMessage({ room, message: '\u274C Could not fetch that album from Spotify. Double-check the ID.' })
          return
        }

        addQueuedAlbum({
          spotifyAlbumId: info.spotifyAlbumId,
          spotifyUrl: info.spotifyUrl || '',
          albumName: info.albumName || 'Unknown',
          artistName: info.artistName || 'Unknown',
          releaseDate: info.releaseDate || '',
          trackCount: Number(info.trackCount || 0),
          albumArt: info.albumArt || '',
          submittedByUserId: userId || '',
          submittedByNickname: submitterNick || ''
        })

        await postMessage({
          room,
          message:
            '\u2705 Added to album queue:\n' +
            `\uD83D\uDCC0 *${info.albumName}*\n` +
            `\uD83C\uDFA4 *${info.artistName}*\n` +
            (info.spotifyUrl ? `\uD83D\uDD17 ${info.spotifyUrl}\n` : '') +
            `\uD83C\uDD86 ${info.spotifyAlbumId}`
        })
      } catch (err) {
        logger.error('[albumadd] Error:', err?.message || err)
        await postMessage({ room, message: '\u274C Failed to add album.' })
      }
    },

    albumremove: async ({ room, args }) => {
      const albumId = extractSpotifyAlbumId(args)

      if (!albumId) {
        await postMessage({ room, message: 'Please specify a Spotify album ID. Usage: `/albumremove <spotifyAlbumId>`' })
        return
      }

      if (!looksLikeSpotifyId(albumId)) {
        await postMessage({ room, message: 'That does not look like a Spotify album ID. Example: `/albumremove 2v6ANhWhZBUKkg6pJJBs3B`' })
        return
      }

      try {
        const ok = removeQueuedAlbum(albumId)
        await postMessage({
          room,
          message: ok
            ? `\uD83D\uDDD1\uFE0F Removed from album queue: ${albumId}`
            : `\u2754 Not found in album queue: ${albumId}`
        })
      } catch (err) {
        logger.error('[albumremove] Error:', err?.message || err)
        await postMessage({ room, message: '\u274C Failed to remove album.' })
      }
    },

    albumlist: async ({ room }) => {
      try {
        const albums = listQueuedAlbums({ limit: 25, includeNonQueued: false })

        if (!albums || albums.length === 0) {
          await postMessage({ room, message: '\uD83D\uDCED There are no albums queued. Use `/albumadd <spotifyAlbumId>` to add one!' })
          return
        }

        const lines = albums.map((a, i) => {
          const title = String(a.albumName || 'Unknown Album').trim()
          const artist = String(a.artistName || 'Unknown Artist').trim()
          const id = String(a.spotifyAlbumId || '').trim() || '\u2014'
          const spotifyUrl = String(a.spotifyUrl || '').trim()
          const submittedBy = String(a.submittedByNickname || '').trim()

          let line = `${String(i + 1).padStart(2, '0')}. *${title}* \u2014 ${artist}\n`
          line += `    \uD83C\uDD86 \`${id}\``
          if (spotifyUrl) line += `  \u2022  \uD83D\uDD17 ${spotifyUrl}`
          if (submittedBy) line += `\n    \uD83D\uDE4B Added by: ${submittedBy}`
          return line
        }).join('\n\n')

        await postMessage({
          room,
          message:
            '\uD83C\uDFA7 **Album Queue**\n' +
            `\uD83D\uDCE6 ${albums.length} queued album${albums.length === 1 ? '' : 's'}\n\n` +
            `${lines}`
        })
      } catch (err) {
        logger.error('[albumlist] Error:', err?.message || err)
        await postMessage({ room, message: '\u274C Failed to fetch the album queue.' })
      }
    }
  }
}
