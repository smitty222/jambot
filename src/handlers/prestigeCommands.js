// src/handlers/prestigeCommands.js
//
// Handlers for /profile, /djstreak, /badges, /titles, /title
// User prestige and progression display commands.

import { postMessage } from '../libs/cometchat.js'
import { getDjStreakStatus, getUserWallet } from '../database/dbwalletmanager.js'
import {
  getEquippedTitle,
  getUserBadges,
  getUserTitles,
  equipTitle,
  getCompactEquippedTitleTag
} from '../database/dbprestige.js'
import { getNetWorthForUser, getLifetimeNet } from '../database/dbwalletmanager.js'

function formatWholeDollars (value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US')
}

function formatMoneyLine (value) {
  return `$${formatWholeDollars(value)}`
}

function titlePrefixForUser (userUUID) {
  const equipped = getEquippedTitle(userUUID)
  return equipped ? `${equipped.emoji || ''} ${equipped.label}`.trim() : null
}

export function compactLeaderboardName (name, uuid, maxLen = 14) {
  const raw = String(name || '').trim()
  if (!raw || /^<@uid:[^>]+>$/.test(raw)) return `user-${String(uuid || '').slice(0, 6)}`
  const clean = raw.replace(/^@/, '').trim()
  return clean.length <= maxLen ? clean : `${clean.slice(0, maxLen - 1)}.`
}

export function formatCompactLeaderboardLine ({ rank, uuid, name, amount }) {
  const titleTag = getCompactEquippedTitleTag(uuid, 7)
  const compactName = compactLeaderboardName(name, uuid, titleTag ? 10 : 14)
  const numeric = Number(amount || 0)
  const money = `${numeric < 0 ? '-' : ''}$${formatWholeDollars(Math.abs(numeric))}`
  return `${rank}. ${titleTag ? `${titleTag} ` : ''}${compactName} ${money}`
}

export function createPrestigeHandlers () {
  return {
    djstreak: async ({ payload, room }) => {
      const userUUID = payload?.sender
      const streak = getDjStreakStatus(userUUID)
      await postMessage({
        room,
        message: [
          '\uD83C\uDFA7 **DJ Streak**',
          `Current streak: ${streak.streakCount}`,
          `Best streak: ${streak.bestStreak}`,
          `Qualifying song: ${streak.lastQualifiedAt ? new Date(streak.lastQualifiedAt).toISOString().slice(0, 10) : 'None yet'}`,
          `Rule: songs with ${3}+ likes extend your streak.`
        ].join('\n')
      })
    },

    badges: async ({ payload, room }) => {
      const userUUID = payload?.sender
      const badges = getUserBadges(userUUID)
      if (!badges.length) {
        await postMessage({
          room,
          message: [
            'No badges yet. Here\'s how to earn them:',
            '🎚️ DJ a song with 3+ likes (streak badges at 3, 5, 8, 12 songs)',
            '💸 Finish #1 on a monthly leaderboard',
            '💎 Trigger a jackpot bonus in slots',
            '🏇 Own a winning racehorse',
            '🂡 Hit a natural blackjack',
            '🎱 Win the lottery',
            'Use `/badges` to check your collection anytime.'
          ].join('\n')
        })
        return
      }
      await postMessage({
        room,
        message: [
          '\uD83C\uDFC5 **Your Badges**',
          '',
          ...badges.map((badge) => `${badge.emoji || '\u2022'} ${badge.label} \`${badge.key}\``)
        ].join('\n')
      })
    },

    titles: async ({ payload, room }) => {
      const userUUID = payload?.sender
      const titles = getUserTitles(userUUID)
      const equipped = getEquippedTitle(userUUID)
      if (!titles.length) {
        await postMessage({ room, message: 'No titles yet. Win a monthly board or hit the biggest DJ streak milestone.' })
        return
      }
      await postMessage({
        room,
        message: [
          '\uD83C\uDF96\uFE0F **Your Titles**',
          equipped ? `Equipped: ${equipped.emoji || ''} ${equipped.label}`.trim() : 'Equipped: none',
          '',
          ...titles.map((title) => `${title.emoji || '\u2022'} ${title.label} \`${title.key}\`${equipped?.key === title.key ? ' [equipped]' : ''}`)
        ].join('\n')
      })
    },

    title: async ({ payload, room, args }) => {
      const userUUID = payload?.sender
      const trimmed = String(args || '').trim()
      if (!trimmed) {
        await postMessage({ room, message: 'Usage: `/title equip <key>` or `/title clear`' })
        return
      }

      if (/^clear$/i.test(trimmed)) {
        equipTitle(userUUID, null)
        await postMessage({ room, message: 'Title cleared.' })
        return
      }

      const match = trimmed.match(/^equip\s+([a-z0-9_]+)$/i)
      if (!match) {
        await postMessage({ room, message: 'Usage: `/title equip <key>` or `/title clear`' })
        return
      }

      const key = match[1]
      const ok = equipTitle(userUUID, key)
      if (!ok) {
        await postMessage({ room, message: `You do not own the title \`${key}\` or it has expired.` })
        return
      }

      const equipped = getEquippedTitle(userUUID)
      await postMessage({ room, message: `Equipped title: ${equipped?.emoji || ''} ${equipped?.label || key}`.trim() })
    },

    profile: async ({ payload, room }) => {
      const userUUID = payload?.sender
      const title = titlePrefixForUser(userUUID)
      const badges = getUserBadges(userUUID)
      const netWorth = await getNetWorthForUser(userUUID)
      const streak = getDjStreakStatus(userUUID)
      const balance = getUserWallet(userUUID)
      const lifetimeNet = getLifetimeNet(userUUID)

      const badgeDisplay = badges.length
        ? `${badges.map(b => b.emoji || '•').join(' ')} (${badges.length})`
        : 'none'

      await postMessage({
        room,
        message: [
          '\uD83E\uDEAA **Profile**',
          title ? `Title: ${title}` : 'Title: none',
          `Cash: ${formatMoneyLine(balance)} \u00B7 Net Worth: ${formatMoneyLine(netWorth?.totalNetWorth || 0)}`,
          `Lifetime Net: ${formatMoneyLine(lifetimeNet)}`,
          `DJ Streak: ${streak.streakCount} current / ${streak.bestStreak} best`,
          `Badges: ${badgeDisplay}`
        ].join('\n')
      })
    }
  }
}
