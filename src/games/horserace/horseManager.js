// src/handlers/horse/horsemanager.js
import { postMessage } from '../../libs/cometchat.js'
import { getUserNickname } from '../../utils/nickname.js'
import { getUserWallet, removeFromUserWallet } from '../../database/dbwalletmanager.js'
import { getAllHorses, insertHorse } from '../../database/dbhorses.js'
import { formatOdds } from './utils/odds.js'

const ROOM = process.env.ROOM_UUID

// Define the available horse tiers. Prices scale with power: basic < elite < champion.
const HORSE_TIERS = {
  basic: { price: 2000, oddsRange: [6.0, 9.0], volatilityRange: [1.5, 2.5], careerLength: [8, 12], emoji: '' },
  elite: { price: 7000, oddsRange: [4.0, 7.0], volatilityRange: [1.0, 2.0], careerLength: [12, 18], emoji: '' },
  champion: { price: 15000, oddsRange: [2.5, 5.0], volatilityRange: [0.5, 1.5], careerLength: [18, 24], emoji: '' }
}

// Display order + labels
const TIER_ORDER = ['champion', 'elite', 'basic']
const TIER_LABELS = {
  basic: 'Basic',
  elite: 'Elite',
  champion: 'Champion'
}

// Formatting helpers
const fmt = n => Number(n || 0).toLocaleString('en-US')
const fmt$ = n => `$${fmt(n)}`

function randomInRange (min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}
function randomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const NAME_PREFIXES = ['Star', 'Night', 'Silver', 'Thunder', 'Lucky', 'Crimson', 'Rocket', 'River', 'Ghost', 'Blue']
const NAME_SUFFIXES = [' Dancer', ' Arrow', ' Spirit', ' Runner', ' Blaze', ' Mirage', ' Glory', ' Wind', ' Monarch', ' Clover']

function generateHorseName (existing) {
  const syll = ['ra', 'in', 'do', 'ver', 'la', 'mi', 'ko', 'zi', 'ta', 'shi', 'na', 'qu', 'fo', 'rum', 'lux', 'tor', 'vin', 'sol', 'mer', 'kai']
  for (let i = 0; i < 1000; i++) {
    const useTable = Math.random() < 0.8
    const name = useTable
      ? NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)] +
        NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]
      : Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => syll[Math.floor(Math.random() * syll.length)])
        .join('')
        .replace(/^./, c => c.toUpperCase())

    if (!existing.includes(name)) return name
  }
  throw new Error('Unable to generate unique horse name.')
}

/**
 * Sort horses so Champion shows first, then Elite, then Basic.
 * Secondary sort: active (not retired) first, then name.
 */
function sortHorsesForDisplay (horses = []) {
  const tierRank = t => {
    const idx = TIER_ORDER.indexOf((t || '').toLowerCase())
    return idx === -1 ? 999 : idx
  }

  return [...horses].sort((a, b) => {
    const tr = tierRank(a.tier) - tierRank(b.tier)
    if (tr !== 0) return tr

    // active first (retired=false before retired=true)
    const ar = Number(Boolean(a.retired)) - Number(Boolean(b.retired))
    if (ar !== 0) return ar

    const an = (a.name || '').toLowerCase()
    const bn = (b.name || '').toLowerCase()
    return an.localeCompare(bn)
  })
}

function groupHorsesByTier (horses = []) {
  const grouped = { champion: [], elite: [], basic: [], other: [] }
  for (const h of horses) {
    const key = (h.tier || '').toLowerCase()
    if (grouped[key]) grouped[key].push(h)
    else grouped.other.push(h)
  }
  return grouped
}

/**
 * Use this in your "enter a horse" prompt UI.
 * Pass the list of eligible horses (usually only the user's, and not retired).
 */
export function horseEntryMessage ({ horses = [], title = 'Choose your horse' } = {}) {
  const sorted = sortHorsesForDisplay(horses)
  const grouped = groupHorsesByTier(sorted)

  const lines = []
  lines.push(`**${title}**`)
  lines.push('_Champion first, then Elite, then Basic._')
  lines.push('')

  const section = (tierKey) => {
    const list = grouped[tierKey] || []
    if (!list.length) return

    lines.push(`**${TIER_LABELS[tierKey]}**`)
    for (let i = 0; i < list.length; i++) {
      const h = list[i]
      const emoji = h.emoji || HORSE_TIERS[tierKey]?.emoji || ''
      const retiredTag = h.retired ? ' _(retired)_' : ''
      const wins = fmt(h.wins)
      const races = fmt(h.racesParticipated)
      const career = h.careerLength != null ? fmt(h.careerLength) : '?'
      const baseOdds = h.baseOdds != null ? formatOdds(h.baseOdds) : '?'

      // Selection token can be name/index/id depending on your race handler.
      lines.push(`• ${emoji} **${h.name}** — odds ${baseOdds} • W ${wins} / R ${races} • career ${races}/${career}${retiredTag}`)
    }
    lines.push('')
  }

  section('champion')
  section('elite')
  section('basic')

  if (!grouped.champion.length && !grouped.elite.length && !grouped.basic.length) {
    lines.push('No horses available.')
  }

  return lines.join('\n').trim()
}

