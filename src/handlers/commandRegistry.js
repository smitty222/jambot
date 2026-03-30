// src/handlers/commandRegistry.js
//
// Central wiring layer: imports handler modules and registers them on the
// command registry. Each command group lives in its own focused file; this
// file is purely responsible for connecting them to the dispatcher.

import { postMessage } from '../libs/cometchat.js'
import { env } from '../config.js'
import { logger } from '../utils/logging.js'
import { resolveDispatchCommand as resolveDispatchCommandBase } from './commandRouting.js'
import { dispatchWithRegistry } from './dispatchCore.js'
import { createSlotsRegistryHandler, buildSlotsInfoMessage } from './slotsRegistryHandler.js'
import { avatarCommandRegistry } from './avatarCommandRegistry.js'
import { readSongBlacklist, writeSongBlacklist } from '../utils/songBlacklist.js'

// Game handlers
import { handleCryptoCommand } from './crypto.js'
import {
  startRouletteGame,
  handleRouletteBet,
  rouletteGameActive
} from './roulette.js'

// Lottery
import {
  handleLotteryCommand,
  handleTopLotteryStatsCommand,
  handleSingleNumberQuery
} from '../database/dblotterymanager.js'

// Wallet / economy
import {
  handleBalanceCommand,
  handleCareerCommand,
  handleGetWalletCommand
} from './walletCommands.js'
import {
  handleCheckBalanceCommand,
  handleBankrollCommand,
  handleTipCommand
} from './walletCommandExtras.js'

// Sports
import {
  handleSportsCommand,
  handleMlbScoresCommand,
  handleNhlScoresCommand,
  handleNbaScoresCommand,
  handleNcaabScoresCommand,
  handleNflScoresCommand,
  handleOddsCommand,
  handleMlbOddsCommand,
  handleSportsBetCommand,
  handleResolveBetsCommand,
  handleSportsInfoCommand,
  handleMyBetsCommand,
  handleOpenBetsCommand
} from './sportsCommands.js'
import { handleMadnessCommand } from './marchMadnessCommands.js'

// Music review
import {
  handleReviewHelpCommand,
  handleSongReviewCommand,
  handleTopSongsCommand,
  handleMyTopSongsCommand,
  handleTopAlbumsCommand,
  handleMyTopAlbumsCommand,
  handleRatingCommand,
  handleAlbumReviewCommand,
  handleSongCommand,
  handleSongStatsCommand,
  handleMostPlayedCommand,
  handleTopLikedCommand,
  handleAlbumCommand,
  handleArtCommand,
  handleScoreCommand
} from './musicReviewCommands.js'

// Suggestions
import { handleSuggestSongsCommand } from './suggestionCommands.js'

// Factory-created handler groups
import { createModControlHandlers } from './modControlCommands.js'
import { createRoomUtilityHandlers } from './roomUtilityCommands.js'
import { createRoomFunHandlers } from './roomFunCommands.js'
import { createSecretFunHandlers } from './secretFunCommands.js'
import { createQueuePlaylistHandlers } from './queuePlaylistCommands.js'
import { createReactionHandlers } from './reactionCommands.js'
import { createAlbumManagementHandlers } from './albumManagementCommands.js'
import { createSpotifyQueueHandlers } from './spotifyQueueCommands.js'
import { createPrestigeHandlers } from './prestigeCommands.js'
import { createEconomyLeaderboardHandlers } from './economyLeaderboardCommands.js'

// Misc utilities
import { getSenderNickname } from '../utils/helpers.js'
import { usersToBeRemoved } from '../utils/usersToBeRemoved.js'
import { isUserAuthorized } from '../utils/API.js'

function createLazyHandlerLoader (loadFactory) {
  let handlersPromise = null
  return async function getHandlers () {
    if (!handlersPromise) {
      handlersPromise = loadFactory()
    }
    return handlersPromise
  }
}

const getMiscCommandHandlers = createLazyHandlerLoader(async () => {
  const { createMiscCommandHandlers } = await import('./miscCommandHandlers.js')
  return createMiscCommandHandlers()
})

const getBlackjackHandlers = createLazyHandlerLoader(async () => {
  const { createBlackjackHandlers } = await import('./blackjackCommands.js')
  return createBlackjackHandlers()
})

// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------

