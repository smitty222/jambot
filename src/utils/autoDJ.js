import { readRecentSongs } from '../libs/bot.js'
import { askQuestion } from '../libs/ai.js'
import { searchSpotify } from './API.js'
import fs from 'fs';
import path from 'path';

const blacklistPath = path.join(process.cwd(), 'src/libs/blacklist.json')

function loadBlacklist() {
  if (!fs.existsSync(blacklistPath)) return []
  const raw = fs.readFileSync(blacklistPath, 'utf8')
  return JSON.parse(raw)
}

function isBlacklisted(trackName, artistName) {
  const blacklist = loadBlacklist()
  const fullName = `${artistName} - ${trackName}`
  return blacklist.includes(fullName)
}

async function getPopularSpotifyTrackID(minPopularity = 1) {
  const recentSongs = readRecentSongs()
  if (!recentSongs || recentSongs.length === 0) {
    console.log('No recent songs available.')
    return null
  }

  // Get last 20 songs
  const recentLimit = 20
  const last20Songs = recentSongs.slice(-recentLimit).map(s => `${s.artistName.toLowerCase()} - ${s.trackName.toLowerCase()}`)

  // Format for AI prompt
  const songList = recentSongs.map(song => `Track: *${song.trackName}* | Artist: *${song.artistName}*`).join('\n')
  const question = `Here is a list of songs I've listened to recently:\n${songList}\n\nCan you suggest some similar songs that I may enjoy? Follow this format:\n\nTrack: <Track Name> | Artist: <Artist Name>\n\nEach suggestion should be on a new line, with no extra commentary. Please don't use the same artist twice.`

  const aiResponse = await askQuestion(question)
  console.log('AI Response:', aiResponse)

  const songSuggestions = aiResponse.split('\n').map(line => {
    const match = line.match(/Track: (.+) \| Artist: (.+)/)
    return match ? { trackName: match[1].trim(), artistName: match[2].trim() } : null
  }).filter(Boolean)

  if (songSuggestions.length === 0) {
    console.log('AI did not return valid song suggestions.')
    return null
  }

  const trackDetailsArray = (await Promise.all(
    songSuggestions.map(async ({ trackName, artistName }) => {
      if (!trackName || !artistName) return null
      try {
        const trackDetails = await searchSpotify(artistName, trackName)
        if (
          trackDetails &&
          trackDetails.popularity >= minPopularity &&
          !isBlacklisted(trackDetails.spotifyTrackName, trackDetails.spotifyArtistName) &&
          !last20Songs.includes(`${trackDetails.spotifyArtistName.toLowerCase()} - ${trackDetails.spotifyTrackName.toLowerCase()}`)
        ) {
          return trackDetails
        }
        return null
      } catch (error) {
        console.error(`Error fetching ${trackName} by ${artistName}:`, error)
        return null
      }
    })
  )).filter(Boolean)

  if (trackDetailsArray.length === 0) {
    console.log('No songs met the popularity threshold or were too recently played.')
    return null
  }

  const selectedTrack = trackDetailsArray.reduce((prev, current) =>
    prev.popularity > current.popularity ? prev : current
  )

  console.log(`Selected Track: ${selectedTrack.spotifyTrackName} by ${selectedTrack.spotifyArtistName} (ID: ${selectedTrack.spotifyTrackID}, Popularity: ${selectedTrack.popularity})`)
  return selectedTrack.spotifyTrackID
}


export { getPopularSpotifyTrackID }
