import { env } from '../config.js'
import { syncPridePrestige, formatPrestigeUnlockLines } from '../database/dbprestige.js'
import { postMessage } from '../libs/cometchat.js'
import { isUserAuthorized } from '../utils/API.js'
import { logger } from '../utils/logging.js'
import {
  handleBotRandomAvatarCommand,
  handleBotDinoCommand,
  handleBotDuckCommand,
  handleBotAlienCommand,
  handleBotAlien2Command,
  handleBotWalrusCommand,
  handleBotPenguinCommand,
  handleBot1Command,
  handleBot2Command,
  handleBot3Command,
  handleBotSpookyCommand,
  handleBotStaffCommand,
  handleBotWinterCommand
} from './avatar/botAvatarCommands.js'
import {
  handleDinoCommand,
  handleTeacupCommand,
  handleAlienCommand,
  handleAlien2Command,
  handleRoyCommand,
  handleSpookyCommand,
  handleBouncerCommand,
  handleDuckCommand,
  handleRecordGuyCommand,
  handleJukeboxCommand,
  handleJesterCommand,
  handleSpaceBearCommand,
  handleWalrusCommand,
  handleVibesGuyCommand,
  handleFacesCommand,
  handleDoDoCommand,
  handleDumDumCommand,
  handleFlowerPowerCommand,
  handleAnonCommand,
  handleGhostCommand,
  handleGrimehouseCommand,
  handleBearPartyCommand,
  handleWinterCommand,
  handleTVguyCommand,
  handlePinkBlanketCommand,
  handleGayCamCommand,
  handleGayIanCommand,
  handleGayAlexCommand,
  handleRandomPajamaCommand,
  handleRandomAvatarCommand,
  handleRandomCyberCommand,
  handleRandomCosmicCommand,
  handleRandomLovableCommand,
  handleGoblinCommand
} from './avatar/userAvatarCommands.js'
import { handleAddAvatarCommand } from './addAvatar.js'
import { handleRemoveAvatarCommand } from './removeAvatar.js'

const ttlToken = env.ttlUserToken
const roomFallback = env.roomUuid

