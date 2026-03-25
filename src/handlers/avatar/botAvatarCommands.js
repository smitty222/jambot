import { getRandomAvatarSlug } from '../../database/dbavatars.js'
import { setChatIdentity } from '../../libs/cometchat.js'
import { updateUserAvatar } from '../../utils/API.js'
import {
  randomColors,
  runBotPoolCommand,
  runStaticBotAvatarCommand
} from './shared.js'
import {
  BOT_POOL_CONFIGS,
  BOT_STATIC_CONFIGS
} from './avatarConfig.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function runBotStaticCommand (cfg, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    ...cfg,
    onBeforePostSuccess: () => setChatIdentity({ avatarId: cfg.avatarId, color: cfg.color })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone — full random (no moderator auth, no themed pool)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleBotRandomAvatarCommand (room, postMessage, ttlUserToken) {
  const avatarId = getRandomAvatarSlug()
  const color = randomColors[Math.floor(Math.random() * randomColors.length)]

  const randomReplies = [
    'Feeling fresh \uD83E\uDD16',
    'New look, who dis?',
    'Just changed into something more comfortable...',
    'Style upgraded \u2728',
    'Bot makeover complete!',
    'Shapeshift complete. You never saw me. \uD83D\uDC7B',
    "I'm undercover now. \uD83E\uDD2B",
    'Cloaking protocol activated. \uD83D\uDEF8',
    'Incognito mode: engaged. \uD83D\uDD76\uFE0F',
    'Just blending in with the crowd. \uD83D\uDE0E',
    "They'll never recognize me now. \uD83C\uDF00",
    'Now you see me, now you don\u2019t. \uD83C\uDFA9\u2728'
  ]
  const randomMessage = randomReplies[Math.floor(Math.random() * randomReplies.length)]

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: randomMessage, identity: { avatarId, color } })
  } catch (error) {
    await postMessage({ room, message: `Failed to update bot avatar: ${error.message}` })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool commands — pick a random themed avatar (moderator-auth)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleBotStaffCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotPoolCommand(BOT_POOL_CONFIGS.botstaff, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBotSpookyCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotPoolCommand(BOT_POOL_CONFIGS.botspooky, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBotWinterCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotPoolCommand(BOT_POOL_CONFIGS.botwinter, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

// ─────────────────────────────────────────────────────────────────────────────
// Static commands — equip a specific avatar (moderator-auth)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleBotDinoCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.botdino, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBotDuckCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.botduck, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBotAlienCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.botalien, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBotAlien2Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.botalien2, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBotWalrusCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.botwalrus, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBotPenguinCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.botpenguin, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBot2Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.bot2, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBot1Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.bot1, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}

export async function handleBot3Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  return runBotStaticCommand(BOT_STATIC_CONFIGS.bot3, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken)
}
