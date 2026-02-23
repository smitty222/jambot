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

// ───────────────────────────────────────────────────────────
// Roast helpers (short + safe)
// ───────────────────────────────────────────────────────────

function isRoastIntent (q) {
  const s = String(q || '').trim().toLowerCase()
  return /^roast\b/.test(s) || /\broast me\b/.test(s)
}

function extractRoastTopic (q) {
  const m = String(q || '').match(/\babout\b\s+(.+)$/i)
  if (!m?.[1]) return null
  return m[1].trim()
}

function isBannedRoastTopic (topic) {
  const t = String(topic || '').toLowerCase()

  // Appearance/body (including weight) — disallowed
  if (/\b(weight|fat|skinny|obese|body|looks|ugly|pretty|face|nose|teeth|bald|hairline|height)\b/.test(t)) return true

  // Protected traits (broad filter) — disallowed
  if (/\b(race|religion|jewish|muslim|christian|black|white|asian|latino|hispanic|gay|lesbian|bi|trans|gender|disabled|autis)\b/.test(t)) return true

  // Violence/threats — disallowed
  if (/\b(kill|die|hurt|assault|rape|dox|swat)\b/.test(t)) return true

  return false
}

function extractRoastTarget (rawQuestion, payload) {
  const q = String(rawQuestion || '').trim()

  // "roast me" or just "roast" -> sender
  if (/\broast me\b/i.test(q) || /^roast\s*$/i.test(q)) {
    return { targetMention: `<@uid:${payload?.sender}>` }
  }

  // Prefer CometChat uid mention token
  const m = q.match(/<@uid:([a-zA-Z0-9-]+)>/)
  if (m?.[1]) {
    return { targetMention: `<@uid:${m[1]}>` }
  }

  // Try @name (not guaranteed to resolve to a uid mention, but fine as text)
  const at = q.match(/@([A-Za-z0-9_][A-Za-z0-9_\- ]{0,30})/)
  if (at?.[1]) {
    return { targetMention: `@${at[1].trim()}` }
  }

  // Default to sender
  return { targetMention: `<@uid:${payload?.sender}>` }
}

function buildRoastPrompt ({ targetMention, roomName, roastTopic, maxChars = 120 }) {
  const topicLine = roastTopic ? `Use this safe topic: ${roastTopic}\n` : ''

  return (
    `You are a playful roast comic in a friendly music listening room.\n` +
    `Target: ${targetMention}\n` +
    (roomName ? `Room: ${roomName}\n` : '') +
    topicLine +
    `Rules:\n` +
    `- Brief 1 to 3 sentences.\n` +
    `- Max ${maxChars} characters.\n` +
    `- Lighthearted and not actually mean.\n` +
    `- No slurs, no threats, no hate.\n` +
    `- Do NOT mention or insult protected traits (race, religion, nationality, gender/sex, sexuality, disability, etc.).\n` +
    `- No appearance/body insults (weight, face, etc.).\n` +
    `- Focus on harmless habits: music taste, aux behavior, taking forever to pick a song, emoji spam.\n` +
    `- End with 😉 or 🎧.\n\n` +
    `Write the roast now.`
  )
}

function clampRoast (text, maxChars = 300) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= maxChars) return t

  const cut = t.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()
  return trimmed + '…'
}

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
  if (!cd.ok) return true

  const raw = stripBotMention(payload.message, { botUuid, chatName })
  const question = normalizeQuestion(raw)

  logger.info('AI mention received', { from: payload.sender, question: question.slice(0, 240) })

  // ───────────────────────────────────────────────────────────
  // ROAST (NEW)
  // Examples:
  //  - "@allen roast me"
  //  - "@allen roast <@uid:...>"
  //  - "@allen roast @afield about always hogging the aux"
  // ───────────────────────────────────────────────────────────
  if (isRoastIntent(question)) {
    const roastCdMs = Number(process.env.AI_ROAST_COOLDOWN_MS ?? 12_000)
    const rcd = checkCooldown(payload.sender, 'aiRoast', roastCdMs)
    if (!rcd.ok) {
      await postMessage({ room, message: '😂 gimme a sec… I’m cooking.' })
      return true
    }

    const roastTopic = extractRoastTopic(question)
    if (roastTopic && isBannedRoastTopic(roastTopic)) {
      await postMessage({
        room,
        message:
          "I can’t roast someone about appearance or personal traits. Give me a harmless topic like their music taste, aux behavior, or emoji spam 😅🎧"
      })
      return true
    }

    const maxChars = Number(process.env.AI_ROAST_MAX_CHARS ?? 120)
    const maxTokens = Number(process.env.AI_ROAST_MAX_TOKENS ?? 60)
    const temperature = Number(process.env.AI_ROAST_TEMP ?? 0.95)

    const { targetMention } = extractRoastTarget(question, payload)
    const prompt = buildRoastPrompt({
      targetMention,
      roomName: roomBot?.roomName,
      roastTopic,
      maxChars
    })

    const result = await askQuestion(prompt, { maxTokens, temperature })
    const text = clampRoast(result?.text, maxChars)

    await postMessage({
      room,
      message: text || `${targetMention} you roast-proof today 😭🎧`
    })
    return true
  }

  // --- quick hard-coded one-offs -----------------------------------------
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

    // keep for backwards compat (ai.js can use this as fallback context)
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

  // --- default: TEXT-ONLY (image generation disabled in ai.js) ------------
  try {
    const result = await Promise.race([
      askQuestion(question),
      new Promise((_, rej) => setTimeout(() => rej(new Error('AI_TIMEOUT')), Number(process.env.AI_TIMEOUT_MS ?? 45_000)))
    ])

    const text = (typeof result?.text === 'string' ? result.text.trim() : '')

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