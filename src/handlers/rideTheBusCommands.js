// src/handlers/rideTheBusCommands.js
import { postMessage } from '../libs/cometchat.js'
import { getSenderNickname } from '../utils/helpers.js'
import {
  startGame,
  handleAnswer,
  handleCashout,
  getActivePhase,
} from '../games/ridethebus/rideTheBus.js'

const ANSWER_WORDS = new Set(['red','black','higher','lower','inside','outside','hearts','diamonds','clubs','spades'])

export function createRideTheBusHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    getSenderNickname: getNickname = getSenderNickname,
    startGame: start = startGame,
    handleAnswer: answer = handleAnswer,
    handleCashout: cashout = handleCashout,
  } = deps

  const gameDeps = { postMessage: post }

  // Primary handler — /rtb, /ridthebus, /ride, /bus
  const handlePrimary = async ({ payload, room, args }) => {
    const uuid = payload.sender
    const nickname = await getNickname(uuid)
    const sub = String(args || '').trim().toLowerCase()

    if (!sub) {
      await post({
        room,
        message: [
          `🚌💨  **RIDE THE BUS**`,
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          `Answer 4 card questions in a row. Cash out anytime — or risk it all for **10×**.`,
          ``,
          `🔴🖤  Stop 1  —  Red or Black?        → **1.5×** if you bail`,
          `📈    Stop 2  —  Higher or Lower?     → **2×** if you bail`,
          `📊    Stop 3  —  Inside or Outside?   → **3.5×** if you bail`,
          `🎯    Stop 4  —  Guess the Suit?      → **10×** sweep 🎉`,
          ``,
          `\`/rtb <amount>\` to start  ·  min $5  ·  max $10,000`,
          `\`/cashout\` at any point to lock in your winnings`,
        ].join('\n')
      })
      return
    }

    if (sub === 'cashout') {
      await cashout(uuid, nickname, room, gameDeps)
      return
    }

    if (ANSWER_WORDS.has(sub)) {
      await answer(uuid, nickname, room, sub, gameDeps)
      return
    }

    // Numeric bet — start a new game
    await start(uuid, nickname, room, sub, gameDeps)
  }

  // Standalone answer handler — used by /higher, /lower, /inside, etc.
  const handleStandalone = (word) => async ({ payload, room }) => {
    const uuid = payload.sender
    const nickname = await getNickname(uuid)
    await answer(uuid, nickname, room, word, gameDeps)
  }

  // Cashout handler — used by /cashout
  const handleCashoutCmd = async ({ payload, room }) => {
    const uuid = payload.sender
    const nickname = await getNickname(uuid)
    await cashout(uuid, nickname, room, gameDeps)
  }

  return {
    // Primary aliases
    ridthebus: handlePrimary,
    ridethebus: handlePrimary,
    ride: handlePrimary,
    bus: handlePrimary,
    rtb: handlePrimary,

    // Standalone answer commands
    higher:   handleStandalone('higher'),
    lower:    handleStandalone('lower'),
    inside:   handleStandalone('inside'),
    outside:  handleStandalone('outside'),
    hearts:   handleStandalone('hearts'),
    diamonds: handleStandalone('diamonds'),
    clubs:    handleStandalone('clubs'),
    spades:   handleStandalone('spades'),

    // Cashout
    cashout: handleCashoutCmd,

    // Utility — lets commandRegistry check for an active game before falling through
    getActivePhase: (room, uuid) => getActivePhase(room, uuid),
  }
}
