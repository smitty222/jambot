// playedSong.js
import { postMessage } from '../libs/cometchat.js'
import { roomBot } from '../index.js'
import { fetchSongData, getAlbumTracks, spotifyTrackInfo } from '../utils/API.js'
import { roomThemes } from './message.js'
import { getCurrentDJUUIDs } from '../libs/bot.js'
import { askQuestion } from '../libs/ai.js'
import { getUserNickname } from './roulette.js'
import { QueueManager } from '../utils/queueManager.js'

const queueManager = new QueueManager('src/data/djQueue.json', getUserNickname)

const stageLock = {
  locked: false,
  userUuid: null,
  timeout: null
}

const formatDate = (dateString) => {
  const [year, month, day] = dateString.split('-')
  return `${month}-${day}-${year}`
}

const parseDuration = (durationStr) => {
  const [minutes, seconds] = durationStr.split(':').map(Number)
  return (minutes * 60 + seconds) * 1000
}

const handleAlbumTheme = async (payload) => {
  const room = process.env.ROOM_UUID
  const theme = (roomThemes[room] || '').toLowerCase()
  const albumThemes = ['album monday', 'albums', 'album day']
  if (!albumThemes.includes(theme)) return

  const currentSong = roomBot.currentSong
  if (!currentSong || !currentSong.spotifyTrackId) return

  try {
    const songData = await spotifyTrackInfo(currentSong.spotifyTrackId)
    if (!songData) return

    const {
      spotifyTrackNumber,
      spotifyDuration,
      spotifyAlbumName: albumName,
      spotifyArtistName: artistName,
      spotifyReleaseDate: releaseDate,
      spotifyTrackName: trackName,
      spotifyAlbumArt: albumArt,
      spotifyAlbumID: albumID
    } = songData

    const albumTracks = await getAlbumTracks(albumID)
    let reliableTrackNumber = albumTracks.findIndex(track => track.id === currentSong.spotifyTrackId) + 1
    const trackCount = albumTracks.length

    if (reliableTrackNumber === 0) reliableTrackNumber = parseInt(spotifyTrackNumber)

    const songDuration = parseDuration(spotifyDuration)
    const formattedReleaseDate = releaseDate ? formatDate(releaseDate) : 'N/A'

    if (reliableTrackNumber === 1) {
      const currentDJUuid = getCurrentDJUUIDs(roomBot.state)[0]
      const currentDJName = await getUserNickname(currentDJUuid)
      roomBot.currentAlbum = { albumId: albumID, albumName, artistName, trackCount, albumArt }
      roomBot.currentAlbumTrackNumber = reliableTrackNumber

      await postMessage({ room, message: ``, images: [albumArt] })
      await postMessage({
        room,
        message: `@${currentDJName} is starting an Album!\n\nAlbum: ${albumName}\nArtist: ${artistName}\nRelease Date: ${formattedReleaseDate}\nTrack Number: ${reliableTrackNumber} of ${trackCount}`
      })
    }

    if (reliableTrackNumber === Math.floor(trackCount / 2)) {
      await postMessage({
        room,
        message: `This is the halfway point in ${artistName}'s album, *${albumName}*.\n\nTrack: ${trackName}\nRelease Date: ${formattedReleaseDate}\nTrack ${reliableTrackNumber} of ${trackCount}`
      })
    }

    if (reliableTrackNumber === trackCount) {
      const currentDJUuid = getCurrentDJUUIDs(roomBot.state)[0]
      const currentDJName = await getUserNickname(currentDJUuid)

      await postMessage({ room, message: ``, images: [albumArt] })
      await postMessage({
        room,
        message: `${trackName}\nTrack ${reliableTrackNumber} of ${trackCount}\n\nThis is the last song of the album. Thanks @${currentDJName} for the tunes! You will be removed from the stage when this song ends.`
      })
      await postMessage({ room, message: `Make sure to leave your review of the album! Use /reviewhelp for more info` })

      const adjustedDuration = Math.max(0, songDuration - 5000)

      setTimeout(async () => {
        try {
          await roomBot.removeDJ(currentDJUuid)
          const nextUser = await queueManager.advanceQueue()

          if (nextUser && nextUser.userId) {
            stageLock.locked = true
            stageLock.userUuid = nextUser.userId

            await postMessage({
              room,
              message: `<@uid:${nextUser.userId}>; you're up next! Please press the 'Play Music' button to get on stage within 30 seconds.`
            })

            stageLock.timeout = setTimeout(async () => {
              const onStage = getCurrentDJUUIDs(roomBot.state)

              for (const djUuid of onStage) {
                if (djUuid !== nextUser.userId) {
                  console.log(`Removing unexpected DJ ${djUuid} from stage`)
                  await roomBot.removeDJ(djUuid)
                  await postMessage({
                    room,
                    message: `<@uid:${djUuid}>; you're not next in the queue. Please wait for your turn.`
                  })
                }
              }

              if (onStage.includes(nextUser.userId)) {
                console.log(`${nextUser.userId} successfully joined the stage.`)
                await queueManager.leaveQueue(nextUser.userId)
                
              } else {
                await postMessage({
                  room,
                  message: `<@uid:${nextUser.userId}>; did not take the stage in time. Moving on.`
                })
              }

              cancelStageLock()
            }, 30000)

            const stageMonitor = setInterval(async () => {
              const onStageNow = getCurrentDJUUIDs(roomBot.state)
              for (const djUuid of onStageNow) {
                if (djUuid !== nextUser.userId) {
                  console.log(`Immediately removing unauthorized DJ ${djUuid}`)
                  await roomBot.removeDJ(djUuid)
                  await postMessage({
                    room,
                    message: `<@uid:${djUuid}>; you're not next in the queue. Please wait for your turn.`
                  })
                }
              }
            }, 1000)

            setTimeout(() => clearInterval(stageMonitor), 30000)
          } else {
            console.log('No user found in queue to add.')
          }
        } catch (error) {
          console.error('Error transitioning to next DJ:', error)
        }
      }, adjustedDuration)
    }
  } catch (error) {
    console.error('Error in handleAlbumTheme:', error)
  }
}

function isStageLockedFor(userUuid) {
  return stageLock.locked && userUuid !== stageLock.userUuid
}

function cancelStageLock() {
  if (stageLock.timeout) clearTimeout(stageLock.timeout)
  stageLock.locked = false
  stageLock.userUuid = null
  stageLock.timeout = null
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

export { handleAlbumTheme, handleCoversTheme, isStageLockedFor, cancelStageLock }
