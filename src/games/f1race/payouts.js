// src/games/f1race/payouts.js

import {
  F1_RACE_SETTINGS,
  getF1EntryFee,
  normalizeF1Tier
} from './config.js'

export function getEntryFee (tierKey) {
  return getF1EntryFee(tierKey)
}

export function getPayoutDistribution () {
  return [...(F1_RACE_SETTINGS.payoutPercentages || [])]
}

export function calculateRacePurse ({
  entryFee = 0,
  fieldSize = F1_RACE_SETTINGS.standardFieldSize
} = {}) {
  const normalizedEntryFee = Math.max(0, Math.floor(Number(entryFee || 0)))
  const normalizedFieldSize = Math.max(0, Math.floor(Number(fieldSize || 0)))
  const purseMultiplier = Math.max(0, Number(F1_RACE_SETTINGS.purseMultiplier || 0))
  const baseEntryPool = normalizedEntryFee * normalizedFieldSize
  const purse = Math.floor(baseEntryPool * purseMultiplier)

  return {
    entryFee: normalizedEntryFee,
    fieldSize: normalizedFieldSize,
    purseMultiplier,
    baseEntryPool,
    purse,
    houseContribution: Math.max(0, purse - baseEntryPool)
  }
}

function normalizeEntrant (entrant = {}) {
  return {
    userId: entrant.userId ? String(entrant.userId) : null,
    carId: entrant.carId != null ? Number(entrant.carId) : null,
    isBot: entrant.isBot === true || !entrant.userId,
    carName: String(entrant.carName || entrant.name || '').trim(),
    ownerName: String(entrant.ownerName || '').trim(),
    tier: normalizeF1Tier(entrant.tier),
    entryFee: Math.max(0, Math.floor(Number(entrant.entryFee || getEntryFee(entrant.tier) || 0)))
  }
}

function splitPurse (purse, percentages = []) {
  const totalPurse = Math.max(0, Math.floor(Number(purse || 0)))
  const normalized = (percentages || []).map((pct) => Math.max(0, Number(pct || 0)))
  const payouts = normalized.map((pct) => Math.floor((totalPurse * (pct / 100)) + 1e-6))
  const distributed = payouts.reduce((sum, amount) => sum + amount, 0)
  const remainder = Math.max(0, totalPurse - distributed)
  if (payouts.length > 0 && remainder > 0) payouts[0] += remainder
  return payouts
}

export function calculateRacePayouts ({
  entrants = [],
  finishOrder = [],
  entryFee = null,
  fieldSize = F1_RACE_SETTINGS.standardFieldSize
} = {}) {
  const normalizedEntrants = entrants.map(normalizeEntrant)
  const normalizedFieldSize = Math.max(0, Math.floor(Number(fieldSize || normalizedEntrants.length || 0)))
  const raceEntryFee = Math.max(
    0,
    Math.floor(Number(entryFee != null ? entryFee : (normalizedEntrants[0]?.entryFee || 0)))
  )
  const purseSummary = calculateRacePurse({
    entryFee: raceEntryFee,
    fieldSize: normalizedFieldSize
  })
  const distribution = getPayoutDistribution()
  const payoutLadder = splitPurse(purseSummary.purse, distribution)

  const placements = finishOrder.map((entrantIndex, placeIdx) => {
    const entrant = normalizedEntrants[entrantIndex]
    if (!entrant) throw new Error(`UNKNOWN_ENTRANT_INDEX_${entrantIndex}`)

    const payout = Math.max(0, Math.floor(Number(payoutLadder[placeIdx] || 0)))
    const actualEntryFee = entrant.isBot ? 0 : entrant.entryFee
    const creditedAmount = entrant.isBot ? 0 : payout

    return {
      userId: entrant.userId,
      carId: entrant.carId,
      isBot: entrant.isBot,
      carName: entrant.carName,
      ownerName: entrant.isBot ? 'Bot' : entrant.ownerName,
      tier: entrant.tier,
      finishPosition: placeIdx + 1,
      entryFee: actualEntryFee,
      payout,
      creditedAmount,
      netResult: creditedAmount - actualEntryFee
    }
  })

  return {
    entryFee: purseSummary.entryFee,
    fieldSize: purseSummary.fieldSize,
    purse: purseSummary.purse,
    baseEntryPool: purseSummary.baseEntryPool,
    houseContribution: purseSummary.houseContribution,
    purseMultiplier: purseSummary.purseMultiplier,
    distribution,
    placements
  }
}