const commandRegistry = {
  // 🎰 Slots
  slots: createSlotsRegistryHandler(),
  slotinfo: async ({ room }) => {
    await postMessage({ room, message: buildSlotsInfoMessage() })
  },

  // 🎲 Roulette
  roulette: async ({ payload, room, args }) => {
    const trimmed = (args || '').trim()

    if (/^start\b/i.test(trimmed)) {
      if (rouletteGameActive) {
        await postMessage({
          room,
          message: ' A roulette game is already active! Please wait for it to finish.'
        })
        return
      }
      await startRouletteGame(payload)
      return
    }

    await postMessage({
      room,
      message:
        ' Welcome to Roulette! Use `/roulette start` to begin.\n\n' +
        ' Place bets using:\n' +
        '- `/red <amount>` or `/black <amount>`\n' +
        '- `/odd <amount>` or `/even <amount>`\n' +
        '- `/high <amount>` or `/low <amount>`\n' +
        '- `/number <number> <amount>` or `/<number> <amount>`\n' +
        '- `/dozen <1|2|3> <amount>`\n\n' +
        ' Use `/balance` to check your wallet.\n' +
        ' Use `/bets` to see all current bets.'
    })
  },

  bets: async ({ room }) => {
    if (!rouletteGameActive) {
      await postMessage({ room, message: 'No active roulette game.' })
    }
  },

  red: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  black: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  green: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  odd: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  even: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  high: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  low: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  number: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },
  dozen: async ({ payload }) => { if (rouletteGameActive) await handleRouletteBet(payload) },

  // 🎰 Lottery
  lottery: async ({ payload, room }) => {
    try {
      const gifUrl =
        'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMm11bGZ0M3RraXg5Z3Z4ZzZpNjU4ZDR4Y2QwMzc0NWwyaWFlNWU4byZlcD12MV9naWZzX3NlYXJjaCZjdD1n/Ps8XflhsT5EVa/giphy.gif'
      await postMessage({ room, message: '', images: [gifUrl] })
    } catch (err) {
      logger.error('Error sending lottery GIF:', err?.message || err)
    }
    await handleLotteryCommand(payload)
  },
  lottostats: async ({ room }) => {
    await handleTopLotteryStatsCommand(room)
  },
  lotto: async ({ payload, room }) => {
    await handleSingleNumberQuery(room, payload.message)
  },

  // 💰 Wallet / economy
  balance: async ({ payload, room }) => {
    await handleBalanceCommand({ payload, room })
  },
  bankroll: async ({ room }) => {
    await handleBankrollCommand({ room })
  },
  career: async ({ payload, room }) => {
    await handleCareerCommand({ payload, room })
  },
  checkbalance: async ({ payload, room }) => {
    await handleCheckBalanceCommand({ payload, room })
  },
  getwallet: async ({ payload, room }) => {
    await handleGetWalletCommand({ payload, room })
  },
  tip: async ({ payload, room, state }) => {
    await handleTipCommand({ payload, room, state })
  },
  suggestsongs: async ({ room }) => {
    await handleSuggestSongsCommand({ room })
  },

  // 🏅 Sports
  sports: async ({ payload, room }) => { await handleSportsCommand({ payload, room }) },
  madness: async ({ payload, room }) => { await handleMadnessCommand({ payload, room }) },
  mlb: async ({ payload, room }) => { await handleMlbScoresCommand({ payload, room }) },
  nhl: async ({ payload, room }) => { await handleNhlScoresCommand({ payload, room }) },
  nba: async ({ payload, room }) => { await handleNbaScoresCommand({ payload, room }) },
  ncaab: async ({ payload, room }) => { await handleNcaabScoresCommand({ payload, room }) },
  nfl: async ({ payload, room }) => { await handleNflScoresCommand({ payload, room }) },
  odds: async ({ payload, room }) => { await handleOddsCommand({ payload, room }) },
  mlbodds: async ({ room }) => { await handleMlbOddsCommand({ room }) },
  sportsbet: async ({ payload, room }) => { await handleSportsBetCommand({ payload, room }) },
  mybets: async ({ payload, room }) => { await handleMyBetsCommand({ payload, room }) },
  openbets: async ({ payload, room }) => { await handleOpenBetsCommand({ payload, room }) },
  resolvebets: async ({ payload, room }) => { await handleResolveBetsCommand({ payload, room }) },
  sportsinfo: async ({ payload, room }) => { await handleSportsInfoCommand({ payload, room }) },

  // 🎵 Music review
  reviewhelp: async ({ room }) => { await handleReviewHelpCommand({ room }) },
  review: async ({ payload, room, roomBot }) => {
    await handleSongReviewCommand({ payload, room, roomBot, commandName: 'review' })
  },
  songreview: async ({ payload, room, roomBot }) => {
    await handleSongReviewCommand({ payload, room, roomBot, commandName: 'songreview' })
  },
  topsongs: async ({ room }) => { await handleTopSongsCommand({ room }) },
  mytopsongs: async ({ payload, room }) => { await handleMyTopSongsCommand({ payload, room }) },
  topalbums: async ({ room }) => { await handleTopAlbumsCommand({ room }) },
  mytopalbums: async ({ payload, room }) => { await handleMyTopAlbumsCommand({ payload, room }) },
  rating: async ({ room, roomBot }) => { await handleRatingCommand({ room, roomBot }) },
  albumreview: async ({ payload, room, roomBot }) => {
    await handleAlbumReviewCommand({ payload, room, roomBot })
  },
  song: async ({ room, roomBot }) => { await handleSongCommand({ room, roomBot }) },
  stats: async ({ room, roomBot }) => { await handleSongStatsCommand({ room, roomBot }) },
  mostplayed: async ({ room }) => { await handleMostPlayedCommand({ room }) },
  topliked: async ({ room }) => { await handleTopLikedCommand({ room }) },
  album: async ({ room, roomBot }) => { await handleAlbumCommand({ room, roomBot }) },
  art: async ({ room, roomBot }) => { await handleArtCommand({ room, roomBot }) },
  score: async ({ room, roomBot }) => { await handleScoreCommand({ room, roomBot }) },

  // 💰 Crypto
  crypto: async ({ payload, room, args }) => {
    await handleCryptoCommand({ payload, room, args })
  }
}

