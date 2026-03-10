import { updateUserAvatar } from '../../utils/API.js'
import { getAvatarsBySlugs, getRandomAvatarSlug } from '../../database/dbavatars.js'
import { logger } from '../../utils/logging.js'
import {
  getAuthorizedUserToken,
  pickRandomAvatarBySlug,
  randomColors,
  runLoggedStaticUserAvatarCommand,
  runStaticUserAvatarCommand,
  slugToTitle,
  userTokenMap
} from './shared.js'

export async function handleDinoCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users 🦕.'
  )
  if (!userToken) return

  const allowedSlugs = [
    'jurassic-01',
    'jurassic-02',
    'jurassic-03',
    'jurassic-05',
    'jurassic-06',
    'jurassic-07'
  ]
  const COLOR_BY_SLUG = {
    'jurassic-01': '#FF7A1CFF',
    'jurassic-02': '#A6FF00FF',
    'jurassic-03': '#9B5DE5FF',
    'jurassic-05': '#FFB347FF',
    'jurassic-06': '#FFECC2FF',
    'jurassic-07': '#FFD500FF'
  }

  const DINO_COLORS = [
    '#A6FF00FF',
    '#FF7A1CFF',
    '#9B5DE5FF',
    '#FFB347FF',
    '#FFECC2FF',
    '#FFD500FF'
  ]

  const DINO_LINES = {
    'jurassic-01': '🦖 Frill Lizard deployed. Back up — the warning display means you’re already too close.',
    'jurassic-02': '🦕 Trike Tank online. Horns polished, tail swaying, crowd control engaged.',
    'jurassic-03': '😎 Cretaceous Cool slid in. Shades on. Herbivores free. Mammals behave.',
    'jurassic-05': '🟤 Desert Drake emerges. Warm scales, steady stare, zero fear.',
    'jurassic-06': '💀 Bonebreaker is awake. Heavy steps. Low patience.',
    'jurassic-07': '💚 Baby Rex activated. Absolutely adorable. Absolutely still a predator.'
  }

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'dino',
    emptyMessage: 'No Jurassic avatars found in the allowed list 🦴',
    missingSlugMessage: 'No dinosaur avatars available right now 😬',
    room,
    postMessage
  })
  if (!slug) return

  const color =
    COLOR_BY_SLUG[slug] ||
    DINO_COLORS[Math.floor(Math.random() * DINO_COLORS.length)]

  const line =
    DINO_LINES[slug] ||
    `🦖 ${slugToTitle(slug)} enters the timeline. Please keep arms and snacks inside the vehicle.`

  logger.info('[dino] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    await updateUserAvatar(userToken, slug, color)

    logger.info('[dino] success', {
      senderUuid,
      slug,
      color
    })

    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    logger.error('[handleDinoCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Failed to update dinosaur avatar 😞'
    })
  }
}

export async function handleBouncerCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    '🚫 This command is only available to authorized users.'
  )
  if (!userToken) return

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
      '🕶️ Black Ops Bear on duty. If your name’s not on the list, you’re not on the stage.',
    'mod-bear-orange':
      '🟠 Floor Security online. Badge visible, attitude checked, behave in the booth.',
    'staff-bear':
      '💛 Staff Bear reporting in — cute face, zero tolerance.',
    staff:
      '👔 Venue Staff present. Keep the energy up and the drama down.'
  }

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'bouncer',
    emptyMessage: 'No security avatars are available right now. 🔒',
    missingSlugMessage: 'Could not equip security mode 😬',
    room,
    postMessage
  })
  if (!slug) return

  const color =
    COLOR_BY_SLUG[slug] ||
    BOUNCER_COLORS[Math.floor(Math.random() * BOUNCER_COLORS.length)]

  const line =
    BOUNCER_LINES[slug] ||
    `🕶️ ${slugToTitle(slug)} on patrol. Respect the booth.`

  logger.info('[bouncer] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    await updateUserAvatar(userToken, slug, color)

    logger.info('[bouncer] success', {
      senderUuid,
      slug,
      color
    })

    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    logger.error('[handleBouncerCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Avatar update failed. Security is temporarily offline 😞'
    })
  }
}

