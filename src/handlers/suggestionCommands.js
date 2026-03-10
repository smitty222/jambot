import { postMessage } from '../libs/cometchat.js'
import { fetchSongData, getSimilarTracks, searchSpotify } from '../utils/API.js'
import { readRecentSongs } from '../database/dbrecentsongsmanager.js'

const MAX_SOURCE_SONGS = 5
const MAX_SUGGESTIONS = 5
const MAX_CANDIDATES = 12
const ENRICH_CONCURRENCY = 3

async function mapLimit (items, limit, mapper) {
  const concurrency = Math.max(1, Math.min(limit, items.length || 1))
  const results = new Array(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex++
      results[current] = await mapper(items[current], current)
    }
  })

  await Promise.all(workers)
  return results
}

function normalizeSuggestionKey ({ artistName, trackName }) {
  const artist = String(artistName || '').trim().toLowerCase()
  const track = String(trackName || '').trim().toLowerCase()
  return `${artist} - ${track}`
}

function collectUniqueSuggestions (similarLists) {
  const seenArtists = new Set()
  const seenTracks = new Set()
  const candidates = []

  for (const suggestions of similarLists) {
    for (const suggestion of suggestions) {
      const artist = String(suggestion?.artistName || '').trim().toLowerCase()
      const key = normalizeSuggestionKey(suggestion)
      if (!artist || !key || seenArtists.has(artist) || seenTracks.has(key)) continue

      seenArtists.add(artist)
      seenTracks.add(key)
      candidates.push(suggestion)

      if (candidates.length >= MAX_CANDIDATES) return candidates
    }
  }

  return candidates
}

async function enrichSuggestion (suggestion) {
  const trackDetails = await searchSpotify(suggestion.artistName, suggestion.trackName)
  if (!trackDetails?.spotifyTrackID || !trackDetails.spotifyUrl) return null

  const songData = await fetchSongData(trackDetails.spotifyTrackID)
  if (!songData) return null

  return {
    song: {
      ...songData,
      musicProviders: songData.musicProvidersIds,
      status: 'SUCCESS'
    }
  }
}

export async function handleSuggestSongsCommand ({ room }) {
  const recentSongs = readRecentSongs()

  if (!recentSongs || recentSongs.length === 0) {
    await postMessage({
      room,
      message: "I don't have any recent songs to suggest right now."
    })
    return
  }

  const sourceSongs = recentSongs.slice(0, MAX_SOURCE_SONGS)
  const similarLists = await Promise.all(
    sourceSongs.map(async ({ artistName, trackName }) => {
      try {
        return await getSimilarTracks(artistName, trackName)
      } catch {
        return []
      }
    })
  )

  const candidates = collectUniqueSuggestions(similarLists)
  if (!candidates.length) {
    await postMessage({
      room,
      message: "Sorry, I couldn't find any playable suggestions from Last.fm."
    })
    return
  }

  const enriched = await mapLimit(candidates, ENRICH_CONCURRENCY, async (candidate) => {
    try {
      return await enrichSuggestion(candidate)
    } catch (err) {
      console.warn(`❌ Failed to process ${candidate.trackName} by ${candidate.artistName}:`, err?.message || err)
      return null
    }
  })

  const customDataSongs = enriched.filter(Boolean).slice(0, MAX_SUGGESTIONS)
  if (!customDataSongs.length) {
    await postMessage({
      room,
      message: "Sorry, I couldn't find any playable suggestions from Last.fm."
    })
    return
  }

  await postMessage({
    room,
    message: `🎧 Here are ${customDataSongs.length} new songs you might enjoy:`,
    customData: { songs: customDataSongs }
  })
}
