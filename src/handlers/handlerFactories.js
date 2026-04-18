import { logger } from '../utils/logging.js'
import { decoratedMention, syncMusicCriticPrestige, formatPrestigeUnlockLines } from '../database/dbprestige.js'

export function createSlotsRegistryHandler (deps = {}) {
  const {
    postMessage,
    handleSlotsCommand,
    buildSlotsInfoMessage
  } = deps

  return async function slotsRegistryHandler ({ payload, room }) {
    const parts = (payload?.message || '').trim().split(/\s+/)
    const userUUID = payload?.sender

    let arg = ''
    if (parts.length > 1) {
      arg = String(parts[1] || '').trim().toLowerCase()
    }

    if (
      arg === 'info' ||
      arg === 'help' ||
      arg === 'bonus' ||
      arg === 'free' ||
      arg === 'stats' ||
      arg === 'effective' ||
      arg === 'eff' ||
      arg === 'lifetime' ||
      arg === 'life'
    ) {
      if (arg === 'info' || arg === 'help') {
        await postMessage({ room, message: buildSlotsInfoMessage() })
        return
      }
      const response = await handleSlotsCommand(userUUID, arg)
      await postMessage({ room, message: response })
      return
    }

    let betAmount = 1
    if (arg) {
      const amt = parseFloat(arg)
      if (!Number.isFinite(amt) || amt <= 0) {
        await postMessage({ room, message: 'Please provide a valid bet amount.' })
        return
      }
      betAmount = amt
    }

    const response = await handleSlotsCommand(userUUID, betAmount)
    await postMessage({ room, message: response })
  }
}

export function createMlbScoresCommandHandler (deps = {}) {
  return createSportsScoresCommandHandler({
    commandName: 'MLB',
    errorTag: 'mlb',
    ...deps
  })
}

export function createSportsScoresCommandHandler (deps = {}) {
  const {
    postMessage,
    getScores,
    getMLBScores,
    commandName = 'Sports',
    errorTag = 'sports'
  } = deps
  const fetchScores = getScores || getMLBScores

  return async function handleSportsScoresCommand ({ payload, room }) {
    const parts = String(payload?.message || '').trim().split(/\s+/)
    const requestedDate = parts[1]

    try {
      const response = await fetchScores(requestedDate)
      await postMessage({ room, message: response })
    } catch (err) {
      logger.error(`[${errorTag}] Error fetching scores`, { err: err?.message || err, requestedDate })
      await postMessage({
        room,
        message: `There was an error fetching ${commandName} scores. Please try again later.`
      })
    }
  }
}

export function createTipCommandHandler (deps = {}) {
  const {
    postMessage,
    getCurrentDJUUIDs,
    parseTipAmount,
    getUserWallet,
    addOrUpdateUser,
    transferTip,
    getSenderNickname,
    randomTipGif
  } = deps

  return async function handleTipCommand ({ payload, room, state }) {
    try {
      const senderUUID = payload?.sender
      const parts = String(payload?.message || '').trim().split(/\s+/)

      if (parts.length < 2) {
        await postMessage({ room, message: 'Usage: /tip <amount>' })
        return
      }

      const rawAmountStr = parts.slice(1).join(' ')
      if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(rawAmountStr)) {
        await postMessage({ room, message: 'Please specify a valid dollar amount with up to 2 decimal places (e.g., /tip 5 or /tip 2.50).' })
        return
      }

      const amount = parseTipAmount(rawAmountStr)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
        await postMessage({ room, message: 'Tip amount must be between 0 and 10000 dollars.' })
        return
      }

      const currentDJUUIDs = getCurrentDJUUIDs(state)
      if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
        await postMessage({ room, message: `${decoratedMention(senderUUID)}, there is no DJ currently playing.` })
        return
      }

      const recipientUUID = currentDJUUIDs[0]
      if (!recipientUUID || recipientUUID === senderUUID) {
        await postMessage({ room, message: 'You cannot tip yourself.' })
        return
      }

      const balance = await getUserWallet(senderUUID)
      const numericBalance = Number(balance) || 0
      if (!Number.isFinite(numericBalance) || numericBalance < amount) {
        await postMessage({ room, message: `Insufficient funds. Your balance is $${numericBalance.toFixed(2)}.` })
        return
      }

      try {
        await addOrUpdateUser(recipientUUID)
        transferTip({ fromUuid: senderUUID, toUuid: recipientUUID, amount })
      } catch (err) {
        if (err?.message === 'INSUFFICIENT_FUNDS') {
          await postMessage({ room, message: `Insufficient funds. Your balance is $${numericBalance.toFixed(2)}.` })
        } else {
          logger.error('[tip] Transfer error', { err: err?.message || err, senderUUID, recipientUUID, amount })
          await postMessage({ room, message: 'Could not complete the tip. Your funds were returned.' })
        }
        return
      }

      const fromName = await getSenderNickname(senderUUID).catch(() => decoratedMention(senderUUID))
      const toMention = decoratedMention(recipientUUID)
      const gif = randomTipGif()

      await postMessage({
        room,
        message: `💸 ${fromName} tipped $${amount.toFixed(2)} to ${toMention}!`
      })
      await postMessage({ room, message: '', images: [gif] })
    } catch (error) {
      logger.error('[tip] Error handling command', { err: error?.message || error })
      await postMessage({ room, message: 'An error occurred processing the tip.' })
    }
  }
}