export async function handleSpookyCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users 🦇.'
  )
  if (!userToken) return

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
    warnLabel: 'spooky',
    emptyMessage: 'No spooky avatars found in the allowed set 🪦',
    missingSlugMessage: 'No spooky avatar available right now 😬',
    room,
    postMessage
  })
  if (!slug) return

  const color =
    COLOR_BY_SLUG[slug] ||
    SPOOKY_COLORS[Math.floor(Math.random() * SPOOKY_COLORS.length)]

  const line =
    SPOOKY_LINES[slug] ||
    `🦇 ${slugToTitle(slug)} has entered the haunt.`

  logger.info('[spooky] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    await updateUserAvatar(userToken, slug, color)

    logger.info('[spooky] success', {
      senderUuid,
      slug,
      color
    })

    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    logger.error('[handleSpookyCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Failed to equip spooky avatar 😞'
    })
  }
}

export async function handleGrimehouseCommand (senderUuid, room, postMessage) {
  await runLoggedStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'dj-grimehouse-1',
    color: '#EDEDEDFF',
    successMessage: '🎧🕶️ Grimehouse unlocked — mask up, bass down, vibes heavy.',
    failureMessage: 'Failed to equip Grimehouse avatar 😞',
    attemptLabel: 'grimehouse',
    errorLabel: 'handleGrimehouseCommand'
  })
}

export async function handleRecordGuyCommand (senderUuid, room, postMessage) {
  await runLoggedStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: '🎟️ Sorry, this command is only available to authorized users.',
    avatarId: 'stadiumseason-04a',
    color: '#FF9A00FF',
    successMessage: '🏟️ Record Mascot on the floor — crowd noise activated, hype levels rising.',
    failureMessage: 'Could not equip Record Mascot 😞',
    attemptLabel: 'recordguy',
    errorLabel: 'handleRecordGuyCommand'
  })
}

export async function handleJesterCommand (senderUuid, room, postMessage) {
  await runLoggedStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: '🎟️ Sorry, this command is only available to authorized users.',
    avatarId: 'ttfm-jester-1',
    color: '#8A2BE2FF',
    successMessage: '🎭 The Jester enters — chaos enabled, mischief guaranteed.',
    failureMessage: 'The Jester slipped on a banana peel 🤡',
    attemptLabel: 'jester',
    errorLabel: 'handleJesterCommand'
  })
}

export async function handleJukeboxCommand (senderUuid, room, postMessage) {
  await runLoggedStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: '📻 Sorry, this command is only available to authorized users.',
    avatarId: 'dj-jukbox-1',
    color: '#FFF000FF',
    successMessage: '📼 Jukebox engaged. Old hits, deep cuts, all requests considered.',
    failureMessage: 'Could not equip Jukebox 😞',
    attemptLabel: 'jukebox',
    errorLabel: 'handleJukeboxCommand'
  })
}

export async function handleDuckCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized dino users 🦖.',
    avatarId: 'stadiumseason-02',
    color: '#FFDE21',
    successMessage: '🐤🧊 Cool, calm, and quackin’. Looking fly, my feather-friend.🕶️',
    failureMessage: 'Duck transformation failed'
  })
}

export async function handleTeacupCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized dino users 🦖.',
    avatarId: 'dj-greentea-1',
    color: '#6EFAC8FF',
    successMessage: '🍵 Green Tea avatar equipped — serenity and caffeine achieved.',
    failureMessage: 'Teacup transformation failed'
  })
}

export async function handleSpaceBearCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'dj-spacebear-1',
    color: '#FFD966',
    successMessage: 'You are now a spacebear! 🐻‍❄️🚀',
    failureMessage: 'Something went wrong trying to launch you into space. 🥲'
  })
}

export async function handleWalrusCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'winter-07',
    color: '#8de2ff',
    successMessage: '🦭 Splash! You’re officially a walrus now. Blub blub. ❄️',
    failureMessage: 'Something went wrong transforming you into a'
  })
}

export async function handleVibesGuyCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'dj-aurision-1',
    color: '#FFA500',
    successMessage: 'All time vibes guy is back',
    failureMessage: 'Something went wrong transforming you into a vibes guy'
  })
}

export async function handleGayCamCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'festivalseason-02',
    color: '#ff00bbff',
    successMessage: 'Haaa.........GAYYYYY',
    failureMessage: 'Something went wrong transforming you into a gay cam'
  })
}

