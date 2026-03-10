import { postMessage } from '../libs/cometchat.js'
import {
  getBalanceByNickname,
  getNicknamesFromWallets,
  getUserWallet,
  transferTip,
  addOrUpdateUser
} from '../database/dbwalletmanager.js'
import { getCurrentDJUUIDs } from '../libs/bot.js'
import { getSenderNickname, parseTipAmount, randomTipGif } from '../utils/helpers.js'
import { getCompactEquippedTitleTag } from '../database/dbprestige.js'
import { createTipCommandHandler as createTipCommandHandlerBase } from './handlerFactories.js'

function compactLeaderboardName (name, uuid, maxLen = 14) {
  const raw = String(name || '').trim()
  if (!raw || /^<@uid:[^>]+>$/.test(raw)) return `user-${String(uuid || '').slice(0, 6)}`
  const clean = raw.replace(/^@/, '').trim()
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}.`
}

function formatCompactMoneyLine ({ rank, uuid, name, amount }) {
  const titleTag = getCompactEquippedTitleTag(uuid, 7)
  const compactName = compactLeaderboardName(name, uuid, titleTag ? 10 : 14)
  const numeric = Number(amount || 0)
  const money = `${numeric < 0 ? '-' : ''}$${Math.round(Math.abs(numeric)).toLocaleString()}`
  return `${rank}. ${titleTag ? `${titleTag} ` : ''}${compactName} ${money}`
}

export async function handleCheckBalanceCommand ({ payload, room }) {
  const args = String(payload?.message || '').split(' ').slice(1)

  if (args.length !== 1) {
    await postMessage({
      room,
      message: 'Usage: /checkbalance <nickname>'
    })
    return
  }

  const nickname = args[0]
  const balance = await getBalanceByNickname(nickname)

  if (balance === null) {
    await postMessage({
      room,
      message: `User with nickname ${nickname} does not exist.`
    })
    return
  }

  await postMessage({
    room,
    message: `${nickname}'s current balance is $${balance}.`
  })
}

export async function handleBankrollCommand ({ room }) {
  try {
    const bankroll = getNicknamesFromWallets()
    const sortedBankroll = bankroll
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5)
      .map((user, index) => formatCompactMoneyLine({
        rank: index + 1,
        uuid: user.uuid,
        name: user.nickname,
        amount: user.balance
      }))

    await postMessage({
      room,
      message: `🏆 **Top Wallet Leaders** 🏆\n\n${sortedBankroll.join('\n')}`
    })
  } catch (error) {
    console.error('Error fetching bankroll information:', error)
    await postMessage({
      room,
      message: 'There was an error fetching the bankroll information.'
    })
  }
}

export function createTipCommandHandler (deps = {}) {
  return createTipCommandHandlerBase({
    postMessage,
    getCurrentDJUUIDs,
    parseTipAmount,
    getUserWallet,
    addOrUpdateUser,
    transferTip,
    getSenderNickname,
    randomTipGif,
    ...deps
  })
}

export const handleTipCommand = createTipCommandHandler()