export function createSongReviewCommandHandler (deps = {}) {
  const {
    postMessage,
    getSenderNickname,
    saveSongReview,
    getActiveSong,
    parseReviewRating,
    mentionForUser
  } = deps

  return async function handleSongReviewCommand ({ payload, room, roomBot, commandName = 'songreview' }) {
    const sender = payload?.sender
    const rating = parseReviewRating(commandName, payload?.message)

    if (!Number.isFinite(rating) || rating < 1 || rating > 10) {
      try {
        const nick = await getSenderNickname(sender)
        await postMessage({
          room,
          message: `${nick} please enter a number between 1 and 10 (one decimal allowed) to review the song.`
        })
      } catch {
        await postMessage({
          room,
          message: 'Please enter a number between 1 and 10 (one decimal allowed) to review the song.'
        })
      }
      return
    }

    const activeSong = getActiveSong(roomBot)
    const song = activeSong
      ? {
          songId: activeSong.songId ?? null,
          trackName: activeSong.trackName,
          artistName: activeSong.artistName,
          albumName: activeSong.albumName ?? null
        }
      : null

    if (!song) {
      await postMessage({ room, message: 'No song is currently playing. Try again in a moment.' })
      return
    }

    try {
      const result = await saveSongReview({
        currentSong: song,
        rating,
        userId: sender
      })

      if (result?.success === true) {
        const nick = await getSenderNickname(sender).catch(() => mentionForUser(sender))
        await postMessage({
          room,
          message: `${nick} thanks! Your ${rating.toFixed(1)}/10 song review has been saved.`
        })
        const criticPrestige = syncMusicCriticPrestige({ userUUID: sender })
        const criticLines = formatPrestigeUnlockLines(criticPrestige)
        if (criticLines.length) {
          await postMessage({ room, message: `<@uid:${sender}>\n${criticLines.join('\n')}` })
        }
        return
      }

      if (result?.reason === 'duplicate') {
        const nick = await getSenderNickname(sender).catch(() => mentionForUser(sender))
        await postMessage({ room, message: `${nick} you've already reviewed this song.` })
        return
      }

      if (result?.reason === 'not_found') {
        await postMessage({ room, message: 'Song not found in stats.' })
        return
      }

      if (result?.reason === 'bad_input') {
        await postMessage({ room, message: 'That rating looks off. Please use 1-10 (one decimal allowed).' })
        return
      }

      await postMessage({ room, message: 'Couldn’t save your review, please try again later.' })
    } catch (e) {
      logger.error('[songreview] save error', { err: e?.message || e, sender })
      await postMessage({ room, message: 'Couldn’t save your review, please try again later.' })
    }
  }
}
