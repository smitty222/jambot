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

const NAME_PREFIXES = ['Star','Night','Silver','Thunder','Lucky','Crimson','Rocket','River','Ghost','Blue']
const NAME_SUFFIXES = [' Dancer',' Arrow',' Spirit',' Runner',' Blaze',' Mirage',' Glory',' Wind',' Monarch',' Clover']

const fmt = n => n.toLocaleString('en-US')

function randomInRange (min, max, decimals = 1) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals))
}
function randomInt (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateHorseName (existing) {
  const syll = ['ra','in','do','ver','la','mi','ko','zi','ta','shi','na','qu','fo','rum','lux','tor','vin','sol','mer','kai']
  for (let i = 0; i < 1000; i++) {
    const useTable = Math.random() < 0.8 && NAME_PREFIXES.length && NAME_SUFFIXES.length
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
  const lines = [
    '🏁 **Horse Shop** — buy a racehorse and enter our races!',
    '',
    '**Tiers & Prices:**',
    `${HORSE_TIERS.basic.emoji} *Basic* — **$${fmt(HORSE_TIERS.basic.price)}** • Base odds ~ ${HORSE_TIERS.basic.oddsRange[0]}–${HORSE_TIERS.basic.oddsRange[1]} • Career: ${HORSE_TIERS.basic.careerLength[0]}–${HORSE_TIERS.basic.careerLength[1]} races`,
    `${HORSE_TIERS.elite.emoji} *Elite* — **$${fmt(HORSE_TIERS.elite.price)}** • Base odds ~ ${HORSE_TIERS.elite.oddsRange[0]}–${HORSE_TIERS.elite.oddsRange[1]} • Career: ${HORSE_TIERS.elite.careerLength[0]}–${HORSE_TIERS.elite.careerLength[1]} races`,
    `${HORSE_TIERS.champion.emoji} *Champion* — **$${fmt(HORSE_TIERS.champion.price)}** • Base odds ~ ${HORSE_TIERS.champion.oddsRange[0]}–${HORSE_TIERS.champion.oddsRange[1]} • Career: ${HORSE_TIERS.champion.careerLength[0]}–${HORSE_TIERS.champion.careerLength[1]} races`,
    '',
    '**How to buy:**',
    '• `/buyhorse basic`',
    '• `/buyhorse elite`',
    '• `/buyhorse champion`',
    '',
    '_Tip: Lower odds = stronger favorite; volatility affects how much odds swing between races._'
  ]
  return lines.join('\n')
}

export class HorseManager {
  async handleBuyHorse (ctx) {
    // Defensive: ensure we only respond to /buyhorse or /horseshop
    const text = (ctx.message || '').trim()
    if (!/^\/(buyhorse|horseshop)\b/i.test(text)) return

    const userId = ctx.sender
    const nick = (await getUserNickname(userId)) || 'Someone'

    // If no tier given (or user asked for help), show the shop
    const match = text.match(/^\/buyhorse\s*(\w+)?/i)
    const tierKey = match?.[1]?.toLowerCase()
    if (!tierKey || tierKey === 'help' || tierKey === 'shop') {
      return postMessage({ room: ROOM, message: horseShopMessage() })
    }

    const tier = HORSE_TIERS[tierKey]
    if (!tier) {
      return postMessage({ room: ROOM, message: `❗ Unknown tier \`${tierKey}\`. Try \`/buyhorse\` for options.` })
    }

    const balance = await getUserWallet(userId)
    if (typeof balance !== 'number') {
      return postMessage({ room: ROOM, message: `⚠️ ${nick}, I couldn’t read your wallet. Try again shortly.` })
    }
    if (balance < tier.price) {
      return postMessage({
        room: ROOM,
        message: `❗ ${nick}, you need **$${fmt(tier.price)}** but you only have **$${fmt(balance)}**.`
      })
    }

    const paid = await removeFromUserWallet(userId, tier.price)
    if (!paid) {
      return postMessage({ room: ROOM, message: `❗ ${nick}, payment failed. Your balance remains **$${fmt(balance)}**.` })
    }

    const allHorses = await getAllHorses()
    const existing = allHorses.map(h => h.name)
    const name = generateHorseName(existing)

    const [minOdd, maxOdd] = tier.oddsRange
    const baseOdds = randomInt(Math.ceil(minOdd * 2), Math.floor(maxOdd * 2)) / 2
    const volatility = randomInRange(...tier.volatilityRange)
    const careerLength = randomInt(...tier.careerLength)

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
      room: ROOM,
      message: `${tier.emoji} ${nick} bought a **${tierKey.toUpperCase()}** horse: **${name}**! Base odds: ${formatOdds(baseOdds)} (volatility ~ ${volatility}x)`
    })
  }
}

export const horseManager = new HorseManager()
