import { postMessage } from '../libs/cometchat.js'
import { getSenderNickname } from '../utils/helpers.js'
import {
  openBetting,
  joinTable,
  leaveTable,
  handleBlackjackBet,
  handleHit,
  handleStand,
  handleDouble,
  handleSurrender,
  handleSplit,
  getFullTableView,
  getPhase
} from '../games/blackjack/blackJack.js'

function buildCtx(room) {
  return { room, tableId: `blackjack:${room}` }
}

async function getNicknameForUser(getNickname, userUUID) {
  return getNickname(userUUID)
}

export function createBlackjackHandlers(deps = {}) {
  const {
    postMessage: post = postMessage,
    getSenderNickname: getNickname = getSenderNickname,
    openBetting: open = openBetting,
    joinTable: join = joinTable,
    leaveTable: leave = leaveTable,
    handleBlackjackBet: placeBet = handleBlackjackBet,
    handleHit: hit = handleHit,
    handleStand: stand = handleStand,
    handleDouble: doubleDown = handleDouble,
    handleSurrender: surrender = handleSurrender,
    handleSplit: split = handleSplit,
    getFullTableView: fullTableView = getFullTableView,
    getPhase: phaseOf = getPhase
  } = deps

  const act = async (action, userUUID, nickname, ctx) => {
    if (action === 'hit') return hit(userUUID, nickname, ctx)
    if (action === 'stand') return stand(userUUID, nickname, ctx)
    if (action === 'double') return doubleDown(userUUID, nickname, ctx)
    if (action === 'surrender') return surrender(userUUID, nickname, ctx)
    if (action === 'split') return split(userUUID, nickname, ctx)
  }

  const handlePrimary = async ({ payload, room, args }) => {
    const userUUID = payload.sender
    const nickname = await getNicknameForUser(getNickname, userUUID)
    const ctx = buildCtx(room)
    const subcommand = String(args || '').trim().toLowerCase()

    if (!subcommand) {
      await open(ctx)
      await join(userUUID, nickname, ctx)
      return
    }

    if (subcommand === 'join') {
      await join(userUUID, nickname, ctx)
      return
    }

    if (subcommand === 'leave') {
      await leave(userUUID, ctx)
      return
    }

    if (subcommand.startsWith('bet')) {
      const amountStr = subcommand.split(/\s+/)[1] ?? ''
      await placeBet(userUUID, amountStr, nickname, ctx)
      return
    }

    if (['hit', 'stand', 'double', 'surrender', 'split'].includes(subcommand)) {
      await act(subcommand, userUUID, nickname, ctx)
      return
    }

    if (subcommand === 'table') {
      const tableMessage = fullTableView(ctx)
      await post({ room, message: tableMessage || '🪑 No one is at the table yet.' })
    }
  }

  const handleJoinShortcut = async ({ payload, room }) => {
    const ctx = buildCtx(room)
    if (phaseOf(ctx) !== 'join') return

    const userUUID = payload.sender
    const nickname = await getNicknameForUser(getNickname, userUUID)
    await join(userUUID, nickname, ctx)
  }

  const handleBetShortcut = async ({ payload, room, args }) => {
    const ctx = buildCtx(room)
    if (phaseOf(ctx) !== 'betting') return

    const userUUID = payload.sender
    const nickname = await getNicknameForUser(getNickname, userUUID)
    const amountStr = String(args || '').trim().split(/\s+/)[0] ?? ''
    await placeBet(userUUID, amountStr, nickname, ctx)
  }

  const handleActionShortcut = async ({ payload, room, action }) => {
    const ctx = buildCtx(room)
    if (phaseOf(ctx) !== 'acting') return

    const userUUID = payload.sender
    const nickname = await getNicknameForUser(getNickname, userUUID)
    await act(action, userUUID, nickname, ctx)
  }

  return {
    blackjack: handlePrimary,
    bj: handlePrimary,
    join: handleJoinShortcut,
    bet: handleBetShortcut,
    hit: async ({ payload, room }) => handleActionShortcut({ payload, room, action: 'hit' }),
    stand: async ({ payload, room }) => handleActionShortcut({ payload, room, action: 'stand' }),
    double: async ({ payload, room }) => handleActionShortcut({ payload, room, action: 'double' }),
    surrender: async ({ payload, room }) => handleActionShortcut({ payload, room, action: 'surrender' }),
    split: async ({ payload, room }) => handleActionShortcut({ payload, room, action: 'split' })
  }
}