export async function handleGayAlexCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'dj-akemie50-1',
    color: '#ff00bbff',
    successMessage: 'Cute mask 💗ྀི',
    failureMessage: 'Something went wrong transforming you into a gay Alex'
  })
}

export async function handleTVguyCommand (senderUuid, room, postMessage) {
  await runLoggedStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: '🎟️ Sorry, this command is only available to authorized users.',
    avatarId: 'dj-jamopi-1',
    color: '#9ED3D3FF',
    successMessage: '📺 TVguy online — static fades, picture locks in, channel changed.',
    failureMessage: '📡 TVguy lost signal… try adjusting the rabbit ears.',
    attemptLabel: 'tvguy',
    errorLabel: 'handleTVguyCommand'
  })
}

export async function handlePinkBlanketCommand (senderUuid, room, postMessage) {
  await runLoggedStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: '🎟️ Sorry, this command is only available to authorized users.',
    avatarId: 'dj-pnkblnkt-1',
    color: '#FFB7D5FF',
    successMessage: '🩷 Pink Blanket mode activated — cozy beats, zero stress.',
    failureMessage: 'Pink Blanket slipped off… please re-tuck 🫣',
    attemptLabel: 'pinkblanket',
    errorLabel: 'handlePinkBlanketCommand'
  })
}

export async function handleFacesCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'dj-FACES-1',
    color: '#007CF0',
    successMessage: 'Smile!',
    failureMessage: 'Something went wrong transforming you into a smiley face'
  })
}

export async function handleGayIanCommand (senderUuid, room, postMessage) {
  await runLoggedStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: '🎟️ Sorry, this command is only available to authorized users.',
    avatarId: 'dj-festseason-4',
    color: '#FF4FA3FF',
    successMessage: '🕺✨ Gay Ian activated — glitter on, volume up',
    failureMessage: 'Gay Ian dropped the beat… and the glitter 💔',
    attemptLabel: 'gayIan',
    errorLabel: 'handleGayIanCommand'
  })
}

export async function handleAlienCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'season-0001-underground-thehuman',
    color: '#39FF14',
    successMessage: 'ET Phone Home! 👽',
    failureMessage: 'Something went wrong transforming you into an alien'
  })
}

export async function handleAlien2Command (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'stadiumseason-01',
    color: '#39FF14',
    successMessage: 'ET Phone Home! 👽',
    failureMessage: 'Something went wrong transforming you into an alien'
  })
}

export async function handleRoyCommand (senderUuid, room, postMessage) {
  await runLoggedStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to authorized users.',
    avatarId: 'dj-roy-1',
    color: '#E5D47FFF',
    successMessage: '☣️ The Roy Protocol is active — mask on, beats hazardous.',
    failureMessage: 'Failed to equip Roy avatar 😞',
    attemptLabel: 'roy',
    errorLabel: 'handleRoyCommand'
  })
}

export async function handleDoDoCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to people i like',
    avatarId: 'lennnie-01',
    color: '#A67C52',
    successMessage: 'The DoDo bird...Proof you don’t need wings to elevate the room',
    failureMessage: 'Something went wrong transforming you into a dodo bird'
  })
}

export async function handleDumDumCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to people i like',
    avatarId: 'stadiumseason-03',
    color: '#767573ff',
    successMessage: 'dum dum want gum gum 🗿',
    failureMessage: 'Something went wrong transforming you...dum dum'
  })
}

export async function handleFlowerPowerCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to people i like',
    avatarId: 'dj-petalsupply-1',
    color: '#ef55ddff',
    successMessage: 'You’ve gone full Flower Power—expect photosynthesis-level energy',
    failureMessage: 'Something went wrong transforming you into a flower'
  })
}

export async function handleAnonCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to people i like',
    avatarId: 'dj-tybolden-1',
    color: '#a199a0ff',
    successMessage: 'Hello Mr. Anonymous',
    failureMessage: 'Something went wrong transforming you into anon'
  })
}

export async function handleGhostCommand (senderUuid, room, postMessage) {
  await runStaticUserAvatarCommand({
    senderUuid,
    room,
    postMessage,
    unauthorizedMessage: 'Sorry, this command is only available to people i like',
    avatarId: 'ghost',
    color: '#ffffffff',
    successMessage: 'Boo!',
    failureMessage: 'Something went wrong transforming you into a ghost'
  })
}

