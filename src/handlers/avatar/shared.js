import { env } from '../../config.js'
import { getAvatarsBySlugs } from '../../database/dbavatars.js'
import { updateUserAvatar } from '../../utils/API.js'
import { logger } from '../../utils/logging.js'
import { setChatIdentity } from '../../libs/cometchat.js'

export const userTokenMap = {
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': env.ianUserToken,
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': env.smittyUserToken,
  '92302b7d-ae5e-466f-975b-d3fee461f13f': env.camUserToken,
  'fd2f1b47-b1d4-4100-8f88-6e56aa82e13f': env.gabUserToken,
  'a122488b-d9ec-4d2f-97bf-9d9472d299a0': env.alexUserToken
}

export const randomColors = [
  '#FFD966', '#A7D2CB', '#FFB6B9', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA',
  '#F7A072', '#D5AAFF', '#ACE7FF', '#FFB347', '#B0E57C', '#FF9AA2', '#E6E6FA',
  '#FFDEAD', '#C0FDFB', '#FAF3DD', '#FDCB82'
]

export function slugToTitle (slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function getAuthorizedUserToken (
  senderUuid,
  room,
  postMessage,
  unauthorizedMessage
) {
  const userToken = userTokenMap[senderUuid]
  if (userToken) {
    return userToken
  }

  await postMessage({
    room,
    message: unauthorizedMessage
  })

  return null
}

export async function requireModerator ({
  senderUuid,
  ttlUserToken,
  isUserAuthorized,
  room,
  postMessage,
  unauthorizedMessage
}) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (isMod) {
    return true
  }

  await postMessage({ room, message: unauthorizedMessage })
  return false
}

export async function pickRandomAvatarBySlug ({
  allowedSlugs,
  warnLabel,
  emptyMessage,
  missingSlugMessage,
  room,
  postMessage
}) {
  const filtered = getAvatarsBySlugs(allowedSlugs)

  if (!filtered || filtered.length === 0) {
    await postMessage({
      room,
      message: emptyMessage
    })
    return null
  }

  const chosen = filtered[Math.floor(Math.random() * filtered.length)]
  const slug = chosen?.slug

  if (!slug) {
    logger.warn(`[${warnLabel}] No slug on selected avatar object`, { chosen })
    await postMessage({
      room,
      message: missingSlugMessage
    })
    return null
  }

  return slug
}

export async function runStaticUserAvatarCommand ({
  senderUuid,
  room,
  postMessage,
  unauthorizedMessage,
  avatarId,
  color,
  successMessage,
  failureMessage,
  onError
}) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage
  )

  if (!userToken) {
    return
  }

  try {
    await updateUserAvatar(userToken, avatarId, color)
    await postMessage({ room, message: successMessage })
  } catch (error) {
    if (onError) {
      await onError(error)
    }
    await postMessage({ room, message: failureMessage })
  }
}

export async function runLoggedStaticUserAvatarCommand ({
  senderUuid,
  room,
  postMessage,
  unauthorizedMessage,
  avatarId,
  color,
  successMessage,
  failureMessage,
  attemptLabel,
  errorLabel
}) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage
  )

  if (!userToken) {
    return
  }

  logger.info(`[${attemptLabel}] attempt`, {
    senderUuid,
    slug: avatarId,
    color
  })

  try {
    await updateUserAvatar(userToken, avatarId, color)

    logger.info(`[${attemptLabel}] success`, {
      senderUuid,
      slug: avatarId,
      color
    })

    await postMessage({ room, message: successMessage })
  } catch (error) {
    logger.error(`[${errorLabel}] update failed`, {
      senderUuid,
      slug: avatarId,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({ room, message: failureMessage })
  }
}

export async function runStaticBotAvatarCommand ({
  room,
  postMessage,
  isUserAuthorized,
  senderUuid,
  ttlUserToken,
  unauthorizedMessage,
  avatarId,
  color,
  successMessage,
  failureMessage,
  onBeforePostSuccess,
  onError
}) {
  const isMod = await requireModerator({
    senderUuid,
    ttlUserToken,
    isUserAuthorized,
    room,
    postMessage,
    unauthorizedMessage
  })

  if (!isMod) {
    return
  }

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    if (onBeforePostSuccess) {
      await onBeforePostSuccess()
    }
    await postMessage({ room, message: successMessage, identity: { avatarId, color } })
  } catch (error) {
    if (onError) {
      await onError(error)
    }
    await postMessage({ room, message: failureMessage })
  }
}

