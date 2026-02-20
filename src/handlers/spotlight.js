// src/handlers/spotlight/spotlightManager.js

// Spotlight mode: clears the stage, sets stage size to 1, lets the host play one song,
// protects the host from bot removal commands, then restores the room automatically.

const spotlight = {
  active: false,
  hostUuid: null,
  hostName: null,
  prevStageSize: null,
  startedAt: null,
  endTimer: null
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const fmt = (n) => Math.round(Number(n || 0)).toLocaleString('en-US')
const fmt$ = (n) => `$${fmt(n)}`

function getStageSizeFromState (state) {
  // Extremely defensive — platforms vary
  return (
    state?.room?.djStageSize ??
    state?.room?.maxDjs ??
    state?.maxDjs ??
    state?.djStageSize ??
    null
  )
}

async function setStageSize (n, roomBot) {
  // Prefer roomBot methods if available
  if (typeof roomBot.setDJStageSize === 'function') return await roomBot.setDJStageSize(n)
  if (typeof roomBot.setStageSize === 'function') return await roomBot.setStageSize(n)
  if (typeof roomBot.setMaxDjs === 'function') return await roomBot.setMaxDjs(n)

  throw new Error('No roomBot method found to set stage size (setDJStageSize/setStageSize/setMaxDjs).')
}

export function isSpotlightActive () {
  return spotlight.active === true
}

export function isSpotlightProtected (uuid) {
  return spotlight.active && spotlight.hostUuid && uuid === spotlight.hostUuid
}

// Useful if you want to show who is in spotlight
export function getSpotlightState () {
  return { ...spotlight }
}

export async function endSpotlight ({ room, roomBot, postMessage }) {
  if (!spotlight.active) return false

  // clear timer
  if (spotlight.endTimer) {
    clearTimeout(spotlight.endTimer)
    spotlight.endTimer = null
  }

  const hostUuid = spotlight.hostUuid
  const hostName = spotlight.hostName || (hostUuid ? `<@uid:${hostUuid}>` : 'DJ')

  // Remove host (best effort)
  try {
    if (hostUuid) await roomBot.removeDJ(hostUuid)
  } catch (e) {}

  // Restore stage size (best effort)
  if (Number.isFinite(spotlight.prevStageSize)) {
    try {
      await setStageSize(spotlight.prevStageSize, roomBot)
    } catch (e) {}
  }

  // Reset state
  spotlight.active = false
  spotlight.hostUuid = null
  spotlight.hostName = null
  spotlight.prevStageSize = null
  spotlight.startedAt = null

  if (postMessage) {
    await postMessage({ room, message: '🎭 Spotlight is over. Stage restored.' })
  }

  return true
}

/**
 * Starts spotlight mode.
 *
 * Requirements:
 * - You pass postMessage, roomBot, and accessors you already have in message.js:
 *   - getCurrentDJ(state) (optional but helpful)
 *   - getCurrentDJUUIDs(state) or equivalent (optional)
 * - This function will:
 *   1) remove everyone from stage
 *   2) set stage size to 1
 *   3) tell host to jump up and play one song
 *   4) set a fallback timer to auto-end
 */
export async function startSpotlight ({
  payload,
  room,
  state,
  roomBot,
  postMessage,
  getSenderNickname,
  fallbackMs = 180000 // 3 minutes
} = {}) {
  if (spotlight.active) {
    await postMessage({ room, message: `🎭 Spotlight is already active (${spotlight.hostName || 'someone'}).` })
    return { ok: false, reason: 'ALREADY_ACTIVE' }
  }

  const callerUuid = payload?.sender
  const callerName = await getSenderNickname(callerUuid).catch(() => `<@uid:${callerUuid}>`)

  // snapshot stage size for restore
  const prev = getStageSizeFromState(state)
  spotlight.prevStageSize = Number.isFinite(Number(prev)) ? Number(prev) : 5 // fallback
  spotlight.active = true
  spotlight.hostUuid = callerUuid
  spotlight.hostName = callerName
  spotlight.startedAt = Date.now()

  await postMessage({ room, message: `🎭 SPOTLIGHT MODE ACTIVATED\nClearing the stage…` })

  // Remove everyone currently on stage
  // Prefer roomBot.state.djs if present (most accurate)
  const djs = Array.isArray(roomBot?.state?.djs)
    ? roomBot.state.djs
    : (Array.isArray(state?.djs) ? state.djs : [])

  const djUuids = djs.map(d => d?.uuid).filter(Boolean)

  for (const djUuid of djUuids) {
    try { await roomBot.removeDJ(djUuid) } catch (e) {}
    await delay(250)
  }

  // Set stage size to 1
  try {
    await setStageSize(1, roomBot)
  } catch (e) {
    console.error('[spotlight] Failed to set stage size:', e?.message || e)
    // Stay active anyway — still works as “stage cleared” mode.
  }

  await postMessage({
    room,
    message: `🕳️ One slot. One DJ.\n${callerName}, the stage is yours — hop up and play ONE song.`
  })

  // fallback auto-end so it can’t get stuck
  spotlight.endTimer = setTimeout(() => {
    endSpotlight({ room, roomBot, postMessage }).catch(() => {})
  }, fallbackMs)

  return { ok: true }
}

/**
 * Call this from your “song changed / playedSong” handler.
 * When spotlight is active, it ends once the host is no longer the current DJ.
 *
 * Pass currentDjUuid if you already have it. Otherwise it tries to derive it.
 */
export async function maybeEndSpotlightOnDJChange ({
  room,
  roomBot,
  postMessage,
  currentDjUuid
} = {}) {
  if (!spotlight.active || !spotlight.hostUuid) return false
  if (!currentDjUuid) return false

  // If the current DJ changed away from host, end spotlight
  if (currentDjUuid !== spotlight.hostUuid) {
    await endSpotlight({ room, roomBot, postMessage })
    return true
  }

  return false
}

/**
 * Optional: "paid command" version of spotlight.
 * Call this instead of startSpotlight if you want to charge for it.
 */
export async function startPaidSpotlight ({
  payload,
  room,
  state,
  roomBot,
  postMessage,
  getSenderNickname,
  getUserWallet,
  removeFromUserWallet,
  cost = 5000,
  fallbackMs = 180000
} = {}) {
  const callerUuid = payload?.sender
  const callerName = await getSenderNickname(callerUuid).catch(() => `<@uid:${callerUuid}>`)

  const balance = await getUserWallet(callerUuid)
  const numericBalance = Number(balance) || 0

  if (!Number.isFinite(numericBalance)) {
    await postMessage({ room, message: `⚠️ ${callerName}, I couldn’t read your wallet. Try again.` })
    return { ok: false, reason: 'WALLET_READ_FAILED' }
  }

  if (numericBalance < cost) {
    await postMessage({ room, message: `💸 ${callerName}, spotlight costs ${fmt$(cost)} but you only have ${fmt$(numericBalance)}.` })
    return { ok: false, reason: 'INSUFFICIENT_FUNDS' }
  }

  const paid = await removeFromUserWallet(callerUuid, cost)
  if (!paid) {
    await postMessage({ room, message: `⚠️ ${callerName}, payment failed. Your balance should still be ${fmt$(numericBalance)}.` })
    return { ok: false, reason: 'PAYMENT_FAILED' }
  }

  await postMessage({ room, message: `💰 ${callerName} paid ${fmt$(cost)} to claim the spotlight…` })

  return startSpotlight({
    payload,
    room,
    state,
    roomBot,
    postMessage,
    getSenderNickname,
    fallbackMs
  })
}
