// src/handlers/spotifyQueueCommands.js
//
// Handlers for /searchalbum, /searchplaylist, /qplaylist, /qalbum, /newalbums
// All Spotify-backed search and queue-population commands live here.

import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
import {
  getAlbumsByArtist,
  getAlbumTracks,
  addSongsToCrate,
  getUserToken,
  clearUserQueueCrate,
  getUserQueueCrateId,
  getSpotifyUserId,
  getUserPlaylists,
  getPlaylistTracks,
  getSpotifyNewAlbumsViaSearch,
  getSpotifyAlbumInfo
} from '../utils/API.js'

function extractSpotifyAlbumId (input) {
  const s = String(input || '').trim()
  if (/^[A-Za-z0-9]{15,30}$/.test(s)) return s
  const m1 = s.match(/open\.spotify\.com\/album\/([A-Za-z0-9]{15,30})/i)
  if (m1?.[1]) return m1[1]
  const m2 = s.match(/spotify:album:([A-Za-z0-9]{15,30})/i)
  if (m2?.[1]) return m2[1]
  return null
}

export function createSpotifyQueueHandlers () {
  return {
    searchalbum: async ({ payload, room, args }) => {
      const artistName = (args || '').trim()

      if (!artistName) {
        await postMessage({
          room,
          message: 'Please provide an artist name. Usage: `/searchalbum Mac Miller`'
        })
        return
      }

      const albums = await getAlbumsByArtist(artistName)
      if (!albums.length) {
        await postMessage({ room, message: `No albums found for "${artistName}".` })
        return
      }

      const albumList = albums.map((album, index) => {
        return `\`${index + 1}.\` *${album.name}* \u2014 \`ID: ${album.id}\``
      }).join('\n')

      await sendDirectMessage(payload.sender, `\uD83C\uDFB6 Albums for "${artistName}":\n${albumList}`)
      await postMessage({ room, message: `<@uid:${payload.sender}> I sent you a private message` })
    },

    searchplaylist: async ({ payload, room }) => {
      const user = payload.sender
      const spotifyUserId = getSpotifyUserId(user)
      if (!spotifyUserId) {
        await postMessage({
          room,
          message: "\uD83D\uDD0D *Spotify user ID not found*\n\nWe don't have a Spotify user ID associated with your account.  Ask an admin to update the mapping for your TT.fm UUID so you can use /searchplaylist."
        })
        return
      }

      try {
        const playlists = await getUserPlaylists(spotifyUserId)
        if (!playlists || playlists.length === 0) {
          await postMessage({
            room,
            message: `\u274C *No playlists found for your Spotify account \`${spotifyUserId}\`.*`
          })
          return
        }

        const playlistList = playlists.map((pl, index) => {
          return `\`${index + 1}.\` *${pl.name}* \u2014 \`ID: ${pl.id}\``
        }).join('\n')

        await sendDirectMessage(user, `\uD83D\uDCF3 Playlists for your Spotify account:\n${playlistList}`)
        await postMessage({ room, message: `<@uid:${user}> I sent you a private message` })
      } catch (error) {
        logger.error('Error fetching user playlists', { err: error })
        await postMessage({
          room,
          message: '\u274C *Failed to fetch your playlists.* Please try again or ask an admin to check the Spotify connection.'
        })
      }
    },

    qplaylist: async ({ payload, room, args }) => {
      const playlistId = (args || '').trim().split(/\s+/)[0]
      if (!playlistId) {
        await postMessage({
          room,
          message: '\u26A0\uFE0F *Missing Playlist ID*\n\nPlease provide a valid Spotify playlist ID.  \nExample: `/qplaylist 37i9dQZF1DXcBWIGoYBM5M`'
        })
        return
      }

      const token = getUserToken(payload.sender)
      if (!token) {
        await postMessage({
          room,
          message: "\uD83D\uDD10 *Spotify account not linked*\n\nWe couldn't find your access token.  \nPlease contact an admin to link your account to use this command."
        })
        return
      }

      try {
        await postMessage({
          room,
          message: '\uD83D\uDCC1 *Clearing your current queue...*\n\uD83D\uDCE1 Fetching playlist from Spotify...'
        })

        await clearUserQueueCrate(payload.sender)
        const crateInfo = await getUserQueueCrateId(payload.sender)
        const crateId = crateInfo?.crateUuid
        if (!crateId) {
          await postMessage({ room, message: '\u274C *Failed to retrieve your queue ID. Please try again later.*' })
          return
        }

        const tracks = await getPlaylistTracks(playlistId)
        if (!tracks || tracks.length === 0) {
          await postMessage({
            room,
            message: `\u274C *No tracks found for playlist \`${playlistId}\`.*`
          })
          return
        }

        const formattedTracks = tracks.map(track => ({
          musicProvider: 'spotify',
          songId: track.id,
          artistName: Array.isArray(track.artists) ? track.artists.map(a => a.name).join(', ') : '',
          trackName: track.name,
          duration: Math.floor((track.duration_ms || 0) / 1000),
          explicit: track.explicit,
          isrc: track.external_ids?.isrc || '',
          playbackToken: '',
          genre: ''
        }))

        const queueResult = await addSongsToCrate(crateId, formattedTracks, true, token)
        const addedCount = Number(queueResult?.added || 0)
        const skippedCount = Number(queueResult?.skipped || 0)
        await postMessage({
          room,
          message: `\u2705 *Playlist Queued!*\n\n\uD83C\uDFB5 Added *${addedCount} track(s)* from playlist \`${playlistId}\` to your queue.${skippedCount > 0 ? `\n\u26A0\uFE0F Skipped ${skippedCount} track(s) that could not be resolved.` : ''}  \nPlease refresh your page for the queue to update`
        })
      } catch (error) {
        logger.error('[qplaylist] error queuing playlist', { playlistId, err: error })
        await postMessage({
          room,
          message: '\u274C *Something went wrong while queuing your playlist.* Please check the playlist ID and try again.'
        })
      }
    },

    qalbum: async ({ payload, room, args }) => {
      const albumId = extractSpotifyAlbumId(args)
      if (!albumId) {
        await postMessage({
          room,
          message:
`\u26A0\uFE0F *Missing Album ID*

Please provide a valid Spotify album ID/URL/URI.
Example: \`/qalbum 4aawyAB9vmqN3uQ7FjRGTy\`
Example: \`/qalbum https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy\``
        })
        return
      }

      const token = getUserToken(payload.sender)
      if (!token) {
        await postMessage({
          room,
          message:
`\uD83D\uDD10 *Spotify account not linked*

We couldn\u2019t find your access token.
Please contact an admin to link your account to use this command.`
        })
        return
      }

      try {
        await postMessage({
          room,
          message: '\uD83D\uDCC1 *Clearing your current queue...*\n\uD83D\uDCE1 Fetching album from Spotify...'
        })

        await clearUserQueueCrate(payload.sender)
        const crateInfo = await getUserQueueCrateId(payload.sender)
        const crateId = crateInfo?.crateUuid
        if (!crateId) {
          await postMessage({ room, message: '\u274C *Failed to retrieve your queue ID. Please try again later.*' })
          return
        }

        const [albumInfo, tracks] = await Promise.all([
          getSpotifyAlbumInfo(albumId),
          getAlbumTracks(albumId)
        ])

        if (!tracks || tracks.length === 0) {
          await postMessage({
            room,
            message:
`\u274C *Couldn\u2019t find tracks for that album.*
\uD83C\uDD86 \`${albumId}\``
          })
          return
        }

        const formattedTracks = tracks
          .filter(track => track?.id)
          .map(track => ({
            musicProvider: 'spotify',
            songId: track.id,
            artistName: Array.isArray(track.artists) ? track.artists.map(a => a.name).join(', ') : '',
            trackName: track.name || 'Unknown',
            duration: Math.floor((track.duration_ms || 0) / 1000),
            explicit: !!track.explicit,
            isrc: track.external_ids?.isrc || '',
            playbackToken: '',
            genre: ''
          }))

        if (!formattedTracks.length) {
          await postMessage({
            room,
            message:
`\u274C *No queueable tracks were found for that album.*
\uD83C\uDD86 \`${albumId}\``
          })
          return
        }

        const queueResult = await addSongsToCrate(crateId, formattedTracks, true, token)
        const addedCount = Number(queueResult?.added || 0)
        const skippedCount = Number(queueResult?.skipped || 0)
        const albumName = albumInfo?.albumName || 'Unknown Album'
        const artistName = albumInfo?.artistName || 'Unknown Artist'
        const spotifyUrl = albumInfo?.spotifyUrl || ''
        const totalTracks = Number(albumInfo?.trackCount || tracks.length || formattedTracks.length)

        await postMessage({
          room,
          message:
`\u2705 *Album Queued!*

\uD83D\uDCC0 *${albumName}*
\uD83C\uDFA4 *${artistName}*
\uD83C\uDFB5 Added *${addedCount}/${totalTracks}* track(s) to your queue.${skippedCount > 0 ? `\n\u26A0\uFE0F Skipped *${skippedCount}* track(s) that could not be resolved.` : ''}
${spotifyUrl ? `\uD83D\uDD17 ${spotifyUrl}\n` : ''}\uD83C\uDD86 \`${albumId}\`
Please refresh your page for the queue to update`
        })
      } catch (error) {
        logger.error('[qalbum] error queuing album', { albumId, err: error })
        await postMessage({
          room,
          message: '\u274C *Something went wrong while queuing your album.* Please check the album ID and try again.'
        })
      }
    },

    newalbums: async ({ payload, room, args }) => {
      const country = ((args || '').trim().split(/\s+/)[0] || 'US').toUpperCase()
      logger.info('[newalbums] command received', { message: payload.message, country })

      let albums
      try {
        albums = await getSpotifyNewAlbumsViaSearch(country, 6)
        logger.info('[newalbums] albums fetched', { country, count: albums?.length || 0 })
      } catch (err) {
        logger.error('[newalbums] fetch failed', { country, err })
        await postMessage({ room, message: '\u274C Failed to fetch new albums. Please try again in a moment.' })
        return
      }

      if (!albums || albums.length === 0) {
        logger.warn('[newalbums] no albums returned', { country })
        await postMessage({ room, message: `No recent full album releases found for ${country}.` })
        return
      }

      const blocks = albums.map((a, i) => {
        const num = i + 1
        return (
`*${num}. ${a.artist || 'Unknown Artist'}*
_${a.name || 'Unknown Album'}_
\uD83D\uDDD3 ${a.releaseDate || '\u2014'}
\uD83C\uDD86 \`${a.id || '\u2014'}\``
        )
      }).join('\n\n')

      logger.info('[newalbums] posting message to room', { country, count: albums.length })
      await postMessage({
        room,
        message:
`\uD83C\uDD95 *New Album Releases* (${country})
_Full albums only_

${blocks}

\u2795 Save to Future Listening Queue:
\`/albumadd <album id>\`
`
      })
    }
  }
}
