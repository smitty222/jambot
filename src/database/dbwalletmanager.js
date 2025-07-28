// src/libs/dbWalletManager.js
import db from './db.js'
import { getUserNickname } from '../handlers/message.js'
import { fetchRecentSongs } from '../utils/API.js'

function roundToTenth(amount) {
  return Math.round(amount * 10) / 10
}

export async function addOrUpdateUser(userUUID) {
  const nickname = await getUserNickname(userUUID)
  if (!nickname) return

  db.prepare(`
    INSERT INTO users (uuid, nickname)
    VALUES (?, ?)
    ON CONFLICT(uuid) DO UPDATE SET nickname = excluded.nickname
  `).run(userUUID, nickname)
}

export function loadWallets() {
  const rows = db.prepare('SELECT uuid, balance FROM wallets').all()

  return rows.reduce((wallets, { uuid, balance }) => {
    wallets[uuid] = { balance: roundToTenth(balance) }
    return wallets
  }, {})
}


export function getUserWallet(userUUID) {
  const row = db.prepare('SELECT balance FROM wallets WHERE uuid = ?').get(userUUID)

  if (!row) {
    // Start wallet with initial $50
    db.prepare('INSERT INTO wallets (uuid, balance) VALUES (?, 50)').run(userUUID)
    return 50
  }

  return roundToTenth(row.balance)
}

export function removeFromUserWallet(userUUID, amount) {
  const current = getUserWallet(userUUID)
  const newBalance = Math.max(0, roundToTenth(current - amount))

  db.prepare(`
    INSERT INTO wallets (uuid, balance)
    VALUES (?, ?)
    ON CONFLICT(uuid) DO UPDATE SET balance = ?
  `).run(userUUID, newBalance, newBalance)

  return true
}

export async function addToUserWallet(userUUID, amount, nickname = null) {
  await addOrUpdateUser(userUUID, nickname)

  const current = getUserWallet(userUUID)
  const newBalance = roundToTenth(current + amount)

  db.prepare(`
    INSERT INTO wallets (uuid, balance)
    VALUES (?, ?)
    ON CONFLICT(uuid) DO UPDATE SET balance = ?
  `).run(userUUID, newBalance, newBalance)

  return true
}

export function loadUsers() {
  const rows = db.prepare('SELECT * FROM users').all()
  return rows.reduce((map, user) => {
    map[user.uuid] = { nickname: user.nickname }
    return map
  }, {})
}

export function getNicknamesFromWallets() {
  const wallets = db.prepare(`
    SELECT u.uuid, u.nickname, w.balance
    FROM wallets w
    LEFT JOIN users u ON u.uuid = w.uuid
  `).all()

  return wallets.map(({ uuid, nickname, balance }) => ({
    uuid,
    nickname: nickname || 'Unknown',
    balance: roundToTenth(balance)
  }))
}


export async function addDollarsByNickname(nickname, amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    console.error('Invalid amount:', amount)
    return
  }

  const row = db.prepare('SELECT uuid FROM users WHERE LOWER(nickname) = ?').get(nickname.toLowerCase())
  if (!row) {
    console.error(`User with nickname ${nickname} not found.`)
    return
  }

  await addToUserWallet(row.uuid, amount, nickname)
  console.log(`Added $${amount} to ${nickname}'s wallet.`)
}

export function getBalanceByNickname(nickname) {
  const row = db.prepare(`
    SELECT w.balance FROM wallets w
    JOIN users u ON u.uuid = w.uuid
    WHERE LOWER(u.nickname) = ?
  `).get(nickname.toLowerCase())

  return row ? roundToTenth(row.balance) : null
}

export async function songPayment() {
  try {
    const songPlays = await fetchRecentSongs()
    if (!Array.isArray(songPlays) || songPlays.length === 0) {
      console.log('No recent songs found.')
      return
    }

    const { djUuid: userUUID, voteCounts } = songPlays[0]
    const voteCount = voteCounts.likes

    if (userUUID && typeof voteCount === 'number' && voteCount > 0) {
      const success = await addToUserWallet(userUUID, voteCount * 2)
      if (success) {
        console.log(`Added $${voteCount * 2} to user ${userUUID}'s wallet for ${voteCount} likes.`)
      } else {
        console.error(`Failed to add to wallet for user ${userUUID}`)
      }
    } else {
      console.error('Invalid userUUID or voteCount for songPlay')
    }
  } catch (error) {
    console.error('Error in songPayment:', error)
  }
}
