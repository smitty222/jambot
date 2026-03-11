// src/games/f1race/payouts.js

import {
  F1_RACE_SETTINGS,
  getF1EntryFee,
  normalizeF1Tier
} from './config.js'

export function getEntryFee (tierKey) {
  return getF1EntryFee(tierKey)
}

export function getPayoutDistribution (numEntrants) {
  const entrants = Math.max(0, Math.floor(Number(numEntrants || 0)))
  return F1_RACE_SETTINGS.payoutDistributions.find((rule) => {
    const min = Number(rule.minEntrants || 0)
    const max = Number.isFinite(Number(rule.maxEntrants)) ? Number(rule.maxEntrants) : Infinity
    return entrants >= min && entrants <= max
  }) || null
}

export function calculatePrizePool (totalEntryFees) {
  const total = Math.max(0, Math.floor(Number(totalEntryFees || 0)))
  const prizePool = Math.floor(total * Number(F1_RACE_SETTINGS.prizePoolPercentage || 0))
  const houseCut = Math.max(0, total - prizePool)

  return {
    totalEntryFees: total,
    prizePool,
    houseCut,
    prizePoolPercentage: Number(F1_RACE_SETTINGS.prizePoolPercentage || 0),
    houseCutPercentage: Number(F1_RACE_SETTINGS.houseCutPercentage || 0)
  }
}

function normalizeEntrant (entrant = {}) {
  return {
    userId: entrant.userId ? String(entrant.userId) : null,
    carId: entrant.carId != null ? Number(entrant.carId) : null,
    carName: String(entrant.carName || entrant.name || '').trim(),
    ownerName: String(entrant.ownerName || '').trim(),
    tier: normalizeF1Tier(entrant.tier),
    entryFee: Math.max(0, Math.floor(Number(entrant.entryFee || getEntryFee(entrant.tier) || 0)))
  }
}

function splitPrizePool (prizePool, percentages = []) {
  const pool = Math.max(0, Math.floor(Number(prizePool || 0)))
  const normalized = (percentages || []).map((pct) => Math.max(0, Number(pct || 0)))
  const payouts = normalized.map((pct) => Math.floor(pool * (pct / 100)))
  const distributed = payouts.reduce((sum, amt) => sum + amt, 0)
  const remainder = Math.max(0, pool - distributed)
  if (payouts.length > 0 && remainder > 0) payouts[0] += remainder
  return payouts
}

export function calculateRacePayouts ({ entrants = [], finishOrder = [] } = {}) {
  const normalizedEntrants = entrants.map(normalizeEntrant)
  const entrantCount = normalizedEntrants.length
  const distributionRule = getPayoutDistribution(entrantCount)

  if (!distributionRule) {
    throw new Error(`NO_PAYOUT_RULE_FOR_${entrantCount}_ENTRANTS`)
  }

  const totalEntryFees = normalizedEntrants.reduce((sum, entrant) => sum + entrant.entryFee, 0)
  const prize = calculatePrizePool(totalEntryFees)
  const payoutAmounts = splitPrizePool(prize.prizePool, distributionRule.percentages)
  const payoutByIndex = new Map()
  payoutAmounts.forEach((amount, idx) => {
    payoutByIndex.set(idx, amount)
  })

  const placements = finishOrder.map((entrantIndex, placeIdx) => {
    const entrant = normalizedEntrants[entrantIndex]
    if (!entrant) throw new Error(`UNKNOWN_ENTRANT_INDEX_${entrantIndex}`)
    const payout = Math.max(0, Math.floor(Number(payoutByIndex.get(placeIdx) || 0)))
    const entryFee = entrant.entryFee

    return {
      userId: entrant.userId,
      carId: entrant.carId,
      carName: entrant.carName,
      ownerName: entrant.ownerName,
      tier: entrant.tier,
      finishPosition: placeIdx + 1,
      entryFee,
      payout,
      netResult: payout - entryFee
    }
  })

  return {
    entrantCount,
    distribution: [...distributionRule.percentages],
    totalEntryFees: prize.totalEntryFees,
    prizePool: prize.prizePool,
    houseCut: prize.houseCut,
    placements
  }
}
