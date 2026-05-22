// src/handlers/rideTheBusCommands.js
import { postMessage } from '../libs/cometchat.js'
import { getSenderNickname } from '../utils/helpers.js'
import { startGame, handleAnswer, handleDecision } from '../games/ridethebus/rideTheBus.js'

const ANSWER_WORDS = new Set(['red','black','higher','lower','inside','outside','hearts','diamonds','clubs','spades'])
const DECIDE_WORDS = new Set(['cashout','continue'])

export function createRideTheBusHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    getSenderNickname: getNickname = getSenderNickname,
    startGame: start = startGame,
    handleAnswer: answer = handleAnswer,
    handleDecision: decide = handleDecision,
  } = deps

  const gameDeps = { postMessage: post }

  const handlePrimary = async ({ payload, room, args }) => {
    const uuid = payload.sender
    const nickname = await getNickname(uuid)
    const sub = String(args || '').trim().toLowerCase()

    if (!sub) {
      await post({
        room,
        message: [
          `🚌  **RIDE THE BUS**`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `Answer 4 card questions in a row to win big.`,
          `Cash out after any correct answer — or risk it all for **10×**.`,
          ``,
          `**Payouts**`,
          `🎴  Q1 — Red or Black?       → **1.5×**`,
          `🎴  Q2 — Higher or Lower?    → **2×**`,
          `🎴  Q3 — Inside or Outside?  → **3.5×**`,
          `🎴  Q4 — Guess the Suit?     → **10×**`,
          ``,
          `\`/rtb <amount>\` to start  ·  min $5  ·  max $10,000`,
        ].join('\n')
      })
      return
    }

    if (DECIDE_WORDS.has(sub)) {
      await decide(uuid, nickname, room, sub, gameDeps)
      return
    }

    if (ANSWER_WORDS.has(sub)) {
      await answer(uuid, nickname, room, sub, gameDeps)
      return
    }

    // Numeric bet — start a new game
    await start(uuid, nickname, room, sub, gameDeps)
  }

  return {
    ridthebus: handlePrimary,
    ridethebus: handlePrimary,
    ride: handlePrimary,
    bus: handlePrimary,
    rtb: handlePrimary,
  }
}
