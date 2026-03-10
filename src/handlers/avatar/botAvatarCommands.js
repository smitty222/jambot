import { updateUserAvatar } from '../../utils/API.js'
import { getRandomAvatarSlug } from '../../database/dbavatars.js'
import { setChatIdentity } from '../../libs/cometchat.js'
import { logger } from '../../utils/logging.js'
import {
  pickRandomAvatarBySlug,
  randomColors,
  requireModerator,
  runStaticBotAvatarCommand,
  slugToTitle
} from './shared.js'

export async function handleBotRandomAvatarCommand (room, postMessage, ttlUserToken) {
  const avatarId = getRandomAvatarSlug()
  const color = randomColors[Math.floor(Math.random() * randomColors.length)]

  const randomReplies = [
    'Feeling fresh 🤖',
    'New look, who dis?',
    'Just changed into something more comfortable...',
    'Style upgraded ✨',
    'Bot makeover complete!',
    'Shapeshift complete. You never saw me. 👻',
    "I'm undercover now. 🤫",
    'Cloaking protocol activated. 🛸',
    'Incognito mode: engaged. 🕶️',
    'Just blending in with the crowd. 😎',
    "They'll never recognize me now. 🌀",
    'Now you see me, now you don’t. 🎩✨'
  ]
  const randomMessage = randomReplies[Math.floor(Math.random() * randomReplies.length)]

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: randomMessage, identity: { avatarId, color } })
  } catch (error) {
    await postMessage({ room, message: `Failed to update bot avatar: ${error.message}` })
  }
}

export async function handleBotDinoCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  await runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    unauthorizedMessage: 'You need to be a moderator to execute this command.',
    avatarId: 'jurassic-05',
    color: '#8B6C5C',
    successMessage: 'Roar!',
    failureMessage: 'Failed to update bot profile',
    onBeforePostSuccess: async () => setChatIdentity({ avatarId: 'jurassic-05', color: '#8B6C5C' })
  })
}

export async function handleBotDuckCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  await runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    unauthorizedMessage: 'You need to be a moderator to execute this command.',
    avatarId: 'stadiumseason-02',
    color: '#FFDE21',
    successMessage: 'Quack Quack 🦆🧼🫧',
    failureMessage: 'Failed to update bot profile',
    onBeforePostSuccess: async () => setChatIdentity({ avatarId: 'stadiumseason-02', color: '#FFDE21' })
  })
}

export async function handleBotAlienCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  await runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    unauthorizedMessage: 'You need to be a moderator to execute this command.',
    avatarId: 'season-0001-underground-thehuman',
    color: '#39FF14',
    successMessage: '👽 Alien transformation complete! Take me to your leader. 🚀',
    failureMessage: 'Failed to update bot profile',
    onBeforePostSuccess: async () => setChatIdentity({ avatarId: 'season-0001-underground-thehuman', color: '#39FF14' })
  })
}

export async function handleBotAlien2Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  await runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    unauthorizedMessage: 'You need to be a moderator to execute this command.',
    avatarId: 'stadiumseason-01',
    color: '#39FF14',
    successMessage: '🌌 Beep boop. I’m not from around here... 👾',
    failureMessage: 'Failed to update bot profile',
    onBeforePostSuccess: async () => setChatIdentity({ avatarId: 'stadiumseason-01', color: '#39FF14' })
  })
}

export async function handleBotWalrusCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  await runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    unauthorizedMessage: 'You need to be a moderator to execute this command.',
    avatarId: 'winter-07',
    color: '#8DE2FF',
    successMessage: '🦭 Don’t mind me… just lounging like a majestic sea sausage.🧊',
    failureMessage: 'Failed to update bot profile',
    onBeforePostSuccess: async () => setChatIdentity({ avatarId: 'winter-07', color: '#8DE2FF' })
  })
}

export async function handleBotPenguinCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  await runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    unauthorizedMessage: 'You need to be a moderator to execute this command.',
    avatarId: 'pinguclub-03',
    color: '#B026FF',
    successMessage: '💜🐧 Initiating purple penguin protocol… waddling in style now.',
    failureMessage: 'Failed to update bot profile',
    onBeforePostSuccess: async () => setChatIdentity({ avatarId: 'pinguclub-03', color: '#B026FF' })
  })
}

export async function handleBot2Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  await runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    unauthorizedMessage: 'You need to be a moderator to execute this command.',
    avatarId: 'bot-2',
    color: '#FF5F1F',
    successMessage: '⚙️🟠 They said I needed a fresh coat… I went full fire.🤖',
    failureMessage: 'Failed to update bot profile',
    onBeforePostSuccess: async () => setChatIdentity({ avatarId: 'bot-2', color: '#FF5F1F' })
  })
}

