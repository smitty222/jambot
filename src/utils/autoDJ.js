import { getCurrentDJUUIDs } from '../libs/bot.js'
import { readRecentSongs } from '../database/dbrecentsongsmanager.js'
import { searchSpotify, getTopTracksByTag, getTopChartTracks, fetchSpotifyPlaylistTracks } from './API.js'
import { getTheme } from './themeManager.js'
import { themeSynonyms } from '../libs/themeSynonyms.js'
import fs from 'fs/promises'
import * as fsSync from 'fs'
import path from 'path'
import { roomBot } from '../index.js'

const blacklistPath = path.join(process.cwd(), 'src/data/songBlacklist.json')

// In-memory cache of the blacklist. It will be lazily loaded on first
// access and invalidated when the underlying file changes. Using an
// in-memory cache avoids synchronous fs reads on every track lookup.
let blacklistCache = null

/**
 * Load the song blacklist from disk. If the list has already been
 * loaded and has not been invalidated, the cached version is returned.
 * @returns {Promise<string[]>}
 */
async function loadBlacklist () {
  if (Array.isArray(blacklistCache)) {
    return blacklistCache
  }
  try {
    const data = await fs.readFile(blacklistPath, 'utf8')
    blacklistCache = JSON.parse(data)
  } catch (err) {
    blacklistCache = []
  }
  return blacklistCache
}

// Watch the blacklist file and invalidate the cache when it changes. We
// use fs.watchFile from the sync fs module because fs/promises does not
// expose watchFile. This watcher is non-blocking and keeps the cache
// fresh during runtime.
try {
  fsSync.watchFile(blacklistPath, { persistent: false }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs) {
      blacklistCache = null
    }
  })
} catch {
  // In environments where watchFile is not supported, skip invalidation
  // and rely on TTL-based cache expiration.
}

/**
 * Determine whether a track is blacklisted. Reads from the cached
 * blacklist, loading it if necessary.
 *
 * @param {string} trackName
 * @param {string} artistName
 * @returns {Promise<boolean>}
 */
async function isBlacklisted (trackName, artistName) {
  const list = await loadBlacklist()
  return list.includes(`${artistName} - ${trackName}`)
}

function normalize (str) {
  return str.toLowerCase().replace(/[^\w\s]/gi, '').trim()
}

