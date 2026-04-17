import { postMessage } from '../libs/cometchat.js'
import {
  addOrUpdateUser,
  getLifetimeNet,
  getUserWallet,
  hasUserWallet
} from '../database/dbwalletmanager.js'
import { formatBalance } from './slots.js'
import { decoratedMention } from '../database/dbprestige.js'

export async function handleBalanceCommand ({ payload, room }) {
  const userUUID = payload?.sender
  const nickname = decoratedMention(userUUID)
  const balance = getUserWallet(userUUID)

  await postMessage({
    room,
    message: `${nickname}, your current balance is $${formatBalance(balance)}.`
  })
}

export async function handleCareerCommand ({ payload, room }) {
  const userUUID = payload?.sender
  const nickname = decoratedMention(userUUID)
  const rounded = Math.round(getLifetimeNet(userUUID))
  const absNet = Math.abs(rounded).toLocaleString('en-US')
  const sign = rounded >= 0 ? '+' : '-'

  await postMessage({
    room,
    message: `${nickname}, your career gambling net total is ${sign}$${absNet}.`
  })
}

export async function handleGetWalletCommand ({ payload, room }) {
  const userUUID = payload?.sender
  const nickname = decoratedMention(userUUID)

  if (hasUserWallet(userUUID)) {
    const balance = getUserWallet(userUUID)
    await postMessage({
      room,
      message: `${nickname}, you already have a wallet with $${formatBalance(balance)}.`
    })
    return
  }

  addOrUpdateUser(userUUID, null)
  const balance = getUserWallet(userUUID)
  await postMessage({
    room,
    message: `${nickname}, your wallet has been initialized with $${formatBalance(balance)}.`
  })
}