function horseShopMessage () {
  const b = HORSE_TIERS.basic
  const e = HORSE_TIERS.elite
  const c = HORSE_TIERS.champion

  return [
    '**Horse Shop** — buy a racehorse and enter our races!',
    '',
    '**Tiers & Price:**',
    `${c.emoji} *Champion* — **${fmt$(c.price)}** • Base odds ~ ${c.oddsRange[0]}–${c.oddsRange[1]} • Career: ${c.careerLength[0]}–${c.careerLength[1]} races`,
    `${e.emoji} *Elite* — **${fmt$(e.price)}** • Base odds ~ ${e.oddsRange[0]}–${e.oddsRange[1]} • Career: ${e.careerLength[0]}–${e.careerLength[1]} races`,
    `${b.emoji} *Basic* — **${fmt$(b.price)}** • Base odds ~ ${b.oddsRange[0]}–${b.oddsRange[1]} • Career: ${b.careerLength[0]}–${b.careerLength[1]} races`,
    '',
    '**How to buy:**',
    '• `/buyhorse basic`',
    '• `/buyhorse elite`',
    '• `/buyhorse champion`',
    '',
    '_Tip: Lower odds = stronger favorite; volatility affects how much odds swing between races._'
  ].join('\n')
}

// THIS is what your router calls:
// in message.js you already have: if (payload.message.startsWith('/buyhorse')) return handleBuyHorse(payload)
export async function handleBuyHorse (payload) {
  const room = payload.room || ROOM
  const text = (payload.message || '').trim()
  const userId = payload.sender
  const nick = (await getUserNickname(userId)) || 'Someone'

  // If no tier provided, or user typed /buyhorse help/shop → show the shop
  const match = text.match(/^\/buyhorse\s*(\w+)?/i)
  const tierKey = match?.[1]?.toLowerCase()
  if (!tierKey || tierKey === 'help' || tierKey === 'shop') {
    return postMessage({ room, message: horseShopMessage() })
  }

  const tier = HORSE_TIERS[tierKey]
  if (!tier) {
    return postMessage({ room, message: `❗ Unknown tier \`${tierKey}\`. Try \`/buyhorse\` for options.` })
  }

  const balance = await getUserWallet(userId)
  if (typeof balance !== 'number') {
    return postMessage({ room, message: `⚠️ ${nick}, I couldn’t read your wallet. Try again shortly.` })
  }

  if (balance < tier.price) {
    return postMessage({
      room,
      message: `❗ ${nick}, you need **${fmt$(tier.price)}** but you only have **${fmt$(balance)}**.`
    })
  }

  const paid = await removeFromUserWallet(userId, tier.price)
  if (!paid) {
    return postMessage({
      room,
      message: `❗ ${nick}, payment failed. Your balance remains **${fmt$(balance)}**.`
    })
  }

  const allHorses = await getAllHorses()
  const existing = allHorses.map(h => h.name)

  const [minOdd, maxOdd] = tier.oddsRange
  const baseOdds = randomInt(Math.ceil(minOdd * 2), Math.floor(maxOdd * 2)) / 2
  const volatility = randomInRange(...tier.volatilityRange)
  const careerLength = randomInt(...tier.careerLength)
  const name = generateHorseName(existing)

  await insertHorse({
    name,
    baseOdds,
    volatility,
    wins: 0,
    racesParticipated: 0,
    careerLength,
    owner: nick,
    ownerId: userId,
    tier: tierKey,
    emoji: tier.emoji,
    price: tier.price,
    retired: false
  })

  return postMessage({
    room,
    message: `${tier.emoji} ${nick} bought a **${tierKey.toUpperCase()}** horse: **${name}**! Base odds: ${formatOdds(baseOdds)} (volatility ~ ${volatility}x)`
  })
}
