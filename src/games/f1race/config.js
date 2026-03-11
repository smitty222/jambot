// src/games/f1race/config.js

export const F1_TIER_ORDER = ['starter', 'pro', 'hyper', 'legendary']

export const F1_CAR_TIERS = {
  starter: {
    key: 'starter',
    label: 'Starter',
    raceLabel: 'Starter Grand Prix',
    price: 30000,
    entryFee: 1000,
    livery: '🟥',
    base: { power: 56, handling: 55, aero: 54, reliability: 57, tire: 55 }
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    raceLabel: 'Pro Grand Prix',
    price: 90000,
    entryFee: 2000,
    livery: '🟦',
    base: { power: 63, handling: 62, aero: 61, reliability: 64, tire: 62 }
  },
  hyper: {
    key: 'hyper',
    label: 'Hyper',
    raceLabel: 'Hyper Grand Prix',
    price: 200000,
    entryFee: 3000,
    livery: '🟩',
    base: { power: 70, handling: 69, aero: 68, reliability: 71, tire: 69 }
  },
  legendary: {
    key: 'legendary',
    label: 'Legendary',
    raceLabel: 'Legendary Grand Prix',
    price: 400000,
    entryFee: 6000,
    livery: '🟪',
    base: { power: 76, handling: 75, aero: 74, reliability: 77, tire: 75 }
  }
}

export const F1_RACE_SETTINGS = {
  minEntrants: 0,
  standardFieldSize: 8,
  purseMultiplier: 1.25,
  payoutPercentages: [35, 24, 17, 14, 10]
}

export function normalizeF1Tier (tierKey) {
  const key = String(tierKey || '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(F1_CAR_TIERS, key) ? key : null
}

export function getF1TierConfig (tierKey) {
  const normalized = normalizeF1Tier(tierKey)
  return normalized ? F1_CAR_TIERS[normalized] : null
}

export function getF1EntryFee (tierKey) {
  const tier = getF1TierConfig(tierKey)
  return Math.max(0, Math.floor(Number(tier?.entryFee || 0)))
}

export function getF1TierLabel (tierKey) {
  const tier = getF1TierConfig(tierKey)
  return tier?.label || 'Starter'
}

export function getF1RaceLabel (tierKey) {
  const tier = getF1TierConfig(tierKey)
  return tier?.raceLabel || 'Starter Grand Prix'
}
