// playedSong.js
import { postMessage } from '../libs/cometchat.js'
import { roomBot } from '../index.js'
import { fetchSongData, fetchUserData, spotifyTrackInfo } from '../utils/API.js'
import { roomThemes } from './message.js'
import { getCurrentDJUUIDs } from '../libs/bot.js'
import { askQuestion } from '../libs/ai.js'

const formatDate = (dateString) => {
  const [year, month, day] = dateString.split('-')
  return `${month}-${day}-${year}`
}

const handleAlbumTheme = async (payload) => {
  try {
    const room = process.env.ROOM_UUID
    const theme = (roomThemes[room] || '').toLowerCase() // Convert to lowercase for case-insensitive comparison

    const albumThemes = ['album monday', 'albums', 'album day']
    if (!albumThemes.includes(theme)) {
      return
    }

    // Extract the current song information from the payload
    const currentSong = roomBot.currentSong
    if (!currentSong || !currentSong.spotifyTrackId) {
      console.log('No song is currently playing or Spotify URL is missing.')
      return
    }

    try {
      // Fetch additional song data using Spotify Track ID
      const songData = await spotifyTrackInfo(currentSong.spotifyTrackId)
      console.log('Song data:', songData)

      // Extract relevant data from the Spotify response
      const spotifyTrackNumber = songData.spotifyTrackNumber // Spotify track number
      const trackCount = songData.spotifyTotalTracks // Total number of tracks in the album
      const songDuration = parseDuration(songData.spotifyDuration) // Convert duration to milliseconds
      const albumName = songData.spotifyAlbumName // Album name
      const artistName = songData.spotifyArtistName // Primary artist name (first artist in the list)
      const releaseDate = songData.spotifyReleaseDate // Album release date
      const trackName = songData.spotifyTrackName
      const albumType = songData.spotifyAlbumType
      const albumArt = songData.spotifyAlbumArt
      const popularity = songData.spotifyPopularity

      const formattedReleaseDate = releaseDate ? formatDate(releaseDate) : 'N/A'

      console.log(`Spotify Track Number: ${spotifyTrackNumber}, Track Count: ${trackCount}, Duration: ${songDuration}ms`)

      // Post album information at the start of the album, only if spotifyTrackNumber is 1
      if (spotifyTrackNumber === 1) {
        const currentDJUuid = getCurrentDJUUIDs(roomBot.state)
        const [currentDJName] = await fetchUserData([currentDJUuid])

        await postMessage({
          room,
          message: `@${currentDJName} is starting an Album!\n\nAlbum: ${albumName}\nArtist: ${artistName}\nRelease Date: ${formattedReleaseDate}\nTrack Number: ${spotifyTrackNumber} of ${trackCount || 'N/A'}\n\n${albumArt}`
        })
      }

      // Post a message when halfway through the album
      if (spotifyTrackNumber === Math.floor(trackCount / 2)) {
        await postMessage({
          room,
          message: `This is the halfway point in ${artistName}'s\n album, ${albumName}.\n\n Track Name: ${trackName} \nRelease Date: ${formattedReleaseDate}\nTrack Number: ${spotifyTrackNumber} of ${trackCount || 'N/A'}`
        })
      }

      // Handle the last song in the album
      if (spotifyTrackNumber === trackCount) {
        console.log('Now playing the last track in the album.')

        const state = payload.state || {}
        console.log('State data:', state)

        const currentDJUUIDs = getCurrentDJUUIDs(roomBot.state)
        const currentDJUuid = currentDJUUIDs.length > 0 ? currentDJUUIDs[0] : null

        console.log('Current DJ UUID:', currentDJUuid)

        if (currentDJUuid) {
          console.log(`Waiting ${songDuration} milliseconds before removing the DJ...`)

          // Remove the DJ after the last song's duration
          setTimeout(async () => {
            await roomBot.removeDJ(currentDJUuid) // Call removeDJ with the current DJ's UUID
            console.log(`DJ ${currentDJUuid} removed from the stage after the final track.`)
          }, songDuration) // Wait for the duration of the song

          const [currentDJName] = await fetchUserData([currentDJUuid])

          // Post a thank-you message to the DJ
          await postMessage({
            room,
            message: `This is the last song of the album. Thanks @${currentDJName} for the tunes!`
          })
        } else {
          console.log('No DJ found to remove, or this is not the last track in the album.')
        }
      } else {
        // Post "test" message if spotifyTrackNumber is neither 1 nor halfway nor the last track
        if (spotifyTrackNumber !== 1 && spotifyTrackNumber !== Math.floor(trackCount / 2)) {
          await postMessage({
            room,
            message: 'Test'
          })
        }
      }
    } catch (error) {
      console.error('Error fetching song data:', error)
    }
  } catch (error) {
    console.error('Error handling album theme event:', error.message)
    await postMessage({
      room,
      message: 'There was an error processing the album theme event.'
    })
  }
}

// Helper function to convert duration string to milliseconds
const parseDuration = (durationStr) => {
  const [minutes, seconds] = durationStr.split(':').map(Number)
  return (minutes * 60 + seconds) * 1000 // Convert to milliseconds
}

const handleCoversTheme = async (payload) => {
  try {
    const room = process.env.ROOM_UUID
    const theme = (roomThemes[room] || '').toLowerCase() // Convert to lowercase for case-insensitive comparison
    // Check if the theme matches any of the cover-related themes
    const coverThemes = ['cover friday', 'covers', 'cover']
    if (!coverThemes.includes(theme)) {
      return
    }

    // Extract the current song information from the payload
    const currentSong = roomBot.currentSong
    console.log('Current song:', currentSong)

    if (currentSong && currentSong.spotifyUrl) {
      try {
        // Fetch additional song data using Spotify URL
        const songData = await fetchSongData(currentSong.spotifyUrl)
        console.log('Song data:', songData)

        // Now ask a question to the AI about this song
        const question = `Is this song a cover? Song Name: ${currentSong.trackName}, Artist Name: ${currentSong.artistName}, Release Date: ${currentSong.releaseDate}`

        const aiResponse = await askQuestion(question)

        // Post the AI's response in the chat
        await postMessage({
          room,
          message: `Current Theme: ${theme}\n\n${aiResponse}\n______________________________________________________`
        })
      } catch (error) {
        console.error('Error fetching song data:', error)
      }
    } else {
      console.log('No song is currently playing or Spotify song ID is missing.')
    }
  } catch (error) {
    console.error('Error handling covers theme event:', error.message)
    await postMessage({
      room,
      message: 'There was an error processing the cover theme event.'
    })
  }
}

export { handleAlbumTheme, handleCoversTheme }
