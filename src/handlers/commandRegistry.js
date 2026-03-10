// src/handlers/commandRegistry.js
//
// A central registry for high-traffic slash commands and a dispatcher
// function to route incoming messages to the appropriate command handler.
// Moving this logic out of message.js improves readability and makes it
// easier to add or remove commands without touching the monolithic file.

import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { env } from '../config.js'
import { logger } from '../utils/logging.js'
import { resolveDispatchCommand as resolveDispatchCommandBase } from './commandRouting.js'
import { dispatchWithRegistry } from './dispatchCore.js'
import { createSlotsRegistryHandler, buildSlotsInfoMessage } from './slotsRegistryHandler.js'
import { createAvatarCommandRegistry } from './avatarCommandRegistry.js'

// Game and feature handlers
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
  handleBotSpookyCommand,
  handleBotStaffCommand,
  handleBotWinterCommand,
  handleDinoCommand,
  handleTeacupCommand,
  handleAlienCommand,
  handleAlien2Command,
  handleRoyCommand,
  handleSpookyCommand,
  handleBouncerCommand,
  handleDuckCommand,
  handleRecordGuyCommand,
  handleJukeboxCommand,
  handleJesterCommand,
  handleSpaceBearCommand,
  handleWalrusCommand,
  handleVibesGuyCommand,
  handleFacesCommand,
  handleDoDoCommand,
  handleDumDumCommand,
  handleFlowerPowerCommand,
  handleAnonCommand,
  handleGhostCommand,
  handleGrimehouseCommand,
  handleBearPartyCommand,
  handleWinterCommand,
  handleTVguyCommand,
  handlePinkBlanketCommand,
  handleGayCamCommand,
  handleGayIanCommand,
  handleGayAlexCommand,
  handleRandomPajamaCommand,
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
import { addQueuedAlbum, removeQueuedAlbum, listQueuedAlbums } from '../database/dbalbumqueue.js'
import { getAllNetTotals, getEconomyOverview, snapshotMonthlyLeaderboard, getDjStreakStatus, getCurrentMonthKey, getNetWorthForUser, getLifetimeNet, getUserWallet, getTopNetWorthLeaderboard } from '../database/dbwalletmanager.js'
import { getEquippedTitle, getUserBadges, getUserTitles, equipTitle, getCompactEquippedTitleTag } from '../database/dbprestige.js'
import {
  handleBalanceCommand,
  handleCareerCommand,
  handleGetWalletCommand
} from './walletCommands.js'
import { handleSuggestSongsCommand } from './suggestionCommands.js'
import {
  handleMlbScoresCommand,
  handleNhlScoresCommand,
  handleNbaScoresCommand,
  handleMlbOddsCommand,
  handleSportsBetCommand,
  handleResolveBetsCommand
} from './sportsCommands.js'
import {
  handleCheckBalanceCommand,
  handleBankrollCommand,
  handleTipCommand
} from './walletCommandExtras.js'
import {
  handleReviewHelpCommand,
  handleSongReviewCommand,
  handleTopSongsCommand,
  handleMyTopSongsCommand,
  handleTopAlbumsCommand,
  handleMyTopAlbumsCommand,
  handleRatingCommand,
  handleAlbumReviewCommand,
  handleSongCommand,
  handleSongStatsCommand,
  handleMostPlayedCommand,
  handleTopLikedCommand,
  handleAlbumCommand,
  handleArtCommand,
  handleScoreCommand
} from './musicReviewCommands.js'
import { createModControlHandlers } from './modControlCommands.js'
import { createRoomUtilityHandlers } from './roomUtilityCommands.js'
import { createRoomFunHandlers } from './roomFunCommands.js'
import { createSecretFunHandlers } from './secretFunCommands.js'
import { createQueuePlaylistHandlers } from './queuePlaylistCommands.js'
import { createReactionHandlers } from './reactionCommands.js'
import { createMiscCommandHandlers } from './miscCommandHandlers.js'
import { createBlackjackHandlers } from './blackjackCommands.js'
import { handleAddAvatarCommand } from './addAvatar.js'
import { handleRemoveAvatarCommand } from './removeAvatar.js'
import { getSenderNickname } from '../utils/helpers.js'
import { usersToBeRemoved } from '../utils/usersToBeRemoved.js'

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

function formatWholeDollars (value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US')
}

function formatMoneyLine (value) {
  return `$${formatWholeDollars(value)}`
}

function titlePrefixForUser (userUUID) {
  const equipped = getEquippedTitle(userUUID)
  return equipped ? `${equipped.emoji || ''} ${equipped.label}`.trim() : null
}

