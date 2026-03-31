// src/handlers/spotifyQueueCommands.js
//
// Handlers for /searchalbum, /searchplaylist, /qplaylist, /qalbum, /newalbums
// All Spotify-backed search and queue-population commands live here.

import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
import { env } from '../config.js'
import { createSpotifyPlaylist, createSpotifyPlaylistForRefreshToken, saveToSpotifyLikedSongs, refreshSpotifyAccessTokenWithRefreshToken } from '../utils/playlistUpdate.js'
import { getSpotifyUserAuth, updateSpotifyUserAuthTokens } from '../database/dbspotifyauth.js'
import { extractSpotifyAlbumId, extractSpotifyPlaylistId } from '../utils/spotifyHelpers.js'
import {
  getAlbumsByArtist,
  getAlbumTracks,
  addSongsToCrate,
  getUserToken,
  clearUserQueueCrate,
  getUserQueueCrateId,
  getSpotifyUserId,
  getUserPlaylists,
  getMyPlaylists,
  getPlaylistTracks,
  isUserAuthorized,
  getSpotifyNewAlbumsViaSearch,
  getSpotifyAlbumInfo
} from '../utils/API.js'


function parsePlaylistCreateArgs (input) {
  const raw = String(input || '').trim()
  if (!raw) return null

  const parts = raw.split(/\s+/)
  const first = String(parts[0] || '').toLowerCase()

  if (first === 'private' || first === 'public') {
    const name = parts.slice(1).join(' ').trim()
    if (!name) return null
    return { name, public: first !== 'private' }
  }

  return { name: raw, public: true }
}

