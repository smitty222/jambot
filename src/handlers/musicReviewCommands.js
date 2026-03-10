import { postMessage } from '../libs/cometchat.js'
import db from '../database/db.js'
import { fetchSongData } from '../utils/API.js'
import { getSenderNickname } from '../utils/helpers.js'
import { getCurrentState } from '../database/dbcurrent.js'
import { saveSongReview, getAverageRating } from '../utils/voteCounts.js'
import { getUserSongReviews } from '../database/dbroomstatsmanager.js'
import {
  saveAlbumReview,
  getTopAlbumReviews,
  getUserAlbumReviews
} from '../database/dbalbumstatsmanager.js'
import { createSongReviewCommandHandler as createSongReviewCommandHandlerBase } from './handlerFactories.js'
import { logger } from '../utils/logging.js'

function mentionForUser (userId) {
  return `<@uid:${userId}>`
}

export function parseReviewRating (commandName, rawMessage = '') {
  const ratingStr = String(rawMessage || '').slice(`/${commandName}`.length).trim()
  const match = ratingStr.match(/^(10(?:\.0)?|[1-9](?:\.[0-9])?)$/)
  const rating = match ? Math.round(Number.parseFloat(match[1]) * 10) / 10 : NaN

  return Number.isFinite(rating) && rating >= 1 && rating <= 10
    ? rating
    : NaN
}

export function parseAlbumReviewRating (rawMessage = '') {
  const ratingStr = String(rawMessage || '').replace('/albumreview', '').trim()
  const match = ratingStr.match(/(10(?:\.0)?|[1-9](?:\.[0-9])?)/)
  const rating = match ? Math.round(Number.parseFloat(match[1]) * 10) / 10 : NaN

  return Number.isFinite(rating) && rating >= 1 && rating <= 10
    ? rating
    : NaN
}

function getActiveSong (roomBot) {
  if (roomBot?.currentSong?.trackName && roomBot?.currentSong?.artistName) {
    return roomBot.currentSong
  }

  const row = getCurrentState?.()
  if (row?.currentSong?.trackName && row?.currentSong?.artistName) {
    return {
      trackName: row.currentSong.trackName,
      artistName: row.currentSong.artistName,
      spotifyUrl: row.currentSong.spotifyUrl,
      songDuration: row.currentSong.songDuration,
      songId: row.currentSong.songId,
      albumArt: row.currentSong.albumArt,
      popularity: row.currentSong.popularity
    }
  }

  if (row?.trackName && row?.artistName) {
    return {
      trackName: row.trackName,
      artistName: row.artistName,
      spotifyUrl: row.spotifyUrl,
      songDuration: row.songDuration,
      songId: row.songId,
      albumName: row.albumName ?? null,
      albumArt: row.albumArt ?? row.albumArtField ?? null,
      popularity: row.popularity
    }
  }

  return null
}

function getActiveAlbum (roomBot) {
  if (roomBot?.currentAlbum?.albumID && roomBot?.currentAlbum?.albumName) {
    return roomBot.currentAlbum
  }

  if (roomBot?.currentAlbum?.albumName && roomBot?.currentAlbum?.artistName) {
    return roomBot.currentAlbum
  }

  const row = getCurrentState?.()
  if (row && (row.albumNameField || row.albumAlbumID || row.albumArtistName)) {
    return {
      albumID: row.albumAlbumID ?? row.albumID ?? null,
      albumName: row.albumNameField ?? row.albumName ?? null,
      artistName: row.albumArtistName ?? row.artistName ?? null,
      releaseDate: row.albumReleaseDate ?? row.releaseDate ?? null,
      albumArt: row.albumArtField ?? row.albumArt ?? null,
      trackCount: row.totalTracks ?? row.trackCount ?? null
    }
  }

  return null
}

export async function handleReviewHelpCommand ({ room }) {
  const helpMessage = [
    '🎧 **How Reviews Work**',
    'You can rate each song from **1 to 10** ',
    '',
    '📝 **Commands**:',
    '/review <1-10> – Submit a review for the current song',
    '/rating – See the average rating for the current song',
    '/topsongs – See the top 5 highest rated songs',
    '/reviewhelp – Show this review guide',
    '/albumreview <1-10> – Submit a review for the album',
    '/topalbums – See the top 5 highest rated albums',
    '/mytopalbums – See your personal top 5 highest rated albums',
    '',
    'Reviews contribute to the song’s overall score in the stats. Thanks for sharing your taste! 🎶'
  ].join('\n')

  await postMessage({ room, message: helpMessage })
}