export async function handleRandomAvatarCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users 🎭.'
  )
  if (!userToken) return

  const randomAvatar = getRandomAvatarSlug()
  const randomColor = randomColors[Math.floor(Math.random() * randomColors.length)]

  try {
    await updateUserAvatar(userToken, randomAvatar, randomColor)
    if (!randomAvatar) {
      await postMessage({ room, message: 'No avatars available right now 😬' })
      return
    }
    await postMessage({ room, message: 'You\'ve been randomly avatar-ized! 🎭' })
  } catch (error) {
    await postMessage({ room, message: 'Failed to update avatar' })
  }
}

export async function handleRandomCyberCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users 🎭.'
  )
  if (!userToken) return

  const allowedSlugs = [
    'cyber-bear-visor',
    'cyber-bear-angry',
    'cyber-girl',
    'cyber-gorilla',
    'cyber-guy',
    'cyber-helmet',
    'cyber-hood-purple',
    'cyber-hood-yellow'
  ]

  const COLOR_BY_SLUG = {
    'cyber-girl': '#FFD54FFF',
    'cyber-guy': '#FF5AB1FF',
    'cyber-helmet': '#FF4D97FF',
    'cyber-bear-visor': '#16E7E4FF',
    'cyber-gorilla': '#FF5C5CFF',
    'cyber-bear-angry': '#8AFF64FF',
    'cyber-hood-purple': '#8A2BE2FF',
    'cyber-hood-yellow': '#FFD500FF'
  }

  const CYBER_COLORS = [
    '#00E6D3FF', '#5B8CFFFF', '#C200FBFF', '#00BBF9FF',
    '#FF7A00FF', '#F15BB5FF', '#9B5DE5FF', '#A6FFCBFF'
  ]

  const AVATAR_LINES = {
    'cyber-bear-visor': '🧸🛡️ Bear with a visor online—scanning synthwave.',
    'cyber-bear-angry': '🐻⚡ Angry Bear boots up—do not feed after midnight.',
    'cyber-girl': '👩‍🎤 Neon Girl synced—city lights set to groove.',
    'cyber-gorilla': '🦍💽 Cyber Gorilla stomps the grid—bass endangered.',
    'cyber-guy': '🕶️💾 Neon Guy: visor down, volume up.',
    'cyber-helmet': '🤖🔊 Helm online—systems green, subwoofers armed.',
    'cyber-hood-purple': '🟣🕶️ Purple Hood in stealth—low light, loud beats.',
    'cyber-hood-yellow': '🟡⚡ Yellow Hood engaged—high voltage incoming.'
  }

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'cyber',
    emptyMessage: 'No avatars found in your allowed list. 🫤',
    missingSlugMessage: 'No avatars available right now 😬',
    room,
    postMessage
  })
  if (!slug) return

  const color = COLOR_BY_SLUG[slug] ?? CYBER_COLORS[Math.floor(Math.random() * CYBER_COLORS.length)]
  const line = AVATAR_LINES[slug] ?? `⚡ ${slugToTitle(slug)} equipped—welcome to the grid.`

  logger.info('[cyber] attempt', { senderUuid, slug, color, title: slugToTitle(slug) })

  try {
    await updateUserAvatar(userToken, slug, color)
    logger.info('[cyber] success', { senderUuid, slug, color })
    await postMessage({ room, message: line })
  } catch (error) {
    logger.error('[handleRandomCyberCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })
    await postMessage({ room, message: 'Failed to update avatar 😞' })
  }
}