export const avatarCommandRegistry = {
  botrandom: async ({ room }) => {
    await handleBotRandomAvatarCommand(room, postMessage, ttlToken)
  },
  botdino: async ({ payload, room }) => {
    await handleBotDinoCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botduck: async ({ payload, room }) => {
    await handleBotDuckCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botalien: async ({ payload, room }) => {
    await handleBotAlienCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botalien2: async ({ payload, room }) => {
    await handleBotAlien2Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botwalrus: async ({ payload, room }) => {
    await handleBotWalrusCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botpenguin: async ({ payload, room }) => {
    await handleBotPenguinCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot1: async ({ payload, room }) => {
    await handleBot1Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot2: async ({ payload, room }) => {
    await handleBot2Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  bot3: async ({ payload, room }) => {
    await handleBot3Command(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botalien1: async ({ payload, room }) => {
    await handleBotAlienCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botspooky: async ({ payload, room }) => {
    await handleBotSpookyCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botstaff: async ({ payload, room }) => {
    await handleBotStaffCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  botwinter: async ({ payload, room }) => {
    await handleBotWinterCommand(room, postMessage, isUserAuthorized, payload?.sender, ttlToken)
  },
  dino: async ({ payload, room }) => {
    await handleDinoCommand(payload?.sender, room, postMessage)
  },
  teacup: async ({ payload, room }) => {
    await handleTeacupCommand(payload?.sender, room, postMessage)
  },
  alien: async ({ payload, room }) => {
    await handleAlienCommand(payload?.sender, room, postMessage)
  },
  alien2: async ({ payload, room }) => {
    await handleAlien2Command(payload?.sender, room, postMessage)
  },
  roy: async ({ payload, room }) => {
    await handleRoyCommand(payload?.sender, room, postMessage)
  },
  spooky: async ({ payload, room }) => {
    await handleSpookyCommand(payload?.sender, room, postMessage)
  },
  bouncer: async ({ payload, room }) => {
    await handleBouncerCommand(payload?.sender, room, postMessage)
  },
  duck: async ({ payload, room }) => {
    await handleDuckCommand(payload?.sender, room, postMessage)
  },
  record: async ({ payload, room }) => {
    await handleRecordGuyCommand(payload?.sender, room, postMessage)
  },
  recordguy: async ({ payload, room }) => {
    await handleRecordGuyCommand(payload?.sender, room, postMessage)
  },
  jester: async ({ payload, room }) => {
    await handleJesterCommand(payload?.sender, room, postMessage)
  },
  jukebox: async ({ payload, room }) => {
    await handleJukeboxCommand(payload?.sender, room, postMessage)
  },
  jukeboxguy: async ({ payload, room }) => {
    await handleJukeboxCommand(payload?.sender, room, postMessage)
  },
  spacebear: async ({ payload, room }) => {
    await handleSpaceBearCommand(payload?.sender, room, postMessage)
  },
  walrus: async ({ payload, room }) => {
    await handleWalrusCommand(payload?.sender, room, postMessage)
  },
  vibesguy: async ({ payload, room }) => {
    await handleVibesGuyCommand(payload?.sender, room, postMessage)
  },
  vibeguy: async ({ payload, room }) => {
    await handleVibesGuyCommand(payload?.sender, room, postMessage)
  },
  faces: async ({ payload, room }) => {
    await handleFacesCommand(payload?.sender, room, postMessage)
  },
  dodo: async ({ payload, room }) => {
    await handleDoDoCommand(payload?.sender, room, postMessage)
  },
  dumdum: async ({ payload, room }) => {
    await handleDumDumCommand(payload?.sender, room, postMessage)
  },
  dumbdumb: async ({ payload, room }) => {
    await handleDumDumCommand(payload?.sender, room, postMessage)
  },
  flowerpower: async ({ payload, room }) => {
    await handleFlowerPowerCommand(payload?.sender, room, postMessage)
  },
  flower: async ({ payload, room }) => {
    await handleFlowerPowerCommand(payload?.sender, room, postMessage)
  },
  anon: async ({ payload, room }) => {
    await handleAnonCommand(payload?.sender, room, postMessage)
  },
  anonymous: async ({ payload, room }) => {
    await handleAnonCommand(payload?.sender, room, postMessage)
  },
  randomavatar: async ({ payload, room }) => {
    await handleRandomAvatarCommand(payload?.sender, room, postMessage)
  },
  randomcyber: async ({ payload, room }) => {
    await handleRandomCyberCommand(payload?.sender, room, postMessage)
  },
  cyber: async ({ payload, room }) => {
    await handleRandomCyberCommand(payload?.sender, room, postMessage)
  },
  ghost: async ({ payload, room }) => {
    await handleGhostCommand(payload?.sender, room, postMessage)
  },
  goblin: async ({ payload, room }) => {
    await handleGoblinCommand(payload?.sender, room, postMessage)
  },
  randomcosmic: async ({ payload, room }) => {
    await handleRandomCosmicCommand(payload?.sender, room, postMessage)
  },
  cosmic: async ({ payload, room }) => {
    await handleRandomCosmicCommand(payload?.sender, room, postMessage)
  },
  randomlovable: async ({ payload, room }) => {
    await handleRandomLovableCommand(payload?.sender, room, postMessage)
  },
  lovable: async ({ payload, room }) => {
    await handleRandomLovableCommand(payload?.sender, room, postMessage)
  },
  grime: async ({ payload, room }) => {
    await handleGrimehouseCommand(payload?.sender, room, postMessage)
  },
  bearparty: async ({ payload, room }) => {
    await handleBearPartyCommand(payload?.sender, room, postMessage)
  },
  bear: async ({ payload, room }) => {
    await handleBearPartyCommand(payload?.sender, room, postMessage)
  },
  winter: async ({ payload, room }) => {
    await handleWinterCommand(payload?.sender, room, postMessage)
  },
  tvguy: async ({ payload, room }) => {
    await handleTVguyCommand(payload?.sender, room, postMessage)
  },
  pinkblanket: async ({ payload, room }) => {
    await handlePinkBlanketCommand(payload?.sender, room, postMessage)
  },
  blanket: async ({ payload, room }) => {
    await handlePinkBlanketCommand(payload?.sender, room, postMessage)
  },
  gaycam: async ({ payload, room }) => {
    await handleGayCamCommand(payload?.sender, room, postMessage)
    const prestige = syncPridePrestige(payload?.sender)
    if (prestige.badges.length) {
      const lines = formatPrestigeUnlockLines(prestige)
      if (lines.length) await postMessage({ room, message: lines.join('\n') })
    }
  },
  gayian: async ({ payload, room }) => {
    await handleGayIanCommand(payload?.sender, room, postMessage)
    const prestige = syncPridePrestige(payload?.sender)
    if (prestige.badges.length) {
      const lines = formatPrestigeUnlockLines(prestige)
      if (lines.length) await postMessage({ room, message: lines.join('\n') })
    }
  },
  gayalex: async ({ payload, room }) => {
    await handleGayAlexCommand(payload?.sender, room, postMessage)
    const prestige = syncPridePrestige(payload?.sender)
    if (prestige.badges.length) {
      const lines = formatPrestigeUnlockLines(prestige)
      if (lines.length) await postMessage({ room, message: lines.join('\n') })
    }
  },
  pajama: async ({ payload, room }) => {
    await handleRandomPajamaCommand(payload?.sender, room, postMessage)
  },
  addavatar: async ({ payload }) => {
    const roomId = payload?.room ?? roomFallback
    try {
      await handleAddAvatarCommand(
        { sender: payload?.sender, message: payload?.message, room: roomId },
        postMessage
      )
    } catch (err) {
      logger.error('[router]/addavatar failed', { err: err?.message || err, roomId })
      await postMessage({ room: roomId, message: '\u274C /addavatar crashed \u2014 check logs.' })
    }
  },
  removeavatar: async ({ payload }) => {
    const roomId = payload?.room ?? roomFallback
    await handleRemoveAvatarCommand(
      { sender: payload?.sender, message: payload?.message, room: roomId },
      postMessage
    )
  }
}