export function createSongReviewCommandHandler (deps = {}) {
  return createSongReviewCommandHandlerBase({
    postMessage,
    getSenderNickname,
    saveSongReview,
    getActiveSong,
    parseReviewRating,
    mentionForUser,
    ...deps
  })
}

export const handleSongReviewCommand = createSongReviewCommandHandler()

export async function handleTopSongsCommand ({ room }) {
  try {
    const topReviewedSongs = db.prepare(`
      SELECT
        rs.trackName,
        rs.artistName,
        rs.spotifyTrackId,
        AVG(sr.rating) AS averageReview,
        COUNT(sr.rating) AS reviewCount
      FROM room_stats rs
      JOIN song_reviews sr ON rs.songId = sr.songId
      GROUP BY rs.songId
      HAVING reviewCount > 0
      ORDER BY averageReview DESC
      LIMIT 5
    `).all()

    if (topReviewedSongs.length === 0) {
      await postMessage({ room, message: 'No reviewed songs found yet.' })
      return
    }

    const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']

    for (let i = 0; i < topReviewedSongs.length; i++) {
      const song = topReviewedSongs[i]
      const emoji = numberEmojis[i] || `#${i + 1}`
      const reviewText = `${Number.parseFloat(song.averageReview).toFixed(1)}/10 ⭐ from ${song.reviewCount} review${song.reviewCount > 1 ? 's' : ''}`
      const songLabel = `*${song.artistName} - ${song.trackName}*`

      try {
        if (song.spotifyTrackId) {
          const songData = await fetchSongData(song.spotifyTrackId)
          await postMessage({
            room,
            message: `${emoji} ${songLabel} (${reviewText})`,
            customData: {
              songs: [
                {
                  song: {
                    ...songData,
                    musicProviders: songData.musicProvidersIds,
                    status: 'SUCCESS'
                  }
                }
              ]
            }
          })
        } else {
          await postMessage({ room, message: `${emoji} ${songLabel} (${reviewText})` })
        }
      } catch (err) {
        logger.error('[topsongs] Failed to fetch song data', { trackName: song.trackName, err: err?.message || err })
        await postMessage({ room, message: `${emoji} ${songLabel} (${reviewText})` })
      }
    }
  } catch (err) {
    logger.error('[topsongs] Error generating list', { err: err?.message || err })
    await postMessage({
      room,
      message: 'Error loading top songs. Please try again later.'
    })
  }
}

export async function handleMyTopSongsCommand ({ payload, room }) {
  const userId = payload?.sender
  const topSongs = getUserSongReviews(userId, 5)

  if (!topSongs.length) {
    await postMessage({
      room,
      message: `${mentionForUser(userId)} you haven't rated any songs yet. Start rating with /review! 🎵`
    })
    return
  }

  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']

  for (let i = 0; i < topSongs.length; i++) {
    const song = topSongs[i]
    const emoji = numberEmojis[i] || `#${i + 1}`
    const songLabel = `*${song.artistName} - ${song.trackName}*`
    const ratingText = `Your rating: ${song.rating}/10 ⭐`

    try {
      const songData = await fetchSongData(song.spotifyTrackId)
      await postMessage({
        room,
        message: `${emoji} ${songLabel} (${ratingText})`,
        customData: {
          songs: [
            {
              song: {
                ...songData,
                musicProviders: songData.musicProvidersIds,
                status: 'SUCCESS'
              }
            }
          ]
        }
      })
    } catch (err) {
      logger.error('[mytopsongs] Failed to fetch song data', { trackName: song.trackName, err: err?.message || err })
    }
  }
}

export async function handleTopAlbumsCommand ({ room }) {
  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']
  const topAlbums = getTopAlbumReviews(5)

  if (!topAlbums || topAlbums.length === 0) {
    await postMessage({
      room,
      message: '🎵 No album reviews found yet! Start rating albums with /albumreview to get featured here! 🎵'
    })
    return
  }

  await postMessage({
    room,
    message: '🎶 *Top Album Reviews* 🎶'
  })

  for (const [i, album] of topAlbums.entries()) {
    const rankEmoji = numberEmojis[i] || `${i + 1}.`
    const stats = db.prepare(`
      SELECT ROUND(AVG(rating), 1) AS avg, COUNT(*) AS cnt
      FROM album_reviews
      WHERE albumId = ?
    `).get(album.id)
    const avg = stats?.avg != null ? Number(stats.avg).toFixed(1) : 'N/A'
    const reviewCount = Number(stats?.cnt || 0)

    await postMessage({
      room,
      message: `${rankEmoji} *"${album.albumName}"* by *${album.artistName}*\n   ➤ ⭐ Average Rating: ${avg}/10 (${reviewCount} review${reviewCount === 1 ? '' : 's'})`
    })

    if (album.albumArt) {
      await postMessage({
        room,
        message: `🖼️ Cover Art for "${album.albumName}"`,
        images: [album.albumArt]
      })
    }
  }
}