export async function handleRandomCosmicCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users 🎭.'
  )
  if (!userToken) return

  const allowedSlugs = [
    'cosmic-alien-bear',
    'cosmic-galactic-bear',
    'cosmic-space-guardian-bear',
    'cosmic-blue-alien',
    'cosmic-helmet-alien',
    'cosmic-baby-alien',
    'cosmic-meteor-guy',
    'cosmic-cloudy-planet',
    'cosmic-crescent-moon-guy',
    'cosmic-galaxy-cloak',
    'cosmic-magical-gem',
    'cosmic-sun-star',
    'cosmic-golden-chibi',
    'cosmic-moon-chibi',
    'cosmic-saturn-cloudy',
    'cosmic-celestial-chibi-alien',
    'cosmic-celestial-chibi-goddess',
    'cosmic-celestial-lady'
  ]

  const COSMIC_COLORS = [
    '#1FA2FFFF',
    '#9B5DE5FF',
    '#F15BB5FF',
    '#00F5D4FF',
    '#FFD700FF',
    '#00BBF9FF',
    '#FF7A00FF',
    '#A6FFCBFF',
    '#C200FBFF',
    '#5B8CFFFF'
  ]

  const AVATAR_LINES = {
    'cosmic-alien-bear': '🐻‍❄️🛸 Alien Bear online—gravity off, paw prints on the moon.',
    'cosmic-galactic-bear': '🐻🌌 Galactic Bear roars—Ursa Major just subscribed.',
    'cosmic-space-guardian': '🛡️🚀 Space Guardian deployed—shields up, bass protected.',
    'cosmic-blue-alien': '🛸💙 Blue Alien beamed in—frequency set to chill.',
    'cosmic-helmet-alien': '👨‍🚀🔊 Helmet Alien sealed—comm check: one-two into the nebula.',
    'cosmic-baby-alien': '👶🪐 Baby Alien coos—cuteness at warp speed.',
    'cosmic-meteor-guy': '☄️🔥 Meteor Guy streaks by—expect heavy drops.',
    'cosmic-cloudy-planet': '☁️🪐 Cloudy Planet ascends—overcast with a chance of bops.',
    'cosmic-crescent-moon-guy': '🌙🎚️ Crescent Moon Guy—night mode engaged.',
    'cosmic-galaxy-cloak': '🌀🧥 Galaxy Cloak swirls—stars stitched into the drip.',
    'cosmic-magical-gem': '💎✨ Magical Gem glows—facet-cut frequencies unlocked.',
    'cosmic-sun-star': '☀️⚡ Sun Star flares—SPF 100 beats recommended.',
    'cosmic-golden-chibi': '🌟🥇 Golden Chibi shines—solid gold set list coming up.',
    'cosmic-moon-chibi': '🌕🌊 Moon Chibi floats—low tide, high vibes.',
    'cosmic-saturn-cloudy': '🪐🌫️ Saturn Cloudy rolls in—ringside seats for the groove.',
    'cosmic-celestial-chibi-alien': '👾✨ Celestial Chibi Alien—cute but cosmic, abducting silence.',
    'cosmic-celestial-chibi-goddess': '👑🌠 Celestial Chibi Goddess descends—divinity with reverb.',
    'cosmic-celestial-lady': '💫🎼 Celestial Lady arrives—elegance in orbit.'
  }

  const COLOR_BY_SLUG = {
    'cosmic-alien-bear': '#54E38BFF',
    'cosmic-galactic-bear': '#B6E3FFFF',
    'cosmic-space-guardian-bear': '#FF8ED2FF',
    'cosmic-blue-alien': '#1EC8FFFF',
    'cosmic-helmet-alien': '#8CF15AFF',
    'cosmic-baby-alien': '#A8F0C2FF',
    'cosmic-meteor-guy': '#FF8C6BFF',
    'cosmic-cloudy-planet': '#F5E46BFF',
    'cosmic-crescent-moon-guy': '#FF6A39FF',
    'cosmic-galaxy-cloak': '#4C3EDCFF',
    'cosmic-magical-gem': '#D9B6FFFF',
    'cosmic-sun-star': '#FFA51CFF',
    'cosmic-golden-chibi': '#FFD54FFF',
    'cosmic-moon-chibi': '#C267F8FF',
    'cosmic-saturn-cloudy': '#FFC4A9FF',
    'cosmic-celestial-chibi-alien': '#B8F1FFFF',
    'cosmic-celestial-chibi-goddess': '#6C49AFFF',
    'cosmic-celestial-lady': '#8C6DF1FF'
  }

  const randomAvatar = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'cosmic',
    emptyMessage: 'No avatars found in your allowed list. 🫤',
    missingSlugMessage: 'No avatars available right now 😬',
    room,
    postMessage
  })
  if (!randomAvatar) return

  const color = COLOR_BY_SLUG[randomAvatar] ?? COSMIC_COLORS[Math.floor(Math.random() * COSMIC_COLORS.length)]
  const line = AVATAR_LINES[randomAvatar] ?? `🌌 ${slugToTitle(randomAvatar)} engaged—orbiting the vibe.`

  logger.info('[cosmic] attempt', {
    senderUuid,
    slug: randomAvatar,
    color,
    title: slugToTitle(randomAvatar)
  })

  try {
    await updateUserAvatar(userToken, randomAvatar, color)
    logger.info('[cosmic] success', { senderUuid, slug: randomAvatar, color })
    await postMessage({ room, message: line })
  } catch (error) {
    const errMsg = error?.message || String(error)
    logger.error('[handleRandomCosmicCommand] update failed', {
      senderUuid,
      slugTried: randomAvatar,
      colorTried: color,
      error: errMsg,
      stack: error?.stack
    })

    await postMessage({ room, message: 'Failed to update avatar 😞' })
  }
}