let knownCommandNames = new Set(Object.keys(commandRegistry))

function extendCommandRegistry (entries) {
  Object.assign(commandRegistry, entries)
  knownCommandNames = new Set(Object.keys(commandRegistry))
}

// ---------------------------------------------------------------------------
// Register all handler groups
// ---------------------------------------------------------------------------

const modControlHandlers = createModControlHandlers()
const roomUtilityHandlers = createRoomUtilityHandlers()
const roomFunHandlers = createRoomFunHandlers()
const secretFunHandlers = createSecretFunHandlers()
const reactionHandlers = createReactionHandlers()
const queuePlaylistHandlers = createQueuePlaylistHandlers({
  addDollarsByUUID: async (...args) => {
    const { addDollarsByUUID } = await import('../database/dbwalletmanager.js')
    return addDollarsByUUID(...args)
  },
  readBlacklistFile: readSongBlacklist,
  writeBlacklistFile: writeSongBlacklist
})

extendCommandRegistry({
  // Avatar commands (all managed in avatarCommandRegistry.js)
  ...avatarCommandRegistry,

  // Album management
  ...createAlbumManagementHandlers(),

  // Spotify search & queue
  ...createSpotifyQueueHandlers(),

  // /spotify link — alias for /spotifylink
  spotify: async ({ payload, room, args, ttlUserToken }) => {
    const sub = (args || '').trim().toLowerCase()
    if (sub === 'link') {
      await commandRegistry.spotifylink({ payload, room, ttlUserToken })
    } else {
      await postMessage({ room, message: 'Usage: `/spotify link` — send yourself a Spotify account link.' })
    }
  },

  // Prestige / profile
  ...createPrestigeHandlers(),

  // Economy & leaderboards
  ...createEconomyLeaderboardHandlers(),

  // Blackjack (lazy-loaded)
  blackjack: async ({ payload, room, args }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.blackjack({ payload, room, args })
  },
  bj: async ({ payload, room, args }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.bj({ payload, room, args })
  },
  join: async ({ payload, room }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.join({ payload, room })
  },
  bet: async ({ payload, room, args }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.bet({ payload, room, args })
  },
  hit: async ({ payload, room }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.hit({ payload, room })
  },
  stand: async ({ payload, room }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.stand({ payload, room })
  },
  double: async ({ payload, room }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.double({ payload, room })
  },
  surrender: async ({ payload, room }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.surrender({ payload, room })
  },
  split: async ({ payload, room }) => {
    const blackjackHandlers = await getBlackjackHandlers()
    await blackjackHandlers.split({ payload, room })
  },

  // Misc commands (lazy-loaded)
  theme: async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.theme({ payload, room })
  },
  settheme: async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.settheme({ payload, room })
  },
  removetheme: async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.removetheme({ payload, room })
  },
  lottowinners: async ({ room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.lottowinners({ room })
  },
  jackpot: async ({ room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.jackpot({ room })
  },
  triviastart: async ({ room, args }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.triviastart({ room, args })
  },
  triviaend: async ({ room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.triviaend({ room })
  },
  trivia: async ({ room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.trivia({ room })
  },
  a: async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.a({ payload, room })
  },
  b: async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.b({ payload, room })
  },
  c: async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.c({ payload, room })
  },
  d: async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.d({ payload, room })
  },
  store: async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers.store({ payload, room })
  },
  '8ball': async ({ payload, room }) => {
    const miscCommandHandlers = await getMiscCommandHandlers()
    await miscCommandHandlers['8ball']({ payload, room })
  },

  // Reactions
  begonebitch: async ({ payload, room, state, roomBot }) => {
    await reactionHandlers.begonebitch({ payload, room, state, roomBot })
  },
  gifs: async ({ room }) => { await reactionHandlers.gifs({ room }) },
  burp: async ({ room }) => { await reactionHandlers.burp({ room }) },
  dog: async ({ room, args }) => { await reactionHandlers.dog({ room, args }) },
  dance: async ({ room }) => { await reactionHandlers.dance({ room }) },
  fart: async ({ room }) => { await reactionHandlers.fart({ room }) },
  party: async ({ room }) => { await reactionHandlers.party({ room }) },
  beer: async ({ room }) => { await reactionHandlers.beer({ room }) },
  cheers: async ({ room }) => { await reactionHandlers.cheers({ room }) },
  tomatoes: async ({ room }) => { await reactionHandlers.tomatoes({ room }) },
  trash: async ({ room }) => { await reactionHandlers.trash({ room }) },
  bonk: async ({ room }) => { await reactionHandlers.bonk({ room }) },
  rigged: async ({ room }) => { await reactionHandlers.rigged({ room }) },
  banger: async ({ room }) => { await reactionHandlers.banger({ room }) },
  peace: async ({ room }) => { await reactionHandlers.peace({ room }) },

  // Room utility
  commands: async ({ payload, room, ttlUserToken }) => {
    await roomUtilityHandlers.commands({ payload, room, ttlUserToken })
  },
  help: async ({ payload, room, ttlUserToken }) => {
    await roomUtilityHandlers.commands({ payload, room, ttlUserToken })
  },
  mod: async ({ payload, room, ttlUserToken }) => {
    await roomUtilityHandlers.mod({ payload, room, ttlUserToken })
  },
  games: async ({ room }) => { await roomUtilityHandlers.games({ room }) },
  music: async ({ room }) => { await roomUtilityHandlers.music({ room }) },
  wallet: async ({ room }) => { await roomUtilityHandlers.wallet({ room }) },
  avatars: async ({ room }) => { await roomUtilityHandlers.avatars({ room }) },
  room: async ({ payload, room, ttlUserToken }) => {
    await roomUtilityHandlers.room({ payload, room, ttlUserToken })
  },
  adddj: async ({ payload, roomBot }) => {
    roomBot.lastCommandText = payload?.message || ''
    await roomUtilityHandlers.adddj({ roomBot })
  },
  removedj: async ({ roomBot }) => { await roomUtilityHandlers.removedj({ roomBot }) },

  // Queue/playlist
  site: async ({ room }) => { await queuePlaylistHandlers.site({ room }) },
  test: async ({ room }) => { await queuePlaylistHandlers.test({ room }) },
  crapsrecord: async ({ room }) => { await queuePlaylistHandlers.crapsrecord({ room }) },
  addmoney: async ({ payload, room }) => { await queuePlaylistHandlers.addmoney({ payload, room }) },
  'q+': async ({ payload, room, queueManager }) => {
    await queuePlaylistHandlers['q+']({ payload, room, queueManager })
  },
  'q-': async ({ payload, room, queueManager }) => {
    await queuePlaylistHandlers['q-']({ payload, room, queueManager })
  },
  q: async ({ room, queueManager }) => { await queuePlaylistHandlers.q({ room, queueManager }) },
  addsong: async ({ payload, room, roomBot }) => {
    await queuePlaylistHandlers.addsong({ payload, room, roomBot })
  },
  removesong: async ({ payload, room, roomBot, ttlUserToken }) => {
    await queuePlaylistHandlers.removesong({ payload, room, roomBot, ttlUserToken, isUserAuthorized })
  },
  'blacklist+': async ({ room, roomBot }) => {
    await queuePlaylistHandlers['blacklist+']({ room, roomBot })
  },

  // Room fun
  djbeer: async ({ payload, room, state }) => {
    await roomFunHandlers.djbeer({ payload, room, state })
  },
  djbeers: async ({ payload, room, state }) => {
    await roomFunHandlers.djbeers({ payload, room, state })
  },
  getdjdrunk: async ({ payload, room, state }) => {
    await roomFunHandlers.getdjdrunk({ payload, room, state })
  },
  jump: async ({ roomBot }) => { await roomFunHandlers.jump({ roomBot }) },
  like: async ({ roomBot }) => { await roomFunHandlers.like({ roomBot }) },
  dislike: async ({ payload, room, roomBot, ttlUserToken }) => {
    await roomFunHandlers.dislike({
      payload,
      room,
      roomBot,
      ttlUserToken,
      getUserNickname: getSenderNickname
    })
  },
  dive: async ({ payload, room, state, roomBot }) => {
    await roomFunHandlers.dive({ payload, room, state, roomBot, getSenderNickname })
  },
  escortme: async ({ payload, room }) => {
    await roomFunHandlers.escortme({ payload, room, getSenderNickname, usersToBeRemoved })
  },
  spotlight: async ({ payload, room, state, roomBot }) => {
    await roomFunHandlers.spotlight({ payload, room, state, roomBot, getSenderNickname })
  },

  // Secret fun
  secret: async ({ payload, room, ttlUserToken }) => {
    await secretFunHandlers.secret({ payload, room, ttlUserToken })
  },
  bark: async ({ room }) => { await secretFunHandlers.bark({ room }) },
  barkbark: async ({ room }) => { await secretFunHandlers.barkbark({ room }) },
  star: async ({ roomBot }) => { await secretFunHandlers.star({ roomBot }) },
  unstar: async ({ roomBot }) => { await secretFunHandlers.unstar({ roomBot }) },
  jam: async ({ roomBot }) => { await secretFunHandlers.jam({ roomBot }) },
  berad: async ({ room }) => { await secretFunHandlers.berad({ room }) },
  cam: async ({ room }) => { await secretFunHandlers.cam({ room }) },
  drink: async ({ room }) => { await secretFunHandlers.drink({ room }) },
  shirley: async ({ room }) => { await secretFunHandlers.shirley({ room }) },
  ello: async ({ room }) => { await secretFunHandlers.ello({ room }) },
  allen: async ({ room }) => { await secretFunHandlers.allen({ room }) },
  props: async ({ room }) => { await secretFunHandlers.props({ room }) },
  ass: async ({ room }) => { await secretFunHandlers.ass({ room }) },
  titties: async ({ room }) => { await secretFunHandlers.titties({ room }) },
  azz: async ({ room }) => { await secretFunHandlers.azz({ room }) },
  shred: async ({ room }) => { await secretFunHandlers.shred({ room }) },

  // Mod control
  status: async ({ room, roomBot }) => {
    await modControlHandlers.status({ room, roomBot })
  },
  bopon: async ({ payload, room, roomBot, ttlUserToken }) => {
    await modControlHandlers.bopon({ payload, room, roomBot, ttlUserToken })
  },
  bopoff: async ({ payload, room, roomBot, ttlUserToken }) => {
    await modControlHandlers.bopoff({ payload, room, roomBot, ttlUserToken })
  },
  songstatson: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.songstatson({ payload, room, ttlUserToken })
  },
  songstatsoff: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.songstatsoff({ payload, room, ttlUserToken })
  },
  greet: async ({ payload, room }) => { await modControlHandlers.greet({ payload, room }) },
  greeton: async ({ payload, room }) => { await modControlHandlers.greet({ payload: { ...payload, message: '/greet standard' }, room }) },
  greetoff: async ({ payload, room }) => { await modControlHandlers.greet({ payload: { ...payload, message: '/greet off' }, room }) },
  infoon: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.infoon({ payload, room, ttlUserToken })
  },
  infooff: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.infooff({ payload, room, ttlUserToken })
  },
  infotoggle: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.infotoggle({ payload, room, ttlUserToken })
  },
  madnessupdates: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.madnessupdates({ payload, room, ttlUserToken })
  },
  infotone: async ({ payload, room, ttlUserToken }) => {
    await modControlHandlers.infotone({ payload, room, ttlUserToken })
  }
})

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function resolveDispatchCommand (txt) {
  return resolveDispatchCommandBase(txt, knownCommandNames)
}

export async function dispatchCommand (txt, payload, room, context = {}) {
  return dispatchWithRegistry({
    txt,
    payload,
    room,
    context: {
      ...context,
      ttlUserToken: env.ttlUserToken
    },
    registry: commandRegistry,
    resolveDispatchCommand,
    rouletteGameActive,
    handleRouletteBet,
    postMessage,
    logger
  })
}