function compactLeaderboardName (name, uuid, maxLen = 14) {
  const raw = String(name || '').trim()
  if (!raw || /^<@uid:[^>]+>$/.test(raw)) return `user-${String(uuid || '').slice(0, 6)}`
  const clean = raw.replace(/^@/, '').trim()
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}.`
}

function formatCompactLeaderboardLine ({ rank, uuid, name, amount }) {
  const titleTag = getCompactEquippedTitleTag(uuid, 7)
  const compactName = compactLeaderboardName(name, uuid, titleTag ? 10 : 14)
  const numeric = Number(amount || 0)
  const money = `${numeric < 0 ? '-' : ''}$${formatWholeDollars(Math.abs(numeric))}`
  return `${rank}. ${titleTag ? `${titleTag} ` : ''}${compactName} ${money}`
}

async function postCareerLossesLeaderboard (room, args = '') {
  const requested = Number.parseInt(String(args || '').trim(), 10)
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 50)
    : 10

  const losses = getAllNetTotals()
    .filter(row => Number(row?.lifetime_net) < 0)
    .sort((a, b) => Number(a.lifetime_net) - Number(b.lifetime_net))
    .slice(0, limit)

  if (!losses.length) {
    await postMessage({ room, message: 'No career gambling losses are recorded yet.' })
    return
  }

  const names = await Promise.all(
    losses.map(async ({ uuid }) => {
      try {
        return await getUserNicknameByUuid(uuid)
      } catch {
        return `<@uid:${uuid}>`
      }
    })
  )

  const lines = losses.map((row, i) => {
    return formatCompactLeaderboardLine({
      rank: i + 1,
      uuid: row.uuid,
      name: names[i],
      amount: -Math.abs(Number(row.lifetime_net))
    })
  })

  await postMessage({
    room,
    message: [
      `📉 **Career Gambling Losses** (Top ${losses.length})`,
      '_Biggest loser → least_',
      '',
      ...lines
    ].join('\n')
  })
}

async function postMonthlyLeaderboard (room, leaderboardType = 'monthly', args = '') {
  const requested = Number.parseInt(String(args || '').trim(), 10)
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 25)
    : 10

  const rows = snapshotMonthlyLeaderboard(leaderboardType, limit, getCurrentMonthKey())
  if (!rows.length) {
    await postMessage({ room, message: 'No monthly economy results are recorded yet.' })
    return
  }

  const names = await Promise.all(
    rows.map(async ({ uuid }) => {
      try {
        return await getUserNicknameByUuid(uuid)
      } catch {
        return `<@uid:${uuid}>`
      }
    })
  )

  const title = rows[0]?.label || 'Monthly Leaderboard'
  const lines = rows.map((row, i) => {
    return formatCompactLeaderboardLine({
      rank: i + 1,
      uuid: row.uuid,
      name: names[i],
      amount: row.amount
    })
  })

  await postMessage({
    room,
    message: [
      `📅 **${title}** (${rows[0].monthKey})`,
      '',
      ...lines
    ].join('\n')
  })
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
  slots: createSlotsRegistryHandler(),
  slotinfo: async ({ room }) => {
    await postMessage({ room, message: buildSlotsInfoMessage() })
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

      // If your addQueuedAlbum returns something meaningful (like { inserted: true/false }),
      // you can adjust copy below. For now we always show success.
      await postMessage({
        room,
        message:
          '✅ Added to album queue:\n' +
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
        const title = String(a.albumName || 'Unknown Album').trim()
        const artist = String(a.artistName || 'Unknown Artist').trim()
        const id = String(a.spotifyAlbumId || '').trim() || '—'
        const spotifyUrl = String(a.spotifyUrl || '').trim()
        const submittedBy = String(a.submittedByNickname || '').trim()

        let line = `${String(i + 1).padStart(2, '0')}. *${title}* — ${artist}\n`
        line += `    🆔 \`${id}\``
        if (spotifyUrl) line += `  •  🔗 ${spotifyUrl}`
        if (submittedBy) line += `\n    🙋 Added by: ${submittedBy}`
        return line
      }).join('\n\n')

      await postMessage({
        room,
        message:
          '🎧 **Album Queue**\n' +
          `📦 ${albums.length} queued album${albums.length === 1 ? '' : 's'}\n\n` +
          `${lines}`
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

  // 📉 Career losses leaderboard: `/careerlosses [count]`
  careerlosses: async ({ room, args }) => {
    await postCareerLossesLeaderboard(room, args)
  },
  biggestlosers: async ({ room, args }) => {
    await postCareerLossesLeaderboard(room, args)
  },

  monthly: async ({ room, args }) => {
    await postMonthlyLeaderboard(room, 'monthly', args)
  },
  monthlydj: async ({ room, args }) => {
    await postMonthlyLeaderboard(room, 'monthlydj', args)
  },
  monthlyf1: async ({ room, args }) => {
    await postMonthlyLeaderboard(room, 'monthlyf1', args)
  },
  monthlygamblers: async ({ room, args }) => {
    await postMonthlyLeaderboard(room, 'monthlygamblers', args)
  },
  djstreak: async ({ payload, room }) => {
    const userUUID = payload?.sender
    const streak = getDjStreakStatus(userUUID)
    await postMessage({
      room,
      message: [
        '🎧 **DJ Streak**',
        `Current streak: ${streak.streakCount}`,
        `Best streak: ${streak.bestStreak}`,
        `Qualifying song: ${streak.lastQualifiedAt ? new Date(streak.lastQualifiedAt).toISOString().slice(0, 10) : 'None yet'}`,
        `Rule: songs with ${3}+ likes extend your streak.`
      ].join('\n')
    })
  },
  badges: async ({ payload, room }) => {
    const userUUID = payload?.sender
    const badges = getUserBadges(userUUID)
    if (!badges.length) {
      await postMessage({ room, message: 'No badges yet. Earn DJ streaks or monthly wins to start your collection.' })
      return
    }
    await postMessage({
      room,
      message: [
        '🏅 **Your Badges**',
        '',
        ...badges.map((badge) => `${badge.emoji || '•'} ${badge.label} \`${badge.key}\``)
      ].join('\n')
    })
  },
  titles: async ({ payload, room }) => {
    const userUUID = payload?.sender
    const titles = getUserTitles(userUUID)
    const equipped = getEquippedTitle(userUUID)
    if (!titles.length) {
      await postMessage({ room, message: 'No titles yet. Win a monthly board or hit the biggest DJ streak milestone.' })
      return
    }
    await postMessage({
      room,
      message: [
        '🎖️ **Your Titles**',
        equipped ? `Equipped: ${equipped.emoji || ''} ${equipped.label}`.trim() : 'Equipped: none',
        '',
        ...titles.map((title) => `${title.emoji || '•'} ${title.label} \`${title.key}\`${equipped?.key === title.key ? ' [equipped]' : ''}`)
      ].join('\n')
    })
  },
  title: async ({ payload, room, args }) => {
    const userUUID = payload?.sender
    const trimmed = String(args || '').trim()
    if (!trimmed) {
      await postMessage({ room, message: 'Usage: `/title equip <key>` or `/title clear`' })
      return
    }

    if (/^clear$/i.test(trimmed)) {
      equipTitle(userUUID, null)
      await postMessage({ room, message: 'Title cleared.' })
      return
    }

    const match = trimmed.match(/^equip\s+([a-z0-9_]+)$/i)
    if (!match) {
      await postMessage({ room, message: 'Usage: `/title equip <key>` or `/title clear`' })
      return
    }

    const key = match[1]
    const ok = equipTitle(userUUID, key)
    if (!ok) {
      await postMessage({ room, message: `You do not own the title \`${key}\` or it has expired.` })
      return
    }

    const equipped = getEquippedTitle(userUUID)
    await postMessage({ room, message: `Equipped title: ${equipped?.emoji || ''} ${equipped?.label || key}`.trim() })
  },
  profile: async ({ payload, room }) => {
    const userUUID = payload?.sender
    const title = titlePrefixForUser(userUUID)
    const badges = getUserBadges(userUUID)
    const netWorth = await getNetWorthForUser(userUUID)
    const streak = getDjStreakStatus(userUUID)
    const balance = getUserWallet(userUUID)
    const lifetimeNet = getLifetimeNet(userUUID)

    await postMessage({
      room,
      message: [
        '🪪 **Profile**',
        title ? `Title: ${title}` : 'Title: none',
        `Cash: ${formatMoneyLine(balance)} · Net Worth: ${formatMoneyLine(netWorth?.totalNetWorth || 0)}`,
        `Lifetime Net: ${formatMoneyLine(lifetimeNet)}`,
        `DJ Streak: ${streak.streakCount} current / ${streak.bestStreak} best`,
        `Badges: ${badges.length}`
      ].join('\n')
    })
  },
  balance: async ({ payload, room }) => {
    await handleBalanceCommand({ payload, room })
  },
  bankroll: async ({ room }) => {
    await handleBankrollCommand({ room })
  },
  career: async ({ payload, room }) => {
    await handleCareerCommand({ payload, room })
  },
  checkbalance: async ({ payload, room }) => {
    await handleCheckBalanceCommand({ payload, room })
  },
  getwallet: async ({ payload, room }) => {
    await handleGetWalletCommand({ payload, room })
  },
  networth: async ({ payload, room }) => {
    const user = await getNetWorthForUser(payload?.sender)
    const total = Math.round(Number(user?.totalNetWorth) || 0).toLocaleString()
    const cash = Math.round(Number(user?.cash) || 0).toLocaleString()
    const cars = Math.round(Number(user?.carValue) || 0).toLocaleString()
    const horses = Math.round(Number(user?.horseValue) || 0).toLocaleString()
    const crypto = Math.round(Number(user?.cryptoValue) || 0).toLocaleString()

    await postMessage({
      room,
      message:
        `🏦 <@uid:${payload?.sender}> Net Worth: **$${total}**\n` +
        `Cash: $${cash} · Cars: $${cars} · Horses: $${horses} · Crypto: $${crypto}`
    })
  },
  topnetworth: async ({ room }) => {
    const netWorthRows = await getTopNetWorthLeaderboard(5)

    if (!Array.isArray(netWorthRows) || netWorthRows.length === 0) {
      await postMessage({
        room,
        message: 'No net worth data found yet.'
      })
      return
    }

    const formatted = netWorthRows.map((user, index) => {
      const total = Math.round(Number(user.totalNetWorth) || 0).toLocaleString()
      const cash = Math.round(Number(user.cash) || 0).toLocaleString()
      const cars = Math.round(Number(user.carValue) || 0).toLocaleString()
      const horses = Math.round(Number(user.horseValue) || 0).toLocaleString()
      const crypto = Math.round(Number(user.cryptoValue) || 0).toLocaleString()

      return [
        formatCompactLeaderboardLine({
          rank: index + 1,
          uuid: user.uuid,
          name: user.nickname,
          amount: user.totalNetWorth
        }),
        `   cash $${cash} · cars $${cars} · horses $${horses} · crypto $${crypto} · total $${total}`
      ].join('\n')
    })

    await postMessage({
      room,
      message: `🏆 **Top Net Worth**\n\n${formatted.join('\n')}`
    })
  },
  tip: async ({ payload, room, state }) => {
    await handleTipCommand({ payload, room, state })
  },
  suggestsongs: async ({ room }) => {
    await handleSuggestSongsCommand({ room })
  },

  economy: async ({ room, args }) => {
    const requested = Number.parseInt(String(args || '').trim(), 10)
    const days = Number.isFinite(requested) && requested > 0
      ? Math.min(requested, 365)
      : 7

    try {
      const overview = await getEconomyOverview(days)
      const sourceLines = overview.topSources.length
        ? overview.topSources.map((row) => `• ${row.source}: +${formatMoneyLine(row.created)} / -${formatMoneyLine(row.sunk)} / net ${formatMoneyLine(row.net)} (${row.eventCount} evt)`)
        : ['• No tracked economy events yet.']

      const walletLines = overview.topWallets.length
        ? overview.topWallets.map((row, idx) => formatCompactLeaderboardLine({
          rank: idx + 1,
          uuid: row.uuid,
          name: row.nickname,
          amount: row.balance
        }))
        : ['No wallet data yet.']

      const netWorthLines = overview.topNetWorth.length
        ? overview.topNetWorth.map((row, idx) => formatCompactLeaderboardLine({
          rank: idx + 1,
          uuid: row.uuid,
          name: row.nickname,
          amount: row.totalNetWorth
        }))
        : ['No net worth data yet.']

      await postMessage({
        room,
        message: [
          `📊 **Economy Snapshot** (${overview.days}d lookback)`,
          '',
          `Cash in wallets: ${formatMoneyLine(overview.currentCash)}`,
          `Cars: ${formatMoneyLine(overview.currentCarValue)} · Horses: ${formatMoneyLine(overview.currentHorseValue)} · Crypto: ${formatMoneyLine(overview.currentCryptoValue)}`,
          `Total net worth: ${formatMoneyLine(overview.currentNetWorth)} across ${overview.walletCount} wallet(s)`,
          '',
          `Recent flow: +${formatMoneyLine(overview.recentEvents.created)} / -${formatMoneyLine(overview.recentEvents.sunk)} / net ${formatMoneyLine(overview.recentEvents.net)} (${overview.recentEvents.eventCount} event(s))`,
          '',
          '**Top Sources**',
          ...sourceLines,
          '',
          '**Top Wallets**',
          ...walletLines,
          '',
          '**Top Net Worth**',
          ...netWorthLines
        ].join('\n')
      })
    } catch (err) {
      logger.error('[economy] Error:', err?.message || err)
      await postMessage({ room, message: '❌ Failed to build the economy snapshot.' })
    }
  },

  // 🏅 Lotto single number query: `/lotto #<number>`
  lotto: async ({ payload, room }) => {
    // Pass the entire message to the helper which extracts and validates the number
    await handleSingleNumberQuery(room, payload.message)
  },
  mlb: async ({ payload, room }) => {
    await handleMlbScoresCommand({ payload, room })
  },
  nhl: async ({ payload, room }) => {
    await handleNhlScoresCommand({ payload, room })
  },
  nba: async ({ payload, room }) => {
    await handleNbaScoresCommand({ payload, room })
  },
  mlbodds: async ({ room }) => {
    await handleMlbOddsCommand({ room })
  },
  sportsbet: async ({ payload, room }) => {
    await handleSportsBetCommand({ payload, room })
  },
  resolvebets: async ({ room }) => {
    await handleResolveBetsCommand({ room })
  },
  reviewhelp: async ({ room }) => {
    await handleReviewHelpCommand({ room })
  },
  review: async ({ payload, room, roomBot }) => {
    await handleSongReviewCommand({ payload, room, roomBot, commandName: 'review' })
  },
  songreview: async ({ payload, room, roomBot }) => {
    await handleSongReviewCommand({ payload, room, roomBot, commandName: 'songreview' })
  },
  topsongs: async ({ room }) => {
    await handleTopSongsCommand({ room })
  },
  mytopsongs: async ({ payload, room }) => {
    await handleMyTopSongsCommand({ payload, room })
  },
  topalbums: async ({ room }) => {
    await handleTopAlbumsCommand({ room })
  },
  mytopalbums: async ({ payload, room }) => {
    await handleMyTopAlbumsCommand({ payload, room })
  },
  rating: async ({ room, roomBot }) => {
    await handleRatingCommand({ room, roomBot })
  },
  albumreview: async ({ payload, room, roomBot }) => {
    await handleAlbumReviewCommand({ payload, room, roomBot })
  },
  song: async ({ room, roomBot }) => {
    await handleSongCommand({ room, roomBot })
  },
  stats: async ({ room, roomBot }) => {
    await handleSongStatsCommand({ room, roomBot })
  },
  mostplayed: async ({ room }) => {
    await handleMostPlayedCommand({ room })
  },
  topliked: async ({ room }) => {
    await handleTopLikedCommand({ room })
  },
  album: async ({ room, roomBot }) => {
    await handleAlbumCommand({ room, roomBot })
  },
  art: async ({ room, roomBot }) => {
    await handleArtCommand({ room, roomBot })
  },
  score: async ({ room, roomBot }) => {
    await handleScoreCommand({ room, roomBot })
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
        message: '⚠️ *Missing Playlist ID*\n\nPlease provide a valid Spotify playlist ID.  \nExample: `/qplaylist 37i9dQZF1DXcBWIGoYBM5M`'
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

      const queueResult = await addSongsToCrate(crateId, formattedTracks, true, token)
      const addedCount = Number(queueResult?.added || 0)
      const skippedCount = Number(queueResult?.skipped || 0)
      await postMessage({
        room,
        message: `✅ *Playlist Queued!*\n\n🎵 Added *${addedCount} track(s)* from playlist \`${playlistId}\` to your queue.${skippedCount > 0 ? `\n⚠️ Skipped ${skippedCount} track(s) that could not be resolved.` : ''}  \nPlease refresh your page for the queue to update`
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
    const albumId = extractSpotifyAlbumId(args)
    if (!albumId) {
      await postMessage({
        room,
        message:
`⚠️ *Missing Album ID*

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

      const [albumInfo, tracks] = await Promise.all([
        getSpotifyAlbumInfo(albumId),
        getAlbumTracks(albumId)
      ])

      if (!tracks || tracks.length === 0) {
        await postMessage({
          room,
          message:
`❌ *Couldn’t find tracks for that album.*
🆔 \`${albumId}\``
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
`❌ *No queueable tracks were found for that album.*
🆔 \`${albumId}\``
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
`✅ *Album Queued!*

📀 *${albumName}*
🎤 *${artistName}*
🎵 Added *${addedCount}/${totalTracks}* track(s) to your queue.${skippedCount > 0 ? `\n⚠️ Skipped *${skippedCount}* track(s) that could not be resolved.` : ''}
${spotifyUrl ? `🔗 ${spotifyUrl}\n` : ''}🆔 \`${albumId}\`  
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

  // 💰 Crypto commands: `/crypto ...`
  crypto: async ({ payload, room, args }) => {
    await handleCryptoCommand({ payload, room, args })
  }
}

const modControlHandlers = createModControlHandlers()
const roomUtilityHandlers = createRoomUtilityHandlers()
const roomFunHandlers = createRoomFunHandlers()
const secretFunHandlers = createSecretFunHandlers()
const reactionHandlers = createReactionHandlers()
const miscCommandHandlers = createMiscCommandHandlers()
const blackjackHandlers = createBlackjackHandlers()
const avatarCommandHandlers = createAvatarCommandRegistry({
  postMessage,
  isUserAuthorized,
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
  handleBotSpookyCommand,
  handleBotStaffCommand,
  handleBotWinterCommand,
  handleDinoCommand,
  handleTeacupCommand,
  handleAlienCommand,
  handleAlien2Command,
  handleRoyCommand,
  handleSpookyCommand,
  handleBouncerCommand,
  handleDuckCommand,
  handleRecordGuyCommand,
  handleJukeboxCommand,
  handleJesterCommand,
  handleSpaceBearCommand,
  handleWalrusCommand,
  handleVibesGuyCommand,
  handleFacesCommand,
  handleDoDoCommand,
  handleDumDumCommand,
  handleFlowerPowerCommand,
  handleAnonCommand,
  handleGhostCommand,
  handleGrimehouseCommand,
  handleBearPartyCommand,
  handleWinterCommand,
  handleTVguyCommand,
  handlePinkBlanketCommand,
  handleGayCamCommand,
  handleGayIanCommand,
  handleGayAlexCommand,
  handleRandomPajamaCommand,
  handleRandomAvatarCommand,
  handleRandomCyberCommand,
  handleRandomCosmicCommand,
  handleRandomLovableCommand,
  handleAddAvatarCommand,
  handleRemoveAvatarCommand,
  logger
})
const queuePlaylistHandlers = createQueuePlaylistHandlers({
  addDollarsByUUID: async (...args) => {
    const { addDollarsByUUID } = await import('../database/dbwalletmanager.js')
    return addDollarsByUUID(...args)
  },
  readBlacklistFile: async () => {
    const fs = await import('fs')
    const path = await import('path')
    const blacklistPath = path.join(process.cwd(), 'src/data/songBlacklist.json')
    try {
      const raw = await fs.promises.readFile(blacklistPath, 'utf8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  },
  writeBlacklistFile: async (items) => {
    const fs = await import('fs')
    const path = await import('path')
    const blacklistPath = path.join(process.cwd(), 'src/data/songBlacklist.json')
    await fs.promises.writeFile(blacklistPath, JSON.stringify(items, null, 2))
  }
})

Object.assign(commandRegistry, {
  ...avatarCommandHandlers,
  begonebitch: async ({ payload, room, state, roomBot }) => {
    await reactionHandlers.begonebitch({ payload, room, state, roomBot })
  },
  blackjack: async ({ payload, room, args }) => {
    await blackjackHandlers.blackjack({ payload, room, args })
  },
  bj: async ({ payload, room, args }) => {
    await blackjackHandlers.bj({ payload, room, args })
  },
  join: async ({ payload, room }) => {
    await blackjackHandlers.join({ payload, room })
  },
  bet: async ({ payload, room, args }) => {
    await blackjackHandlers.bet({ payload, room, args })
  },
  hit: async ({ payload, room }) => {
    await blackjackHandlers.hit({ payload, room })
  },
  stand: async ({ payload, room }) => {
    await blackjackHandlers.stand({ payload, room })
  },
  double: async ({ payload, room }) => {
    await blackjackHandlers.double({ payload, room })
  },
  surrender: async ({ payload, room }) => {
    await blackjackHandlers.surrender({ payload, room })
  },
  split: async ({ payload, room }) => {
    await blackjackHandlers.split({ payload, room })
  },
  theme: async ({ payload, room }) => {
    await miscCommandHandlers.theme({ payload, room })
  },
  settheme: async ({ payload, room }) => {
    await miscCommandHandlers.settheme({ payload, room })
  },
  removetheme: async ({ payload, room }) => {
    await miscCommandHandlers.removetheme({ payload, room })
  },
  lottowinners: async ({ room }) => {
    await miscCommandHandlers.lottowinners({ room })
  },
  jackpot: async ({ room }) => {
    await miscCommandHandlers.jackpot({ room })
  },
  triviastart: async ({ room, args }) => {
    await miscCommandHandlers.triviastart({ room, args })
  },
  triviaend: async ({ room }) => {
    await miscCommandHandlers.triviaend({ room })
  },
  trivia: async ({ room }) => {
    await miscCommandHandlers.trivia({ room })
  },
  a: async ({ payload, room }) => {
    await miscCommandHandlers.a({ payload, room })
  },
  b: async ({ payload, room }) => {
    await miscCommandHandlers.b({ payload, room })
  },
  c: async ({ payload, room }) => {
    await miscCommandHandlers.c({ payload, room })
  },
  d: async ({ payload, room }) => {
    await miscCommandHandlers.d({ payload, room })
  },
  store: async ({ payload, room }) => {
    await miscCommandHandlers.store({ payload, room })
  },
  '8ball': async ({ payload, room }) => {
    await miscCommandHandlers['8ball']({ payload, room })
  },
  gifs: async ({ room }) => {
    await reactionHandlers.gifs({ room })
  },
  burp: async ({ room }) => {
    await reactionHandlers.burp({ room })
  },
  dog: async ({ room, args }) => {
    await reactionHandlers.dog({ room, args })
  },
  dance: async ({ room }) => {
    await reactionHandlers.dance({ room })
  },
  fart: async ({ room }) => {
    await reactionHandlers.fart({ room })
  },
  party: async ({ room }) => {
    await reactionHandlers.party({ room })
  },
  beer: async ({ room }) => {
    await reactionHandlers.beer({ room })
  },
  cheers: async ({ room }) => {
    await reactionHandlers.cheers({ room })
  },
  tomatoes: async ({ room }) => {
    await reactionHandlers.tomatoes({ room })
  },
  trash: async ({ room }) => {
    await reactionHandlers.trash({ room })
  },
  bonk: async ({ room }) => {
    await reactionHandlers.bonk({ room })
  },
  rigged: async ({ room }) => {
    await reactionHandlers.rigged({ room })
  },
  banger: async ({ room }) => {
    await reactionHandlers.banger({ room })
  },
  peace: async ({ room }) => {
    await reactionHandlers.peace({ room })
  },
  commands: async ({ payload, room, ttlUserToken }) => {
    await roomUtilityHandlers.commands({ payload, room, ttlUserToken })
  },
  mod: async ({ payload, room, ttlUserToken }) => {
    await roomUtilityHandlers.mod({ payload, room, ttlUserToken })
  },
  games: async ({ room }) => {
    await roomUtilityHandlers.games({ room })
  },
  music: async ({ room }) => {
    await roomUtilityHandlers.music({ room })
  },
  wallet: async ({ room }) => {
    await roomUtilityHandlers.wallet({ room })
  },
  avatars: async ({ room }) => {
    await roomUtilityHandlers.avatars({ room })
  },
  room: async ({ payload, room, ttlUserToken }) => {
    await roomUtilityHandlers.room({ payload, room, ttlUserToken })
  },
  site: async ({ room }) => {
    await queuePlaylistHandlers.site({ room })
  },
  test: async ({ room }) => {
    await queuePlaylistHandlers.test({ room })
  },
  crapsrecord: async ({ room }) => {
    await queuePlaylistHandlers.crapsrecord({ room })
  },
  addmoney: async ({ payload, room }) => {
    await queuePlaylistHandlers.addmoney({ payload, room })
  },
  'q+': async ({ payload, room, queueManager }) => {
    await queuePlaylistHandlers['q+']({ payload, room, queueManager })
  },
  'q-': async ({ payload, room, queueManager }) => {
    await queuePlaylistHandlers['q-']({ payload, room, queueManager })
  },
  q: async ({ room, queueManager }) => {
    await queuePlaylistHandlers.q({ room, queueManager })
  },
  adddj: async ({ payload, roomBot }) => {
    roomBot.lastCommandText = payload?.message || ''
    await roomUtilityHandlers.adddj({ roomBot })
  },
  removedj: async ({ roomBot }) => {
    await roomUtilityHandlers.removedj({ roomBot })
  },
  djbeer: async ({ payload, room, state }) => {
    await roomFunHandlers.djbeer({ payload, room, state })
  },
  djbeers: async ({ payload, room, state }) => {
    await roomFunHandlers.djbeers({ payload, room, state })
  },
  getdjdrunk: async ({ payload, room, state }) => {
    await roomFunHandlers.getdjdrunk({ payload, room, state })
  },
  jump: async ({ roomBot }) => {
    await roomFunHandlers.jump({ roomBot })
  },
  like: async ({ roomBot }) => {
    await roomFunHandlers.like({ roomBot })
  },
  dislike: async ({ payload, room, roomBot, ttlUserToken }) => {
    await roomFunHandlers.dislike({
      payload,
      room,
      roomBot,
      ttlUserToken,
      getUserNickname: getSenderNickname
    })
  },
  dive: async ({ payload, room, state, roomBot }) => {
    await roomFunHandlers.dive({ payload, room, state, roomBot, getSenderNickname })
  },
  escortme: async ({ payload, room }) => {
    await roomFunHandlers.escortme({ payload, room, getSenderNickname, usersToBeRemoved })
  },
  spotlight: async ({ payload, room, state, roomBot }) => {
    await roomFunHandlers.spotlight({ payload, room, state, roomBot, getSenderNickname })
  },
  secret: async ({ payload, room, ttlUserToken }) => {
    await secretFunHandlers.secret({ payload, room, ttlUserToken })
  },
  bark: async ({ room }) => {
    await secretFunHandlers.bark({ room })
  },
  barkbark: async ({ room }) => {
    await secretFunHandlers.barkbark({ room })
  },
  star: async ({ roomBot }) => {
    await secretFunHandlers.star({ roomBot })
  },
  unstar: async ({ roomBot }) => {
    await secretFunHandlers.unstar({ roomBot })
  },
  jam: async ({ roomBot }) => {
    await secretFunHandlers.jam({ roomBot })
  },
  berad: async ({ room }) => {
    await secretFunHandlers.berad({ room })
  },
  cam: async ({ room }) => {
    await secretFunHandlers.cam({ room })
  },
  drink: async ({ room }) => {
    await secretFunHandlers.drink({ room })
  },
  shirley: async ({ room }) => {
    await secretFunHandlers.shirley({ room })
  },
  ello: async ({ room }) => {
    await secretFunHandlers.ello({ room })
  },
  allen: async ({ room }) => {
    await secretFunHandlers.allen({ room })
  },
  props: async ({ room }) => {
    await secretFunHandlers.props({ room })
  },
  ass: async ({ room }) => {
    await secretFunHandlers.ass({ room })
  },
  titties: async ({ room }) => {
    await secretFunHandlers.titties({ room })
  },
  azz: async ({ room }) => {
    await secretFunHandlers.azz({ room })
  },
  shred: async ({ room }) => {
    await secretFunHandlers.shred({ room })
  },
  addsong: async ({ payload, room, roomBot }) => {
    await queuePlaylistHandlers.addsong({ payload, room, roomBot })
  },
  removesong: async ({ payload, room, roomBot, ttlUserToken }) => {
    await queuePlaylistHandlers.removesong({ payload, room, roomBot, ttlUserToken, isUserAuthorized })
  },
  'blacklist+': async ({ room, roomBot }) => {
    await queuePlaylistHandlers['blacklist+']({ room, roomBot })
  },
  status: async ({ room, roomBot }) => {
    await modControlHandlers.status({ room, roomBot })
  },
  bopon: async ({ payload, room, roomBot, ttlUserToken }) => {
    await modControlHandlers.bopon({ payload, room, roomBot, ttlUserToken })
  },
  bopoff: async ({ payload, room, roomBot, ttlUserToken }) => {
    await modControlHandlers.bopoff({ payload, room, roomBot, ttlUserToken })
  },
  songstatson: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.songstatson({ payload, room, ttlUserToken })
  },
  songstatsoff: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.songstatsoff({ payload, room, ttlUserToken })
  },
  greet: async ({ payload, room }) => {
    await modControlHandlers.greet({ payload, room })
  },
  greetoff: async ({ payload, room }) => {
    await modControlHandlers.greet({ payload, room })
  },
  infoon: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.infoon({ payload, room, ttlUserToken })
  },
  infooff: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.infooff({ payload, room, ttlUserToken })
  },
  infotoggle: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.infotoggle({ payload, room, ttlUserToken })
  },
  infotone: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.infotone({ payload, room, ttlUserToken })
  }
})

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
export function resolveDispatchCommand (txt) {
  return resolveDispatchCommandBase(txt, new Set(Object.keys(commandRegistry)))
}

export async function dispatchCommand (txt, payload, room, context = {}) {
  return dispatchWithRegistry({
    txt,
    payload,
    room,
    context: {
      ...context,
      ttlUserToken: env.ttlUserToken
    },
    registry: commandRegistry,
    resolveDispatchCommand,
    rouletteGameActive,
    handleRouletteBet,
    postMessage,
    logger
  })
}