// ---------------------------------------------------------------------------
// Generic pool runners — used by the config-driven command factories
// ---------------------------------------------------------------------------

/**
 * Run a user avatar command that picks a random avatar from a themed slug pool.
 * @param {object} cfg  Entry from USER_POOL_CONFIGS in avatarConfig.js
 */
export async function runUserPoolCommand (cfg, senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(senderUuid, room, postMessage, cfg.unauthorizedMessage)
  if (!userToken) return

  let slug
  if (cfg.directPick) {
    if (!cfg.allowedSlugs.length) {
      await postMessage({ room, message: cfg.emptyMessage })
      return
    }
    slug = cfg.allowedSlugs[Math.floor(Math.random() * cfg.allowedSlugs.length)]
  } else {
    slug = await pickRandomAvatarBySlug({
      allowedSlugs: cfg.allowedSlugs,
      warnLabel: cfg.warnLabel,
      emptyMessage: cfg.emptyMessage,
      missingSlugMessage: cfg.missingSlugMessage,
      room,
      postMessage
    })
    if (!slug) return
  }

  const color = cfg.colorBySlug
    ? (cfg.colorBySlug[slug] ?? cfg.fallbackColors[Math.floor(Math.random() * cfg.fallbackColors.length)])
    : cfg.fallbackColors[Math.floor(Math.random() * cfg.fallbackColors.length)]

  const line = cfg.lines
    ? (cfg.lines[slug] ?? cfg.defaultLine(slug))
    : cfg.defaultLine(slug)

  logger.info(`[${cfg.key}] attempt`, { senderUuid, slug, color, title: slugToTitle(slug) })

  try {
    await updateUserAvatar(userToken, slug, color)
    logger.info(`[${cfg.key}] success`, { senderUuid, slug, color })
    await postMessage({ room, message: line })
  } catch (error) {
    logger.error(`[${cfg.errorLabel}] update failed`, {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })
    await postMessage({ room, message: cfg.failureMessage })
  }
}

/**
 * Run a bot avatar command that picks a random avatar from a themed slug pool.
 * Requires moderator auth; updates bot identity after equip.
 * @param {object} cfg  Entry from BOT_POOL_CONFIGS in avatarConfig.js
 */
export async function runBotPoolCommand (cfg, room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await requireModerator({
    senderUuid,
    ttlUserToken,
    isUserAuthorized,
    room,
    postMessage,
    unauthorizedMessage: cfg.unauthorizedMessage
  })
  if (!isMod) return

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs: cfg.allowedSlugs,
    warnLabel: cfg.warnLabel,
    emptyMessage: cfg.emptyMessage,
    missingSlugMessage: cfg.missingSlugMessage,
    room,
    postMessage
  })
  if (!slug) return

  const color = cfg.colorBySlug
    ? (cfg.colorBySlug[slug] ?? cfg.fallbackColors[Math.floor(Math.random() * cfg.fallbackColors.length)])
    : cfg.fallbackColors[Math.floor(Math.random() * cfg.fallbackColors.length)]

  const line = cfg.lines
    ? (cfg.lines[slug] ?? cfg.defaultLine(slug))
    : cfg.successMessage

  logger.info(`[${cfg.key}] attempt`, { senderUuid, slug, color, title: slugToTitle(slug) })

  try {
    await updateUserAvatar(ttlUserToken, slug, color)
    setChatIdentity({ avatarId: slug, color })
    logger.info(`[${cfg.key}] success`, { senderUuid, slug, color })
    await postMessage({ room, message: line, identity: { avatarId: slug, color } })
  } catch (error) {
    logger.error(`[${cfg.errorLabel}] update failed`, {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })
    await postMessage({ room, message: cfg.failureMessage })
  }
}