export async function getPopularSpotifyTrackID (minPopularity = 0, currentState = null) {
  const recentSongs = readRecentSongs()
  const recentSet = new Set(recentSongs.map(s => normalize(`${s.artistName} - ${s.trackName}`)))
  const botUUID = process.env.BOT_USER_UUID
  const roomUUID = process.env.ROOM_UUID

  const currentTheme = getTheme(roomUUID)?.toLowerCase() || 'just jam'
  console.log(`🎨 Current room theme: "${currentTheme}"`)

  // === SPECIAL CASE: HITS THEME ===
  if (currentTheme === 'hits') {
    console.log('🔥 Using Last.fm top chart tracks for \'Hits\' theme...')
    const chartPool = await getTopChartTracks(100)
    const shuffledChartTracks = chartPool.sort(() => Math.random() - 0.5)
    const chartTracks = shuffledChartTracks.slice(0, 15)

    console.log(`📊 Retrieved ${chartTracks.length} chart tracks.`)

    const validTracks = []

    for (const { artistName, trackName } of chartTracks) {
      try {
        const trackDetails = await searchSpotify(artistName, trackName)
        if (!trackDetails) {
          console.log(`❌ Spotify search failed: ${trackName} by ${artistName}`)
          continue
        }

        const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`)

        if (trackDetails.popularity < minPopularity) {
          console.log(`🚫 Too low popularity: ${trackDetails.spotifyTrackName} (${trackDetails.popularity})`)
          continue
        }
        if (recentSet.has(normalized)) {
          console.log(`🚫 Recently played: ${trackDetails.spotifyTrackName}`)
          continue
        }
        if (await isBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
          console.log(`🚫 Blacklisted: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`)
          continue
        }

        console.log(`✅ Eligible chart track: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`)
        validTracks.push(trackDetails)
      } catch (err) {
        console.error(`❌ Error processing chart track: ${trackName} by ${artistName}`, err)
      }
    }

    if (validTracks.length > 0) {
      const randomIndex = Math.floor(Math.random() * validTracks.length)
      const selected = validTracks[randomIndex]
      console.log(`🎲 Selected from chart: ${selected.spotifyTrackName} by ${selected.spotifyArtistName}`)
      return selected.spotifyTrackID
    } else {
      console.log('⚠️ No valid chart tracks found. Falling back to Just Jam logic...')
    }
  }

  // === THEME-BASED TRACK SELECTION ===
  if (currentTheme !== 'just jam' && currentTheme !== 'hits') {
    const tagsToTry = themeSynonyms[currentTheme] || [currentTheme]
    console.log(`🔍 Using Last.fm tag.getTopTracks with tags: ${tagsToTry.join(', ')}`)

    for (const tag of tagsToTry) {
      const tagTracks = await getTopTracksByTag(tag, 10)
      const validTracks = []

      console.log(`📀 Found ${tagTracks.length} tracks for tag "${tag}"`)

      for (const { artistName, trackName } of tagTracks) {
        try {
          const trackDetails = await searchSpotify(artistName, trackName)
          if (!trackDetails) {
            console.log(`❌ Spotify search failed: ${trackName} by ${artistName}`)
            continue
          }

          const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`)

          if (trackDetails.popularity < minPopularity) {
            console.log(`🚫 Popularity too low: ${trackDetails.spotifyTrackName} (${trackDetails.popularity})`)
            continue
          }
          if (recentSet.has(normalized)) {
            console.log(`🚫 Recently played: ${trackDetails.spotifyTrackName}`)
            continue
          }
          if (await isBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
            console.log(`🚫 Blacklisted: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`)
            continue
          }

          console.log(`✅ Eligible themed track: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`)
          validTracks.push(trackDetails)
        } catch (err) {
          console.error(`❌ Error processing tag track: ${trackName} by ${artistName}`, err)
        }
      }

      if (validTracks.length > 0) {
        const randomIndex = Math.floor(Math.random() * validTracks.length)
        const selected = validTracks[randomIndex]
        console.log(`🎲 Selected from theme: ${selected.spotifyTrackName} by ${selected.spotifyArtistName}`)
        return selected.spotifyTrackID
      } else {
        console.log(`⚠️ No valid tracks found for tag "${tag}"`)
      }
    }

    console.log('🛑 No valid tag-based songs found. Falling back to Just Jam logic...')
  }

  // === FALLBACK: SIMILAR TRACKS FROM RECENT SONGS ===

  let currentDJCount = 1
  let isBotOnlyDJ = false

  if (roomBot.state) {
    const djUUIDs = getCurrentDJUUIDs(roomBot.state)
    const nonBotDJs = djUUIDs.filter(uuid => uuid !== botUUID)
    currentDJCount = nonBotDJs.length || 1
    isBotOnlyDJ = nonBotDJs.length === 0

    console.log(`🎤 All DJs from helper: ${JSON.stringify(djUUIDs)}`)
    console.log(`🧠 Bot UUID: ${botUUID}`)
    console.log(`👤 Non-bot DJs on stage: ${nonBotDJs.length}`)
    console.log(`🤖 Is bot the only DJ? ${isBotOnlyDJ}`)
  } else {
    console.warn('⚠️ currentState is missing or null')
  }

  const userPlayedSongs = recentSongs.filter(song => song.dj !== 'bot')
  const songsToUse = [...userPlayedSongs].slice(0, currentDJCount)

  const similarTrackSuggestions = []
  for (const song of songsToUse) {
    if (Array.isArray(song.similarTracks)) {
      similarTrackSuggestions.push(...song.similarTracks.filter(t => t?.trackName && t?.artistName))
    }
  }

  console.log(`🎯 Found ${similarTrackSuggestions.length} raw similar tracks to consider.`)

  const validTracks = (
    await Promise.all(
      similarTrackSuggestions.map(async ({ trackName, artistName }) => {
        if (!trackName || !artistName) {
          console.log('⚠️ Missing track or artist')
          return null
        }

        try {
          const trackDetails = await searchSpotify(artistName, trackName)
          if (!trackDetails) {
            console.log(`❌ Spotify search failed: ${trackName} by ${artistName}`)
            return null
          }

          const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`)

          if (trackDetails.popularity < minPopularity) {
            console.log(`🚫 Popularity too low: ${trackDetails.spotifyTrackName} (${trackDetails.popularity})`)
            return null
          }
          if (recentSet.has(normalized)) {
            console.log(`🚫 Recently played: ${trackDetails.spotifyTrackName}`)
            return null
          }
          if (await isBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
            console.log(`🚫 Blacklisted: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`)
            return null
          }

          console.log(`✅ Eligible fallback track: ${trackDetails.spotifyTrackName} by ${trackDetails.spotifyArtistName}`)
          return trackDetails
        } catch (err) {
          console.error(`❌ Error processing fallback track: ${trackName} by ${artistName}`, err)
          return null
        }
      })
    )
  ).filter(Boolean)

  if (validTracks.length > 0) {
    const randomIndex = Math.floor(Math.random() * validTracks.length)
    const selected = validTracks[randomIndex]
    console.log(`🎲 Selected from fallback: ${selected.spotifyTrackName} by ${selected.spotifyArtistName}`)
    return selected.spotifyTrackID
  }

  // === SIMILAR TRACKS FAILED — FALL BACK TO DEFAULT PLAYLIST ===
  console.log('❌ No valid fallback similar tracks found. Using default playlist instead.')

  const playlistID = '61vNvZ72Ay7rQgFZYmDixU'
  const playlistTracks = await fetchSpotifyPlaylistTracks(playlistID)
  console.log(`📚 Retrieved ${playlistTracks.length} tracks from playlist ${playlistID}`)

  // Filter and map playlist tracks asynchronously so that we can await
  // blacklist checks. Using a for-of loop instead of Array.filter
  // allows us to use `await` within the loop.
  const filtered = []
  for (const item of playlistTracks) {
    const track = item.track
    if (!track || !track.name || !track.artists?.[0]?.name) {
      console.log('⚠️ Invalid track format. Skipping...')
      continue
    }
    const normalized = normalize(`${track.artists[0].name} - ${track.name}`)
    if (track.popularity < minPopularity) {
      console.log(`🚫 Skipping low popularity: ${track.name} (${track.popularity})`)
      continue
    }
    if (recentSet.has(normalized)) {
      console.log(`🚫 Skipping recently played: ${track.name}`)
      continue
    }
    if (await isBlacklisted(track.name, track.artists[0].name)) {
      console.log(`🚫 Skipping blacklisted: ${track.name} by ${track.artists[0].name}`)
      continue
    }
    filtered.push({
      spotifyTrackName: track.name,
      spotifyArtistName: track.artists[0].name,
      spotifyTrackID: track.id,
      popularity: track.popularity
    })
  }

  if (filtered.length > 0) {
    const randomIndex = Math.floor(Math.random() * filtered.length)
    const selected = filtered[randomIndex]
    console.log(`🎲 Selected from playlist: ${selected.spotifyTrackName} by ${selected.spotifyArtistName}`)
    return selected.spotifyTrackID
  } else {
    console.log('❌ No valid tracks found in default playlist either.')
    return null
  }
}