export async function handleRandomPajamaCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users 🎭.'
  )
  if (!userToken) return

  const allowedSlugs = [
    'pajamas-classic-bear-frog',
    'pajamas-classic-bear-panda',
    'pajamas-eyeball',
    'pajamas-pink-skin-black',
    'pajamas-pixel-boy-blue',
    'pajamas-pixel-girl-pink',
    'pajamas-bunny-blue',
    'pajamas-bunny-pink',
    'pajamas-witch',
    'pajamas-black-penguin',
    'pajamas-blue-penguin',
    'pajamas-penguin-onesies',
    'pajamas-clown-cap',
    'pajamas-clown-jester-cap',
    'pajamas-yellow-cloak',
    'pajamas-brown-onsies-goblin',
    'pajamas-orange-onsies-goblin',
    'pajamas-yellow-fire'
  ]

  const PAJAMA_COLORS = [
    '#FFD966FF', '#A7D2CBFF', '#FFB6B9FF', '#FFDAC1FF', '#E2F0CBFF', '#B5EAD7FF',
    '#C7CEEAFF', '#F7A072FF', '#D5AAFFFF', '#ACE7FFFF', '#FFB347FF', '#B0E57CFF',
    '#FF9AA2FF', '#E6E6FAFF', '#FFDEADFF', '#C0FDFBFF', '#FAF3DDFF', '#FDCB82FF'
  ]

  const AVATAR_LINES = {
    'pajamas-classic-bear-frog': '🐸🐻 Frog Bear onesie engaged — ribbit, then cuddle.',
    'pajamas-classic-bear-panda': '🐼🐻 Panda Bear mode — black, white, and bedtime-ready.',
    'pajamas-eyeball': '👁️🛌 Eyeball pajama mode — I’m watching… the vibes.',
    'pajamas-pink-skin-black': '🩷🖤 Pink Skin (Black) — cozy, but make it dangerous.',
    'pajamas-pixel-boy-blue': '🟦😴 Pixel Boy Blue — low-res, high comfort.',
    'pajamas-pixel-girl-pink': '🩷😴 Pixel Girl Pink — bedtime but still cute.',
    'pajamas-bunny-blue': '🐰💙 Blue Bunny — hop into sleep mode.',
    'pajamas-bunny-pink': '🐰🩷 Pink Bunny — soft steps, softer vibes.',
    'pajamas-witch': '🧙‍♀️🌙 Pajama Witch online — spells cast, lights out.',
    'pajamas-black-penguin': '🐧🖤 Black Penguin — waddle into cozy season.',
    'pajamas-blue-penguin': '🐧💙 Blue Penguin — chill mode: max.',
    'pajamas-penguin-onesies': '🐧🧸 Penguin onesie squad — cold outside, warm inside.',
    'pajamas-clown-cap': '🤡🎈 Clown Cap pajamas — goofy, but comfy.',
    'pajamas-clown-jester': '🎭🛌 Jester pajamas — mischief, then sleep.',
    'pajamas-yellow-cloak': '🟡🧥 Yellow Cloak — mysterious… and extremely cozy.',
    'pajamas-brown-onsies-goblin': '👺🟤 Brown Goblin onesie — menace in slippers.',
    'pajamas-orange-onsies-goblin': '👺🟠 Orange Goblin onesie — chaos, but bedtime.',
    'pajamas-yellow-fire': '🔥🟡 Yellow Fire — hot cocoa energy, warm beats only.'
  }

  const COLOR_BY_SLUG = {
    'pajamas-classic-bear-frog': '#67E38BFF',
    'pajamas-classic-bear-panda': '#EDEDEDFF',
    'pajamas-eyeball': '#7EC8FFFF',
    'pajamas-pink-skin-black': '#FF5AB1FF',
    'pajamas-pixel-boy-blue': '#4DA3FFFF',
    'pajamas-pixel-girl-pink': '#FF8FCBFF',
    'pajamas-bunny-blue': '#66D6FFFF',
    'pajamas-bunny-pink': '#FF9EDBFF',
    'pajamas-witch': '#8A2BE2FF',
    'pajamas-black-penguin': '#1A1A1AFF',
    'pajamas-blue-penguin': '#2F7DFFFF',
    'pajamas-penguin-onesies': '#B6E3FFFF',
    'pajamas-clown-cap': '#FF4D97FF',
    'pajamas-clown-jester': '#8C6DF1FF',
    'pajamas-yellow-cloak': '#FFD500FF',
    'pajamas-brown-onsies-goblin': '#C68642FF',
    'pajamas-orange-onsies-goblin': '#FF7A1CFF',
    'pajamas-yellow-fire': '#FFB000FF'
  }

  if (!allowedSlugs.length) {
    await postMessage({ room, message: 'No pajamas configured 😬' })
    return
  }

  const randomAvatar = allowedSlugs[Math.floor(Math.random() * allowedSlugs.length)]
  const color = COLOR_BY_SLUG[randomAvatar] ?? PAJAMA_COLORS[Math.floor(Math.random() * PAJAMA_COLORS.length)]
  const line = AVATAR_LINES[randomAvatar] ?? `🛌 ${slugToTitle(randomAvatar)} equipped—cozy mode enabled.`

  logger.info('[pajama] attempt', {
    senderUuid,
    slug: randomAvatar,
    color,
    title: slugToTitle(randomAvatar)
  })

  try {
    await updateUserAvatar(userToken, randomAvatar, color)
    logger.info('[pajama] success', { senderUuid, slug: randomAvatar, color })
    await postMessage({ room, message: line })
  } catch (error) {
    const errMsg = error?.message || String(error)
    logger.error('[handleRandomPajamaCommand] update failed', {
      senderUuid,
      slugTried: randomAvatar,
      colorTried: color,
      error: errMsg,
      stack: error?.stack
    })
    await postMessage({ room, message: 'Failed to update avatar 😞' })
  }
}