export function createSpotifyQueueHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    sendDirectMessage: sendDm = sendDirectMessage,
    createSpotifyPlaylist: createPlaylist = createSpotifyPlaylist,
    createSpotifyPlaylistForRefreshToken: createPlaylistForToken = createSpotifyPlaylistForRefreshToken,
    getSpotifyUserAuth: getUserSpotifyAuth = getSpotifyUserAuth,
    updateSpotifyUserAuthTokens: saveUserSpotifyTokens = updateSpotifyUserAuthTokens,
    isUserAuthorized: isAuthorized = isUserAuthorized,
    saveToSpotifyLikedSongs: saveLikedSong = saveToSpotifyLikedSongs
  } = deps

  const handlePlaylistCreate = async ({ payload, room, args, ttlUserToken }) => {
    const ok = await isAuthorized(payload.sender, ttlUserToken)
    if (!ok) {
      await post({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }

    const parsed = parsePlaylistCreateArgs(args)
    if (!parsed?.name) {
      await post({
        room,
        message: 'Please provide a playlist name. Usage: `/playlistcreate <name>` or `/playlistcreate private <name>`'
      })
      return
    }

    try {
      const createOptions = {
        public: parsed.public,
        description: `Created by Jamflow Bot on ${new Date().toISOString().slice(0, 10)}`
      }
      const userAuth = getUserSpotifyAuth(payload.sender)
      let playlist

      if (userAuth?.refreshToken) {
        const result = await createPlaylistForToken(
          userAuth.refreshToken,
          parsed.name,
          createOptions,
          { accessToken: userAuth.accessToken, expiresAt: userAuth.expiresAt }
        )
        playlist = result?.playlist
        if (result?.auth?.accessToken) {
          saveUserSpotifyTokens(payload.sender, {
            accessToken: result.auth.accessToken,
            refreshToken: result.auth.refreshToken || userAuth.refreshToken,
            expiresAt: result.auth.expiresAt
          })
        }
      } else {
        playlist = await createPlaylist(parsed.name, createOptions)
      }

      if (!playlist?.id) {
        await post({ room, message: '❌ Spotify did not return a playlist ID. Please try again.' })
        return
      }

      const spotifyUrl = playlist?.external_urls?.spotify || ''
      const ownershipLine = userAuth?.refreshToken
        ? '👤 Created on your linked Spotify account'
        : '👤 Created on the shared bot Spotify account'
      await post({
        room,
        message:
`✅ *Playlist Created!*

🎵 *${playlist.name || parsed.name}*
🌐 ${playlist.public === false ? 'Private' : 'Public'}
${ownershipLine}
${spotifyUrl ? `🔗 ${spotifyUrl}\n` : ''}🆔 \`${playlist.id}\``
      })
    } catch (error) {
      logger.error('[playlistcreate] error creating playlist', { err: error })
      await post({
        room,
        message: `❌ Failed to create playlist.${error?.message ? ` ${error.message}` : ''}`
      })
    }
  }

  const handleSearchPlaylist = async ({ payload, room, args }) => {
    const user = payload.sender
    const filter = (args || '').trim().toLowerCase()

    const userAuth = getUserSpotifyAuth(user)
    const spotifyUserId = getSpotifyUserId(user) || userAuth?.spotifyUserId

    if (!userAuth?.refreshToken && !spotifyUserId) {
      await post({
        room,
        message: '\uD83D\uDD0D *Spotify account not linked*\n\nUse `/spotifylink` to connect your Spotify account first.'
      })
      return
    }

    try {
      let playlists = []

      if (userAuth?.refreshToken) {
        // Use the user's OAuth token to get /me/playlists — includes Spotify-curated playlists
        // (Discover Weekly, Daily Mixes, Release Radar, etc.)
        let token = userAuth.accessToken
        const isExpired = !token || !userAuth.expiresAt || userAuth.expiresAt <= Date.now()

        if (isExpired) {
          const refreshed = await refreshSpotifyAccessTokenWithRefreshToken(userAuth.refreshToken)
          token = refreshed.accessToken
          saveUserSpotifyTokens(user, {
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken || userAuth.refreshToken,
            expiresAt: refreshed.expiresAt
          })
        }

        playlists = await getMyPlaylists(token)
      } else {
        playlists = await getUserPlaylists(spotifyUserId)
      }

      if (!playlists || playlists.length === 0) {
        await post({ room, message: '\u274C *No playlists found on your Spotify account.*' })
        return
      }

      const matched = filter
        ? playlists.filter(pl => pl.name?.toLowerCase().includes(filter))
        : playlists

      if (matched.length === 0) {
        await post({ room, message: `\u274C *No playlists found matching "${filter}".*` })
        return
      }

      const playlistList = matched.map((pl, index) => {
        const count = pl.tracks?.total != null ? ` (${pl.tracks.total} tracks)` : ''
        return `\`${index + 1}.\` *${pl.name}*${count}\n\uD83C\uDD86 \`${pl.id}\``
      }).join('\n\n')

      const header = filter
        ? `\uD83D\uDCF3 *Playlists matching "${filter}"* (${matched.length}):\n\n`
        : `\uD83D\uDCF3 *Your Spotify Playlists* (${matched.length}):\n\n`

      await sendDm(user, `${header}${playlistList}\n\n\u25B6\uFE0F Queue one with \`/qplaylist <id>\``)
      await post({ room, message: `<@uid:${user}> Check your DMs for your playlist list!` })
    } catch (error) {
      logger.error('[searchplaylist] error fetching playlists', { err: error })
      await post({ room, message: '\u274C *Failed to fetch your playlists.* Please try again.' })
    }
  }

  return {
    searchalbum: async ({ payload, room, args }) => {
      const artistName = (args || '').trim()

      if (!artistName) {
        await post({
          room,
          message: 'Please provide an artist name. Usage: `/searchalbum Mac Miller`'
        })
        return
      }

      const albums = await getAlbumsByArtist(artistName)
      if (!albums.length) {
        await post({ room, message: `No albums found for "${artistName}".` })
        return
      }

      const albumList = albums.map((album, index) => {
        return `\`${index + 1}.\` *${album.name}* \u2014 \`ID: ${album.id}\``
      }).join('\n')

      await sendDm(payload.sender, `\uD83C\uDFB6 Albums for "${artistName}":\n${albumList}`)
      await post({ room, message: `<@uid:${payload.sender}> I sent you a private message` })
    },

    searchplaylist: handleSearchPlaylist,
    searchplaylists: handleSearchPlaylist,

    playlistcreate: handlePlaylistCreate,
    createplaylist: handlePlaylistCreate,

    qplaylist: async ({ payload, room, args }) => {
      const playlistId = extractSpotifyPlaylistId((args || '').trim().split(/\s+/)[0])
      if (!playlistId) {
        await post({
          room,
          message: '\u26A0\uFE0F *Missing Playlist ID*\n\nPlease provide a valid Spotify playlist ID.  \nExample: `/qplaylist 37i9dQZF1DXcBWIGoYBM5M`'
        })
        return
      }

      const token = getUserToken(payload.sender)
      if (!token) {
        await post({
          room,
          message: "\uD83D\uDD10 *Spotify account not linked*\n\nWe couldn't find your access token.  \nPlease contact an admin to link your account to use this command."
        })
        return
      }

      try {
        await post({
          room,
          message: '\uD83D\uDCC1 *Clearing your current queue...*\n\uD83D\uDCE1 Fetching playlist from Spotify...'
        })

        await clearUserQueueCrate(payload.sender)
        const crateInfo = await getUserQueueCrateId(payload.sender)
        const crateId = crateInfo?.crateUuid
        if (!crateId) {
          await post({ room, message: '\u274C *Failed to retrieve your queue ID. Please try again later.*' })
          return
        }

        const tracks = await getPlaylistTracks(playlistId)
        if (!tracks || tracks.length === 0) {
          await post({
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
        await post({
          room,
          message: `\u2705 *Playlist Queued!*\n\n\uD83C\uDFB5 Added *${addedCount} track(s)* from playlist \`${playlistId}\` to your queue.${skippedCount > 0 ? `\n\u26A0\uFE0F Skipped ${skippedCount} track(s) that could not be resolved.` : ''}  \nPlease refresh your page for the queue to update`
        })
      } catch (error) {
        logger.error('[qplaylist] error queuing playlist', { playlistId, err: error })
        await post({
          room,
          message: '\u274C *Something went wrong while queuing your playlist.* Please check the playlist ID and try again.'
        })
      }
    },

    qalbum: async ({ payload, room, args }) => {
      const albumId = extractSpotifyAlbumId(args)
      if (!albumId) {
        await post({
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
        await post({
          room,
          message:
`\uD83D\uDD10 *Spotify account not linked*

We couldn\u2019t find your access token.
Please contact an admin to link your account to use this command.`
        })
        return
      }

      try {
        await post({
          room,
          message: '\uD83D\uDCC1 *Clearing your current queue...*\n\uD83D\uDCE1 Fetching album from Spotify...'
        })

        await clearUserQueueCrate(payload.sender)
        const crateInfo = await getUserQueueCrateId(payload.sender)
        const crateId = crateInfo?.crateUuid
        if (!crateId) {
          await post({ room, message: '\u274C *Failed to retrieve your queue ID. Please try again later.*' })
          return
        }

        const [albumInfo, tracks] = await Promise.all([
          getSpotifyAlbumInfo(albumId),
          getAlbumTracks(albumId)
        ])

        if (!tracks || tracks.length === 0) {
          await post({
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
          await post({
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

        await post({
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
        await post({
          room,
          message: '\u274C *Something went wrong while queuing your album.* Please check the album ID and try again.'
        })
      }
    },

    save: async ({ payload, room, roomBot }) => {
      const spotifyTrackId = roomBot?.currentSong?.spotifyTrackId
      if (!spotifyTrackId) {
        await post({ room, message: '\u274C No track is currently playing or track ID is unavailable.' })
        return
      }

      const userAuth = getUserSpotifyAuth(payload.sender)
      if (!userAuth?.refreshToken) {
        await post({
          room,
          message: '\uD83D\uDD10 *Spotify account not linked*\n\nYou need a linked Spotify account to save liked songs.\nPlease contact an admin to link your account.'
        })
        return
      }

      try {
        const authResult = await saveLikedSong(
          userAuth.refreshToken,
          spotifyTrackId,
          { accessToken: userAuth.accessToken, expiresAt: userAuth.expiresAt }
        )
        if (authResult?.accessToken) {
          saveUserSpotifyTokens(payload.sender, {
            accessToken: authResult.accessToken,
            refreshToken: authResult.refreshToken || userAuth.refreshToken,
            expiresAt: authResult.expiresAt
          })
        }
        const trackName = roomBot.currentSong?.trackName || 'the current track'
        const artistName = roomBot.currentSong?.artistName
        const label = artistName ? `*${trackName}* by *${artistName}*` : `*${trackName}*`
        await post({ room, message: `\u2764\uFE0F Saved ${label} to your Spotify Liked Songs!` })
      } catch (error) {
        logger.error('[save] error saving to liked songs', { spotifyTrackId, err: error })
        await post({ room, message: '\u274C *Something went wrong while saving the track.* Please try again.' })
      }
    },

    spotifylink: async ({ payload, room, ttlUserToken }) => {
      const ok = await isAuthorized(payload.sender, ttlUserToken)
      if (!ok) {
        await post({ room, message: '\u26D4 You need to be a moderator to use this command.' })
        return
      }

      if (!env.redirectUri) {
        await post({ room, message: '\u274C Spotify auth is not configured on this bot.' })
        return
      }

      try {
        const authUrl = new URL('/auth/spotify', env.redirectUri)
        authUrl.searchParams.set('user', payload.sender)
        await sendDm(payload.sender,
          `\uD83D\uDD17 *Link your Spotify account*\n\nClick the link below to connect your Spotify account to the bot:\n${authUrl.href}\n\n_This will allow you to use commands like \`/save\`, \`/qplaylist\`, and \`/playlistcreate\`._`
        )
        await post({ room, message: `\u2705 <@uid:${payload.sender}> Check your DMs for your Spotify link!` })
      } catch (err) {
        logger.error('[spotifylink] error sending auth link', { sender: payload.sender, err })
        await post({ room, message: '\u274C Failed to send the Spotify link. Please try again.' })
      }
    },

    spotifyhelp: async ({ payload, room }) => {
      const user = payload.sender
      const help = `\uD83C\uDFB5 *Spotify Commands Guide*

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\uD83D\uDD10 *Account Setup* _(mod only)_
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\`/spotifylink\` or \`/spotify link\`
Link your Spotify account. Sends you a DM with your personal auth URL. Required before using any other Spotify commands.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\u2764\uFE0F *Favorite Playlists*
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\`/favplaylist <1-9> <playlistId|url>\`
Save a playlist to a slot (1–9). Accepts a Spotify ID or full URL. Overwrites the slot if already set.

\`/favplaylists\`
View all your saved playlist slots with names and IDs.

\`/unfavplaylist <1-9>\`
Clear a slot.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\uD83C\uDFB5 *Current Song*
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\`/addsong <1-9>\`
Add the currently playing track to the playlist in that slot.

\`/removesong <1-9>\`
Remove the currently playing track from the playlist in that slot.

\`/save\`
Save the currently playing track to your Spotify Liked Songs.

\`/playlist?\`
Check which of your favorite playlist slots already contain the current track.

\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\uD83D\uDD0D *Search & Queue*
\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
\`/searchplaylist [filter]\` or \`/searchplaylists [filter]\`
DMs you a list of your Spotify playlists. Optionally filter by name, e.g. \`/searchplaylist chill\`.

\`/qplaylist <id|url>\`
Load all tracks from a Spotify playlist into your queue.

\`/qalbum <id|url>\`
Load all tracks from a Spotify album into your queue.

\`/searchalbum <artist>\`
DMs you a list of albums by an artist with their IDs.

\`/newalbums [countryCode]\`
Show recent album releases. Defaults to US.`

      await sendDm(user, help)
      await post({ room, message: `<@uid:${user}> Check your DMs for the Spotify commands guide!` })
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
        await post({ room, message: '\u274C Failed to fetch new albums. Please try again in a moment.' })
        return
      }

      if (!albums || albums.length === 0) {
        logger.warn('[newalbums] no albums returned', { country })
        await post({ room, message: `No recent full album releases found for ${country}.` })
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
      await post({
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
