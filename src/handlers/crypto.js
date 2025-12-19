// src/handlers/crypto.js
//
// Implements a simple paper crypto investing game. Users can query prices,
// buy and sell coins with their fake USD balance and view their holdings.
// Commands are invoked via the `/crypto` slash command and accept subcommands
// described in the help text below. This module relies on the dbcrypto and
// cryptoPrice helpers for persistence and external API access respectively.

import { postMessage } from '../libs/cometchat.js'
import {
  // Crypto-specific helpers for positions and trade history. We still store
  // positions and trades in the crypto tables, but cash is handled via the
  // general user wallet (dbwalletmanager) instead of a separate crypto account.
  addPosition,
  reducePosition,
  getPositions,
  getPosition,
  recordTrade
} from '../database/dbcrypto.js'
import {
  // Wallet helpers for reading and updating a user's cash balance. These
  // functions operate on the shared wallet used by other games (slots,
  // roulette, etc.), so crypto purchases and sales draw from and deposit
  // into the same pot.
  getUserWallet,
  addToUserWallet,
  removeFromUserWallet
} from '../database/dbwalletmanager.js'
import {
  resolveCoinId,
  getCryptoPrice,
  COIN_ALIASES
} from '../utils/cryptoPrice.js'

// Format a cash amount to two decimal places and thousands separators. Returns
// a string like "1,234.56" or "0.00".
function formatUsd (amount) {
  return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Construct a help message describing the crypto command syntax.
function buildHelpMessage () {
  return (
    '💰 *Crypto Investing Commands*\n' +
    'Use the `/crypto` command to manage your paper crypto portfolio.\n\n' +
    '*Commands:*\n' +
    '`/crypto price <symbol>` – Show the current USD price for a coin (e.g. btc, eth).\n' +
    '`/crypto buy <symbol> <usdAmount>` – Buy a coin using USD from your wallet balance.\n' +
    '`/crypto sell <symbol> <usdAmount>` – Sell a coin for USD (sells proportionally by value).\n' +
    '`/crypto portfolio` – Show your current crypto holdings and cash.\n' +
    '`/crypto help` – Show this help message.\n\n' +
    'Supported symbols include: ' + Object.keys(COIN_ALIASES).filter((k, i, arr) => arr.indexOf(k) === i).join(', ') + '.\n' +
    'Values are approximate and based on CoinGecko spot prices.'
  )
}

// Handle the /crypto command. Accepts the payload, room and args from
// commandRegistry. All responses are sent via postMessage.
export async function handleCryptoCommand ({ payload, room, args }) {
  const userId = payload?.sender
  const trimmed = String(args || '').trim()
  if (!trimmed) {
    await postMessage({ room, message: buildHelpMessage() })
    return
  }
  const parts = trimmed.split(/\s+/)
  const sub = parts[0].toLowerCase()
  try {
    if (sub === 'help') {
      await postMessage({ room, message: buildHelpMessage() })
      return
    }
    if (sub === 'price') {
      if (parts.length < 2) {
        await postMessage({ room, message: 'Please specify a coin symbol. Example: `/crypto price btc`' })
        return
      }
      const coinInput = parts[1]
      const coinId = resolveCoinId(coinInput)
      if (!coinId) {
        await postMessage({ room, message: `Unknown coin: ${coinInput}. Try one of: ${Object.keys(COIN_ALIASES).join(', ')}` })
        return
      }
      const price = await getCryptoPrice(coinId)
      await postMessage({ room, message: `The current price of *${coinInput.toUpperCase()}* is $${formatUsd(price)} USD.` })
      return
    }
    if (sub === 'portfolio') {
      // Use the general wallet for cash rather than a separate crypto cash
      const cash = getUserWallet(userId)
      const positions = getPositions(userId)
      if (!positions.length) {
        await postMessage({ room, message: `💼 Your crypto portfolio is empty. Cash balance: $${formatUsd(cash)}.` })
        return
      }
      // Fetch current prices for all held coins in batch
      const uniqueIds = [...new Set(positions.map(p => p.coinId))]
      const pricePromises = uniqueIds.map(id => getCryptoPrice(id).then(p => [id, p]))
      const priceEntries = await Promise.all(pricePromises)
      const priceMap = Object.fromEntries(priceEntries)
      let totalValue = cash
      let lines = positions.map(pos => {
        const price = priceMap[pos.coinId] || 0
        const value = pos.quantity * price
        totalValue += value
        return `${pos.symbol.toUpperCase()}: ${pos.quantity.toFixed(6)} (avg $${formatUsd(pos.avgCostUsd)}) – worth $${formatUsd(value)}`
      })
      lines.push(`\nWallet cash: $${formatUsd(cash)}`)
      lines.push(`Total Net Worth: $${formatUsd(totalValue)}`)
      await postMessage({ room, message: lines.join('\n') })
      return
    }
    if (sub === 'buy') {
      if (parts.length < 3) {
        await postMessage({ room, message: 'Usage: `/crypto buy <symbol> <usdAmount>`' })
        return
      }
      const coinInput = parts[1]
      const coinId = resolveCoinId(coinInput)
      if (!coinId) {
        await postMessage({ room, message: `Unknown coin: ${coinInput}. Try one of: ${Object.keys(COIN_ALIASES).join(', ')}` })
        return
      }
      const usdAmount = parseFloat(parts[2])
      if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
        await postMessage({ room, message: 'Please provide a positive USD amount to invest.' })
        return
      }
      // Check available cash from the user’s wallet
      const cash = getUserWallet(userId)
      if (cash < usdAmount) {
        await postMessage({ room, message: `Insufficient funds. Available wallet balance: $${formatUsd(cash)}` })
        return
      }
      // Fetch current price and calculate quantity
      const price = await getCryptoPrice(coinId)
      const qty = usdAmount / price
      // Debit wallet; if removal fails return an error
      const removed = removeFromUserWallet(userId, usdAmount)
      if (!removed) {
        await postMessage({ room, message: `Insufficient funds. Available wallet balance: $${formatUsd(getUserWallet(userId))}` })
        return
      }
      // Add position and record trade
      addPosition(userId, coinId, coinInput.toLowerCase(), qty, price)
      recordTrade(userId, coinId, 'BUY', qty, price)
      await postMessage({ room, message: `✅ Bought ${qty.toFixed(6)} ${coinInput.toUpperCase()} @ $${formatUsd(price)} for $${formatUsd(usdAmount)}.` })
      return
    }
    if (sub === 'sell') {
      if (parts.length < 3) {
        await postMessage({ room, message: 'Usage: `/crypto sell <symbol> <usdAmount>`' })
        return
      }
      const coinInput = parts[1]
      const coinId = resolveCoinId(coinInput)
      if (!coinId) {
        await postMessage({ room, message: `Unknown coin: ${coinInput}. Try one of: ${Object.keys(COIN_ALIASES).join(', ')}` })
        return
      }
      const usdAmount = parseFloat(parts[2])
      if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
        await postMessage({ room, message: 'Please provide a positive USD amount to sell.' })
        return
      }
      const position = getPosition(userId, coinId)
      if (!position) {
        await postMessage({ room, message: `You do not own any ${coinInput.toUpperCase()}.` })
        return
      }
      const price = await getCryptoPrice(coinId)
      const maxUsdValue = position.quantity * price
      if (usdAmount > maxUsdValue + 1e-8) {
        await postMessage({ room, message: `Insufficient position value. Your ${coinInput.toUpperCase()} is worth $${formatUsd(maxUsdValue)}.` })
        return
      }
      // Determine quantity to sell
      const qtyToSell = usdAmount / price
      // Update DB: reduce position, credit wallet, record trade
      reducePosition(userId, coinId, qtyToSell)
      await addToUserWallet(userId, usdAmount)
      recordTrade(userId, coinId, 'SELL', qtyToSell, price)
      await postMessage({ room, message: `✅ Sold ${qtyToSell.toFixed(6)} ${coinInput.toUpperCase()} @ $${formatUsd(price)} for $${formatUsd(usdAmount)}.` })
      return
    }
    // Unknown subcommand
    await postMessage({ room, message: `Unknown crypto command: ${sub}. Use "/crypto help" for usage.` })
  } catch (err) {
    console.error('[crypto] Error handling command', err)
    await postMessage({ room, message: 'An error occurred while processing your crypto command.' })
  }
}