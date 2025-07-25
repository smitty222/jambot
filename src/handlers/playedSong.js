// playedSong.js
import { postMessage } from '../libs/cometchat.js'
import { roomBot } from '../index.js'
import { fetchSongData, getAlbumTracks, spotifyTrackInfo } from '../utils/API.js'
import { roomThemes } from './message.js'
import { getCurrentDJUUIDs } from '../libs/bot.js'
import { askQuestion } from '../libs/ai.js'
import { getUserNickname } from './message.js'
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

    const renderProgressBar = (current, total) => {
      const filled = Math.round((current / total) * 10)
      return '▓'.repeat(filled) + '░'.repeat(10 - filled)
    }

    const progressBar = renderProgressBar(reliableTrackNumber, trackCount)

    const currentDJUuid = getCurrentDJUUIDs(roomBot.state)[0]
    const currentDJName = await getUserNickname(currentDJUuid)

    const isFirst = reliableTrackNumber === 1
    const isMidpoint = reliableTrackNumber === Math.floor(trackCount / 2)
    const isLast = reliableTrackNumber === trackCount
    const shouldAnnounceBasic = !isFirst && !isMidpoint && !isLast

    // 🎧 Album start
    if (isFirst) {
      roomBot.currentAlbum = { albumId: albumID, albumName, artistName, trackCount, albumArt }
      roomBot.currentAlbumTrackNumber = reliableTrackNumber

      await postMessage({ room, message: ``, images: [albumArt] })

      await postMessage({
        room,
        message:
`🎧 *Album Session Started*  
────────────────────────────  
👤 DJ: <@uid:${currentDJUuid}>  
📀 Album: *${albumName}*  	
🎤 Artist: *${artistName}*  
📅 Released: ${formattedReleaseDate}  
💿 Track: ${reliableTrackNumber} of ${trackCount}  
📊 Progress: ${progressBar}`
      })
    }

    // 🌓 Midpoint
    if (isMidpoint) {
      await postMessage({
        room,
        message:
`🌓 *Halfway through the album!*  
🎧 *${albumName}* by *${artistName}*  
📀 Now Playing: *${trackName}*  
📊 Progress: ${progressBar}

💬 Use \`/albumreview\` to rate tracks. Type \`/reviewhelp\` to see the rating scale!`
      })
    }

    // 🎉 Final Track Logic
    if (isLast) {
      await postMessage({ room, message: ``, images: [albumArt] })

      await postMessage({
        room,
        message:
`🎉 *Final Track of the Album!*  
🖼️ Album: *${albumName}*  
📀 Track: *${trackName}* (${reliableTrackNumber}/${trackCount})  
👤 Thanks for the vibes, <@uid:${currentDJUuid}>  
💬 Time to leave your review: \`/albumreview\`  
📊 Progress: ${progressBar}`
      })

      await postMessage({
        room,
        message: `✨ Use \`/reviewhelp\` to learn how to rate the album!`
      })

      const adjustedDuration = Math.max(0, songDuration - 5000)
      const reminderTime = Math.max(0, adjustedDuration - 60000)

      // ⏳ Queue reminder (60s before end)
      setTimeout(async () => {
        const nextUser = await queueManager.getCurrentUser()
        if (nextUser?.userId) {
          await postMessage({
            room,
            message:
`⏳ *Album ending soon!*  
🎧 <@uid:${nextUser.userId}> you're next in the queue.  
Please be ready to press *Play Music* when the stage opens.`
          })
        } else {
          await postMessage({
            room,
            message:
`📢 *Album wrapping up in 60 seconds!*  
No one is in the queue.  
Want to go next? Type \`q+\` to claim your spot and play an album!`
          })
        }
      }, reminderTime)

      console.log(`[AlbumTheme] Will remove DJ <@uid:${currentDJUuid}> in ${adjustedDuration}ms`)

      setTimeout(async () => {
        try {
          const onStage = getCurrentDJUUIDs(roomBot.state)

          if (!onStage.includes(currentDJUuid)) {
            console.log(`[AlbumTheme] DJ ${currentDJUuid} already removed from stage.`)
            return
          }

          console.log(`[AlbumTheme] Removing DJ after album end: ${currentDJUuid}`)
          await roomBot.removeDJ(currentDJUuid)

          const nextUser = await queueManager.advanceQueue()

          if (nextUser?.userId) {
            stageLock.locked = true
            stageLock.userUuid = nextUser.userId

            await postMessage({
              room,
              message: `<@uid:${nextUser.userId}> you're up next! Please press the 'Play Music' button to get on stage within 30 seconds.`
            })

            stageLock.timeout = setTimeout(async () => {
              const currentDJs = getCurrentDJUUIDs(roomBot.state)

              for (const djUuid of currentDJs) {
                if (djUuid !== nextUser.userId) {
                  console.log(`[Queue] Removing unexpected DJ: ${djUuid}`)
                  await roomBot.removeDJ(djUuid)
                  await postMessage({
                    room,
                    message: `<@uid:${djUuid}> you're not next in the queue. Please wait for your turn.`
                  })
                }
              }

              if (currentDJs.includes(nextUser.userId)) {
                console.log(`[Queue] ${nextUser.userId} joined — removing from queue.`)
                await queueManager.leaveQueue(nextUser.userId)
              } else {
                console.log(`[Queue] ${nextUser.userId} did not join — removing from queue.`)
                await queueManager.leaveQueue(nextUser.userId)

                const nextNextUser = await queueManager.getCurrentUser()

                if (nextNextUser?.userId) {
                  await postMessage({
                    room,
                    message: `<@uid:${nextNextUser.userId}> you're next up! Please press 'Play Music' within 30 seconds.`
                  })

                  stageLock.userUuid = nextNextUser.userId
                  stageLock.timeout = null
                } else {
                  await postMessage({
                    room,
                    message: `🎵 No more DJs in queue. The stage is open for the next album!`
                  })
                  stageLock.locked = false
                  stageLock.userUuid = null
                  stageLock.timeout = null
                }
              }
            }, 30000)

            const monitor = setInterval(async () => {
              const liveDJs = getCurrentDJUUIDs(roomBot.state)

              for (const djUuid of liveDJs) {
                if (djUuid !== nextUser.userId) {
                  console.log(`[Queue] Booting unauthorized DJ ${djUuid}`)
                  await roomBot.removeDJ(djUuid)
                  await postMessage({
                    room,
                    message: `<@uid:${djUuid}> you're not next up. Please wait for your turn.`
                  })
                }
              }
            }, 1000)

            setTimeout(() => clearInterval(monitor), 30000)
          } else {
            await postMessage({
              room,
              message: `🎵 No one is in the queue. The stage is open to play the next album!`
            })
          }
        } catch (error) {
          console.error('[AlbumTheme] Error during DJ transition:', error)
        }
      }, adjustedDuration)
    }

    // 🎵 Standard track
    if (shouldAnnounceBasic) {
      await postMessage({
        room,
        message:
`🎵 Now playing from *${albumName}*\n🎤 *${artistName}*  
📀 *${trackName}* (Track ${reliableTrackNumber} of ${trackCount})  
📊 ${progressBar}`
      })
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
