// src/handlers/crypto.js
//
// Implements a simple paper crypto investing game. Users can query prices,
// buy and sell coins with their fake USD balance and view their holdings.
// Commands are invoked via the `/crypto` slash command and accept subcommands
// described in the help text below. This module relies on the dbcrypto and
// cryptoPrice helpers for persistence and external API access respectively.

import { postMessage } from '../libs/cometchat.js'
import {
  addPosition,
  reducePosition,
  getPositions,
  getPosition,
  recordTrade
} from '../database/dbcrypto.js'
import {
  getUserWallet,
  addToUserWallet,
  removeFromUserWallet
} from '../database/dbwalletmanager.js'
import {
  resolveCoinId,
  getCryptoPrice,
  getTopCoins,
  getTrendingCoins,
  COIN_ALIASES
} from '../utils/cryptoPrice.js'

// ─────────────────────────────────────────────────────────────
// Cosmetic helpers
// ─────────────────────────────────────────────────────────────

const COIN_EMOJIS = {
  btc: '₿',
  eth: '⟠',
  sol: '◎',
  ada: '🅰️',
  xrp: '💧',
  doge: '🐶',
  shib: '🐕',
  dot: '🔴',
  link: '🔗',
  matic: '🟣',
  avax: '🏔️',
  ltc: 'Ł',
  bnb: '🟡',
  uni: '🦄',
  atom: '⚛️',
  xlm: '✨',
  algo: '🧠',
  near: '🌐'
}

function coinEmoji (symbol) {
  const key = String(symbol || '').toLowerCase()
  return COIN_EMOJIS[key] || '🪙'
}

function coinLabel (symbol) {
  const sym = String(symbol || '').toUpperCase()
  return `${sym} ${coinEmoji(symbol)}`
}

// Format a crypto quantity with commas and up to 6 decimals (good for trades)
function formatQty (amount) {
  return Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  })
}

