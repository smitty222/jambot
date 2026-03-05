// src/handlers/commandRegistry.js
//
// A central registry for high-traffic slash commands and a dispatcher
// function to route incoming messages to the appropriate command handler.
// Moving this logic out of message.js improves readability and makes it
// easier to add or remove commands without touching the monolithic file.

import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'

// Game and feature handlers
import { handleSlotsCommand } from './slots.js'
import { handleCryptoCommand } from './crypto.js'
import {
  startRouletteGame,
  handleRouletteBet,
  rouletteGameActive
} from './roulette.js'

// Lottery and GIF/Dog handlers
import {
  handleLotteryCommand,
  handleTopLotteryStatsCommand,
  handleSingleNumberQuery
} from '../database/dblotterymanager.js'
import handleDogCommand from './commandDog.js'

// Avatar command handlers
import {
  handleBotRandomAvatarCommand,
  handleBotDinoCommand,
  handleBotDuckCommand,
  handleBotAlienCommand,
  handleBotAlien2Command,
  handleBotWalrusCommand,
  handleBotPenguinCommand,
  handleBot1Command,
  handleBot2Command,
  handleBot3Command,
  handleDinoCommand,
  handleDuckCommand,
  handleSpaceBearCommand,
  handleWalrusCommand,
  handleVibesGuyCommand,
  handleFacesCommand,
  handleDoDoCommand,
  handleDumDumCommand,
  handleFlowerPowerCommand,
  handleRandomAvatarCommand,
  handleRandomCyberCommand,
  handleRandomCosmicCommand,
  handleRandomLovableCommand
} from './avatarCommands.js'

// User authorization helper to restrict bot avatar changes
import {
  isUserAuthorized,
  getSpotifyAlbumInfo,
  getUserNicknameByUuid,
  getAlbumsByArtist,
  getAlbumTracks,
  addSongsToCrate,
  getUserToken,
  clearUserQueueCrate,
  getUserQueueCrateId,
  getSpotifyUserId,
  getUserPlaylists,
  getPlaylistTracks,
  getSpotifyNewAlbumsViaSearch
} from '../utils/API.js'

// Album list management functions.  These helpers read and write a simple JSON
// file at the project root to keep track of albums that should be queued.
// The list is updated via the /albumadd and /albumremove commands.
// Pull in album list helpers.  In addition to adding and removing, we can
// query the current list of queued albums so users can see what is in the
// rotation.  getAlbumList returns an array of album names (lower‑cased) or
// an empty array if none have been queued yet.
import { addQueuedAlbum, removeQueuedAlbum,listQueuedAlbums } from '../database/dbalbumqueue.js'


function extractSpotifyAlbumId (input) {
  const s = String(input || '').trim()

  // raw base62 ID
  if (/^[A-Za-z0-9]{15,30}$/.test(s)) return s

  // https://open.spotify.com/album/<id>
  const m1 = s.match(/open\.spotify\.com\/album\/([A-Za-z0-9]{15,30})/i)
  if (m1?.[1]) return m1[1]

  // spotify:album:<id>
  const m2 = s.match(/spotify:album:([A-Za-z0-9]{15,30})/i)
  if (m2?.[1]) return m2[1]

  return null
}

function looksLikeSpotifyId (s) {
  return !!extractSpotifyAlbumId(s)
}


// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------
// Each entry maps a slash command (without the leading '/') to an async
// handler. The handler receives an object with the original payload, the
// current room ID, and a string of extra arguments.
const commandRegistry = {
  // 🎰 Slots: `/slots [betAmount]`
  // Supports text subcommands and numeric bets.
  slots: async ({ payload, room }) => {
    const parts = (payload?.message || '').trim().split(/\s+/)
    const userUUID = payload?.sender

    // Determine the argument (if any) after the command name.
    let arg = ''
    if (parts.length > 1) {
      arg = String(parts[1] || '').trim().toLowerCase()
    }

    // Handle text subcommands directly.
    if (
      arg === 'bonus' ||
      arg === 'free' ||
      arg === 'stats' ||
      arg === 'effective' ||
      arg === 'eff' ||
      arg === 'lifetime' ||
      arg === 'life'
    ) {
      const response = await handleSlotsCommand(userUUID, arg)
      await postMessage({ room, message: response })
      return
    }

    // Parse a numeric bet amount; default to 1 when none provided.
    let betAmount = 1
    if (arg) {
      const amt = parseFloat(arg)
      if (!Number.isFinite(amt) || amt <= 0) {
        await postMessage({ room, message: 'Please provide a valid bet amount.' })
        return
      }
      betAmount = amt
    }

    const response = await handleSlotsCommand(userUUID, betAmount)
    await postMessage({ room, message: response })
  },

  // 🎲 Roulette help + start:
  // `/roulette` → instructions
  // `/roulette start` → start game (if not already running)
  roulette: async ({ payload, room, args }) => {
    const trimmed = (args || '').trim()

    if (/^start\b/i.test(trimmed)) {
      if (rouletteGameActive) {
        await postMessage({
          room,
          message: ' A roulette game is already active! Please wait for it to finish.'
        })
        return
      }
      await startRouletteGame(payload)
      return
    }

    // Default: show instructions
    await postMessage({
      room,
      message:
        ' Welcome to Roulette! Use `/roulette start` to begin.\n\n' +
        ' Place bets using:\n' +
        '- `/red <amount>` or `/black <amount>`\n' +
        '- `/odd <amount>` or `/even <amount>`\n' +
        '- `/high <amount>` or `/low <amount>`\n' +
        '- `/number <number> <amount>` or `/<number> <amount>`\n' +
        '- `/dozen <1|2|3> <amount>`\n\n' +
        ' Use `/balance` to check your wallet.\n' +
        ' Use `/bets` to see all current bets.'
    })
  },

  // 🧾 Show all bets: `/bets` (only if active)
  bets: async ({ room }) => {
    if (!rouletteGameActive) {
      await postMessage({ room, message: 'No active roulette game.' })
    }
  },

  // 🎲 Roulette bet shorthands:
  // These all delegate to handleRouletteBet, which parses the message itself.
  red: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  black: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  green: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  odd: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  even: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  high: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  low: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  number: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  dozen: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },

  // 🎵 Add an album to the remembered list.
    // 🎵 Add an album by Spotify album ID.
  // Usage: `/albumadd <spotifyAlbumId>`
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
        await postMessage({ room, message: '❌ Could not fetch that album from Spotify. Double-check the ID.' })
        return
      }

      // Persist to DB (idempotent behavior should be handled in dbalbumqueue.js)
      const result = addQueuedAlbum({
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

      // If your addQueuedAlbum returns something meaningful (like { inserted: true/false }),
      // you can adjust copy below. For now we always show success.
      await postMessage({
        room,
        message:
          `✅ Added to album queue:\n` +
          `📀 *${info.albumName}*\n` +
          `🎤 *${info.artistName}*\n` +
          (info.spotifyUrl ? `🔗 ${info.spotifyUrl}\n` : '') +
          `🆔 ${info.spotifyAlbumId}`
      })
    } catch (err) {
      logger.error('[albumadd] Error:', err?.message || err)
      await postMessage({ room, message: '❌ Failed to add album.' })
    }
  },

  // 🎵 Remove an album from queue by Spotify album ID
  // Usage: `/albumremove <spotifyAlbumId>`
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
          ? `🗑️ Removed from album queue: ${albumId}`
          : `❔ Not found in album queue: ${albumId}`
      })
    } catch (err) {
      logger.error('[albumremove] Error:', err?.message || err)
      await postMessage({ room, message: '❌ Failed to remove album.' })
    }
  },

  // 🎵 Show queued albums (DB)
  // Usage: `/albumlist`
  albumlist: async ({ room }) => {
    try {
      const albums = listQueuedAlbums({ limit: 25, includeNonQueued: false })

      if (!albums || albums.length === 0) {
        await postMessage({ room, message: '📭 There are no albums queued. Use `/albumadd <spotifyAlbumId>` to add one!' })
        return
      }

      const lines = albums.map((a, i) => {
        const title = a.albumName || 'Unknown Album'
        const artist = a.artistName || 'Unknown Artist'
        const id = a.spotifyAlbumId || '—'
        return `${String(i + 1).padStart(2, '0')}. ${title} — ${artist} (${id})`
      }).join('\n')

      await postMessage({
  room,
  message:
    `🎧 Albums in the queue (${albums.length}):\n` +
    '```' +
    `\n${lines}\n` +
    '```'
})

    } catch (err) {
      logger.error('[albumlist] Error:', err?.message || err)
      await postMessage({ room, message: '❌ Failed to fetch the album queue.' })
    }
  },

  // 🎰 Lottery: `/lottery`
  // Show a fun GIF and then start the lottery game. This mirrors the
  // original behavior in message.js but moves the logic into the
  // centralized registry for faster dispatch.
  lottery: async ({ payload, room }) => {
    try {
      // Pre-game GIF (pumped up for lotto!)
      const gifUrl =
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm11bGZ0M3RraXg5Z3Z4ZzZpNjU4ZDR4Y2QwMzc0NWwyaWFlNWU4byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Ps8XflhsT5EVa/giphy.gif'
      await postMessage({ room, message: '', images: [gifUrl] })
    } catch (err) {
      logger.error('Error sending lottery GIF:', err?.message || err)
    }
    // Start the game; handleLotteryCommand will DM users about picks
    await handleLotteryCommand(payload)
  },

  // 🏆 Lotto stats: `/lottostats`
  lottostats: async ({ room }) => {
    await handleTopLotteryStatsCommand(room)
  },

  // 🏅 Lotto single number query: `/lotto #<number>`
  lotto: async ({ payload, room }) => {
    // Pass the entire message to the helper which extracts and validates the number
    await handleSingleNumberQuery(room, payload.message)
  },

  // 🔎 Album search by artist name: `/searchalbum artist name`
  searchalbum: async ({ payload, room, args }) => {
    const artistName = (args || '').trim()

    if (!artistName) {
      await postMessage({
        room,
        message: 'Please provide an artist name. Usage: `/searchalbums Mac Miller`'
      })
      return
    }

    const albums = await getAlbumsByArtist(artistName)
    if (!albums.length) {
      await postMessage({ room, message: `No albums found for "${artistName}".` })
      return
    }

    const albumList = albums.map((album, index) => {
      return `\`${index + 1}.\` *${album.name}* — \`ID: ${album.id}\``
    }).join('\n')

    await sendDirectMessage(payload.sender, `🎶 Albums for "${artistName}":\n${albumList}`)
    await postMessage({ room, message: `<@uid:${payload.sender}> I sent you a private message` })
  },

  // 🔎 Search user playlists from their linked Spotify user ID.
  searchplaylist: async ({ payload, room }) => {
    const user = payload.sender
    const spotifyUserId = getSpotifyUserId(user)
    if (!spotifyUserId) {
      await postMessage({
        room,
        message: '🔍 *Spotify user ID not found*\n\nWe don\'t have a Spotify user ID associated with your account.  Ask an admin to update the mapping for your TT.fm UUID so you can use /searchplaylist.'
      })
      return
    }

    try {
      const playlists = await getUserPlaylists(spotifyUserId)
      if (!playlists || playlists.length === 0) {
        await postMessage({
          room,
          message: `❌ *No playlists found for your Spotify account \`${spotifyUserId}\`.*`
        })
        return
      }

      const playlistList = playlists.map((pl, index) => {
        return `\`${index + 1}.\` *${pl.name}* — \`ID: ${pl.id}\``
      }).join('\n')

      await sendDirectMessage(user, `📃 Playlists for your Spotify account:\n${playlistList}`)
      await postMessage({ room, message: `<@uid:${user}> I sent you a private message` })
    } catch (error) {
      logger.error('Error fetching user playlists', { err: error })
      await postMessage({
        room,
        message: `❌ *Failed to fetch your playlists*\n\`${error.message}\``
      })
    }
  },

  // 📥 Queue tracks from a Spotify playlist into the user's queue crate.
  qplaylist: async ({ payload, room, args }) => {
    const playlistId = (args || '').trim().split(/\s+/)[0]
    if (!playlistId) {
      await postMessage({
        room,
        message: '⚠️ *Missing Playlist ID*\n\nPlease provide a valid Spotify playlist ID.  \nExample: \`/qplaylist 37i9dQZF1DXcBWIGoYBM5M\`'
      })
      return
    }

    const token = getUserToken(payload.sender)
    if (!token) {
      await postMessage({
        room,
        message: '🔐 *Spotify account not linked*\n\nWe couldn\'t find your access token.  \nPlease contact an admin to link your account to use this command.'
      })
      return
    }

    try {
      await postMessage({
        room,
        message: '📁 *Clearing your current queue...*\n📡 Fetching playlist from Spotify...'
      })

      await clearUserQueueCrate(payload.sender)
      const crateInfo = await getUserQueueCrateId(payload.sender)
      const crateId = crateInfo?.crateUuid
      if (!crateId) {
        await postMessage({
          room,
          message: '❌ *Failed to retrieve your queue ID. Please try again later.*'
        })
        return
      }

      const tracks = await getPlaylistTracks(playlistId)
      if (!tracks || tracks.length === 0) {
        await postMessage({
          room,
          message: `❌ *No tracks found for playlist \`${playlistId}\`.*`
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

      await addSongsToCrate(crateId, formattedTracks, true, token)
      await postMessage({
        room,
        message: `✅ *Playlist Queued!*\n\n🎵 Added *${formattedTracks.length} track(s)* from playlist \`${playlistId}\` to your queue.  \nPlease refresh your page for the queue to update`
      })
    } catch (error) {
      await postMessage({
        room,
        message: `❌ *Something went wrong while queuing your playlist*  \n\`${error.message}\``
      })
    }
  },

  // 📥 Queue tracks from a Spotify album into the user's queue crate.
  qalbum: async ({ payload, room, args }) => {
    const albumId = (args || '').trim().split(/\s+/)[0]
    if (!albumId) {
      await postMessage({
        room,
        message:
`⚠️ *Missing Album ID*

Please provide a valid Spotify album ID.  
Example: \`/qalbum 4aawyAB9vmqN3uQ7FjRGTy\``
      })
      return
    }

    const token = getUserToken(payload.sender)
    if (!token) {
      await postMessage({
        room,
        message:
`🔐 *Spotify account not linked*

We couldn’t find your access token.  
Please contact an admin to link your account to use this command.`
      })
      return
    }

    try {
      await postMessage({
        room,
        message: '📁 *Clearing your current queue...*\n📡 Fetching album from Spotify...'
      })

      await clearUserQueueCrate(payload.sender)
      const crateInfo = await getUserQueueCrateId(payload.sender)
      const crateId = crateInfo?.crateUuid
      if (!crateId) {
        await postMessage({
          room,
          message: '❌ *Failed to retrieve your queue ID. Please try again later.*'
        })
        return
      }

      const tracks = await getAlbumTracks(albumId)
      if (!tracks || tracks.length === 0) {
        await postMessage({
          room,
          message: `❌ *No tracks found for album \`${albumId}\`.*`
        })
        return
      }

      const formattedTracks = tracks.map(track => ({
        musicProvider: 'spotify',
        songId: track.id,
        artistName: track.artists.map(a => a.name).join(', '),
        trackName: track.name,
        duration: Math.floor(track.duration_ms / 1000),
        explicit: track.explicit,
        isrc: track.external_ids?.isrc || '',
        playbackToken: '',
        genre: ''
      }))

      await addSongsToCrate(crateId, formattedTracks, true, token)
      await postMessage({
        room,
        message:
`✅ *Album Queued!*

🎵 Added *${formattedTracks.length} track(s)* from album \`${albumId}\` to your queue.  
Please refresh your page for the queue to update`
      })
    } catch (error) {
      await postMessage({
        room,
        message:
`❌ *Something went wrong while queuing your album*  
\`\`\`${error.message}\`\`\``
      })
    }
  },

  // 🆕 Show newest albums by country: `/newalbums [countryCode]`
  newalbums: async ({ payload, room, args }) => {
    const country = ((args || '').trim().split(/\s+/)[0] || 'US').toUpperCase()
    console.log('[newalbums] command received:', payload.message)
    console.log('[newalbums] country:', country)

    let albums
    try {
      albums = await getSpotifyNewAlbumsViaSearch(country, 6)
      console.log('[newalbums] albums fetched:', albums?.length || 0)
    } catch (err) {
      console.error('[newalbums] fetch failed:', err)
      await postMessage({ room, message: `❌ Failed to fetch new albums.\n\`${err.message}\`` })
      return
    }

    if (!albums || albums.length === 0) {
      console.warn('[newalbums] no albums returned')
      await postMessage({ room, message: `No recent full album releases found for ${country}.` })
      return
    }

    const blocks = albums.map((a, i) => {
      const num = i + 1
      return (
`*${num}. ${a.artist || 'Unknown Artist'}*
_${a.name || 'Unknown Album'}_
🗓 ${a.releaseDate || '—'}
🆔 \`${a.id || '—'}\``
      )
    }).join('\n\n')

    console.log('[newalbums] posting message to room')
    await postMessage({
      room,
      message:
`🆕 *New Album Releases* (${country})
_Full albums only_

${blocks}

➕ Save to Future Listening Queue:
\`/albumadd <album id>\`
`
    })
  },

  // 🎬 Show GIF list: `/gifs`
  gifs: async ({ room }) => {
    await postMessage({
      room,
      message:
        'Randomly selected GIFs:\n- /burp\n- /dance\n- /party\n- /beer\n- /fart\n- /tomatoes\n- /cheers'
    })
  },

  // 🤢 Burp: `/burp`
  burp: async ({ room }) => {
    try {
      const gifUrl =
        'https://media.giphy.com/media/3orieOieQrTkLXl2SY/giphy.gif?cid=790b7611gofgmq0d396jww26sbt1bhc9ljg9am4nb8m6f6lo&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      await postMessage({ room, message: '', images: [gifUrl] })
    } catch (err) {
      logger.error('Error sending burp GIF:', err?.message || err)
    }
  },

  // 💃 Dance: `/dance`
  dance: async ({ room }) => {
    try {
      const options = [
        'https://media.giphy.com/media/IwAZ6dvvvaTtdI8SD5/giphy.gif',
        'https://media.giphy.com/media/3o7qDQ4kcSD1PLM3BK/giphy.gif',
        'https://media.giphy.com/media/oP997KOtJd5ja/giphy.gif',
        'https://media.giphy.com/media/wAxlCmeX1ri1y/giphy.gif'
      ]
      const choice = options[Math.floor(Math.random() * options.length)]
      await postMessage({ room, message: '', images: [choice] })
    } catch (err) {
      logger.error('Error sending dance GIF:', err?.message || err)
      await postMessage({ room, message: 'An error occurred while processing the dance command. Please try again.' })
    }
  },

  // 🎉 Party: `/party`
  party: async ({ room }) => {
    try {
      const options = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHF6aTAzeXNubW84aHJrZzd1OGM1ZjM0MGp5aTZrYTRrZmdscnYwbyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/IwAZ6dvvvaTtdI8SD5/giphy.gif',
        'https://media.giphy.com/media/xUA7aT1vNqVWHPY1cA/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/iJ2cZjydqg9wFkzbGD/giphy.gif?cid=790b7611ov12e8uoq7xedaifcwz9gj28xb43wtxtnuj0rnod&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const choice = options[Math.floor(Math.random() * options.length)]
      await postMessage({ room, message: '', images: [choice] })
    } catch (err) {
      logger.error('Error sending party GIF:', err?.message || err)
    }
  },

  // 🍺 Beer: `/beer`
  beer: async ({ room }) => {
    try {
      const options = [
        'https://media.giphy.com/media/l2Je5C6DLUvYVj37a/giphy.gif?cid=ecf05e475as76fua0g8zvld9lzbm85sb3ojqyt95jrxrnlqz&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/9GJ2w4GMngHCh2W4uk/giphy.gif?cid=ecf05e47vxjww4oli5eck8v6nd6jcmfl9e6awd3a9ok2wa7w&ep=v1_gifs_search&rid=giphy.gif&ct=g',
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaG5yc2UzZXh5dDdzbTh4YnE4dzc5MjMweGc5YXowZjViYWthYXczZiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DmzUp9lX7lHlm/giphy.gif',
        'https://media.giphy.com/media/70lIzbasCI6vOuE2zG/giphy.gif?cid=ecf05e4758ayajrk9c6dnrcblptih04zceztlwndn0vwxmgd&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const choice = options[Math.floor(Math.random() * options.length)]
      await postMessage({ room, message: '', images: [choice] })
    } catch (err) {
      logger.error('Error sending beer GIF:', err?.message || err)
    }
  },

  // 💨 Fart: `/fart`
  fart: async ({ room }) => {
    try {
      const options = [
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExZ21qYmtndjNqYWRqaTFrd2NqaDNkejRqY3RrMTV5Mzlvb3gydDk0ZyZlcD12MV9naWZzX3NlYXJjaCZjdD1n/dWxYMTXIJtT9wGLkOw/giphy.gif',
        'https://media.giphy.com/media/LFvQBWwKk7Qc0/giphy.gif?cid=790b7611gmjbkgv3jadji1kwcjh3dz4jctk15y39oox2t94g&ep=v1_gifs_search&rid=giphy.gif&ct=g'
      ]
      const choice = options[Math.floor(Math.random() * options.length)]
      await postMessage({ room, message: '', images: [choice] })
    } catch (err) {
      logger.error('Error sending fart GIF:', err?.message || err)
      await postMessage({ room, message: 'An error occurred while processing the fart command. Please try again.' })
    }
  },

  // 🥂 Cheers: `/cheers`
  cheers: async ({ room }) => {
    try {
      const options = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3dpem43dXNuNnkzb3A3NmY0ZjBxdTZxazR5aXh1dDl1N3R5OHRyaSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/BPJmthQ3YRwD6QqcVD/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/3oeSB36G9Au4V0xUhG/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' },
        { type: 'gif', value: 'https://media.giphy.com/media/l7jc8M23lg9e3l9SDn/giphy.gif?cid=790b7611swizn7usn6y3op76f4f0qu6qk4yixut9u7ty8tri&ep=v1_gifs_search&rid=giphy.gif&ct=g' },
        { type: 'emoji', value: '' }
      ]
      const selection = options[Math.floor(Math.random() * options.length)]
      if (selection.type === 'gif') {
        await postMessage({ room, message: '', images: [selection.value] })
      } else {
        await postMessage({ room, message: selection.value })
      }
    } catch (err) {
      logger.error('Error sending cheers:', err?.message || err)
    }
  },

  // 🍅 Tomatoes: `/tomatoes`
  tomatoes: async ({ room }) => {
    try {
      const options = [
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb296MmJyeHBpYm9yMGQwbG81cnhlcGd4MWF4N3A1dWhhN3FxNmJvdCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Her9TInMPQYrS/giphy.gif' },
        { type: 'gif', value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExbGY4YmQwZTA5aHk3ejhrbTI1Mmk1NDl6ZTkzM2h6cm53djZsYnB5diZlcD12MV9naWZzX3NlYXJjaCZjdD1n/26nfoIrm8lHXqmm7C/giphy.gif' },
        { type: 'emoji', value: '' }
      ]
      const selection = options[Math.floor(Math.random() * options.length)]
      if (selection.type === 'gif') {
        await postMessage({ room, message: '', images: [selection.value] })
      } else {
        await postMessage({ room, message: selection.value })
      }
    } catch (err) {
      logger.error('Error sending tomatoes:', err?.message || err)
    }
  },

  // 🐕 Dog: `/dog [breed] [sub-breed]`
  dog: async ({ room, args }) => {
    try {
      // Parse arguments into an array for breed and sub-breed
      const breedArgs = args ? args.trim().split(/\s+/).filter(Boolean) : []
      await handleDogCommand({ room, args: breedArgs })
    } catch (err) {
      logger.error('Error processing dog command:', err?.message || err)
      try {
        await postMessage({ room, message: ' Something went wrong fetching a pup.' })
      } catch {
        /* ignore */
      }
    }
  },

  // 💰 Crypto commands: `/crypto ...`
  crypto: async ({ payload, room, args }) => {
    await handleCryptoCommand({ payload, room, args })
  },

  // -----------------------------------------------------------------------
  // Avatar commands
  // These handlers update the bot's appearance or change a user's avatar.
  // Placing them in the registry avoids scanning the long conditional chain
  // in message.js and provides faster routing for commonly used avatar
  // commands. Moderator checks are enforced for bot commands via isUserAuthorized.
  botrandom: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotRandomAvatarCommand(room, postMessage, ttlToken)
  },
  botdino: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotDinoCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botduck: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotDuckCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botalien: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotAlienCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botalien2: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotAlien2Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botwalrus: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotWalrusCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botpenguin: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBotPenguinCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot1: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBot1Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot2: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBot2Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot3: async ({ payload, room }) => {
    const ttlToken = process.env.TTL_USER_TOKEN
    await handleBot3Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },

  // User avatar commands
  dino: async ({ payload, room }) => {
    await handleDinoCommand(payload?.sender, room, postMessage)
  },
  duck: async ({ payload, room }) => {
    await handleDuckCommand(payload?.sender, room, postMessage)
  },
  spacebear: async ({ payload, room }) => {
    await handleSpaceBearCommand(payload?.sender, room, postMessage)
  },
  walrus: async ({ payload, room }) => {
    await handleWalrusCommand(payload?.sender, room, postMessage)
  },
  vibesguy: async ({ payload, room }) => {
    await handleVibesGuyCommand(payload?.sender, room, postMessage)
  },
  faces: async ({ payload, room }) => {
    await handleFacesCommand(payload?.sender, room, postMessage)
  },
  dodo: async ({ payload, room }) => {
    await handleDoDoCommand(payload?.sender, room, postMessage)
  },
  dumdum: async ({ payload, room }) => {
    await handleDumDumCommand(payload?.sender, room, postMessage)
  },
  flowerpower: async ({ payload, room }) => {
    await handleFlowerPowerCommand(payload?.sender, room, postMessage)
  },
  randomavatar: async ({ payload, room }) => {
    await handleRandomAvatarCommand(payload?.sender, room, postMessage)
  },
  randomcyber: async ({ payload, room }) => {
    await handleRandomCyberCommand(payload?.sender, room, postMessage)
  },
  randomcosmic: async ({ payload, room }) => {
    await handleRandomCosmicCommand(payload?.sender, room, postMessage)
  },
  randomlovable: async ({ payload, room }) => {
    await handleRandomLovableCommand(payload?.sender, room, postMessage)
  }
}

/**
 * Attempt to dispatch the provided message to a command handler. Returns
 * true if a handler was found and executed, false otherwise. Errors are
 * logged and result in a user-facing error message.
 *
 * @param {string} txt The full text of the incoming message.
 * @param {Object} payload The original CometChat payload.
 * @param {string} room The UUID of the current room.
 * @returns {Promise<boolean>}
 */
export async function dispatchCommand (txt, payload, room) {
  if (!txt || txt[0] !== '/') return false

  const parts = txt.trim().substring(1).split(/\s+/)
  const cmd = (parts[0] || '').toLowerCase()

  //  Special case: direct number bets like `/17 25` when roulette is active
  if (/^\d+$/.test(cmd) && rouletteGameActive) {
    try {
      await handleRouletteBet(payload)
    } catch (err) {
      logger.error('[Dispatcher] Error executing numeric roulette bet:', err?.message || err)
      try {
        await postMessage({ room, message: '⚠️ Error processing roulette bet.' })
      } catch {
        /* ignore */
      }
    }
    return true
  }

  const handler = commandRegistry[cmd]
  if (!handler) return false

  try {
    await handler({ payload, room, args: parts.slice(1).join(' ') })
  } catch (err) {
    logger.error(`[Dispatcher] Error executing /${cmd}:`, err?.message || err)
    try {
      await postMessage({ room, message: `⚠️ Error processing /${cmd}.` })
    } catch {
      /* swallow */
    }
  }
  return true
}
