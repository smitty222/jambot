import { postMessage } from '../libs/cometchat.js'
import { getCurrentDJ, getCurrentDJUUIDs } from '../libs/bot.js'
import { markUser, getMarkedUser } from '../utils/removalQueue.js'
import { startPaidSpotlight } from './spotlight.js'
import { getUserWallet, removeFromUserWallet } from '../database/dbwalletmanager.js'
import { isUserAuthorized } from '../utils/API.js'
import { decoratedMention, syncWhiskeyPrestige } from '../database/dbprestige.js'

export function createRoomFunHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    getCurrentDJUUIDs: getDjUuids = getCurrentDJUUIDs,
    getCurrentDJ: getDj = getCurrentDJ,
    getMarkedUser: getMarked = getMarkedUser,
    markUser: mark = markUser,
    startPaidSpotlight: startSpotlight = startPaidSpotlight,
    getUserWallet: getWallet = getUserWallet,
    removeFromUserWallet: removeWallet = removeFromUserWallet,
    isUserAuthorized: isAuthorized = isUserAuthorized
  } = deps
  const stagedRemovals = deps.usersToBeRemoved || Object.create(null)

  return {
    djbeers: async ({ payload, room, state }) => {
      const senderUUID = payload.sender
      const currentDJUUIDs = getDjUuids(state)

      if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
        await post({
          room,
          message: `${decoratedMention(senderUUID)}, there is no DJ currently playing.`
        })
        return
      }

      const mentionText = currentDJUUIDs.map(uuid => decoratedMention(uuid)).join(' and ')
      await post({
        room,
        message: `${decoratedMention(senderUUID)} gives ${mentionText} two ice cold beers!! 🍺🍺`
      })
    },

    djbeer: async ({ payload, room, state }) => {
      const senderUUID = payload.sender
      const currentDJUUIDs = getDjUuids(state)

      if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
        await post({
          room,
          message: `${decoratedMention(senderUUID)}, there is no DJ currently playing.`
        })
        return
      }

      await post({
        room,
        message: `${decoratedMention(senderUUID)} gives ${decoratedMention(currentDJUUIDs[0])} an ice cold beer! 🍺`
      })
    },

    getdjdrunk: async ({ payload, room, state }) => {
      const senderUUID = payload.sender
      const currentDJUUIDs = getDjUuids(state)

      if (!currentDJUUIDs || currentDJUUIDs.length === 0) {
        await post({
          room,
          message: `${decoratedMention(senderUUID)}, there is no DJ currently playing.`
        })
        return
      }

      await post({
        room,
        message: `${decoratedMention(senderUUID)} gives ${decoratedMention(currentDJUUIDs[0])} a million ice cold beers!!! 🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺🍺`
      })
      syncWhiskeyPrestige(senderUUID)
    },

    jump: async ({ roomBot }) => {
      await roomBot.playOneTimeAnimation('jump', process.env.ROOM_UUID, process.env.BOT_USER_UUID)
    },

    like: async ({ roomBot }) => {
      await roomBot.voteOnSong(process.env.ROOM_UUID, { like: true }, process.env.BOT_USER_UUID)
    },

    dislike: async ({ payload, room, roomBot, ttlUserToken, getUserNickname }) => {
      const senderUUID = payload.sender
      const nickname = await getUserNickname(senderUUID)
      const ok = await isAuthorized(senderUUID, ttlUserToken)

      if (!ok) {
        await post({
          room,
          message: `Don't tell me what to do, @${nickname}`
        })
        return
      }

      await roomBot.voteOnSong(process.env.ROOM_UUID, { like: false }, process.env.BOT_USER_UUID)
    },

    dive: async ({ payload, room, state, roomBot, getSenderNickname }) => {
      const userUuid = payload.sender
      const senderName = await getSenderNickname(userUuid)
      const currentDJ = getDj(state)

      if (userUuid === currentDJ) {
        if (getMarked() === userUuid) {
          await post({
            room,
            message: `${senderName}, you're already set to dive after your current song. 🫧`
          })
          return
        }

        mark(userUuid)
        await post({
          room,
          message: `${senderName}, you'll dive off stage after this track. 🌊`
        })
        return
      }

      await roomBot.removeDJ(userUuid)
    },

    escortme: async ({ payload, room, getSenderNickname, usersToBeRemoved: activeRemovals }) => {
      const senderUUID = payload.sender
      const senderName = await getSenderNickname(senderUUID)
      const removals = activeRemovals || stagedRemovals

      if (removals[senderUUID]) {
        await post({
          room,
          message: `${senderName}, you're already set to be removed after your current song.`
        })
        return
      }

      removals[senderUUID] = true
      await post({
        room,
        message: `${senderName}, you will be removed from the stage after your next song ends.`
      })
    },

    spotlight: async ({ payload, room, state, roomBot, getSenderNickname }) => {
      await startSpotlight({
        payload,
        room,
        state,
        roomBot,
        postMessage: post,
        getSenderNickname,
        getUserWallet: getWallet,
        removeFromUserWallet: removeWallet,
        cost: 1
      })
    }
  }
}