export async function handleBotStaffCommand (
  room,
  postMessage,
  isUserAuthorized,
  senderUuid,
  ttlUserToken
) {
  const isMod = await requireModerator({
    senderUuid,
    ttlUserToken,
    isUserAuthorized,
    room,
    postMessage,
    unauthorizedMessage: '🚫 You need to be a moderator to execute this command.'
  })
  if (!isMod) {
    return
  }

  const allowedSlugs = [
    'mod-bear-black',
    'mod-bear-orange',
    'staff-bear',
    'staff'
  ]

  const COLOR_BY_SLUG = {
    'mod-bear-black': '#1A1A1AFF',
    'mod-bear-orange': '#FF6A00FF',
    'staff-bear': '#FFC300FF',
    staff: '#1A1A1AFF'
  }

  const BOUNCER_COLORS = [
    '#1A1A1AFF',
    '#FF6A00FF',
    '#FFC300FF'
  ]

  const BOUNCER_LINES = {
    'mod-bear-black':
      '🕶️ Black Ops Bot on duty. If your name’s not on the list, you’re not on the stage.',
    'mod-bear-orange':
      '🟠 Floor Security Bot online. Badge visible, attitude checked, behave in the booth.',
    'staff-bear':
      '💛 Staff Bear Bot reporting in — cute face, zero tolerance.',
    staff:
      '👔 Venue Staff Bot present. Keep the energy up and the drama down.'
  }

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'botstaff',
    emptyMessage: 'No security avatars are available right now. 🔒',
    missingSlugMessage: 'Could not equip security mode 😬',
    room,
    postMessage
  })

  if (!slug) {
    return
  }

  const color =
    COLOR_BY_SLUG[slug] ||
    BOUNCER_COLORS[Math.floor(Math.random() * BOUNCER_COLORS.length)]

  const line =
    BOUNCER_LINES[slug] ||
    `🕶️ ${slugToTitle(slug)} Bot on patrol. Respect the booth.`

  logger.info('[botstaff] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    await updateUserAvatar(ttlUserToken, slug, color)
    setChatIdentity({ avatarId: slug, color })

    logger.info('[botstaff] success', { senderUuid, slug, color })

    await postMessage({
      room,
      message: line,
      identity: { avatarId: slug, color }
    })
  } catch (error) {
    logger.error('[handleBotStaffCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Avatar update failed. Security bot is temporarily offline 😞'
    })
  }
}

export async function handleBot3Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const avatarId = 'lovable-pixel'
  const color = '#FF4D97FF'
  const isMod = await requireModerator({
    senderUuid,
    ttlUserToken,
    isUserAuthorized,
    room,
    postMessage,
    unauthorizedMessage: 'You need to be a moderator to execute this command.'
  })
  if (!isMod) {
    return
  }

  logger.info('[bot3] attempt', { senderUuid, avatar: avatarId, color })

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    logger.info('[bot3] success', { senderUuid, avatar: avatarId })

    await postMessage({ room, message: '🤖💖 Pixel mode engaged — LED grin, latency zero.', identity: { avatarId, color } })
  } catch (error) {
    logger.error('[handleBot3Command] update failed', {
      senderUuid,
      avatarTried: avatarId,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

export async function handleBotSpookyCommand (
  room,
  postMessage,
  isUserAuthorized,
  senderUuid,
  ttlUserToken
) {
  const isMod = await requireModerator({
    senderUuid,
    ttlUserToken,
    isUserAuthorized,
    room,
    postMessage,
    unauthorizedMessage: 'You need to be a moderator to execute this command. 🦇'
  })
  if (!isMod) {
    return
  }

  const allowedSlugs = [
    'harvest-08',
    'harvest-07',
    'harvest-06',
    'harvest-05',
    'dj-mummyv1-1',
    'dj-mummyv2-1',
    'ghost',
    'dj-vamplife-1',
    'dj-witchv1-1',
    'dj-witchv2-1',
    'dj-malezombie-1',
    'dj-femalezombie-1'
  ]

  const COLOR_BY_SLUG = {
    'harvest-08': '#FF6A00FF',
    'harvest-07': '#FFB84BFF',
    'harvest-06': '#FFB84BFF',
    'harvest-05': '#00FF66FF',
    'dj-mummyv1-1': '#C9C9C9FF',
    'dj-mummyv2-1': '#FFF4CCFF',
    ghost: '#FFFFFFFF',
    'dj-vamplife-1': '#B00020FF',
    'dj-witchv1-1': '#32C24DFF',
    'dj-witchv2-1': '#FF7A1CFF',
    'dj-malezombie-1': '#7FBF3FFF',
    'dj-femalezombie-1': '#8BD1A2FF'
  }

  const SPOOKY_COLORS = [
    '#FF6A00FF',
    '#00FF66FF',
    '#FFFFFFFF',
    '#B00020FF',
    '#C9C9C9FF'
  ]

  const SPOOKY_LINES = {
    'harvest-08': '🎃 Pumpkin Beast online. The candle’s real, the smile is not.',
    'harvest-07': '🕯️ Harvest Lantern lit. Cozy vibe, suspicious grin.',
    'harvest-06': '🌾 Field Watcher reports in. Stitch-smile, zero heartbeat.',
    'harvest-05': '🌽 Haunted Scarecrow rises — eyes glowing green, birds evacuated.',
    'dj-mummyv1-1': '🧻 Ancient Wrap v1 awakened. Do not tug the bandages.',
    'dj-mummyv2-1': '🧟‍♂️ Experimental Wrap v2 online. Extra stitches, extra curse.',
    ghost: '👻 Friendly Ghost materialized. Floating. Watching. Vibing.',
    'dj-vamplife-1': '🩸 Vamplife engaged. Pale face, dark night, louder than midnight.',
    'dj-witchv1-1': '🧪 Swamp Witch enters the booth — cauldron bass only.',
    'dj-witchv2-1': '🧹 Midnight Witch glides in. Hat sharp, spell sharper.',
    'dj-malezombie-1': '🧟‍♂️ Male Zombie staggers into the booth — smell of bass and decay.',
    'dj-femalezombie-1': '🧟‍♀️ Undead Diva awakens — beats fresher than her complexion.'
  }

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'botSpooky',
    emptyMessage: 'No spooky avatars found in the allowed set 🪦',
    missingSlugMessage: 'No spooky avatar available right now 😬',
    room,
    postMessage
  })

  if (!slug) {
    return
  }

  const color =
    COLOR_BY_SLUG[slug] ||
    SPOOKY_COLORS[Math.floor(Math.random() * SPOOKY_COLORS.length)]

  const line =
    SPOOKY_LINES[slug] ||
    `🦇 ${slugToTitle(slug)} has taken control of the booth.`

  logger.info('[botSpooky] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    await updateUserAvatar(ttlUserToken, slug, color)
    setChatIdentity({ avatarId: slug, color })

    logger.info('[botSpooky] success', {
      senderUuid,
      slug,
      color
    })

    await postMessage({
      room,
      message: line,
      identity: { avatarId: slug, color }
    })
  } catch (error) {
    logger.error('[handleBotSpookyCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Failed to update bot spooky avatar 😞'
    })
  }
}

