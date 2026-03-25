// src/handlers/economyLeaderboardCommands.js
//
// Handlers for economy overview, net worth display, and monthly/career leaderboards.

import { postMessage } from '../libs/cometchat.js'
import { logger } from '../utils/logging.js'
import { getUserNicknameByUuid } from '../utils/API.js'
import {
  getAllNetTotals,
  getEconomyOverview,
  snapshotMonthlyLeaderboard,
  getCurrentMonthKey,
  getNetWorthForUser,
  getTopNetWorthLeaderboard
} from '../database/dbwalletmanager.js'
import { formatCompactLeaderboardLine } from './prestigeCommands.js'

function formatWholeDollars (value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US')
}

function formatMoneyLine (value) {
  return `$${formatWholeDollars(value)}`
}

async function postCareerLossesLeaderboard (room, args = '') {
  const requested = Number.parseInt(String(args || '').trim(), 10)
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 50)
    : 10

  const losses = getAllNetTotals()
    .filter(row => Number(row?.lifetime_net) < 0)
    .sort((a, b) => Number(a.lifetime_net) - Number(b.lifetime_net))
    .slice(0, limit)

  if (!losses.length) {
    await postMessage({ room, message: 'No career gambling losses are recorded yet.' })
    return
  }

  const names = await Promise.all(
    losses.map(async ({ uuid }) => {
      try {
        return await getUserNicknameByUuid(uuid)
      } catch {
        return `<@uid:${uuid}>`
      }
    })
  )

  const lines = losses.map((row, i) => {
    return formatCompactLeaderboardLine({
      rank: i + 1,
      uuid: row.uuid,
      name: names[i],
      amount: -Math.abs(Number(row.lifetime_net))
    })
  })

  await postMessage({
    room,
    message: [
      `\uD83D\uDCC9 **Career Gambling Losses** (Top ${losses.length})`,
      '_Biggest loser \u2192 least_',
      '',
      ...lines
    ].join('\n')
  })
}

async function postMonthlyLeaderboard (room, leaderboardType = 'monthly', args = '') {
  const requested = Number.parseInt(String(args || '').trim(), 10)
  const limit = Number.isFinite(requested) && requested > 0
    ? Math.min(requested, 25)
    : 10

  const rows = snapshotMonthlyLeaderboard(leaderboardType, limit, getCurrentMonthKey())
  if (!rows.length) {
    await postMessage({ room, message: 'No monthly economy results are recorded yet.' })
    return
  }

  const names = await Promise.all(
    rows.map(async ({ uuid }) => {
      try {
        return await getUserNicknameByUuid(uuid)
      } catch {
        return `<@uid:${uuid}>`
      }
    })
  )

  const title = rows[0]?.label || 'Monthly Leaderboard'
  const lines = rows.map((row, i) => {
    return formatCompactLeaderboardLine({
      rank: i + 1,
      uuid: row.uuid,
      name: names[i],
      amount: row.amount
    })
  })

  await postMessage({
    room,
    message: [
      `\uD83D\uDCC5 **${title}** (${rows[0].monthKey})`,
      '',
      ...lines
    ].join('\n')
  })
}