export async function handleMyTopAlbumsCommand ({ payload, room }) {
  const userId = payload?.sender
  const userAlbums = getUserAlbumReviews(userId, 5)

  if (!userAlbums || userAlbums.length === 0) {
    await postMessage({
      room,
      message: `🎵 ${mentionForUser(userId)} you haven't rated any albums yet! Use /albumreview to start rating.`
    })
    return
  }

  await postMessage({
    room,
    message: '🎶 *Your Top Album Ratings* 🎶'
  })

  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣']

  for (const [i, album] of userAlbums.sort((a, b) => b.rating - a.rating).entries()) {
    const rankEmoji = numberEmojis[i] || `${i + 1}.`
    await postMessage({
      room,
      message: `${rankEmoji} *"${album.albumName}"* by *${album.artistName}*\n   ➤ ⭐ Your Rating: ${album.rating}/10`
    })

    if (album.albumArt) {
      await postMessage({
        room,
        message: `🖼️ Cover Art for "${album.albumName}"`,
        images: [album.albumArt]
      })
    }
  }
}

export async function handleRatingCommand ({ room, roomBot }) {
  const currentSong = getActiveSong(roomBot)
  if (!currentSong || !currentSong.trackName || !currentSong.artistName) {
    await postMessage({
      room,
      message: 'No song is currently playing. Try again in a moment.'
    })
    return
  }

  let songId = currentSong.songId
  if (!songId) {
    const row = db.prepare(`
      SELECT songId
      FROM room_stats
      WHERE LOWER(TRIM(trackName)) = LOWER(TRIM(?))
        AND LOWER(TRIM(artistName)) = LOWER(TRIM(?))
      ORDER BY id DESC
      LIMIT 1
    `).get(currentSong.trackName, currentSong.artistName)
    songId = row?.songId
  }

  if (!songId) {
    await postMessage({
      room,
      message: `No reviews for "${currentSong.trackName}" by ${currentSong.artistName} yet.`
    })
    return
  }

  const ratingInfo = await getAverageRating({ songId })
  if (!ratingInfo.found) {
    await postMessage({
      room,
      message: `No reviews for "${currentSong.trackName}" by ${currentSong.artistName} yet.`
    })
    return
  }

  await postMessage({
    room,
    message: `"${currentSong.trackName}" by ${currentSong.artistName} has an average rating of ${Number(ratingInfo.average).toFixed(1)}/10 from ${ratingInfo.count} review${ratingInfo.count === 1 ? '' : 's'}.`
  })
}

export async function handleAlbumReviewCommand ({ payload, room, roomBot }) {
  const rating = parseAlbumReviewRating(payload?.message)
  const sender = payload?.sender

  if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
    await postMessage({
      room,
      message: `${mentionForUser(sender)} please enter a number between 1 and 10 (one decimal allowed) to rate the album.`
    })
    return
  }

  const album = getActiveAlbum(roomBot)
  if (!album) {
    await postMessage({
      room,
      message: 'No album info is available to rate. Wait until the next album starts.'
    })
    return
  }

  const result = await saveAlbumReview({
    albumId: album.albumID,
    albumName: album.albumName,
    albumArt: album.albumArt,
    artistName: album.artistName,
    trackCount: album.trackCount,
    userId: sender,
    rating
  })

  if (result.success) {
    await postMessage({
      room,
      message: `${mentionForUser(sender)} thanks! Your album review (${rating}/10) was saved. Current avg: ${result.average}/10.`
    })
    return
  }

  await postMessage({
    room,
    message: 'Something went wrong saving your album review. Try again later.'
  })
}

export async function handleSongCommand ({ room, roomBot }) {
  const song = getActiveSong(roomBot)

  if (!song) {
    await postMessage({
      room,
      message: 'No song is currently playing.'
    })
    return
  }

  const details = [
    `🎵 Track: ${song.trackName}`,
    `👤 Artist: ${song.artistName}`,
    song.spotifyUrl,
    `⏱ Duration: ${song.songDuration}`,
    `🆔 Song ID: ${song.songId}`
  ].filter(Boolean).join('\n')

  await postMessage({ room, message: details })
}

