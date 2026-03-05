// src/handlers/horse/horsemanager.js
import { postMessage } from '../../libs/cometchat.js'
import { getUserNickname } from '../../utils/nickname.js'
import { getUserWallet, removeFromUserWallet, addToUserWallet } from '../../database/dbwalletmanager.js'
import { getAllHorses, getUserHorses, insertHorse, deleteHorseOwnedByUser } from '../../database/dbhorses.js'
import { formatOdds } from './utils/odds.js'
import { listHorseTierImageFiles, buildHorseImageUrl, pickHorseImageUrl } from './utils/images.js'

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
const TIER_ALIASES = { '1': 'basic', '2': 'elite', '3': 'champion' }

// Formatting helpers
const fmt = n => Number(n || 0).toLocaleString('en-US')
const fmt$ = n => `$${fmt(n)}`
const clamp = (n, a, b) => Math.max(a, Math.min(b, n))
const toInt = (n) => Math.floor(Number(n || 0))

function randomInRange (min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}
function randomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function horseLabel (horse) {
  const emoji = String(horse?.emoji || '').trim()
  const name = String(horse?.name || 'Unknown')
  return `${emoji ? `${emoji} ` : ''}${name}`.trim()
}

function estimateHorseResaleValue (horse) {
  const price = Math.max(0, toInt(horse?.price))
  if (price <= 0) return 0

  const tier = String(horse?.tier || '').toLowerCase()
  const races = Math.max(0, toInt(horse?.racesParticipated))
  const wins = Math.max(0, toInt(horse?.wins))
  const careerLength = Math.max(0, toInt(horse?.careerLength))
  const retired = !!horse?.retired || Number(horse?.retired) === 1

  const basePctByTier = {
    basic: 0.70,
    elite: 0.66,
    champion: 0.62
  }
  const basePct = basePctByTier[tier] ?? 0.64
  const baseValue = price * basePct

  const left = Math.max(0, careerLength - races)
  const leftPct = careerLength > 0 ? clamp(left / careerLength, 0, 1) : 0.8
  // Strong depreciation near career end: even high-performing horses should
  // not return a large payout when they are nearly done.
  const lifeFactor = retired ? 0.10 : (0.10 + (0.90 * Math.pow(leftPct, 1.85)))

  const winRate = wins / Math.max(1, races)
  const perfRaw = (wins * 300) + Math.floor(winRate * price * 0.08)
  // Performance bonus also shrinks sharply as career runs out.
  const perfBonus = Math.floor(perfRaw * Math.pow(leftPct, 2.4))
  const performanceBonus = Math.min(Math.floor(price * 0.10), perfBonus)

  const raw = Math.floor((baseValue * lifeFactor) + performanceBonus)
  const minFloor = Math.floor(price * (retired ? 0.05 : 0.10))
  const maxCapByLife = Math.floor(price * (retired ? 0.18 : (0.20 + (0.65 * Math.pow(leftPct, 1.4)))))
  const maxCap = Math.max(minFloor, maxCapByLife)
  return Math.max(minFloor, Math.min(maxCap, raw))
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
    '• `/buyhorse <tier>` (showroom)',
    '• `/buyhorse <tier> <option#>` (buy specific image)',
    'Examples: `/buyhorse basic` · `/buyhorse basic 1`',
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
  const argsRaw = (text.match(/^\/buyhorse(?:\s+(.+))?$/i) || [])[1] || ''
  const parts = argsRaw.trim().split(/\s+/).filter(Boolean)
  const tierArg = parts[0]?.toLowerCase()
  const pickArg = parts[1]
  const tierKey = TIER_ALIASES[tierArg] || tierArg

  if (!tierKey || /^(help|shop|list)$/i.test(tierKey)) {
    return postMessage({ room, message: horseShopMessage() })
  }

  const tier = HORSE_TIERS[tierKey]
  if (!tier) {
    return postMessage({ room, message: `❗ Unknown tier \`${tierKey}\`. Try \`/buyhorse\` for options.` })
  }

  const tierImageFiles = listHorseTierImageFiles(tierKey).sort((a, b) => a.localeCompare(b))
  if (!pickArg || /^(help|list|show|shop)$/i.test(pickArg)) {
    const lines = []
    lines.push(`${TIER_LABELS[tierKey]} SHOWROOM`)
    lines.push(`Price: ${fmt$(tier.price)}`)
    lines.push('')

    if (!tierImageFiles.length) {
      lines.push('No image options are available in this tier yet.')
      lines.push(`You can still buy one with: /buyhorse ${tierKey} 1`)
      await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
      return
    }

    lines.push('Choose an option number:')
    lines.push('')
    lines.push('Options are shown in image posts below.')
    lines.push('')
    lines.push(`Buy with: /buyhorse ${tierKey} <option#>`)
    lines.push(`Example: /buyhorse ${tierKey} 1`)
    await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })

    for (let i = 0; i < Math.min(10, tierImageFiles.length); i++) {
      const file = tierImageFiles[i]
      const url = buildHorseImageUrl(tierKey, file)
      if (!url) continue
      await postMessage({
        room,
        message: `Option #${i + 1} — ${TIER_LABELS[tierKey]}`,
        images: [url]
      })
    }
    if (tierImageFiles.length > 10) {
      await postMessage({ room, message: `…and ${tierImageFiles.length - 10} more options. Use /buyhorse ${tierKey} <option#>.` })
    }
    return
  }

  const selectedOption = Number.parseInt(String(pickArg), 10)
  if (!Number.isFinite(selectedOption) || selectedOption < 1) {
    return postMessage({
      room,
      message: `❗ ${nick}, choose a valid option number. Browse options with \`/buyhorse ${tierKey}\`.`
    })
  }
  if (tierImageFiles.length && selectedOption > tierImageFiles.length) {
    return postMessage({
      room,
      message: `❗ ${nick}, option #${selectedOption} doesn't exist for ${TIER_LABELS[tierKey]}. Use \`/buyhorse ${tierKey}\` to view options.`
    })
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
  const selectedFile = tierImageFiles.length ? tierImageFiles[selectedOption - 1] : null
  const imageUrl = selectedFile ? buildHorseImageUrl(tierKey, selectedFile) : pickHorseImageUrl(tierKey)

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
    retired: false,
    imageUrl
  })

  const updatedBalance = await getUserWallet(userId)
  return postMessage({
    room,
    message:
      `${tier.emoji} ${nick} bought a **${tierKey.toUpperCase()}** horse: **${name}**!\n` +
      `${selectedFile ? `🖼️ Chosen option: **#${selectedOption}**\n` : ''}` +
      `Base odds: ${formatOdds(baseOdds)} (volatility ~ ${volatility}x)\n` +
      `💰 Balance: **${fmt$(updatedBalance)}**`,
    images: imageUrl ? [imageUrl] : undefined
  })
}

