import { getRandomAvatarSlug } from '../../database/dbavatars.js'
import {
  getAuthorizedUserToken,
  randomColors,
  runLoggedStaticUserAvatarCommand,
  runStaticUserAvatarCommand,
  runUserPoolCommand
} from './shared.js'
import { updateUserAvatar } from '../../utils/API.js'
import {
  USER_POOL_CONFIGS,
  USER_STATIC_CONFIGS
} from './avatarConfig.js'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function runUserStaticCommand (cfg, senderUuid, room, postMessage) {
  return cfg.logged
    ? runLoggedStaticUserAvatarCommand({ senderUuid, room, postMessage, ...cfg })
    : runStaticUserAvatarCommand({ senderUuid, room, postMessage, ...cfg })
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool commands — pick a random themed avatar
// ─────────────────────────────────────────────────────────────────────────────

export async function handleDinoCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.dino, senderUuid, room, postMessage)
}

export async function handleBouncerCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.bouncer, senderUuid, room, postMessage)
}

export async function handleSpookyCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.spooky, senderUuid, room, postMessage)
}

export async function handleRandomCyberCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.cyber, senderUuid, room, postMessage)
}

export async function handleRandomCosmicCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.cosmic, senderUuid, room, postMessage)
}

export async function handleRandomPajamaCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.pajama, senderUuid, room, postMessage)
}

export async function handleRandomLovableCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.lovable, senderUuid, room, postMessage)
}

export async function handleBearPartyCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.bearparty, senderUuid, room, postMessage)
}

export async function handleWinterCommand (senderUuid, room, postMessage) {
  return runUserPoolCommand(USER_POOL_CONFIGS.winter, senderUuid, room, postMessage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Static commands — equip a specific avatar
// ─────────────────────────────────────────────────────────────────────────────

export async function handleGrimehouseCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.grimehouse, senderUuid, room, postMessage)
}

export async function handleRecordGuyCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.recordguy, senderUuid, room, postMessage)
}

export async function handleJesterCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.jester, senderUuid, room, postMessage)
}

export async function handleJukeboxCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.jukebox, senderUuid, room, postMessage)
}

export async function handleTVguyCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.tvguy, senderUuid, room, postMessage)
}

export async function handlePinkBlanketCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.pinkblanket, senderUuid, room, postMessage)
}

export async function handleGayIanCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.gayian, senderUuid, room, postMessage)
}

export async function handleRoyCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.roy, senderUuid, room, postMessage)
}

export async function handleDuckCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.duck, senderUuid, room, postMessage)
}

export async function handleTeacupCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.teacup, senderUuid, room, postMessage)
}

export async function handleSpaceBearCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.spacebear, senderUuid, room, postMessage)
}

export async function handleWalrusCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.walrus, senderUuid, room, postMessage)
}

export async function handleVibesGuyCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.vibesguy, senderUuid, room, postMessage)
}

export async function handleGayCamCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.gaycam, senderUuid, room, postMessage)
}

export async function handleGayAlexCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.gayalex, senderUuid, room, postMessage)
}

export async function handleFacesCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.faces, senderUuid, room, postMessage)
}

export async function handleAlienCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.alien, senderUuid, room, postMessage)
}

export async function handleAlien2Command (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.alien2, senderUuid, room, postMessage)
}

export async function handleDoDoCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.dodo, senderUuid, room, postMessage)
}

export async function handleDumDumCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.dumdum, senderUuid, room, postMessage)
}

export async function handleFlowerPowerCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.flowerpower, senderUuid, room, postMessage)
}

export async function handleAnonCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.anon, senderUuid, room, postMessage)
}

export async function handleGhostCommand (senderUuid, room, postMessage) {
  return runUserStaticCommand(USER_STATIC_CONFIGS.ghost, senderUuid, room, postMessage)
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone — full random (all avatars, not a themed pool)
// ─────────────────────────────────────────────────────────────────────────────

export async function handleRandomAvatarCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users \uD83C\uDFAD.'
  )
  if (!userToken) return

  const randomAvatar = getRandomAvatarSlug()
  const randomColor = randomColors[Math.floor(Math.random() * randomColors.length)]

  try {
    await updateUserAvatar(userToken, randomAvatar, randomColor)
    if (!randomAvatar) {
      await postMessage({ room, message: 'No avatars available right now \uD83D\uDE2C' })
      return
    }
    await postMessage({ room, message: "You've been randomly avatar-ized! \uD83C\uDFAD" })
  } catch (error) {
    await postMessage({ room, message: 'Failed to update avatar' })
  }
}
