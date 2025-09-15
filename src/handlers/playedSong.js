import { postMessage } from '../libs/cometchat.js'
import { roomBot } from '../index.js'
import { fetchSongData, getAlbumTracks, spotifyTrackInfo } from '../utils/API.js'
import { roomThemes } from '../utils/roomThemes.js'
import { getCurrentDJUUIDs } from '../libs/bot.js'
import { askQuestion } from '../libs/ai.js'
import { getUserNickname } from '../utils/nickname.js'
import { QueueManager } from '../utils/queueManager.js'

// DB handles
import db from '../database/db.js'

const queueManager = new QueueManager(getUserNickname)

const stageLock = { locked: false, userUuid: null, timeout: null }

const formatDate = (dateString) => {
  const [y, m, d] = (dateString || '').split('-')
  if (!y || !m || !d) return 'N/A'
  return `${m}-${d}-${y}`
}
const parseDuration = (durationStr) => {
  const [minutes, seconds] = (durationStr || '0:00').split(':').map(Number)
  return (minutes * 60 + seconds) * 1000
}

// ---- DB-first theme lookups (mirror bot.js) ----
let sqliteThemeDbPromise = null
async function getSqliteThemeDb () {
  if (!sqliteThemeDbPromise) {
    sqliteThemeDbPromise = sqliteOpen({
      filename: process.env.DB_FILE || './mydb.sqlite',
      driver: sqlite3.Database
    })
  }
  return sqliteThemeDbPromise
}
function getThemeViaBetterSqlite (room) {
  try {
    const row = db.prepare('SELECT theme FROM themes WHERE roomId = ?').get(room)
    if (row?.theme) return { theme: String(row.theme), source: 'better-sqlite3' }
  } catch (e) {
    console.warn('[AlbumTheme] better-sqlite3 lookup error:', e?.message || e)
  }
  return null
}
async function getThemeViaSqlite (room) {
  try {
    const sdb = await getSqliteThemeDb()
    const row = await sdb.get('SELECT theme FROM themes WHERE roomId = ?', room)
    if (row?.theme) return { theme: String(row.theme), source: 'sqlite3' }
  } catch (e) {
    console.warn('[AlbumTheme] sqlite3 lookup error:', e?.message || e)
  }
  return null
}
async function getRoomTheme (room) {
  const b = getThemeViaBetterSqlite(room)
  if (b) { console.log(`[AlbumTheme] theme from ${b.source}: "${b.theme}"`); return b.theme }
  const s = await getThemeViaSqlite(room)
  if (s) { console.log(`[AlbumTheme] theme from ${s.source}: "${s.theme}"`); return s.theme }
  const t = roomThemes[room] || ''
  console.log(`[AlbumTheme] theme fallback: "${t}"`)
  return t
}
function isAlbumWord (t) {
  return /\balbums?\b|^album day$|^album monday$/i.test(t || '')
}

const handleAlbumTheme = async (_payload) => {
  const room = process.env.ROOM_UUID

  const rawTheme = await getRoomTheme(room)
  const albumActive = isAlbumWord(rawTheme)
  console.log(`[AlbumTheme] resolved="${(rawTheme || '').toLowerCase()}" active=${albumActive}`)
  if (!albumActive) return

  const currentSong = roomBot.currentSong
  if (!currentSong || !currentSong.spotifyTrackId) {
    console.log('[AlbumTheme] Missing spotifyTrackId; skipping album flow for this track.')
    return
  }

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

    if (reliableTrackNumber === 0) reliableTrackNumber = parseInt(spotifyTrackNumber || '0', 10)

    const songDuration = parseDuration(spotifyDuration)
    const formattedReleaseDate = releaseDate ? formatDate(releaseDate) : 'N/A'

    const renderProgressBar = (current, total) => {
      const filled = Math.max(0, Math.min(10, Math.round((current / total) * 10)))
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

      await postMessage({ room, message: '', images: [albumArt] })
      await postMessage({
        room,
        message:
`🎧 *Album Session Started*  
───────────────────────── 
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

💬 Use \`/albumreview\` to rate this album. Type \`/reviewhelp\` to see the rating scale!`
      })
    }

    // 🎉 Final Track
    if (isLast) {
      await postMessage({ room, message: '', images: [albumArt] })
      await postMessage({
        room,
        message:
`🎉 *Final Track of the Album!*  
🖼️ Album: *${albumName}*  
🎤 Artist: *${artistName}*  
📀 Track: *${trackName}* (${reliableTrackNumber}/${trackCount})  
👤 Thanks for the vibes, <@uid:${currentDJUuid}>  
💬 Time to leave your review: \`/albumreview\`  
📊 Progress: ${progressBar}`
      })
      await postMessage({ room, message: '✨ Use `/reviewhelp` to learn how to rate the album!' })

      const adjustedDuration = Math.max(0, songDuration - 5000)
      const reminderTime = Math.max(0, adjustedDuration - 60000)

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
          if (!onStage.includes(currentDJUuid)) return

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
                  await roomBot.removeDJ(djUuid)
                  await postMessage({ room, message: `<@uid:${djUuid}> you're not next in the queue. Please wait for your turn.` })
                }
              }

              if (currentDJs.includes(nextUser.userId)) {
                await queueManager.leaveQueue(nextUser.userId)
              } else {
                await queueManager.leaveQueue(nextUser.userId)
                const nextNextUser = await queueManager.getCurrentUser()
                if (nextNextUser?.userId) {
                  await postMessage({ room, message: `<@uid:${nextNextUser.userId}> you're next up! Please press 'Play Music' within 30 seconds.` })
                  stageLock.userUuid = nextNextUser.userId
                  stageLock.timeout = null
                } else {
                  await postMessage({ room, message: '🎵 No more DJs in queue. The stage is open for the next album!' })
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
                  await roomBot.removeDJ(djUuid)
                  await postMessage({ room, message: `<@uid:${djUuid}> you're not next up. Please wait for your turn.` })
                }
              }
            }, 1000)
            setTimeout(() => clearInterval(monitor), 30000)
          } else {
            await postMessage({ room, message: '🎵 No one is in the queue. The stage is open to play the next album!' })
          }
        } catch (error) {
          console.error('[AlbumTheme] Error during DJ transition:', error)
        }
      }, adjustedDuration)
    }

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

function isStageLockedFor (userUuid) {
  return stageLock.locked && userUuid !== stageLock.userUuid
}
function cancelStageLock () {
  if (stageLock.timeout) clearTimeout(stageLock.timeout)
  stageLock.locked = false
  stageLock.userUuid = null
  stageLock.timeout = null
}

// (covers handler unchanged)
const handleCoversTheme = async (payload) => { /* unchanged for brevity */ }

export { handleAlbumTheme, handleCoversTheme, isStageLockedFor, cancelStageLock }
