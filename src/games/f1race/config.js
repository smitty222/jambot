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
  purseMultiplier: 2.44140625,
  payoutPercentages: [44, 27.2, 12.8, 10.88, 5.12]
}

export const F1_COMPONENTS = {
  engine: {
    key: 'engine',
    label: 'Engine',
    emoji: '🔩',
    dbCol: 'engineDurability',
    drainPerRace: 4,
    replaceCost: { starter: 1000, pro: 2400, hyper: 4800, legendary: 9500 }
  },
  gearbox: {
    key: 'gearbox',
    label: 'Gearbox',
    emoji: '⚙️',
    dbCol: 'gearboxDurability',
    drainPerRace: 5,
    replaceCost: { starter: 600, pro: 1400, hyper: 2800, legendary: 5500 }
  },
  aero: {
    key: 'aero',
    label: 'Aero Pack',
    emoji: '🪂',
    dbCol: 'aeroDurability',
    drainPerRace: 4,
    replaceCost: { starter: 700, pro: 1600, hyper: 3200, legendary: 6500 }
  },
  tires: {
    key: 'tires',
    label: 'Tire Set',
    emoji: '🛞',
    dbCol: 'tiresDurability',
    drainPerRace: 8,
    replaceCost: { starter: 400, pro: 900, hyper: 1800, legendary: 3500 }
  }
}

export const F1_COMPONENT_ORDER = ['engine', 'gearbox', 'aero', 'tires']

// Higher tiers drain components slower (better build quality)
export const F1_COMPONENT_DRAIN_MULT = {
  starter: 1.00,
  pro: 0.88,
  hyper: 0.76,
  legendary: 0.63
}

export const F1_COMPONENT_WARN_THRESHOLD = 25  // warn on entry below this %
export const F1_COMPONENT_CRIT_THRESHOLD = 10  // flag as critical in displays

export function getComponentDrainForRace (tierKey) {
  const tier = String(tierKey || 'starter').toLowerCase()
  const mult = F1_COMPONENT_DRAIN_MULT[tier] ?? 1.00
  const result = {}
  for (const [key, cfg] of Object.entries(F1_COMPONENTS)) {
    result[key] = Math.max(1, Math.round(cfg.drainPerRace * mult))
  }
  return result
}

export function getComponentReplaceCost (componentKey, tierKey) {
  const comp = F1_COMPONENTS[String(componentKey || '').toLowerCase()]
  const tier = String(tierKey || 'starter').toLowerCase()
  return comp?.replaceCost[tier] ?? comp?.replaceCost.starter ?? 0
}

export function getCarComponentStatus (car) {
  return F1_COMPONENT_ORDER.map(key => {
    const cfg = F1_COMPONENTS[key]
    const durability = Math.max(0, Math.min(100, Number(car[cfg.dbCol] ?? 100)))
    return {
      key,
      label: cfg.label,
      emoji: cfg.emoji,
      durability,
      isBlown: durability <= 0,
      isLow: durability > 0 && durability <= F1_COMPONENT_WARN_THRESHOLD,
      isCrit: durability > 0 && durability <= F1_COMPONENT_CRIT_THRESHOLD
    }
  })
}

export function getBlownComponents (car) {
  return getCarComponentStatus(car).filter(c => c.isBlown)
}

export function getLowComponents (car) {
  return getCarComponentStatus(car).filter(c => c.isLow)
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