// Portfolio display: round coin totals to nearest hundredth (2 decimals)
function formatQtyPortfolio (amount) {
  return Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

// Format a cash amount to two decimal places and thousands separators.
function formatUsd (amount) {
  return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatSignedUsd (amount) {
  const sign = amount >= 0 ? '+' : '-'
  return `${sign}$${formatUsd(Math.abs(amount))}`
}

function pnlEmoji (amount) {
  if (amount > 0) return '🟢'
  if (amount < 0) return '🔴'
  return '⚪'
}

function formatPct (x) {
  if (!Number.isFinite(x)) return '—'
  const sign = x > 0 ? '+' : ''
  return `${sign}${x.toFixed(2)}%`
}

function fmtRank (rank) {
  if (!Number.isFinite(rank)) return '—'
  return `#${rank}`
}

// Construct a help message describing the crypto command syntax.
function buildHelpMessage () {
  return (
    '💰 *Crypto Investing Commands*\n' +
    'Use the `/crypto` command to manage your paper crypto portfolio.\n\n' +
    '*Commands:*\n' +
    '`/crypto price <symbol>` – Show the current USD price for a coin (e.g. btc, eth).\n' +
    '`/crypto buy <symbol> <Amount>` – Buy a coin using cash from your wallet balance.\n' +
    '`/crypto sell <symbol> <Amount|all>` – Sell a coin for cash (sell by USD amount or your entire position).\n' +
    '`/crypto portfolio` – Show your current crypto holdings and total crypto value.\n' +
    '`/crypto top` – Show the top 10 coins by market cap.\n' +
    '`/crypto trending` – Show CoinGecko trending coins.\n' +
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

    if (sub === 'top') {
      const top = await getTopCoins({ limit: 10 })
      if (!top?.length) {
        await postMessage({ room, message: 'No data returned for top coins right now.' })
        return
      }

      const lines = []
      lines.push('🏆 *Top 10 Crypto (Market Cap)*')
      for (let i = 0; i < Math.min(10, top.length); i++) {
        const c = top[i]
        const sym = String(c.symbol || '').toUpperCase()
        const pct24h = c.price_change_percentage_24h
        lines.push(
          `${String(i + 1).padStart(2, '0')}. ${coinLabel(sym)} ${c.name} (${fmtRank(c.market_cap_rank)}) ` +
          `– $${formatUsd(c.current_price)} · 24h ${formatPct(pct24h)}`
        )
      }

      await postMessage({ room, message: lines.join('\n') })
      return
    }

    if (sub === 'trending') {
      const trending = await getTrendingCoins({ limit: 10 })
      if (!trending?.length) {
        await postMessage({ room, message: 'No data returned for trending coins right now.' })
        return
      }

      const lines = []
      lines.push('🔥 *Trending on CoinGecko*')
      for (let i = 0; i < Math.min(10, trending.length); i++) {
        const c = trending[i]
        const sym = String(c.symbol || '').toUpperCase()
        lines.push(
          `${String(i + 1).padStart(2, '0')}. ${coinLabel(sym)} ${c.name} (${fmtRank(c.market_cap_rank)})`
        )
      }

      await postMessage({ room, message: lines.join('\n') })
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
      await postMessage({ room, message: `📈 ${coinLabel(coinInput)} is currently *$${formatUsd(price)}*.` })
      return
    }

    if (sub === 'portfolio') {
      const positions = getPositions(userId)

      if (!positions.length) {
        await postMessage({ room, message: `💼 Your crypto portfolio is empty.\nTotal Crypto: $${formatUsd(0)}.` })
        return
      }

      // Fetch current prices for all held coins in batch
      const uniqueIds = [...new Set(positions.map(p => p.coinId))]
      const pricePromises = uniqueIds.map(id => getCryptoPrice(id).then(p => [id, p]))
      const priceEntries = await Promise.all(pricePromises)
      const priceMap = Object.fromEntries(priceEntries)

      // Sort by current value descending for a nicer portfolio display
      const enriched = positions
        .map(pos => {
          const price = priceMap[pos.coinId] || 0
          const value = pos.quantity * price
          const costBasis = pos.quantity * pos.avgCostUsd
          const pnlUsd = value - costBasis
          return { ...pos, price, value, costBasis, pnlUsd }
        })
        .sort((a, b) => (b.value || 0) - (a.value || 0))

      let totalCrypto = 0
      const lines = enriched.map(pos => {
        totalCrypto += pos.value
        return `${coinLabel(pos.symbol)}: ${formatQtyPortfolio(pos.quantity)} – worth $${formatUsd(pos.value)} (${formatSignedUsd(pos.pnlUsd)}) ${pnlEmoji(pos.pnlUsd)}`
      })

      lines.push(`\nTotal Crypto: $${formatUsd(totalCrypto)}`)

      await postMessage({ room, message: lines.join('\n') })
      return
    }

    if (sub === 'buy') {
      if (parts.length < 3) {
        await postMessage({ room, message: 'Usage: `/crypto buy <symbol> <Amount>`' })
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
        await postMessage({ room, message: 'Please provide a positive cash amount to invest.' })
        return
      }

      const cash = getUserWallet(userId)
      if (cash < usdAmount) {
        await postMessage({ room, message: `Insufficient funds. Available wallet balance: $${formatUsd(cash)}` })
        return
      }

      const price = await getCryptoPrice(coinId)
      const qty = usdAmount / price

      const removed = removeFromUserWallet(userId, usdAmount)
      if (!removed) {
        await postMessage({ room, message: `Insufficient funds. Available wallet balance: $${formatUsd(getUserWallet(userId))}` })
        return
      }

      addPosition(userId, coinId, coinInput.toLowerCase(), qty, price)
      recordTrade(userId, coinId, 'BUY', qty, price)

      await postMessage({
        room,
        message: `✅ Bought ${formatQty(qty)} ${coinLabel(coinInput)} @ $${formatUsd(price)} for $${formatUsd(usdAmount)}.`
      })
      return
    }

    if (sub === 'sell') {
      if (parts.length < 3) {
        await postMessage({ room, message: 'Usage: `/crypto sell <symbol> <Amount|all>`' })
        return
      }

      const coinInput = parts[1]
      const coinId = resolveCoinId(coinInput)
      if (!coinId) {
        await postMessage({ room, message: `Unknown coin: ${coinInput}. Try one of: ${Object.keys(COIN_ALIASES).join(', ')}` })
        return
      }

      const position = getPosition(userId, coinId)
      if (!position) {
        await postMessage({ room, message: `You do not own any ${coinLabel(coinInput)}.` })
        return
      }

      const amountToken = String(parts[2] || '').trim().toLowerCase()
      const price = await getCryptoPrice(coinId)

      if (amountToken === 'all') {
        const qtyToSell = position.quantity
        const proceedsUsd = qtyToSell * price

        if (!Number.isFinite(qtyToSell) || qtyToSell <= 0 || !Number.isFinite(proceedsUsd) || proceedsUsd <= 0) {
          await postMessage({ room, message: `Your ${coinLabel(coinInput)} position is too small to sell.` })
          return
        }

        reducePosition(userId, coinId, qtyToSell)
        await addToUserWallet(userId, proceedsUsd)
        recordTrade(userId, coinId, 'SELL', qtyToSell, price)

        await postMessage({
          room,
          message: `✅ Sold *ALL* (${formatQty(qtyToSell)} ${coinLabel(coinInput)}) @ $${formatUsd(price)} for $${formatUsd(proceedsUsd)}.`
        })
        return
      }

      const usdAmount = parseFloat(amountToken)
      if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
        await postMessage({ room, message: 'Please provide a positive cash amount to sell, or use `all` (example: `/crypto sell btc all`).' })
        return
      }

      const maxUsdValue = position.quantity * price
      if (usdAmount > maxUsdValue + 1e-8) {
        await postMessage({ room, message: `Insufficient position value. Your ${coinLabel(coinInput)} is worth $${formatUsd(maxUsdValue)}.` })
        return
      }

      const qtyToSell = usdAmount / price

      reducePosition(userId, coinId, qtyToSell)
      await addToUserWallet(userId, usdAmount)
      recordTrade(userId, coinId, 'SELL', qtyToSell, price)

      await postMessage({
        room,
        message: `✅ Sold ${formatQty(qtyToSell)} ${coinLabel(coinInput)} @ $${formatUsd(price)} for $${formatUsd(usdAmount)}.`
      })
      return
    }

    await postMessage({ room, message: `Unknown crypto command: ${sub}. Use "/crypto help" for usage.` })
  } catch (err) {
    console.error('[crypto] Error handling command', err)
    await postMessage({ room, message: 'An error occurred while processing your crypto command.' })
  }
}
