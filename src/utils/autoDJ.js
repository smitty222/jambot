import { getCurrentDJUUIDs } from '../libs/bot.js'
import { readRecentSongs } from '../database/dbrecentsongsmanager.js'
import { searchSpotify, getTopTracksByTag, getTopChartTracks, fetchSpotifyPlaylistTracks } from './API.js'
import { env } from '../config.js'
import { getTheme } from './themeManager.js'
import { themeSynonyms } from '../libs/themeSynonyms.js'
import { isSongBlacklisted } from './songBlacklist.js'
import { logger } from './logging.js'
import { roomBot } from '../runtime/roomBot.js'

const logInfo = (message, meta = {}) => logger.info(message, meta)
const logDebug = (message, meta = {}) => logger.debug(message, meta)
const logWarn = (message, meta = {}) => logger.warn(message, meta)
const logError = (message, meta = {}) => logger.error(message, meta)

function normalize (str) {
  return str.toLowerCase().replace(/[^\w\s]/gi, '').trim()
}

export async function getPopularSpotifyTrackID (minPopularity = 0, currentState = null) {
  const recentSongs = readRecentSongs()
  const recentSet = new Set(recentSongs.map(s => normalize(`${s.artistName} - ${s.trackName}`)))
  const botUUID = env.botUserUuid
  const roomUUID = env.roomUuid

  const currentTheme = getTheme(roomUUID)?.toLowerCase() || 'just jam'
  logInfo('[autodj] current theme', { currentTheme })

  // === SPECIAL CASE: HITS THEME ===
  if (currentTheme === 'hits') {
    logInfo('[autodj] using hits chart source')
    const chartPool = await getTopChartTracks(100)
    const shuffledChartTracks = chartPool.sort(() => Math.random() - 0.5)
    const chartTracks = shuffledChartTracks.slice(0, 15)

    logInfo('[autodj] fetched chart tracks', { count: chartTracks.length })

    const validTracks = []

    for (const { artistName, trackName } of chartTracks) {
      try {
        const trackDetails = await searchSpotify(artistName, trackName)
        if (!trackDetails) {
          logDebug('[autodj] spotify search failed for chart track', { trackName, artistName })
          continue
        }

        const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`)

        if (trackDetails.popularity < minPopularity) {
          logDebug('[autodj] skipped chart track for popularity', { trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName, popularity: trackDetails.popularity, minPopularity })
          continue
        }
        if (recentSet.has(normalized)) {
          logDebug('[autodj] skipped recently played chart track', { trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
          continue
        }
        if (await isSongBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
          logDebug('[autodj] skipped blacklisted chart track', { trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
          continue
        }

        logDebug('[autodj] eligible chart track', { trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
        validTracks.push(trackDetails)
      } catch (err) {
        logError('[autodj] error processing chart track', { trackName, artistName, err })
      }
    }

    if (validTracks.length > 0) {
      const randomIndex = Math.floor(Math.random() * validTracks.length)
      const selected = validTracks[randomIndex]
      logInfo('[autodj] selected chart track', { trackName: selected.spotifyTrackName, artistName: selected.spotifyArtistName })
      return selected.spotifyTrackID
    } else {
      logInfo('[autodj] no valid chart tracks found; falling back')
    }
  }

  // === THEME-BASED TRACK SELECTION ===
  if (currentTheme !== 'just jam' && currentTheme !== 'hits') {
    const tagsToTry = themeSynonyms[currentTheme] || [currentTheme]
    logInfo('[autodj] using tag sources', { currentTheme, tagsToTry })

    for (const tag of tagsToTry) {
      const tagTracks = await getTopTracksByTag(tag, 10)
      const validTracks = []

      logInfo('[autodj] fetched themed tag tracks', { tag, count: tagTracks.length })

      for (const { artistName, trackName } of tagTracks) {
        try {
          const trackDetails = await searchSpotify(artistName, trackName)
          if (!trackDetails) {
            logDebug('[autodj] spotify search failed for themed track', { tag, trackName, artistName })
            continue
          }

          const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`)

          if (trackDetails.popularity < minPopularity) {
            logDebug('[autodj] skipped themed track for popularity', { tag, trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName, popularity: trackDetails.popularity, minPopularity })
            continue
          }
          if (recentSet.has(normalized)) {
            logDebug('[autodj] skipped recently played themed track', { tag, trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
            continue
          }
          if (await isSongBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
            logDebug('[autodj] skipped blacklisted themed track', { tag, trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
            continue
          }

          logDebug('[autodj] eligible themed track', { tag, trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
          validTracks.push(trackDetails)
        } catch (err) {
          logError('[autodj] error processing themed track', { tag, trackName, artistName, err })
        }
      }

      if (validTracks.length > 0) {
        const randomIndex = Math.floor(Math.random() * validTracks.length)
        const selected = validTracks[randomIndex]
        logInfo('[autodj] selected themed track', { tag, trackName: selected.spotifyTrackName, artistName: selected.spotifyArtistName })
        return selected.spotifyTrackID
      } else {
        logInfo('[autodj] no valid tracks found for tag', { tag })
      }
    }

    logInfo('[autodj] no valid themed tracks found; falling back')
  }

  // === FALLBACK: SIMILAR TRACKS FROM RECENT SONGS ===

  let currentDJCount = 1
  let isBotOnlyDJ = false

  if (roomBot.state) {
    const djUUIDs = getCurrentDJUUIDs(roomBot.state)
    const nonBotDJs = djUUIDs.filter(uuid => uuid !== botUUID)
    currentDJCount = nonBotDJs.length || 1
    isBotOnlyDJ = nonBotDJs.length === 0

    logDebug('[autodj] stage context', { djUUIDs, botUUID, nonBotDjCount: nonBotDJs.length, isBotOnlyDJ })
  } else {
    logWarn('[autodj] room state missing while selecting track')
  }

  const userPlayedSongs = recentSongs.filter(song => song.dj !== 'bot')
  const songsToUse = [...userPlayedSongs].slice(0, currentDJCount)

  const similarTrackSuggestions = []
  for (const song of songsToUse) {
    if (Array.isArray(song.similarTracks)) {
      similarTrackSuggestions.push(...song.similarTracks.filter(t => t?.trackName && t?.artistName))
    }
  }

  logInfo('[autodj] found similar track suggestions', { count: similarTrackSuggestions.length })

  const validTracks = (
    await Promise.all(
      similarTrackSuggestions.map(async ({ trackName, artistName }) => {
        if (!trackName || !artistName) {
          logDebug('[autodj] skipped similar track with missing metadata')
          return null
        }

        try {
          const trackDetails = await searchSpotify(artistName, trackName)
          if (!trackDetails) {
            logDebug('[autodj] spotify search failed for fallback track', { trackName, artistName })
            return null
          }

          const normalized = normalize(`${trackDetails.spotifyArtistName} - ${trackDetails.spotifyTrackName}`)

          if (trackDetails.popularity < minPopularity) {
            logDebug('[autodj] skipped fallback track for popularity', { trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName, popularity: trackDetails.popularity, minPopularity })
            return null
          }
          if (recentSet.has(normalized)) {
            logDebug('[autodj] skipped recently played fallback track', { trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
            return null
          }
          if (await isSongBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName)) {
            logDebug('[autodj] skipped blacklisted fallback track', { trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
            return null
          }

          logDebug('[autodj] eligible fallback track', { trackName: trackDetails.spotifyTrackName, artistName: trackDetails.spotifyArtistName })
          return trackDetails
        } catch (err) {
          logError('[autodj] error processing fallback track', { trackName, artistName, err })
          return null
        }
      })
    )
  ).filter(Boolean)

  if (validTracks.length > 0) {
    const randomIndex = Math.floor(Math.random() * validTracks.length)
    const selected = validTracks[randomIndex]
    logInfo('[autodj] selected fallback similar track', { trackName: selected.spotifyTrackName, artistName: selected.spotifyArtistName })
    return selected.spotifyTrackID
  }

  // === SIMILAR TRACKS FAILED — FALL BACK TO DEFAULT PLAYLIST ===
  logInfo('[autodj] no valid fallback similar tracks found; using default playlist')

  const playlistID = '61vNvZ72Ay7rQgFZYmDixU'
  const playlistTracks = await fetchSpotifyPlaylistTracks(playlistID)
  logInfo('[autodj] fetched playlist fallback tracks', { playlistID, count: playlistTracks.length })

  // Filter and map playlist tracks asynchronously so that we can await
  // blacklist checks. Using a for-of loop instead of Array.filter
  // allows us to use `await` within the loop.
  const filtered = []
  for (const item of playlistTracks) {
    const track = item.track
    if (!track || !track.name || !track.artists?.[0]?.name) {
      logDebug('[autodj] skipped invalid playlist fallback track')
      continue
    }
    const normalized = normalize(`${track.artists[0].name} - ${track.name}`)
    if (track.popularity < minPopularity) {
      logDebug('[autodj] skipped playlist fallback track for popularity', { trackName: track.name, artistName: track.artists[0].name, popularity: track.popularity, minPopularity })
      continue
    }
    if (recentSet.has(normalized)) {
      logDebug('[autodj] skipped recently played playlist fallback track', { trackName: track.name, artistName: track.artists[0].name })
      continue
    }
    if (await isSongBlacklisted(track.name, track.artists[0].name)) {
      logDebug('[autodj] skipped blacklisted playlist fallback track', { trackName: track.name, artistName: track.artists[0].name })
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
    logInfo('[autodj] selected playlist fallback track', { trackName: selected.spotifyTrackName, artistName: selected.spotifyArtistName })
    return selected.spotifyTrackID
  } else {
    logWarn('[autodj] no valid tracks found in default playlist fallback')
    return null
  }
}
