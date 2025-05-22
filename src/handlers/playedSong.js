// playedSong.js
import { postMessage } from '../libs/cometchat.js'
import { roomBot } from '../index.js'
import { fetchSongData, fetchUserData, spotifyTrackInfo } from '../utils/API.js'
import { roomThemes } from './message.js'
import { getCurrentDJUUIDs } from '../libs/bot.js'
import { askQuestion } from '../libs/ai.js'
import { getUserNickname } from './roulette.js'

const formatDate = (dateString) => {
  const [year, month, day] = dateString.split('-')
  return `${month}-${day}-${year}`
}

const handleAlbumTheme = async (payload) => {
  const room = process.env.ROOM_UUID
  const theme = (roomThemes[room] || '').toLowerCase()
  const albumThemes = ['album monday', 'albums', 'album day']

  if (!albumThemes.includes(theme)) return

  const currentSong = roomBot.currentSong
  if (!currentSong || !currentSong.spotifyTrackId) {
    console.log('No song is currently playing or missing Spotify Track ID.')
    return
  }

  try {
    const songData = await spotifyTrackInfo(currentSong.spotifyTrackId)
    if (!songData) {
      console.log('No song data returned from Spotify.')
      return
    }

    const {
      spotifyTrackNumber,
      spotifyTotalTracks: trackCount,
      spotifyDuration,
      spotifyAlbumName: albumName,
      spotifyArtistName: artistName,
      spotifyReleaseDate: releaseDate,
      spotifyTrackName: trackName,
      spotifyAlbumArt: albumArt, 
      spotifyAlbumID: albumID
    } = songData

    const songDuration = parseDuration(spotifyDuration)
    const formattedReleaseDate = releaseDate ? formatDate(releaseDate) : 'N/A'

    console.log(`Track debug — Track #: ${spotifyTrackNumber}, Track Count: ${trackCount}, Album: ${albumName}`)

    // === First Track ===
    if (spotifyTrackNumber === 1) {
      const currentDJUuid = getCurrentDJUUIDs(roomBot.state)[0]
      const currentDJName = await getUserNickname(currentDJUuid)

      roomBot.currentAlbum = {
        albumId: albumID,  
        albumName,
        artistName,
        trackCount
      }

      await postMessage({
        room,
        message: ``,
        images: [albumArt]
      })
      await postMessage({
        room,
        message: `@${currentDJName} is starting an Album!\n\nAlbum: ${albumName}\nArtist: ${artistName}\nRelease Date: ${formattedReleaseDate}\nTrack Number: ${spotifyTrackNumber} of ${trackCount}`,
      })
    }

    // === Halfway Point ===
    if (spotifyTrackNumber === Math.floor(trackCount / 2)) {
      await postMessage({
        room,
        message: `This is the halfway point in ${artistName}'s album, *${albumName}*.\n\nTrack: ${trackName}\nRelease Date: ${formattedReleaseDate}\nTrack ${spotifyTrackNumber} of ${trackCount}`
      })
    }

    // === Last Track ===
    if (spotifyTrackNumber === trackCount) {
      const currentDJUuid = getCurrentDJUUIDs(roomBot.state)[0]
      const currentDJName = await getUserNickname(currentDJUuid)

      await postMessage({
        room,
        message: ``,
        images: [albumArt]
      })
      await postMessage({
        room,
        message: `${trackName}\nTrack ${spotifyTrackNumber} of ${trackCount}\n\nThis is the last song of the album. Thanks @${currentDJName} for the tunes! You will be removed from the stage when this song ends.`,
      })
      await postMessage({
        room,
        message: `Make sure to leave your review of the album! Use /reviewhelp for more info`,
      })
     

      if (currentDJUuid) {
        const adjustedDuration = Math.max(0, songDuration - 5000)
        console.log(`Waiting ${adjustedDuration}ms to remove DJ ${currentDJUuid}`)

        setTimeout(async () => {
          await roomBot.removeDJ(currentDJUuid)
          console.log(`DJ ${currentDJUuid} removed from stage after final track.`)
        }, adjustedDuration)
      }
    }

    // === Any Other Track ===
    if (
      spotifyTrackNumber !== 1 &&
      spotifyTrackNumber !== Math.floor(trackCount / 2) &&
      spotifyTrackNumber !== trackCount
    ) {
      await postMessage({
        room,
        message: `${trackName}\nTrack ${spotifyTrackNumber} of ${trackCount}`
      })
    }
  } catch (error) {
    
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

        // Check if the current song is in the covers.json list
        const isCoverSong = coversList.find(
          (entry) =>
            entry.coverSong.toLowerCase() === currentSong.trackName.toLowerCase() &&
            entry.coverArtist.toLowerCase() === currentSong.artistName.toLowerCase()
        )

        if (isCoverSong) {
          // If the song is in the covers.json list, post the original song details
          const originalInfo = `Original Song: "${isCoverSong.originalSong}" by ${isCoverSong.originalArtist}`
          await postMessage({
            room,
            message: `Cover Friday:\n______________________________________________________\nThis is a cover!\n${originalInfo}\n______________________________________________________`
          })
        } else {
          // Now ask the AI about the song if it's not in the covers list
          const question = `Is ${currentSong.trackName} by ${currentSong.artistName} a cover? If so, please provide information about the original. If not, please explain why.`

          const aiResponse = await askQuestion(question)

          // Post the AI's response in the chat
          await postMessage({
            room,
            message: `Cover Friday:\n______________________________________________________\n${aiResponse}\n______________________________________________________`
          })
        }
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
