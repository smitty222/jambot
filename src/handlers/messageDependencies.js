import { logger } from '../utils/logging.js'
import { handleAIMention } from './aiMentions.js'
import { startRouletteGame } from './roulette.js'
import { handleBotRandomAvatarCommand } from './avatarCommands.js'
import {
  startHorseRace,
  handleHorseBet,
  isHorseBettingOpen,
  isWaitingForEntries,
  handleHorseEntryAttempt,
  handleHorseHelpCommand,
  handleHorseStatsCommand,
  handleTopHorsesCommand,
  handleMyHorsesCommand,
  handleHofPlaqueCommand
} from '../games/horserace/handlers/commands.js'
import { handleBuyHorse, handleSellHorse } from '../games/horserace/horseManager.js'
import {
  handleCarEntryAttempt,
  handleBetCommand,
  startF1Race,
  startDragRace,
  handleBuyCar,
  handleGarageCommand,
  handleMyCars,
  handleWearCommand,
  handleCarShow,
  handleCarPics,
  handleRepairCar,
  handleRenameCar,
  handleSellCar,
  handleTeamCommand,
  handleF1Help,
  handleCarStats,
  handleF1RaceHistory,
  handleF1Stats,
  handleF1Leaderboard
} from '../games/f1race/handlers/commands.js'
import { handleLotteryNumber } from '../database/dblotterymanager.js'

export const horseRouteHandlers = {
  isWaitingForEntries,
  isHorseBettingOpen,
  handleHorseEntryAttempt,
  startHorseRace,
  handleHorseBet,
  handleBuyHorse,
  handleSellHorse,
  handleMyHorsesCommand,
  handleHorseHelpCommand,
  handleHorseStatsCommand,
  handleTopHorsesCommand,
  handleHofPlaqueCommand
}

export const f1RouteHandlers = {
  startF1Race,
  startDragRace,
  handleBuyCar,
  handleGarageCommand,
  handleMyCars,
  handleCarStats,
  handleF1RaceHistory,
  handleF1Stats,
  handleF1Leaderboard,
  handleWearCommand,
  handleCarPics,
  handleCarShow,
  handleRepairCar,
  handleRenameCar,
  handleSellCar,
  handleTeamCommand,
  handleF1Help,
  handleBetCommand,
  handleCarEntryAttempt
}

export const aiMentionHandlers = {
  handleAIMention,
  startRouletteGame,
  handleBotRandomAvatarCommand,
  logger
}

export const lotteryHandlers = {
  handleLotteryNumber,
  logger
}