export async function handleSellHorse (payload) {
  const room = payload?.room || ROOM
  const text = String(payload?.message || '').trim()
  const userId = payload?.sender
  const nick = (await getUserNickname(userId)) || 'Someone'
  const nameArg = (text.match(/^\/(?:sellhorse|sell\s+horse)(?:\s+(.+))?$/i) || [])[1]

  const horses = await getUserHorses(userId)
  if (!horses?.length) {
    await postMessage({ room, message: `${nick}, you don’t own any horses yet. Try **/buyhorse**.` })
    return
  }

  if (!nameArg) {
    const lines = []
    lines.push(`${nick}'s STABLE SELL VALUES`)
    lines.push('')

    const sorted = horses.slice().sort((a, b) => estimateHorseResaleValue(b) - estimateHorseResaleValue(a))
    for (const h of sorted.slice(0, 12)) {
      const resale = estimateHorseResaleValue(h)
      const retired = (!!h?.retired || Number(h?.retired) === 1) ? ' · RET' : ''
      lines.push(`• ${horseLabel(h)} — ${fmt$(resale)}${retired}`)
    }
    if (sorted.length > 12) lines.push(`…and ${sorted.length - 12} more horses.`)

    lines.push('')
    lines.push('Sell one: `/sellhorse <horse name>`')
    await postMessage({ room, message: '```\n' + lines.join('\n') + '\n```' })
    return
  }

  const q = String(nameArg).toLowerCase()
  const horse =
    horses.find(h => String(h.name || '').toLowerCase() === q) ||
    horses.find(h => String(h.name || '').toLowerCase().includes(q))

  if (!horse) {
    await postMessage({ room, message: `❗ ${nick}, couldn’t find that horse in your stable.` })
    return
  }

  const resale = estimateHorseResaleValue(horse)
  const sold = await deleteHorseOwnedByUser(horse.id, userId)
  if (!sold) {
    await postMessage({ room, message: `⚠️ ${nick}, couldn't complete that sale. Try again.` })
    return
  }

  await addToUserWallet(userId, resale, nick)
  const updated = await getUserWallet(userId)
  const original = toInt(horse.price)
  const delta = resale - original
  const deltaLabel = `${delta >= 0 ? '+' : ''}${fmt$(delta)}`

  await postMessage({
    room,
    message:
      `💸 ${nick} sold **${horseLabel(horse)}** for **${fmt$(resale)}**.\n` +
      `Buy-in: ${fmt$(original)} · Sale vs buy-in: ${deltaLabel}\n` +
      `💰 Balance: **${fmt$(updated)}**`,
    images: horse.imageUrl ? [horse.imageUrl] : undefined
  })
}