export async function handleBot1Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  await runStaticBotAvatarCommand({
    room,
    postMessage,
    isUserAuthorized,
    senderUuid,
    ttlUserToken,
    unauthorizedMessage: 'You need to be a moderator to execute this command.',
    avatarId: 'bot-01',
    color: '#04D9FF',
    successMessage: '💙🤖 Classic look, timeless tech.',
    failureMessage: 'Failed to update bot profile',
    onBeforePostSuccess: async () => setChatIdentity({ avatarId: 'bot-01', color: '#04D9FF' })
  })
}

export async function handleBotWinterCommand (
  room,
  postMessage,
  isUserAuthorized,
  senderUuid,
  ttlUserToken
) {
  const isMod = await requireModerator({
    senderUuid,
    ttlUserToken,
    isUserAuthorized,
    room,
    postMessage,
    unauthorizedMessage: '🚫 You need to be a moderator to execute this command. ❄️'
  })
  if (!isMod) {
    return
  }

  const allowedSlugs = [
    'winter-01',
    'winter-02',
    'winter-03',
    'winter-04',
    'winter-05',
    'winter-06',
    'winter-07',
    'winter-08',
    'winter2-01',
    'winter2-02',
    'winter2-03',
    'winter2-04',
    'winter2-05',
    'winter2-06',
    'winter2-07',
    'winter2-08'
  ]

  const WINTER_COLORS = [
    '#E6F7FFFF',
    '#B3E5FFFF',
    '#8DE2FFFF',
    '#C7CEEAFF',
    '#DDEBFFFF',
    '#A7D2CBFF',
    '#F0F8FFFF',
    '#FFFFFFFF'
  ]

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'botwinter',
    emptyMessage: 'No winter avatars found in the allowed set ☃️',
    missingSlugMessage: 'No winter avatar available right now 😬',
    room,
    postMessage
  })

  if (!slug) {
    return
  }

  const color = WINTER_COLORS[Math.floor(Math.random() * WINTER_COLORS.length)]

  logger.info('[botwinter] attempt', { senderUuid, slug, color })

  try {
    await updateUserAvatar(ttlUserToken, slug, color)
    setChatIdentity({ avatarId: slug, color })

    logger.info('[botwinter] success', { senderUuid, slug, color })

    await postMessage({
      room,
      message: '❄️ Bot winter avatar equipped!',
      identity: { avatarId: slug, color }
    })
  } catch (error) {
    logger.error('[handleBotWinterCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Failed to equip bot winter avatar 😞'
    })
  }
}
