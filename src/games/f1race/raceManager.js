// src/games/f1race/raceManager.js

import { postMessage } from '../../libs/cometchat.js'
import { getUserWallet, creditGameWin, applyGameDeltaInTransaction } from '../../database/dbwalletmanager.js'
import { getUserNickname } from '../../utils/nickname.js'
import { getTeamByOwner } from '../../database/dbteams.js'
import { recordCarRaceFinancials } from '../../database/dbcars.js'
import { logF1RaceResults } from '../../database/dbf1results.js'
import { safeCall } from './service.js'
import { runRace } from './simulation.js'
import {
  F1_CAR_TIERS,
  F1_RACE_SETTINGS,
  getF1EntryFee,
  getF1RaceLabel,
  normalizeF1Tier
} from './config.js'
import { calculateRacePayouts, calculateRacePurse } from './payouts.js'
import { pickTrack } from './utils/track.js'
import { fmtMoney } from './utils/render.js'

const DELAY = (ms) => new Promise(resolve => setTimeout(resolve, ms))

function rint (min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function clamp (n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function carLabel (car) {
  const livery = String(car?.livery || '').trim() || '⬛'
  const name = String(car?.name || '').trim()
  return `${livery} ${name}`.trim()
}

function teamLabel (team) {
  if (!team) return '—'
  const badge = String(team.badge || '').trim()
  const name = String(team.name || '').trim()
  const short = name.length > 10 ? `${name.slice(0, 9)}…` : name
  return (badge ? `${badge} ${short}` : short).trim() || '—'
}

function generateBotName (usedLower = new Set()) {
  const ADJ = [
    'Neon', 'Apex', 'Turbo', 'Crimson', 'Midnight', 'Solar', 'Phantom', 'Vortex', 'Cobalt', 'Titan',
    'Quantum', 'Iron', 'Velvet', 'Rapid', 'Savage', 'Atomic', 'Inferno', 'Glacial', 'Royal', 'Stealth',
    'Ivory', 'Chrome', 'Scarlet', 'Azure', 'Obsidian', 'Golden', 'Electric', 'Hyper', 'Final', 'Prime'
  ]
  const NOUN = [
    'Viper', 'Wraith', 'Comet', 'Falcon', 'Raven', 'Blitz', 'Mirage', 'Arrow', 'Specter', 'Nova',
    'Eclipse', 'Rocket', 'Cyclone', 'Tempest', 'Raptor', 'Helix', 'Vector', 'Pulse', 'Meteor', 'Axiom',
    'Striker', 'Phantom', 'Horizon', 'Thunder', 'Drift', 'Astra', 'Blade', 'Fury', 'Pioneer', 'Vertex'
  ]

  for (let i = 0; i < 80; i++) {
    const name = `${ADJ[rint(0, ADJ.length - 1)]} ${NOUN[rint(0, NOUN.length - 1)]}`
    if (!usedLower.has(name.toLowerCase())) return name
  }

  return `House Racer ${rint(100, 999)}`
}

function createBotCar (tierKey, usedNames = new Set()) {
  const normalizedTier = normalizeF1Tier(tierKey) || 'starter'
  const tier = F1_CAR_TIERS[normalizedTier] || F1_CAR_TIERS.starter
  const biasByTier = { starter: -1, pro: 0, hyper: 1, legendary: 2 }
  const statJitter = (base) => clamp(Number(base || 50) + Number(biasByTier[normalizedTier] || 0) + rint(-4, 4), 35, 96)
  const name = generateBotName(usedNames)

  return {
    id: null,
    ownerId: null,
    isBot: true,
    name,
    livery: tier.livery,
    tier: normalizedTier,
    price: 0,
    power: statJitter(tier.base.power),
    handling: statJitter(tier.base.handling),
    aero: statJitter(tier.base.aero),
    reliability: statJitter(tier.base.reliability),
    tire: statJitter(tier.base.tire),
    wear: 0,
    imageUrl: null,
    teamLabel: '—',
    label: `◻️ ${name}`
  }
}

async function refundEntryCharges (entryCharges = [], reason = 'Grand Prix cancelled') {
  for (const charge of entryCharges) {
    const amount = Math.max(0, Math.floor(Number(charge?.amount || 0)))
    if (!charge?.userId || amount <= 0) continue

    await safeCall(creditGameWin, [charge.userId, amount, null, {
      source: 'f1',
      category: 'entry_refund',
      note: reason
    }]).catch(() => null)
  }
}

async function sendLightsOutSequence (roomId) {
  await postMessage({ room: roomId, message: '🚥 Cars lining up on the grid...' })
  await DELAY(1200)
  await postMessage({ room: roomId, message: 'Engines revving...' })
  await DELAY(1500)
  await postMessage({ room: roomId, message: '🔴' })
  await DELAY(1000)
  await postMessage({ room: roomId, message: '🔴 🔴' })
  await DELAY(900)
  await postMessage({ room: roomId, message: '🔴 🔴 🔴' })
  await DELAY(800)
  await postMessage({ room: roomId, message: '🔴 🔴 🔴 🔴' })
  await DELAY(700)
  await postMessage({ room: roomId, message: '🔴 🔴 🔴 🔴 🔴' })
  await DELAY(1200)
  await DELAY(400 + Math.random() * 900)
  await postMessage({ room: roomId, message: '🟢 LIGHTS OUT!!! 🏁' })
  await DELAY(600)
}

async function postGrandPrixResults ({
  roomId,
  raceLabel,
  purse,
  placements = []
} = {}) {
  const lines = [`🏁 ${raceLabel} Results`, '']

  for (const placement of placements) {
    const owner = placement.isBot ? '' : ` (${placement.ownerName || 'Unknown'})`
    const payoutText = placement.payout > 0 ? ` — ${fmtMoney(placement.payout)}` : ''
    lines.push(`${placement.finishPosition}. ${placement.carName}${owner}${payoutText}`)
  }

  lines.push('')
  lines.push(`💰 Total Purse: ${fmtMoney(purse)}`)
  await postMessage({ room: roomId, message: lines.join('\n') })
}

export async function prepareGrandPrixField ({
  roomId,
  raceTier,
  enteredCars = [],
  allCars = []
} = {}) {
  const tierKey = normalizeF1Tier(raceTier) || 'starter'
  const raceLabel = getF1RaceLabel(tierKey)
  const entryFee = getF1EntryFee(tierKey)
  const entryCharges = []
  const humanEntrants = []
  const fieldSize = Math.max(1, Number(F1_RACE_SETTINGS.standardFieldSize || 8))

  try {
    for (const car of (enteredCars || []).slice(0, fieldSize)) {
      if (!car?.ownerId) continue

      const balance = await safeCall(getUserWallet, [car.ownerId]).catch(() => null)
      const nick = await safeCall(getUserNickname, [car.ownerId]).catch(() => '@user')

      if (typeof balance !== 'number' || balance < entryFee) {
        await safeCall(postMessage, [{
          room: roomId,
          message: `❌ ${String(nick || '@user').replace(/^@/, '')} could not lock in ${carLabel(car)} for ${raceLabel}.`
        }])
        continue
      }

      const debit = await safeCall(applyGameDeltaInTransaction, [car.ownerId, -entryFee, {
        requireSufficientFunds: true,
        meta: {
          source: 'f1',
          category: 'race_entry',
          note: `${tierKey} grand prix entry`
        }
      }]).catch(() => ({ ok: false }))

      if (!debit?.ok) {
        await safeCall(postMessage, [{
          room: roomId,
          message: `❌ ${String(nick || '@user').replace(/^@/, '')} could not be charged for ${carLabel(car)}.`
        }])
        continue
      }

      entryCharges.push({
        userId: car.ownerId,
        carId: car.id,
        amount: entryFee
      })

      const team = await safeCall(getTeamByOwner, [car.ownerId]).catch(() => null)
      humanEntrants.push({
        ...car,
        isBot: false,
        teamLabel: teamLabel(team),
        label: carLabel(car)
      })
    }

    const usedNames = new Set((allCars || []).map((car) => String(car?.name || '').toLowerCase()))
    for (const car of humanEntrants) usedNames.add(String(car.name || '').toLowerCase())

    const bots = []
    while (humanEntrants.length + bots.length < fieldSize) {
      const bot = createBotCar(tierKey, usedNames)
      usedNames.add(String(bot.name || '').toLowerCase())
      bots.push(bot)
    }

    return {
      field: [...humanEntrants, ...bots],
      entryCharges,
      entryFee,
      humanEntrantCount: humanEntrants.length,
      botEntrantCount: bots.length
    }
  } catch (error) {
    await refundEntryCharges(entryCharges, 'Grand Prix setup failed')
    throw error
  }
}

export async function runGrandPrix ({
  roomId,
  raceTier,
  field = [],
  track = pickTrack(),
  bets = {},
  lockedOddsDec = [],
  entryCharges = []
} = {}) {
  const tierKey = normalizeF1Tier(raceTier) || 'starter'
  const entryFee = getF1EntryFee(tierKey)
  const purseSummary = calculateRacePurse({
    entryFee,
    fieldSize: field.length || Number(F1_RACE_SETTINGS.standardFieldSize || 8)
  })

  try {
    await postMessage({
      room: roomId,
      message: `💰 ${getF1RaceLabel(tierKey)} Purse: ${fmtMoney(purseSummary.purse)}`
    })
    await DELAY(500)

    await postMessage({
      room: roomId,
      message: `🏁 Track Name: ${String(track?.name || 'Balanced GP').toUpperCase()}`
    })
    await DELAY(600)

    if (track?.imageUrl) {
      await postMessage({
        room: roomId,
        message: '',
        images: [track.imageUrl]
      })
      await DELAY(900)
    }

    await DELAY(1200)
    await postMessage({ room: roomId, message: 'Final checks complete.' })
    await DELAY(900)
    await sendLightsOutSequence(roomId)

    const raceResult = await runRace({
      cars: field,
      track,
      raceType: 'gp',
      raceTier: tierKey,
      bets,
      lockedOddsDec
    })

    const payoutSummary = calculateRacePayouts({
      entrants: field.map((car) => ({
        userId: car.ownerId,
        carId: car.id,
        isBot: car.isBot === true || !car.ownerId,
        carName: car.name,
        ownerName: car.ownerName,
        tier: tierKey,
        entryFee
      })),
      finishOrder: raceResult.finishOrder,
      entryFee,
      fieldSize: field.length
    })

    const ownerNames = new Map()
    for (const row of payoutSummary.placements) {
      if (!row.userId || ownerNames.has(row.userId)) continue
      const nick = await safeCall(getUserNickname, [row.userId]).catch(() => null)
      ownerNames.set(row.userId, nick ? String(nick).replace(/^@/, '') : 'Unknown')
    }

    const placements = payoutSummary.placements.map((row) => ({
      ...row,
      ownerName: row.isBot ? 'Bot' : (ownerNames.get(row.userId) || row.ownerName || 'Unknown')
    }))

    for (const row of placements) {
      if (row.userId && row.creditedAmount > 0) {
        await safeCall(creditGameWin, [row.userId, row.creditedAmount, null, {
          source: 'f1',
          category: 'race_prize',
          note: `${tierKey} grand prix P${row.finishPosition}`
        }]).catch(() => null)
      }

      if (row.carId != null) {
        await safeCall(recordCarRaceFinancials, [row.carId, {
          entryFee: row.entryFee,
          payout: row.creditedAmount
        }]).catch(() => null)
      }
    }

    const raceId = `f1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await safeCall(logF1RaceResults, [{
      raceId,
      roomId,
      tier: tierKey,
      track,
      entrantCount: field.length,
      fieldSize: payoutSummary.fieldSize,
      entryFee: payoutSummary.entryFee,
      totalPurse: payoutSummary.purse,
      baseEntryPool: payoutSummary.baseEntryPool,
      houseContribution: payoutSummary.houseContribution,
      placements
    }]).catch(() => null)

    await postGrandPrixResults({
      roomId,
      raceLabel: getF1RaceLabel(tierKey),
      purse: payoutSummary.purse,
      placements
    })

    return {
      raceResult,
      payoutSummary,
      placements
    }
  } catch (error) {
    await refundEntryCharges(entryCharges, 'Grand Prix cancelled')
    await safeCall(postMessage, [{ room: roomId, message: '❌ Race failed to start.' }])
    throw error
  }
}
