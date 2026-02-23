// src/handlers/aiMentionHandler.js

import { postMessage } from '../libs/cometchat.js'
import { askQuestion, setCurrentSong } from '../libs/ai.js'
import { logger as defaultLogger } from '../utils/logging.js'

import {
  isMentioned,
  stripBotMention,
  normalizeQuestion,
  isSongQuery,
  isAlbumQuery,
  expandSongQuestion,
  expandAlbumQuestion,
  safeAskQuestion,
  checkCooldown
} from '../utils/aiHelpers.js'

// your existing helpers used inside mention flow
import { isLotteryQuestion, extractUserFromText } from '../database/dblotteryquestionparser.js'
import { handleLotteryCheck } from '../database/dblotterymanager.js'

export async function handleAIMention ({
  payload,
  room,
  roomBot,
  startRouletteGame,
  handleBotRandomAvatarCommand,
  setCurrentAlbum, // optional if you have it
  logger = defaultLogger
}) {
  const botUuid = process.env.BOT_USER_UUID
  const chatName = process.env.CHAT_NAME

  if (!payload?.message || !payload?.sender) return false
  if (payload.sender === botUuid) return false
  if (String(payload.message).includes('played')) return false

  if (!isMentioned(payload.message, { botUuid, chatName })) return false

  // anti-spam / cost control
  const cdMs = Number(process.env.AI_MENTION_COOLDOWN_MS ?? 4000)
  const cd = checkCooldown(payload.sender, 'aiMention', cdMs)
  if (!cd.ok) {
    // optionally stay silent instead of nagging
    return true
  }

  const raw = stripBotMention(payload.message, { botUuid, chatName })
  const question = normalizeQuestion(raw)

  logger.info('AI mention received', { from: payload.sender, question: question.slice(0, 240) })

  // --- quick hard-coded one-offs -----------------------------------------
  // (keep these because they’re instant and funny)
  if (question.toLowerCase() === 'you good?') {
    await postMessage({ room, message: "Couldn't be better" })
    return true
  }

  if (question.toLowerCase() === 'hide') {
    try {
      await handleBotRandomAvatarCommand(room, postMessage, process.env.TTL_USER_TOKEN)
    } catch (err) {
      logger.error('Hide command failed', { err: err?.message || err })
      await postMessage({ room, message: 'I tried to hide but tripped over my own code. 🤕' })
    }
    return true
  }

  // DJ invitation
  {
    const ql = question.toLowerCase()
    if (ql.includes('dj with us') || ql.includes('dj with me')) {
      await postMessage({ room, message: "Let's get it" })

      const discoverIdsEnv = process.env.DISCOVER_PLAYLIST_IDS || ''
      let discoverIds = discoverIdsEnv.split(',').map(s => s.trim()).filter(Boolean)
      if (discoverIds.length === 0) {
        discoverIds = [
          '37i9dQZF1DX4JAvHpjipBk',
          '37i9dQZF1DX5trt9i14X7j',
          '37i9dQZF1DWVqfgj8NZEp1'
        ]
      }

      if (typeof roomBot.enableDiscoverDJ === 'function') {
        await roomBot.enableDiscoverDJ(discoverIds)
      }
      await roomBot.addDJ()
      return true
    }

    if (ql.includes('get tf off the stage') || ql.includes('stop djing')) {
      await postMessage({ room, message: 'Damn...alright' })
      await roomBot.removeDJ(botUuid)
      return true
    }

    if (ql.includes('9+10') || ql.includes('9 + 10')) {
      await postMessage({ room, message: '21...are you stoopid?' })
      return true
    }

    if (ql.includes('are you a bot')) {
      await postMessage({ room, message: 'I am not' })
      return true
    }

    if (ql.includes('spin the wheel') || ql.includes('spin that wheel')) {
      await startRouletteGame(payload)
      return true
    }
  }

  // --- lottery intent -----------------------------------------------------
  if (isLotteryQuestion(question.toLowerCase())) {
    const userInput = extractUserFromText(question.toLowerCase())
    if (userInput) {
      await handleLotteryCheck(room, userInput)
    } else {
      await postMessage({ room, message: 'Who do you want me to check?' })
    }
    return true
  }

  // --- song intent --------------------------------------------------------
  if (isSongQuery(question)) {
    const currentSong = roomBot?.currentSong
    if (!currentSong) {
      await postMessage({ room, message: 'No song is currently playing.' })
      return true
    }

    setCurrentSong(currentSong)

    const prompt = expandSongQuestion(question, currentSong)
    const aiReplyText = await safeAskQuestion(prompt, askQuestion, logger)

    await postMessage({ room, message: aiReplyText })
    return true
  }

  // --- album intent -------------------------------------------------------
  if (isAlbumQuery(question)) {
    const currentAlbumName = roomBot?.currentAlbum?.albumName ?? roomBot?.currentSong?.albumName
    const currentArtistName = roomBot?.currentAlbum?.artistName ?? roomBot?.currentSong?.artistName

    if (!currentAlbumName && !currentArtistName) {
      await postMessage({ room, message: 'No album info available for the current track.' })
      return true
    }

    if (typeof setCurrentAlbum === 'function') {
      setCurrentAlbum({ albumName: currentAlbumName, artistName: currentArtistName })
    }

    const prompt = expandAlbumQuestion(question, currentAlbumName, currentArtistName)
    const aiReplyText = await safeAskQuestion(prompt, askQuestion, logger)

    await postMessage({ room, message: aiReplyText })
    return true
  }

  // --- default: allow images OR text --------------------------------------
  try {
    const result = await Promise.race([
      askQuestion(question, {
        onStartImage: async () => {
          await postMessage({ room, message: '🎨 Generating image...' })
        }
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), Number(process.env.AI_TIMEOUT_MS ?? 45_000)))
    ])

    const images = Array.isArray(result?.images)
      ? result.images.filter(u => typeof u === 'string' && u.trim().length > 0)
      : []
    const text = (typeof result?.text === 'string' ? result.text.trim() : '')

    if (images.length > 0) {
      await postMessage({ room, message: text || 'Here’s your image!', images })
      return true
    }

    if (text) {
      await postMessage({ room, message: text })
      return true
    }

    await postMessage({ room, message: 'I’m not sure yet—could you rephrase that?' })
    return true
  } catch (err) {
    logger.error('[AI][default] Error', { err: err?.message || err })
    await postMessage({ room, message: 'My AI brain buffered too long. Try again in a sec. 😅' })
    return true
  }
}