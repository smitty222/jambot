import { logger } from '../utils/logging.js'

function getYearMonthKey (d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

export function createSlotsStateHelpers ({
  slotStmts,
  jackpotSeed,
  collectionResetKey,
  collectionGoals,
  collectionRewards,
  formatBalance
}) {
  function readSetting (key) {
    try {
      const row = slotStmts.readSetting.get(key)
      return row?.value ?? null
    } catch (e) {
      logger.error('[Slots] readSetting error', { err: e?.message || e, key })
      return null
    }
  }

  function writeSetting (key, value) {
    try {
      slotStmts.writeSetting.run(key, String(value))
    } catch (e) {
      logger.error('[Slots] writeSetting error', { err: e?.message || e, key })
    }
  }

  function maybeResetCollectionsMonthly () {
    const current = getYearMonthKey()
    const last = readSetting(collectionResetKey)

    if (!last) {
      writeSetting(collectionResetKey, current)
      return { didReset: false, current }
    }

    if (last !== current) {
      try {
        slotStmts.clearCollections.run()
        writeSetting(collectionResetKey, current)
        logger.info('[Slots] Collections reset for new month', { monthKey: current })
        return { didReset: true, current }
      } catch (e) {
        logger.error('[Slots] Failed to reset collections', { err: e?.message || e, monthKey: current })
        return { didReset: false, current }
      }
    }

    return { didReset: false, current }
  }

  function recordJackpotContribution (userUUID, amount) {
    const inc = Math.max(0, Number(amount) || 0)
    if (!userUUID || inc <= 0) return

    try {
      const now = new Date().toISOString()
      slotStmts.recordJackpotContribution.run(userUUID, inc, inc, now)
    } catch (e) {
      logger.error('[Slots] recordJackpotContribution error', { err: e?.message || e, userUUID, amount: inc })
    }
  }

  function scaleEffectiveJackpotContributions (retainedRatio) {
    const ratio = Number(retainedRatio)
    if (!Number.isFinite(ratio)) return

    const clamped = Math.max(0, Math.min(1, ratio))
    const now = new Date().toISOString()

    try {
      slotStmts.scaleEffectiveContributions.run(clamped, now)
    } catch (e) {
      logger.error('[Slots] scaleEffectiveJackpotContributions error', { err: e?.message || e, retainedRatio: clamped })
    }
  }

  function getUserJackpotContributionStats (userUUID) {
    try {
      const row = slotStmts.getUserJackpotContribution.get(userUUID)
      const totals = slotStmts.getJackpotContributionTotals.get()

      const lifetimeContributed = Number(row?.lifetimeContributed || 0)
      const effectiveContributed = Number(row?.effectiveContributed || 0)
      const totalEffective = Number(totals?.totalEffective || 0)
      const effectiveSharePct = totalEffective > 0
        ? (effectiveContributed / totalEffective) * 100
        : 0

      return {
        lifetimeContributed,
        effectiveContributed,
        totalEffective,
        effectiveSharePct
      }
    } catch (e) {
      logger.error('[Slots] getUserJackpotContributionStats error', { err: e?.message || e, userUUID })
      return {
        lifetimeContributed: 0,
        effectiveContributed: 0,
        totalEffective: 0,
        effectiveSharePct: 0
      }
    }
  }

  function getJackpotValue () {
    const row = slotStmts.getJackpotValue.get()
    return Number(row?.progressiveJackpot || jackpotSeed)
  }

  function updateJackpotValue (newValue) {
    slotStmts.updateJackpotValue.run(Number(newValue))
    logger.info('[Slots] Jackpot updated', { newValue: Number(newValue) })
  }

  function getBonusSession (userUUID) {
    try {
      const row = slotStmts.getBonusSession.get(userUUID)
      if (!row?.data) return null
      return JSON.parse(row.data)
    } catch (e) {
      logger.error('[Slots] getBonusSession error', { err: e?.message || e, userUUID })
      return null
    }
  }

  function saveBonusSession (userUUID, session, options = {}) {
    const throwOnError = Boolean(options?.throwOnError)
    try {
      const now = new Date().toISOString()
      slotStmts.saveBonusSession.run(userUUID, JSON.stringify(session), now)
      return true
    } catch (e) {
      logger.error('[Slots] saveBonusSession error', { err: e?.message || e, userUUID })
      if (throwOnError) throw e
      return false
    }
  }

  function clearBonusSession (userUUID, options = {}) {
    const throwOnError = Boolean(options?.throwOnError)
    try {
      slotStmts.clearBonusSession.run(userUUID)
      return true
    } catch (e) {
      logger.error('[Slots] clearBonusSession error', { err: e?.message || e, userUUID })
      if (throwOnError) throw e
      return false
    }
  }

  function getFeatureSession (userUUID) {
    try {
      const row = slotStmts.getFeatureSession.get(userUUID)
      if (!row?.data) return null
      return JSON.parse(row.data)
    } catch (e) {
      logger.error('[Slots] getFeatureSession error', { err: e?.message || e, userUUID })
      return null
    }
  }

  function saveFeatureSession (userUUID, session, options = {}) {
    const throwOnError = Boolean(options?.throwOnError)
    try {
      const now = new Date().toISOString()
      slotStmts.saveFeatureSession.run(userUUID, JSON.stringify(session), now)
      return true
    } catch (e) {
      logger.error('[Slots] saveFeatureSession error', { err: e?.message || e, userUUID })
      if (throwOnError) throw e
      return false
    }
  }

  function clearFeatureSession (userUUID, options = {}) {
    const throwOnError = Boolean(options?.throwOnError)
    try {
      slotStmts.clearFeatureSession.run(userUUID)
      return true
    } catch (e) {
      logger.error('[Slots] clearFeatureSession error', { err: e?.message || e, userUUID })
      if (throwOnError) throw e
      return false
    }
  }

  function getUserCollection (userUUID) {
    try {
      const row = slotStmts.getUserCollection.get(userUUID)
      if (!row?.data) return { counts: {}, tiers: {}, halfNotifs: {} }
      const parsed = JSON.parse(row.data)
      return {
        counts: parsed.counts || {},
        tiers: parsed.tiers || {},
        halfNotifs: parsed.halfNotifs || {}
      }
    } catch (e) {
      logger.error('[Slots] getUserCollection error', { err: e?.message || e, userUUID })
      return { counts: {}, tiers: {}, halfNotifs: {} }
    }
  }

  function saveUserCollection (userUUID, collection) {
    try {
      const now = new Date().toISOString()
      slotStmts.saveUserCollection.run(userUUID, JSON.stringify(collection), now)
    } catch (e) {
      logger.error('[Slots] saveUserCollection error', { err: e?.message || e, userUUID })
    }
  }

  function applyCollectionProgress (userUUID, spins) {
    const col = getUserCollection(userUUID)
    const counts = col.counts || {}
    const tiers = col.tiers || {}
    const halfNotifs = col.halfNotifs || {}

    const beforeCounts = { ...counts }

    for (const s of spins.flat()) {
      counts[s] = (counts[s] || 0) + 1
    }

    const unlocked = []
    const progress = []
    let totalReward = 0

    for (const sym of Object.keys(collectionGoals)) {
      const goal = collectionGoals[sym]
      const reward = collectionRewards[sym] || 0

      const before = Number(beforeCounts[sym] || 0)
      const after = Number(counts[sym] || 0)

      const prevTier = Number(tiers[sym] || 0)
      const newTier = Math.floor(after / goal)

      const nextTier = prevTier + 1
      const halfThreshold = (prevTier * goal) + Math.ceil(goal / 2)
      const lastHalfTierNotified = Number(halfNotifs[sym] || 0)

      if (
        nextTier > prevTier &&
        lastHalfTierNotified < nextTier &&
        before < halfThreshold &&
        after >= halfThreshold &&
        newTier === prevTier
      ) {
        halfNotifs[sym] = nextTier
        const currentInTier = after - (prevTier * goal)
        progress.push(`⏳ COLLECTION: ${sym} halfway to Tier ${nextTier} (${currentInTier}/${goal})`)
      }

      if (newTier > prevTier) {
        const tiersGained = newTier - prevTier
        tiers[sym] = newTier

        const payout = reward * tiersGained
        totalReward += payout

        unlocked.push(`🏅 COLLECTION: ${sym} Tier ${newTier} (+$${formatBalance(payout)})`)
        halfNotifs[sym] = Math.max(Number(halfNotifs[sym] || 0), newTier)
      }
    }

    saveUserCollection(userUUID, { counts, tiers, halfNotifs })

    return { unlockedLines: unlocked, progressLines: progress, rewardTotal: totalReward }
  }

  return {
    readSetting,
    writeSetting,
    maybeResetCollectionsMonthly,
    recordJackpotContribution,
    scaleEffectiveJackpotContributions,
    getUserJackpotContributionStats,
    getJackpotValue,
    updateJackpotValue,
    getBonusSession,
    saveBonusSession,
    clearBonusSession,
    getFeatureSession,
    saveFeatureSession,
    clearFeatureSession,
    getUserCollection,
    saveUserCollection,
    applyCollectionProgress
  }
}