export async function handleRandomLovableCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users 🎭.'
  )
  if (!userToken) return

  const allowedSlugs = [
    'lovable-figgy',
    'lovable-loop',
    'lovable-nova',
    'lovable-pixel',
    'lovable-bee'
  ]

  const COLOR_BY_SLUG = {
    'lovable-figgy': '#9B5DE5FF',
    'lovable-loop': '#FF8C00FF',
    'lovable-nova': '#00E6D3FF',
    'lovable-pixel': '#FF4D97FF',
    'lovable-bee': '#FFD54FFF'
  }

  const LOVE_COLORS = [
    '#A0C4FFFF', '#F15BB5FF', '#9B5DE5FF', '#00BBF9FF', '#00F5D4FF'
  ]

  const AVATAR_LINES = {
    'lovable-figgy': '🫧 Figgy materializes—mischief meter pegged at 11.',
    'lovable-loop': '🔁 Loop locks the hard hat—constructing certified bops.',
    'lovable-nova': '🌟 Nova ignites—tiny astronaut, galaxy-sized energy.',
    'lovable-pixel': '🤖 Pixel online—LED smile, latency zero.',
    'lovable-vee': '💜 Vee vibes in—soft glow, big heart, bigger jams.'
  }

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'lovable',
    emptyMessage: 'No avatars found in your allowed list. 🫤',
    missingSlugMessage: 'No avatars available right now 😬',
    room,
    postMessage
  })
  if (!slug) return

  const color = COLOR_BY_SLUG[slug] ?? LOVE_COLORS[Math.floor(Math.random() * LOVE_COLORS.length)]
  const line = AVATAR_LINES[slug] ?? `💖 ${slugToTitle(slug)} equipped—spreading wholesome waves.`

  logger.info('[lovable] attempt', { senderUuid, slug, color, title: slugToTitle(slug) })

  try {
    await updateUserAvatar(userToken, slug, color)
    logger.info('[lovable] success', { senderUuid, slug, color })
    await postMessage({ room, message: line })
  } catch (error) {
    logger.error('[handleRandomLovableCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })
    await postMessage({ room, message: 'Failed to update avatar 😞' })
  }
}

