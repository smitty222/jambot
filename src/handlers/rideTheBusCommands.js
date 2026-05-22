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
          '🚌 **Ride the Bus** — Card guessing game with a cash-out mechanic!',
          '',
          'Answer 4 questions correctly to win **10×** your bet.',
          'Cash out after any correct answer to lock in a smaller win.',
          '',
          '**Payouts:** Q1 correct = 1.5×  •  Q2 = 2×  •  Q3 = 3.5×  •  Sweep = 10×',
          '',
          '`/rtb <amount>` to start  •  Min $5  •  Max $10,000',
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
    rtb: handlePrimary,
  }
}
