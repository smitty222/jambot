// src/handlers/horse/horsemanager.js
import { postMessage } from '../../libs/cometchat.js'
import { getUserNickname } from '../../utils/nickname.js'
import { getUserWallet, removeFromUserWallet } from '../../database/dbwalletmanager.js'
import { getAllHorses, insertHorse } from '../../database/dbhorses.js'
import { formatOdds } from './utils/odds.js'

const ROOM = process.env.ROOM_UUID

const HORSE_TIERS = {
  basic:    { price: 2000,  oddsRange: [6.0, 9.0], volatilityRange: [1.5, 2.5], careerLength: [8, 12],  emoji: '🐴' },
  elite:    { price: 7000,  oddsRange: [4.0, 7.0], volatilityRange: [1.0, 2.0], careerLength: [12, 18], emoji: '🐎' },
  champion: { price: 15000, oddsRange: [2.5, 5.0], volatilityRange: [0.5, 1.5], careerLength: [18, 24], emoji: '🐉' }
}

const fmt = n => Number(n || 0).toLocaleString('en-US')

function randomInRange (min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}
function randomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const NAME_PREFIXES = ['Star','Night','Silver','Thunder','Lucky','Crimson','Rocket','River','Ghost','Blue']
const NAME_SUFFIXES = [' Dancer',' Arrow',' Spirit',' Runner',' Blaze',' Mirage',' Glory',' Wind',' Monarch',' Clover']
function generateHorseName (existing) {
  const syll = ['ra','in','do','ver','la','mi','ko','zi','ta','shi','na','qu','fo','rum','lux','tor','vin','sol','mer','kai']
  for (let i = 0; i < 1000; i++) {
    const useTable = Math.random() < 0.8
    const name = useTable
      ? NAME_PREFIXES[Math.floor(Math.random()*NAME_PREFIXES.length)]
        + NAME_SUFFIXES[Math.floor(Math.random()*NAME_SUFFIXES.length)]
      : Array.from({ length: 2 + Math.floor(Math.random()*2) }, () => syll[Math.floor(Math.random()*syll.length)])
          .join('')
          .replace(/^./, c => c.toUpperCase())
    if (!existing.includes(name)) return name
  }
  throw new Error('Unable to generate unique horse name.')
}

function horseShopMessage () {
  const b = HORSE_TIERS.basic, e = HORSE_TIERS.elite, c = HORSE_TIERS.champion
  return [
    '🏁 **Horse Shop** — buy a racehorse and enter our races!',
    '',
    '**Tiers & Prices:**',
    `${b.emoji} *Basic* — **$${fmt(b.price)}** • Base odds ~ ${b.oddsRange[0]}–${b.oddsRange[1]} • Career: ${b.careerLength[0]}–${b.careerLength[1]} races`,
    `${e.emoji} *Elite* — **$${fmt(e.price)}** • Base odds ~ ${e.oddsRange[0]}–${e.oddsRange[1]} • Career: ${e.careerLength[0]}–${e.careerLength[1]} races`,
    `${c.emoji} *Champion* — **$${fmt(c.price)}** • Base odds ~ ${c.oddsRange[0]}–${c.oddsRange[1]} • Career: ${c.careerLength[0]}–${c.careerLength[1]} races`,
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
    return postMessage({ room, message: `❗ ${nick}, you need **$${fmt(tier.price)}** but you only have **$${fmt(balance)}**.` })
  }

  const paid = await removeFromUserWallet(userId, tier.price)
  if (!paid) {
    return postMessage({ room, message: `❗ ${nick}, payment failed. Your balance remains **$${fmt(balance)}**.` })
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
