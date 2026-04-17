// src/handlers/prestigeCommands.js
//
// Handlers for /profile, /djstreak, /badges, /titles, /title
// User prestige and progression display commands.

import { postMessage } from '../libs/cometchat.js'
import { getDjStreakStatus, getUserWallet } from '../database/dbwalletmanager.js'
import {
  getEquippedTitle,
  getEquippedBadge,
  getUserBadges,
  getUserTitles,
  equipTitle,
  equipBadge,
  getCompactEquippedTitleTag,
  decoratedMention
} from '../database/dbprestige.js'
import { getNetWorthForUser, getLifetimeNet } from '../database/dbwalletmanager.js'
import { getDisplayName } from '../utils/names.js'

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
      const equippedBadge = getEquippedBadge(userUUID)
      if (!badges.length) {
        await postMessage({
          room,
          message: [
            'You have not earned any badges yet. Here\'s how to get them:',
            '🎚️ **DJ streaks** — play songs that get 3+ likes back-to-back (milestones at 3, 5, 8, and 12 songs)',
            '💸 **Monthly leaderboards** — finish #1 in net gain, DJ earnings, F1, or gambling for the month',
            '💎 **Slots** — trigger a bonus round, free spins, or jackpot',
            '🏇 **Horse racing** — own a horse that wins a race or hits a big payout',
            '🂡 **Blackjack** — hit a natural blackjack or win a doubled-down hand',
            '🎱 **Lottery** — win the lottery',
            'Badges show on your `/profile`.'
          ].join('\n')
        })
        return
      }
      await postMessage({
        room,
        message: [
          `🏅 **Your Badges** (${badges.length})`,
          equippedBadge ? `Equipped: ${equippedBadge.emoji || ''} ${equippedBadge.label}`.trim() : 'Equipped: none',
          '',
          ...badges.map((badge) => `${badge.emoji || '•'} **${badge.label}** \`${badge.key}\` — ${badge.description}${equippedBadge?.key === badge.key ? ' [equipped]' : ''}`)
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

    badge: async ({ payload, room, args }) => {
      const userUUID = payload?.sender
      const trimmed = String(args || '').trim()
      if (!trimmed) {
        await postMessage({
          room,
          message: [
            'To equip a badge: `/badge equip <key>`',
            'To remove your badge: `/badge clear`',
            'The key is the `code` shown next to each badge in `/badges`.'
          ].join('\n')
        })
        return
      }

      if (/^clear$/i.test(trimmed)) {
        equipBadge(userUUID, null)
        await postMessage({ room, message: 'Badge cleared. Your icon will no longer show next to your name.' })
        return
      }

      const match = trimmed.match(/^equip\s+([a-z0-9_]+)$/i)
      if (!match) {
        await postMessage({
          room,
          message: [
            'Usage: `/badge equip <key>` or `/badge clear`',
            'The key is the `code` shown next to each badge in `/badges`.'
          ].join('\n')
        })
        return
      }

      const key = match[1]
      const ok = equipBadge(userUUID, key)
      if (!ok) {
        const badges = getUserBadges(userUUID)
        if (!badges.length) {
          await postMessage({ room, message: 'You have not earned any badges yet. Earn one first, then equip it.' })
        } else {
          await postMessage({
            room,
            message: [
              `\`${key}\` is not in your collection or has expired.`,
              'Your available badges:',
              ...badges.map((b) => `${b.emoji || '•'} ${b.label} \`${b.key}\``)
            ].join('\n')
          })
        }
        return
      }

      const equipped = getEquippedBadge(userUUID)
      await postMessage({
        room,
        message: `${equipped?.emoji || ''} **${equipped?.label || key}** equipped — your icon will now show next to your name.`.trim()
      })
    },

    title: async ({ payload, room, args }) => {
      const userUUID = payload?.sender
      const trimmed = String(args || '').trim()
      if (!trimmed) {
        await postMessage({
          room,
          message: [
            'To equip a title: `/title equip <key>`',
            'To remove your title: `/title clear`',
            'The key is the `code` shown next to each title in `/titles`.'
          ].join('\n')
        })
        return
      }

      if (/^clear$/i.test(trimmed)) {
        equipTitle(userUUID, null)
        await postMessage({ room, message: 'Title cleared. Your name will appear without a title tag.' })
        return
      }

      const match = trimmed.match(/^equip\s+([a-z0-9_]+)$/i)
      if (!match) {
        await postMessage({
          room,
          message: [
            'Usage: `/title equip <key>` or `/title clear`',
            'The key is the `code` shown next to each title in `/titles`.'
          ].join('\n')
        })
        return
      }

      const key = match[1]
      const ok = equipTitle(userUUID, key)
      if (!ok) {
        const titles = getUserTitles(userUUID)
        if (!titles.length) {
          await postMessage({ room, message: `You have not earned any titles yet. Win a monthly leaderboard or hit a DJ streak milestone to unlock your first one.` })
        } else {
          await postMessage({
            room,
            message: [
              `\`${key}\` is not in your collection or has expired.`,
              'Your available titles:',
              ...titles.map((t) => `${t.emoji || '•'} ${t.label} \`${t.key}\``)
            ].join('\n')
          })
        }
        return
      }

      const equipped = getEquippedTitle(userUUID)
      await postMessage({
        room,
        message: `${equipped?.emoji || ''} **${equipped?.label || key}** equipped — your title will now show on leaderboards.`.trim()
      })
    },

    profile: async ({ payload, room }) => {
      const userUUID = payload?.sender
      const username = getDisplayName(userUUID)
      const title = titlePrefixForUser(userUUID)
      const badges = getUserBadges(userUUID)
      const netWorth = await getNetWorthForUser(userUUID)
      const streak = getDjStreakStatus(userUUID)
      const balance = getUserWallet(userUUID)
      const lifetimeNet = getLifetimeNet(userUUID)

      const equippedBadge = getEquippedBadge(userUUID)
      const badgeDisplay = badges.length
        ? `${badges.map(b => b.emoji || '•').join(' ')} (${badges.length})`
        : 'none'

      await postMessage({
        room,
        message: [
          `\uD83E\uDEAA **${username}'s Profile**`,
          title ? `Title: ${title}` : 'Title: none',
          equippedBadge ? `Badge: ${equippedBadge.emoji || ''} ${equippedBadge.label}`.trim() : 'Badge: none',
          `Cash: ${formatMoneyLine(balance)} \u00B7 Net Worth: ${formatMoneyLine(netWorth?.totalNetWorth || 0)}`,
          `Lifetime Net: ${formatMoneyLine(lifetimeNet)}`,
          `DJ Streak: ${streak.streakCount} current / ${streak.bestStreak} best`,
          `Badges: ${badgeDisplay}`
        ].join('\n')
      })
    }
  }
}