export async function handleBearPartyCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users 🐻.'
  )
  if (!userToken) return

  const allowedSlugs = [
    'mod-bear-black',
    'mod-bear-orange',
    'staff-bear',
    'dj-spacebear-1',
    'cyber-bear-visor',
    'cyber-bear-angry',
    'cosmic-alien-bear',
    'cosmic-galactic-bear',
    '19',
    '20',
    'dj-christian-2',
    '28',
    '21',
    '10'
  ]

  const COLOR_BY_SLUG = {
    'mod-bear-black': '#1A1A1AFF',
    'mod-bear-orange': '#FF6A00FF',
    'staff-bear': '#FFC300FF',
    'dj-spacebear-1': '#8DE2FFFF',
    'cyber-bear-visor': '#16E7E4FF',
    'cyber-bear-angry': '#8AFF64FF',
    'cosmic-alien-bear': '#54E38BFF',
    'cosmic-galactic-bear': '#B6E3FFFF',
    19: '#FF1A1AFF',
    20: '#FFD500FF'
  }

  const BEAR_COLORS = [
    '#FFD54FFF',
    '#FF6A00FF',
    '#8DE2FFFF',
    '#16E7E4FF',
    '#8AFF64FF',
    '#54E38BFF',
    '#FF1A1AFF',
    '#FFD500FF'
  ]

  const BEAR_LINES = {
    'mod-bear-black': '🕶️ Midnight Bear enters — mysterious, cool, and judging your playlist.',
    'mod-bear-orange': '🟠 Orange Alert Bear crashes the party — high visibility, higher vibes.',
    'staff-bear': '💛 Staff Bear arrives — adorable… but enforcing the party rules.',
    'dj-spacebear-1': '🚀 Spacebear descends from orbit — gravitational bangers inbound.',
    'cyber-bear-visor': '🔷 Cyber Visor Bear uploaded — scanning frequencies for fun.',
    'cyber-bear-angry': '💢 Angry Cyber Bear online — the bass better behave.',
    'cosmic-alien-bear': '👽 Alien Bear beams in — abducting all weak beats.',
    'cosmic-galactic-bear': '🌌 Galactic Bear materializes — entire star systems feeling the groove.',
    19: '🐻‍🔥 Red-Eyed Shadow Bear emerges — watching… always.',
    20: '💛 Honey Glow Bear arrives — sweet vibes, sticky bass.'
  }

  const slug = await pickRandomAvatarBySlug({
    allowedSlugs,
    warnLabel: 'bearparty',
    emptyMessage: 'No bear party avatars found 🐻🥲',
    missingSlugMessage: 'No bear party avatar available right now 😬',
    room,
    postMessage
  })
  if (!slug) return

  const color =
    COLOR_BY_SLUG[slug] ||
    BEAR_COLORS[Math.floor(Math.random() * BEAR_COLORS.length)]

  const line =
    BEAR_LINES[slug] ||
    `🐻 ${slugToTitle(slug)} joins the Bear Party!`

  logger.info('[bearparty] attempt', {
    senderUuid,
    slug,
    color
  })

  try {
    await updateUserAvatar(userToken, slug, color)

    logger.info('[bearparty] success', { senderUuid, slug, color })

    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    logger.error('[handleBearPartyCommand] update failed', {
      senderUuid,
      slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Failed to equip Bear Party avatar 😞'
    })
  }
}

export async function handleWinterCommand (senderUuid, room, postMessage) {
  const userToken = await getAuthorizedUserToken(
    senderUuid,
    room,
    postMessage,
    'Sorry, this command is only available to authorized users ❄️.'
  )
  if (!userToken) return

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
    warnLabel: 'winter',
    emptyMessage: 'No winter avatars found in the allowed set ☃️',
    missingSlugMessage: 'No winter avatar available right now 😬',
    room,
    postMessage
  })
  if (!slug) return

  const color = WINTER_COLORS[Math.floor(Math.random() * WINTER_COLORS.length)]

  logger.info('[winter] attempt', { senderUuid, slug, color })

  try {
    await updateUserAvatar(userToken, slug, color)

    logger.info('[winter] success', { senderUuid, slug, color })

    await postMessage({
      room,
      message: '❄️ Winter avatar equipped!'
    })
  } catch (error) {
    logger.error('[handleWinterCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Failed to equip winter avatar 😞'
    })
  }
}
