// message.js
import { postMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
import { LotteryGameActive } from '../database/dblotterymanager.js'
import { routeCrapsMessage } from '../games/craps/craps.single.js'
import { dispatchCommand } from './commandRegistry.js'
import { handleDirectMessage } from './dmHandler.js'
import { normalizeIncomingMessage } from './messagePayload.js'
import { routeHorseMessage } from './horseMessageRoutes.js'
import { routeCrapsChatMessage } from './crapsMessageRoutes.js'
import { routeF1Message } from './f1MessageRoutes.js'
import {
  maybeHandleDirectMessage,
  maybeHandleGifMessage,
  maybeHandlePing,
  maybeHandleAiMention,
  maybeHandleLotteryFastPath,
  maybeHandleLotteryFallback,
  maybeDispatchCommand
} from './messageFlow.js'
import {
  horseRouteHandlers,
  f1RouteHandlers,
  aiMentionHandlers,
  lotteryHandlers
} from './messageDependencies.js'
import { QueueManager } from '../utils/queueManager.js'
import { getUserNickname } from '../utils/nickname.js'

const queueManager = new QueueManager(getUserNickname)

/*
 * The DM admin allow list, helper functions and the DM command handler have
 * been moved to src/handlers/dmHandler.js. Keeping them here would bloat
 * message.js and make maintenance more difficult. See dmHandler.js for the
 * implementation of handleDirectMessage, parseUidFromMention, isDmAdmin and
 * related helpers.
 */

export default async (payload, room, state, roomBot) => {
  const {
    receiverType,
    text: txt,
    normalizedPayload,
    isGifMessage
  } = normalizeIncomingMessage(payload)

  if (await maybeHandleDirectMessage({
    receiverType,
    payload,
    handleDirectMessage
  })) {
    return
  }

  if (await maybeHandleGifMessage({
    isGifMessage,
    payload,
    logger
  })) {
    return
  }

  if (!txt) return

  if (await maybeHandlePing({
    txt,
    room,
    postMessage
  })) {
    return
  }

  if (await maybeHandleAiMention({
    txt,
    payload: normalizedPayload,
    room,
    roomBot,
    ...aiMentionHandlers
  })) {
    return
  }

  if (await routeHorseMessage({
    txt,
    payload: normalizedPayload,
    handlers: horseRouteHandlers
  })) {
    return
  }

  if (await routeCrapsChatMessage({
    txt,
    payload: normalizedPayload,
    routeCrapsMessage
  })) {
    return
  }

  if (await routeF1Message({
    txt,
    payload: normalizedPayload,
    handlers: f1RouteHandlers
  })) {
    return
  }

  if (await maybeHandleLotteryFastPath({
    txt,
    payload: normalizedPayload,
    lotteryGameActive: LotteryGameActive,
    ...lotteryHandlers
  })) {
    return
  }

  if (await maybeDispatchCommand({
    txt,
    payload: normalizedPayload,
    room,
    state,
    roomBot,
    queueManager,
    dispatchCommand,
    logger
  })) {
    return
  }

  if (await maybeHandleLotteryFallback({
    txt,
    payload: normalizedPayload,
    lotteryGameActive: LotteryGameActive,
    handleLotteryNumber: lotteryHandlers.handleLotteryNumber
  })) {
    return
  }
}