export async function handleSongStatsCommand ({ room, roomBot }) {
  const currentSong = getActiveSong(roomBot)

  if (!currentSong) {
    await postMessage({ room, message: 'No song is currently playing or missing songId.' })
    return
  }

  const TZ = 'America/New_York'
  const fmtDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('en-US', { timeZone: TZ })
    } catch {
      return String(iso)
    }
  }
  const pct = (num, den) => den > 0 ? Math.round((num / den) * 100) : 0
  const formatDuration = (raw, fallbacks = []) => {
    let duration = raw
    for (const fallback of fallbacks) {
      if (duration == null || duration === '' || duration === '0') duration = fallback
    }
    if (duration == null) return '—'
    if (typeof duration === 'string') {
      const trimmed = duration.trim()
      if (!trimmed) return '—'
      if (trimmed.includes(':')) return trimmed
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed)) return '—'
      duration = parsed
    }
    if (typeof duration === 'number') {
      if (duration <= 0) return '—'
      const totalSec = duration < 1000 ? Math.round(duration) : Math.round(duration / 1000)
      const minutes = Math.floor(totalSec / 60)
      const seconds = String(totalSec % 60).padStart(2, '0')
      return `${minutes}:${seconds}`
    }
    return '—'
  }

  try {
    let songStats = null
    if (currentSong.songId) {
      songStats = db.prepare(`
        SELECT trackName, artistName, songId, songDuration, playCount, likes, dislikes, stars, lastPlayed, averageReview
        FROM room_stats
        WHERE songId = ?
      `).get(currentSong.songId)
    }

    if (!songStats && currentSong.trackName && currentSong.artistName) {
      songStats = db.prepare(`
        SELECT trackName, artistName, songId, songDuration, playCount, likes, dislikes, stars, lastPlayed, averageReview
        FROM room_stats
        WHERE LOWER(TRIM(trackName)) = LOWER(TRIM(?))
          AND LOWER(TRIM(artistName)) = LOWER(TRIM(?))
        ORDER BY id DESC
        LIMIT 1
      `).get(currentSong.trackName, currentSong.artistName)
    }

    if (!songStats) {
      await postMessage({ room, message: 'No stats found for this song yet.' })
      return
    }

    const reviewRow = db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM song_reviews
      WHERE songId = ?
    `).get(songStats.songId ?? currentSong.songId)
    const reviewsCount = reviewRow?.cnt ?? 0

    const avgRow = db.prepare(`
      SELECT ROUND(AVG(rating), 1) AS avg
      FROM song_reviews
      WHERE songId = ?
    `).get(songStats.songId ?? currentSong.songId)
    const avgLive = avgRow?.avg != null ? Number(avgRow.avg).toFixed(1) : null

    const bounds = db.prepare(`
      SELECT MIN(playedAt) AS firstPlayed
      FROM song_plays
      WHERE LOWER(TRIM(trackName)) = LOWER(TRIM(?))
        AND LOWER(TRIM(artistName)) = LOWER(TRIM(?))
    `).get(songStats.trackName, songStats.artistName) || {}

    const plays = songStats.playCount ?? 0
    const likes = songStats.likes ?? 0
    const dislikes = songStats.dislikes ?? 0
    const hearts = songStats.stars ?? 0
    const likeRate = pct(likes, plays)
    const disRate = pct(dislikes, plays)
    const avg = avgLive != null
      ? avgLive
      : (songStats.averageReview != null ? Number(songStats.averageReview).toFixed(1) : null)
    const durationStr = formatDuration(songStats.songDuration, [currentSong.songDuration, currentSong.duration])

    const lines = [
      `📊 "${songStats.trackName}" — ${songStats.artistName}`,
      `⏱️ Duration: ${durationStr}`,
      `🟢 Plays: ${plays}`,
      `👍 Likes: ${likes}`,
      `👎 Dislikes: ${dislikes}`,
      `❤️ Hearts: ${hearts}`,
      `📈 Like%: ${likeRate}%`,
      `📉 Dislike%: ${disRate}%`,
      `⭐ Avg Review: ${avg ? `${avg}/10` : '—'}  (🧾 ${reviewsCount})`,
      `📆 First Played: ${fmtDate(bounds.firstPlayed)}`
    ]

    await postMessage({ room, message: lines.join('\n') })
  } catch (error) {
    logger.error('[songstats] Error retrieving song stats', { err: error?.message || error })
    await postMessage({ room, message: 'Error retrieving song stats.' })
  }
}

export async function handleMostPlayedCommand ({ room }) {
  try {
    const topPlayed = db.prepare(`
      SELECT trackName, artistName, playCount
      FROM room_stats
      WHERE LOWER(trackName) != 'unknown'
      ORDER BY playCount DESC
      LIMIT 5
    `).all()

    if (topPlayed.length === 0) {
      await postMessage({ room, message: 'No play history found.' })
      return
    }

    const message = '📈 **Most Played Songs:**\n\n' +
      topPlayed.map((song, i) =>
        `${i + 1}. "${song.trackName}" by ${song.artistName} — ${song.playCount} play${song.playCount !== 1 ? 's' : ''}`
      ).join('\n')

    await postMessage({ room, message })
  } catch (error) {
    logger.error('[mostplayed] Error loading songs', { err: error?.message || error })
    await postMessage({
      room,
      message: 'Error retrieving play count stats.'
    })
  }
}

export async function handleTopLikedCommand ({ room }) {
  try {
    const topLiked = db.prepare(`
      SELECT trackName, artistName, likes
      FROM room_stats
      WHERE LOWER(trackName) != 'unknown'
      ORDER BY likes DESC
      LIMIT 5
    `).all()

    if (topLiked.length === 0) {
      await postMessage({ room, message: 'No like history found.' })
      return
    }

    const message = '❤️ **Top Liked Songs:**\n\n' +
      topLiked.map((song, i) =>
        `${i + 1}. "${song.trackName}" by ${song.artistName} — 👍 ${song.likes}`
      ).join('\n')

    await postMessage({ room, message })
  } catch (error) {
    logger.error('[topliked] Error loading songs', { err: error?.message || error })
    await postMessage({
      room,
      message: 'Error retrieving like stats.'
    })
  }
}

export async function handleAlbumCommand ({ room, roomBot }) {
  const album = getActiveAlbum(roomBot)
  if (!album?.albumName || !album?.artistName) {
    await postMessage({
      room,
      message: 'No album is currently playing or album info is missing.'
    })
    return
  }

  let avgInfo = null
  try {
    const stats = db.prepare(`
      SELECT
        s.id AS id,
        ROUND(AVG(r.rating), 1) AS avg,
        COUNT(r.id) AS cnt
      FROM album_stats s
      LEFT JOIN album_reviews r ON r.albumId = s.id
      WHERE s.albumName = ? AND s.artistName = ?
    `).get(album.albumName, album.artistName)

    if (stats && stats.cnt > 0 && stats.avg != null) {
      avgInfo = { avg: Number(stats.avg).toFixed(1), cnt: stats.cnt }
    }
  } catch (e) {
    logger.error('[album] avg lookup failed', { err: e?.message || e, albumName: album.albumName, artistName: album.artistName })
  }

  const lines = [
    `💿 Album: ${album.albumName}`,
    `👤 Artist: ${album.artistName}`,
    album.releaseDate ? `📅 Released: ${album.releaseDate}` : null,
    avgInfo ? `⭐ Average Rating: ${avgInfo.avg}/10 (${avgInfo.cnt} review${avgInfo.cnt === 1 ? '' : 's'})` : null
  ].filter(Boolean)

  await postMessage({ room, message: lines.join('\n') })

  if (album.albumArt) {
    await postMessage({ room, images: [album.albumArt] })
  }
}

export async function handleArtCommand ({ room, roomBot }) {
  const song = getActiveSong(roomBot)
  const album = getActiveAlbum(roomBot)
  const artUrl = song?.albumArt || album?.albumArt || getCurrentState?.()?.albumArt || getCurrentState?.()?.albumArtField || null

  if (artUrl) {
    await postMessage({ room, images: [artUrl] })
    return
  }

  await postMessage({
    room,
    message: 'No album art available right now.'
  })
}

export async function handleScoreCommand ({ room, roomBot }) {
  const song = getActiveSong(roomBot)

  if (!song) {
    await postMessage({
      room,
      message: 'No song is currently playing or track info is missing.'
    })
    return
  }

  await postMessage({
    room,
    message: `🎵 ${song.trackName} by ${song.artistName} has a current popularity score of ${song.popularity} out of 100.`
  })
}