export function createEconomyLeaderboardHandlers () {
  return {
    careerlosses: async ({ room, args }) => {
      await postCareerLossesLeaderboard(room, args)
    },
    biggestlosers: async ({ room, args }) => {
      await postCareerLossesLeaderboard(room, args)
    },

    monthly: async ({ room, args }) => {
      await postMonthlyLeaderboard(room, 'monthly', args)
    },
    monthlydj: async ({ room, args }) => {
      await postMonthlyLeaderboard(room, 'monthlydj', args)
    },
    monthlyf1: async ({ room, args }) => {
      await postMonthlyLeaderboard(room, 'monthlyf1', args)
    },
    monthlygamblers: async ({ room, args }) => {
      await postMonthlyLeaderboard(room, 'monthlygamblers', args)
    },

    networth: async ({ payload, room }) => {
      const user = await getNetWorthForUser(payload?.sender)
      const total = Math.round(Number(user?.totalNetWorth) || 0).toLocaleString()
      const cash = Math.round(Number(user?.cash) || 0).toLocaleString()
      const cars = Math.round(Number(user?.carValue) || 0).toLocaleString()
      const horses = Math.round(Number(user?.horseValue) || 0).toLocaleString()
      const crypto = Math.round(Number(user?.cryptoValue) || 0).toLocaleString()

      await postMessage({
        room,
        message:
          `\uD83C\uDFE6 <@uid:${payload?.sender}> Net Worth: **$${total}**\n` +
          `Cash: $${cash} \u00B7 Cars: $${cars} \u00B7 Horses: $${horses} \u00B7 Crypto: $${crypto}`
      })
    },

    topnetworth: async ({ room }) => {
      const netWorthRows = await getTopNetWorthLeaderboard(5)

      if (!Array.isArray(netWorthRows) || netWorthRows.length === 0) {
        await postMessage({ room, message: 'No net worth data found yet.' })
        return
      }

      const formatted = netWorthRows.map((user, index) => {
        const total = Math.round(Number(user.totalNetWorth) || 0).toLocaleString()
        const cash = Math.round(Number(user.cash) || 0).toLocaleString()
        const cars = Math.round(Number(user.carValue) || 0).toLocaleString()
        const horses = Math.round(Number(user.horseValue) || 0).toLocaleString()
        const crypto = Math.round(Number(user.cryptoValue) || 0).toLocaleString()

        return [
          formatCompactLeaderboardLine({
            rank: index + 1,
            uuid: user.uuid,
            name: user.nickname,
            amount: user.totalNetWorth
          }),
          `   cash $${cash} \u00B7 cars $${cars} \u00B7 horses $${horses} \u00B7 crypto $${crypto} \u00B7 total $${total}`
        ].join('\n')
      })

      await postMessage({
        room,
        message: `\uD83C\uDFC6 **Top Net Worth**\n\n${formatted.join('\n')}`
      })
    },

    economy: async ({ room, args }) => {
      const requested = Number.parseInt(String(args || '').trim(), 10)
      const days = Number.isFinite(requested) && requested > 0
        ? Math.min(requested, 365)
        : 7

      try {
        const overview = await getEconomyOverview(days)
        const sourceLines = overview.topSources.length
          ? overview.topSources.map((row) => `\u2022 ${row.source}: +${formatMoneyLine(row.created)} / -${formatMoneyLine(row.sunk)} / net ${formatMoneyLine(row.net)} (${row.eventCount} evt)`)
          : ['\u2022 No tracked economy events yet.']

        const walletLines = overview.topWallets.length
          ? overview.topWallets.map((row, idx) => formatCompactLeaderboardLine({
            rank: idx + 1,
            uuid: row.uuid,
            name: row.nickname,
            amount: row.balance
          }))
          : ['No wallet data yet.']

        const netWorthLines = overview.topNetWorth.length
          ? overview.topNetWorth.map((row, idx) => formatCompactLeaderboardLine({
            rank: idx + 1,
            uuid: row.uuid,
            name: row.nickname,
            amount: row.totalNetWorth
          }))
          : ['No net worth data yet.']

        await postMessage({
          room,
          message: [
            `\uD83D\uDCCA **Economy Snapshot** (${overview.days}d lookback)`,
            '',
            `Cash in wallets: ${formatMoneyLine(overview.currentCash)}`,
            `Cars: ${formatMoneyLine(overview.currentCarValue)} \u00B7 Horses: ${formatMoneyLine(overview.currentHorseValue)} \u00B7 Crypto: ${formatMoneyLine(overview.currentCryptoValue)}`,
            `Total net worth: ${formatMoneyLine(overview.currentNetWorth)} across ${overview.walletCount} wallet(s)`,
            '',
            `Recent flow: +${formatMoneyLine(overview.recentEvents.created)} / -${formatMoneyLine(overview.recentEvents.sunk)} / net ${formatMoneyLine(overview.recentEvents.net)} (${overview.recentEvents.eventCount} event(s))`,
            '',
            '**Top Sources**',
            ...sourceLines,
            '',
            '**Top Wallets**',
            ...walletLines,
            '',
            '**Top Net Worth**',
            ...netWorthLines
          ].join('\n')
        })
      } catch (err) {
        logger.error('[economy] Error:', err?.message || err)
        await postMessage({ room, message: '\u274C Failed to build the economy snapshot.' })
      }
    }
  }
}
