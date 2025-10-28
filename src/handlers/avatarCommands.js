import { updateUserAvatar } from '../utils/API.js'
import { getAvatarsBySlugs, getRandomAvatarSlug } from '../database/dbavatars.js'
import { setChatIdentity } from '../libs/cometchat.js'

const userTokenMap = {
  '072b0bb3-518e-4422-97fd-13dc53e8ae7e': process.env.IAN_USER_TOKEN,
  '210141ad-6b01-4665-84dc-e47ea7c27dcb': process.env.SMITTY_USER_TOKEN,
  '92302b7d-ae5e-466f-975b-d3fee461f13f': process.env.CAM_USER_TOKEN,
  'fd2f1b47-b1d4-4100-8f88-6e56aa82e13f': process.env.GAB_USER_TOKEN,
  'a122488b-d9ec-4d2f-97bf-9d9472d299a0': process.env.ALEX_USER_TOKEN,
  
}

const randomColors = [
  '#FFD966', '#A7D2CB', '#FFB6B9', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA',
  '#F7A072', '#D5AAFF', '#ACE7FF', '#FFB347', '#B0E57C', '#FF9AA2', '#E6E6FA',
  '#FFDEAD', '#C0FDFB', '#FAF3DD', '#FDCB82'
]

/// //////////////////////// Bot Updates /////////////////////////////

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
    await updateUserAvatar(ttlUserToken, avatarId, color) // 1) platform
    setChatIdentity({ avatarId, color }) // 2) live chat meta
    await postMessage({ room, message: randomMessage, identity: { avatarId, color } }) // 3) one-off override
  } catch (error) {
    await postMessage({ room, message: `Failed to update bot avatar: ${error.message}` })
  }
}

export async function handleBotDinoCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'jurassic-05'
  const color = '#8B6C5C'

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: 'Roar!', identity: { avatarId, color } })
  } catch {
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

export async function handleBotDuckCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'stadiumseason-02'
  const color = '#FFDE21'

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: 'Quack Quack 🦆🧼🫧', identity: { avatarId, color } })
  } catch {
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

export async function handleBotAlienCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'season-0001-underground-thehuman'
  const color = '#39FF14'

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: '👽 Alien transformation complete! Take me to your leader. 🚀', identity: { avatarId, color } })
  } catch {
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

export async function handleBotAlien2Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'stadiumseason-01'
  const color = '#39FF14'

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: '🌌 Beep boop. I’m not from around here... 👾', identity: { avatarId, color } })
  } catch {
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

export async function handleBotWalrusCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'winter-07'
  const color = '#8DE2FF'

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: '🦭 Don’t mind me… just lounging like a majestic sea sausage.🧊', identity: { avatarId, color } })
  } catch {
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

export async function handleBotPenguinCommand (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'pinguclub-03'
  const color = '#B026FF'

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: '💜🐧 Initiating purple penguin protocol… waddling in style now.', identity: { avatarId, color } })
  } catch {
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

export async function handleBot2Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'bot-2'
  const color = '#FF5F1F'

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: '⚙️🟠 They said I needed a fresh coat… I went full fire.🤖', identity: { avatarId, color } })
  } catch {
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

export async function handleBot3Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'lovable-pixel'
  const color = '#FF4D97FF' // hot magenta to match Pixel accents

  try {
    console.log('[bot3] attempt', { senderUuid, avatar: avatarId, color })
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    console.log('[bot3] success', { senderUuid, avatar: avatarId })

    await postMessage({ room, message: '🤖💖 Pixel mode engaged — LED grin, latency zero.', identity: { avatarId, color } })
  } catch (error) {
    console.error('[handleBot3Command] update failed', {
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
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({
      room,
      message: 'You need to be a moderator to execute this command. 🦇'
    })
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
    'harvest-08':    '#FF6A00FF',
    'harvest-07':    '#FFB84BFF',
    'harvest-06':    '#FFB84BFF',
    'harvest-05':    '#00FF66FF',
    'dj-mummyv1-1':  '#C9C9C9FF',
    'dj-mummyv2-1':  '#FFF4CCFF',
    'ghost':         '#FFFFFFFF',
    'dj-vamplife-1': '#B00020FF',
    'dj-witchv1-1':  '#32C24DFF',
    'dj-witchv2-1':  '#FF7A1CFF',
    'dj-malezombie-1':   '#7FBF3FFF',
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
    'harvest-08':   '🎃 Pumpkin Beast online. The candle’s real, the smile is not.',
    'harvest-07':   '🕯️ Harvest Lantern lit. Cozy vibe, suspicious grin.',
    'harvest-06':   '🌾 Field Watcher reports in. Stitch-smile, zero heartbeat.',
    'harvest-05':   '🌽 Haunted Scarecrow rises — eyes glowing green, birds evacuated.',
    'dj-mummyv1-1': '🧻 Ancient Wrap v1 awakened. Do not tug the bandages.',
    'dj-mummyv2-1': '🧟‍♂️ Experimental Wrap v2 online. Extra stitches, extra curse.',
    'ghost':        '👻 Friendly Ghost materialized. Floating. Watching. Vibing.',
    'dj-vamplife-1':'🩸 Vamplife engaged. Pale face, dark night, louder than midnight.',
    'dj-witchv1-1': '🧪 Swamp Witch enters the booth — cauldron bass only.',
    'dj-witchv2-1': '🧹 Midnight Witch glides in. Hat sharp, spell sharper.',
    'dj-malezombie-1':   '🧟‍♂️ Male Zombie staggers into the booth — smell of bass and decay.',
    'dj-femalezombie-1': '🧟‍♀️ Undead Diva awakens — beats fresher than her complexion.'
  }

  const filtered = getAvatarsBySlugs(allowedSlugs)

  if (!filtered || filtered.length === 0) {
    await postMessage({
      room,
      message: 'No spooky avatars found in the allowed set 🪦'
    })
    return
  }

  const chosen = filtered[Math.floor(Math.random() * filtered.length)]
  const slug = chosen?.slug

  if (!slug) {
    console.warn('[botSpooky] No slug on selected avatar object:', chosen)
    await postMessage({
      room,
      message: 'No spooky avatar available right now 😬'
    })
    return
  }

  const color =
    COLOR_BY_SLUG[slug] ||
    SPOOKY_COLORS[Math.floor(Math.random() * SPOOKY_COLORS.length)]

  const line =
    SPOOKY_LINES[slug] ||
    `🦇 ${slugToTitle(slug)} has taken control of the booth.`

  console.log('[botSpooky] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    // 1) update bot avatar platform-side
    await updateUserAvatar(ttlUserToken, slug, color)

    // 2) sync live chat identity for immediate visual consistency
    setChatIdentity({ avatarId: slug, color })

    console.log('[botSpooky] success', {
      senderUuid,
      slug,
      color
    })

    // 3) announce using that identity override so message shows as spooky bot
    await postMessage({
      room,
      message: line,
      identity: { avatarId: slug, color }
    })
  } catch (error) {
    console.error('[handleBotSpookyCommand] update failed', {
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

  function slugToTitle (s) {
    return s
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }
}



export async function handleBot1Command (room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
  const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
  if (!isMod) {
    await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
    return
  }

  const avatarId = 'bot-01'
  const color = '#04D9FF'

  try {
    await updateUserAvatar(ttlUserToken, avatarId, color)
    setChatIdentity({ avatarId, color })
    await postMessage({ room, message: '💙🤖 Classic look, timeless tech.', identity: { avatarId, color } })
  } catch {
    await postMessage({ room, message: 'Failed to update bot profile' })
  }
}

/// //////////////////////////// User Updates //////////////////////////////
export async function handleDinoCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({
      room,
      message: 'Sorry, this command is only available to authorized users 🦕.'
    })
    return
  }

  // 🦖 Allowed Jurassic avatars (these are the only ones we'll choose from)
  const allowedSlugs = [
    'jurassic-01',
    'jurassic-02',
    'jurassic-03',
    'jurassic-05',
    'jurassic-06',
    'jurassic-07'
  ]
  const COLOR_BY_SLUG = {
    'jurassic-01': '#FF7A1CFF', // fiery orange frill / warning display
    'jurassic-02': '#A6FF00FF', // toxic lime body plates
    'jurassic-03': '#9B5DE5FF', // neon purple visor-energy sunglasses vibe
    'jurassic-05': '#FFB347FF', // amber/golden caramel shell
    'jurassic-06': '#FFECC2FF', // horn/bone ivory accent on the tough brown one
    'jurassic-07': '#FFD500FF'  // bright crest yellow on the baby dino
  }

  const DINO_COLORS = [
    '#A6FF00FF', // lime
    '#FF7A1CFF', // orange
    '#9B5DE5FF', // violet
    '#FFB347FF', // amber
    '#FFECC2FF', // bone/ivory
    '#FFD500FF'  // crest yellow
  ]

  const DINO_LINES = {
    'jurassic-01': '🦖 Frill Lizard deployed. Back up — the warning display means you’re already too close.',
    'jurassic-02': '🦕 Trike Tank online. Horns polished, tail swaying, crowd control engaged.',
    'jurassic-03': '😎 Cretaceous Cool slid in. Shades on. Herbivores free. Mammals behave.',
    'jurassic-05': '🟤 Desert Drake emerges. Warm scales, steady stare, zero fear.',
    'jurassic-06': '💀 Bonebreaker is awake. Heavy steps. Low patience.',
    'jurassic-07': '💚 Baby Rex activated. Absolutely adorable. Absolutely still a predator.'
  }

  // Pull the avatar objects for those slugs, same pattern as cyber
  const filtered = getAvatarsBySlugs(allowedSlugs)

  if (!filtered || filtered.length === 0) {
    await postMessage({
      room,
      message: 'No Jurassic avatars found in the allowed list 🦴'
    })
    return
  }

  // pick one at random
  const chosen = filtered[Math.floor(Math.random() * filtered.length)]
  const slug = chosen?.slug

  if (!slug) {
    console.warn('[dino] No slug on selected avatar object:', chosen)
    await postMessage({
      room,
      message: 'No dinosaur avatars available right now 😬'
    })
    return
  }

  // find color for that slug or fall back to one of the jurassic palette colors
  const color =
    COLOR_BY_SLUG[slug] ||
    DINO_COLORS[Math.floor(Math.random() * DINO_COLORS.length)]

  // pick the line for that slug
  const line =
    DINO_LINES[slug] ||
    `🦖 ${slugToTitle(slug)} enters the timeline. Please keep arms and snacks inside the vehicle.`

  // helpful log for debugging + analytics
  console.log('[dino] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    await updateUserAvatar(userToken, slug, color)

    console.log('[dino] success', {
      senderUuid,
      slug,
      color
    })

    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    console.error('[handleDinoCommand] update failed', {
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

  function slugToTitle (s) {
    return s
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }
}

export async function handleBouncerCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({
      room,
      message: '🚫 This command is only available to authorized users.'
    })
    return
  }

  // 🛡 Allowed security / staff avatars
  const allowedSlugs = [
    'mod-bear-black',
    'mod-bear-orange',
    'staff-bear',
    'staff'
  ]

  // 🎨 Per-avatar accent/chat color (8-digit RGBA-style hex)
  // Pick something that matches their most obvious visual accent:
  // - mod-bear-black   → blackout / shades
  // - mod-bear-orange  → hazard orange / high-vis
  // - staff-bear       → bright yellow hair buns
  // - staff            → black STAFF jumpsuit
  const COLOR_BY_SLUG = {
    'mod-bear-black':  '#1A1A1AFF',  // deep charcoal / "night security"
    'mod-bear-orange': '#FF6A00FF',  // vivid hazard orange / radio earpiece
    'staff-bear':      '#FFC300FF',  // bright golden staff hair
    'staff':           '#1A1A1AFF'   // black STAFF uniform
  }

  // backup palette if we somehow don't have a color
  const BOUNCER_COLORS = [
    '#1A1A1AFF',  // blackout
    '#FF6A00FF',  // warning orange
    '#FFC300FF'   // high-vis yellow
  ]

  // 🗣 per-avatar announcement line for chat
  // tone: door control / crowd control / you-are-being-watched
  const BOUNCER_LINES = {
    'mod-bear-black':
      '🕶️ Black Ops Bear on duty. If your name’s not on the list, you’re not on the stage.',
    'mod-bear-orange':
      '🟠 Floor Security online. Badge visible, attitude checked, behave in the booth.',
    'staff-bear':
      '💛 Staff Bear reporting in — cute face, zero tolerance.',
    'staff':
      '👔 Venue Staff present. Keep the energy up and the drama down.'
  }

  // get avatar objects by slug
  const filtered = getAvatarsBySlugs(allowedSlugs)

  if (!filtered || filtered.length === 0) {
    await postMessage({
      room,
      message: 'No security avatars are available right now. 🔒'
    })
    return
  }

  // choose one at random
  const chosen = filtered[Math.floor(Math.random() * filtered.length)]
  const slug = chosen?.slug

  if (!slug) {
    console.warn('[bouncer] No slug on selected avatar object:', chosen)
    await postMessage({
      room,
      message: 'Could not equip security mode 😬'
    })
    return
  }

  // pick its mapped color or fallback
  const color =
    COLOR_BY_SLUG[slug] ||
    BOUNCER_COLORS[Math.floor(Math.random() * BOUNCER_COLORS.length)]

  // choose chat line
  const line =
    BOUNCER_LINES[slug] ||
    `🕶️ ${slugToTitle(slug)} on patrol. Respect the booth.`

  // log for debugging
  console.log('[bouncer] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    // actually update their avatar in TT
    await updateUserAvatar(userToken, slug, color)

    console.log('[bouncer] success', {
      senderUuid,
      slug,
      color
    })

    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    console.error('[handleBouncerCommand] update failed', {
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

  function slugToTitle (s) {
    return s
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }
}


export async function handleSpookyCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({
      room,
      message: 'Sorry, this command is only available to authorized users 🦇.'
    })
    return
  }

  // 🎃 Allowed Halloween / Spooky avatars
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
    'harvest-08':    '#FF6A00FF', // vivid jack-o-lantern orange glow
    'harvest-07':    '#FFB84BFF', // softer harvest pumpkin / candy corn yellow-orange
    'harvest-06':    '#FFB84BFF', // straw yellow / autumn hat band orange
    'harvest-05':    '#00FF66FF', // cursed neon green eyes
    'dj-mummyv1-1':  '#C9C9C9FF', // bandage gray-white w/ spooky purple eye
    'dj-mummyv2-1':  '#FFF4CCFF', // warmer bandage + yellow eye
    'ghost':         '#FFFFFFFF', // pure spectral white
    'dj-vamplife-1': '#B00020FF', // deep blood red
    'dj-witchv1-1':  '#32C24DFF', // witch skin toxic green
    'dj-witchv2-1':  '#FF7A1CFF',  // orange hat band / warm charm
    'dj-malezombie-1':   '#7FBF3FFF',  // sickly green skin tone
    'dj-femalezombie-1': '#8BD1A2FF'   // pale mint undead hue
  }

  // 🩸 spooky fallback palette if a slug is missing a mapping
  const SPOOKY_COLORS = [
    '#FF6A00FF', // pumpkin orange
    '#00FF66FF', // toxic green
    '#FFFFFFFF', // ghost white
    '#B00020FF', // blood red
    '#C9C9C9FF'  // linen mummy wrap
  ]

  // 👻 Per-avatar chat voice lines
  // Short, punchy, flavor-y. Mentions vibe of each avatar.
  const SPOOKY_LINES = {
    'harvest-08':   '🎃 Pumpkin Beast online. The candle’s real, the smile is not.',
    'harvest-07':   '🕯️ Harvest Lantern lit. Cozy vibe, suspicious grin.',
    'harvest-06':   '🌾 Field Watcher reports in. Stitch-smile, zero heartbeat.',
    'harvest-05':   '🌽 Haunted Scarecrow rises — eyes glowing green, birds evacuated.',
    'dj-mummyv1-1': '🧻 Ancient Wrap v1 awakened. Do not tug the bandages.',
    'dj-mummyv2-1': '🧟‍♂️ Experimental Wrap v2 online. Extra stitches, extra curse.',
    'ghost':        '👻 Friendly Ghost materialized. Floating. Watching. Vibing.',
    'dj-vamplife-1':'🩸 Vamplife engaged. Pale face, dark night, louder than midnight.',
    'dj-witchv1-1': '🧪 Swamp Witch enters the booth — cauldron bass only.',
    'dj-witchv2-1': '🧹 Midnight Witch glides in. Hat sharp, spell sharper.',
    'dj-malezombie-1':   '🧟‍♂️ Male Zombie staggers into the booth — smell of bass and decay.',
    'dj-femalezombie-1': '🧟‍♀️ Undead Diva awakens — beats fresher than her complexion.'
  }

  // Grab only these avatars from inventory
  const filtered = getAvatarsBySlugs(allowedSlugs)

  if (!filtered || filtered.length === 0) {
    await postMessage({
      room,
      message: 'No spooky avatars found in the allowed set 🪦'
    })
    return
  }

  // pick one at random
  const chosen = filtered[Math.floor(Math.random() * filtered.length)]
  const slug = chosen?.slug

  if (!slug) {
    console.warn('[spooky] No slug on selected avatar object:', chosen)
    await postMessage({
      room,
      message: 'No spooky avatar available right now 😬'
    })
    return
  }

  // Pick a matching chat color for that avatar, else random fallback
  const color =
    COLOR_BY_SLUG[slug] ||
    SPOOKY_COLORS[Math.floor(Math.random() * SPOOKY_COLORS.length)]

  // Pick the line for that slug
  const line =
    SPOOKY_LINES[slug] ||
    `🦇 ${slugToTitle(slug)} has entered the haunt.`

  // Debug info for server logs
  console.log('[spooky] attempt', {
    senderUuid,
    slug,
    color,
    title: slugToTitle(slug)
  })

  try {
    // actually set their avatar
    await updateUserAvatar(userToken, slug, color)

    console.log('[spooky] success', {
      senderUuid,
      slug,
      color
    })

    // announce to room
    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    console.error('[handleSpookyCommand] update failed', {
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

  function slugToTitle (s) {
    return s
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  }
}
export async function handleRecordGuyCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({
      room,
      message: '🎟️ Sorry, this command is only available to authorized users.'
    })
    return
  }

  const slug = 'stadiumseason-04a'

  // Color: black/white record mascot with orange shoes.
  // We’ll go with that warm sneaker orange for chat color.
  const color = '#FF9A00FF'

  const line = '🏟️ Record Mascot on the floor — crowd noise activated, hype levels rising.'

  console.log('[recordguy] attempt', {
    senderUuid,
    slug,
    color
  })

  try {
    await updateUserAvatar(userToken, slug, color)

    console.log('[recordguy] success', {
      senderUuid,
      slug,
      color
    })

    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    console.error('[handleRecordGuyCommand] update failed', {
      senderUuid,
      slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Could not equip Record Mascot 😞'
    })
  }
}

export async function handleJukeboxCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({
      room,
      message: '📻 Sorry, this command is only available to authorized users.'
    })
    return
  }

  const slug = 'dj-jukebox-1'

  // Color: neon safety yellow body with red "JukBox" text.
  // We’ll choose the highlighter yellow for chat color.
  const color = '#FFF000FF'

  const line = '📼 Jukebox engaged. Old hits, deep cuts, all requests considered.'

  console.log('[jukebox] attempt', {
    senderUuid,
    slug,
    color
  })

  try {
    await updateUserAvatar(userToken, slug, color)

    console.log('[jukebox] success', {
      senderUuid,
      slug,
      color
    })

    await postMessage({
      room,
      message: line
    })
  } catch (error) {
    console.error('[handleJukeboxCommand] update failed', {
      senderUuid,
      slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })

    await postMessage({
      room,
      message: 'Could not equip Jukebox 😞'
    })
  }
}



export async function handleDuckCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized dino users 🦖.' })
    return
  }

  try {
    await updateUserAvatar(userToken, 'stadiumseason-02', '#FFDE21')
    await postMessage({ room, message: '🐤🧊 Cool, calm, and quackin’. Looking fly, my feather-friend.🕶️' })
  } catch (error) {
    await postMessage({ room, message: 'Duck transformation failed' })
  }
}
export async function handleTeacupCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized dino users 🦖.' })
    return
  }

  try {
    await updateUserAvatar(userToken, 'dj-greentea-1', '#6EFAC8FF')
    await postMessage({ room, message: '🍵 Green Tea avatar equipped — serenity and caffeine achieved.' })
  } catch (error) {
    await postMessage({ room, message: 'Teacup transformation failed' })
  }
}
export async function handleSpaceBearCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users.' })
    return
  }

  try {
    await updateUserAvatar(userToken, 'dj-spacebear-1', '#FFD966')
    await postMessage({ room, message: 'You are now a spacebear! 🐻‍❄️🚀' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong trying to launch you into space. 🥲' })
  }
}
export async function handleWalrusCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users.' })
    return
  }

  try {
    await updateUserAvatar(userToken, 'winter-07', '#8de2ff')
    await postMessage({ room, message: '🦭 Splash! You’re officially a walrus now. Blub blub. ❄️' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong transforming you into a' })
  }
}
export async function handleVibesGuyCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users.' })
    return
  }

  try {
    await updateUserAvatar(userToken, 'dj-aurision-1', '#FFA500')
    await postMessage({ room, message: 'All time vibes guy is back' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong transforming you into a vibes guy' })
  }
}
export async function handleFacesCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users.' })
    return
  }
  try {
    await updateUserAvatar(userToken, 'dj-FACES-1', '#007CF0')
    await postMessage({ room, message: 'Smile!' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong transforming you into a smiley face' })
  }
}
export async function handleDoDoCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to people i like' })
    return
  }
  try {
    await updateUserAvatar(userToken, 'lennnie-01', '#A67C52')
    await postMessage({ room, message: 'The DoDo bird...Proof you don’t need wings to elevate the room' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong transforming you into a dodo bird' })
  }
}
export async function handleDumDumCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to people i like' })
    return
  }
  try {
    await updateUserAvatar(userToken, 'stadiumseason-03', '#767573ff')
    await postMessage({ room, message: 'dum dum want gum gum 🗿' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong transforming you...dum dum' })
  }
}

export async function handleFlowerPowerCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to people i like' })
    return
  }
  try {
    await updateUserAvatar(userToken, 'dj-petalsupply-1', '#ef55ddff')
    await postMessage({ room, message: 'You’ve gone full Flower Power—expect photosynthesis-level energy' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong transforming you into a flower' })
  }
}
export async function handleAnonCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to people i like' })
    return
  }
  try {
    await updateUserAvatar(userToken, 'dj-tybolden-1', '#a199a0ff')
    await postMessage({ room, message: 'Hello Mr. Anonymous' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong transforming you into anon' })
  }
}
export async function handleGhostCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to people i like' })
    return
  }
  try {
    await updateUserAvatar(userToken, 'ghost', '#ffffffff')
    await postMessage({ room, message: 'Boo!' })
  } catch (error) {
    await postMessage({ room, message: 'Something went wrong transforming you into a ghost' })
  }
}

export async function handleRandomAvatarCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users 🎭.' })
    return
  }

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
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users 🎭.' })
    return
  }

  // Keep your list as-is; order doesn't matter because we map by slug
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

  // 🎨 Per-avatar chat colors (8-digit hex, opaque), tuned to the image L→R
  // Tier 1: girl, guy
  // Tier 2: helmet, bear-visor
  // Tier 3: gorilla, bear-angry
  // Tier 4: hood-purple, hood-yellow
  const COLOR_BY_SLUG = {
    'cyber-girl': '#FFD54FFF', // honey yellow hair
    'cyber-guy': '#FF5AB1FF', // neon pink visor
    'cyber-helmet': '#FF4D97FF', // hot magenta accents
    'cyber-bear-visor': '#16E7E4FF', // cyan visor on purple bear
    'cyber-gorilla': '#FF5C5CFF', // cap red / accent
    'cyber-bear-angry': '#8AFF64FF', // acid-lime face/accents
    'cyber-hood-purple': '#8A2BE2FF', // blue-violet hood
    'cyber-hood-yellow': '#FFD500FF' // high-vis yellow hood
  }

  // Fallbacks if a slug ever misses mapping
  const CYBER_COLORS = [
    '#00E6D3FF', '#5B8CFFFF', '#C200FBFF', '#00BBF9FF',
    '#FF7A00FF', '#F15BB5FF', '#9B5DE5FF', '#A6FFCBFF'
  ]

  // 🗣️ One unique line per avatar
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

  const filtered = getAvatarsBySlugs(allowedSlugs)
  if (!filtered || filtered.length === 0) {
    await postMessage({ room, message: 'No avatars found in your allowed list. 🫤' })
    return
  }

  const chosen = filtered[Math.floor(Math.random() * filtered.length)]
  const slug = chosen?.slug
  if (!slug) {
    console.warn('[cyber] No slug on selected avatar object:', chosen)
    await postMessage({ room, message: 'No avatars available right now 😬' })
    return
  }

  const color = COLOR_BY_SLUG[slug] ?? CYBER_COLORS[Math.floor(Math.random() * CYBER_COLORS.length)]
  const line = AVATAR_LINES[slug] ?? `⚡ ${slugToTitle(slug)} equipped—welcome to the grid.`

  // helpful logs
  console.log('[cyber] attempt', { senderUuid, slug, color, title: slugToTitle(slug) })

  try {
    await updateUserAvatar(userToken, slug, color)
    console.log('[cyber] success', { senderUuid, slug, color })
    await postMessage({ room, message: line })
  } catch (error) {
    console.error('[handleRandomCyberCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })
    await postMessage({ room, message: 'Failed to update avatar 😞' })
  }

  function slugToTitle (s) {
    return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
}

export async function handleRandomCosmicCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users 🎭.' })
    return
  }

  // ✅ Allowed slugs
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

  // ✅ Fallback cosmic colors (opaque 8-digit hex)
  const COSMIC_COLORS = [
    '#1FA2FFFF', // electric blue
    '#9B5DE5FF', // amethyst
    '#F15BB5FF', // fuchsia
    '#00F5D4FF', // neon mint
    '#FFD700FF', // solar gold
    '#00BBF9FF', // sky electric
    '#FF7A00FF', // meteor orange
    '#A6FFCBFF', // pastel mint
    '#C200FBFF', // ultraviolet
    '#5B8CFFFF' // steel blue
  ]

  // ✅ Unique line per avatar
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

  // ✅ Per-slug preferred colors
  const COLOR_BY_SLUG = {
  // Tier 1
    'cosmic-alien-bear': '#54E38BFF', // mint green bear
    'cosmic-galactic-bear': '#B6E3FFFF', // icy suit blue
    'cosmic-space-guardian-bear': '#FF8ED2FF', // pink/coral guardian

    // Tier 2
    'cosmic-blue-alien': '#1EC8FFFF', // bright cyan/blue
    'cosmic-helmet-alien': '#8CF15AFF', // lime suit green
    'cosmic-baby-alien': '#A8F0C2FF', // soft pastel mint

    // Tier 3
    'cosmic-meteor-guy': '#FF8C6BFF', // salmon/coral (meteor heat)
    'cosmic-cloudy-planet': '#F5E46BFF', // muted sun-yellow
    'cosmic-crescent-moon-guy': '#FF6A39FF', // flame orange

    // Tier 4
    'cosmic-galaxy-cloak': '#4C3EDCFF', // deep indigo + halo gold vibe
    'cosmic-magical-gem': '#D9B6FFFF', // lavender/pink hair
    'cosmic-sun-star': '#FFA51CFF', // vivid solar orange

    // Tier 5
    'cosmic-golden-chibi': '#FFD54FFF', // rich gold
    'cosmic-moon-chibi': '#C267F8FF', // magenta-violet
    'cosmic-saturn-cloudy': '#FFC4A9FF', // peachy saturn fit

    // Tier 6
    'cosmic-celestial-chibi-alien': '#B8F1FFFF', // frosty cyan hair
    'cosmic-celestial-chibi-goddess': '#6C49AFFF', // deep galaxy purple
    'cosmic-celestial-lady': '#8C6DF1FF' // lighter violet
  }

  const filteredAvatars = getAvatarsBySlugs(allowedSlugs)
  if (!filteredAvatars || filteredAvatars.length === 0) {
    await postMessage({ room, message: 'No avatars found in your allowed list. 🫤' })
    return
  }

  // pick a random allowed avatar
  const random = filteredAvatars[Math.floor(Math.random() * filteredAvatars.length)]
  const randomAvatar = random?.slug

  if (!randomAvatar) {
    console.warn('[cosmic] No slug on selected avatar object:', random)
    await postMessage({ room, message: 'No avatars available right now 😬' })
    return
  }

  const color = COLOR_BY_SLUG[randomAvatar] ?? COSMIC_COLORS[Math.floor(Math.random() * COSMIC_COLORS.length)]
  const line = AVATAR_LINES[randomAvatar] ?? `🌌 ${slugToTitle(randomAvatar)} engaged—orbiting the vibe.`

  // 🔎 Helpful logs before the API call
  console.log('[cosmic] attempt', {
    senderUuid,
    slug: randomAvatar,
    color,
    title: slugToTitle(randomAvatar)
  })

  try {
    await updateUserAvatar(userToken, randomAvatar, color)
    console.log('[cosmic] success', { senderUuid, slug: randomAvatar, color })
    await postMessage({ room, message: line })
  } catch (error) {
    const errMsg = error?.message || String(error)
    // 🚨 This is the line you’ll want to look for in logs
    console.error('[handleRandomCosmicCommand] update failed', {
      senderUuid,
      slugTried: randomAvatar,
      colorTried: color,
      error: errMsg,
      stack: error?.stack
    })

    // keep the user-facing message generic
    await postMessage({ room, message: 'Failed to update avatar 😞' })
  }

  function slugToTitle (slug) {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
}

export async function handleRandomLovableCommand (senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid]
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users 🎭.' })
    return
  }

  // L→R from the screenshot
  const allowedSlugs = [
    'lovable-figgy',
    'lovable-loop',
    'lovable-nova',
    'lovable-pixel',
    'lovable-bee'
  ]

  // 🎨 Per-avatar chat colors (opaque 8-digit hex), tuned to the artwork
  const COLOR_BY_SLUG = {
    'lovable-figgy': '#9B5DE5FF', // amethyst purple (Figgy body/ears)
    'lovable-loop': '#FF8C00FF', // vivid orange (Loop shorts/accents)
    'lovable-nova': '#00E6D3FF', // neon aqua/teal (Nova suit accents)
    'lovable-pixel': '#FF4D97FF', // hot magenta-pink (Pixel cheeks/trim)
    'lovable-bee': '#FFD54FFF' // honey gold (Bee vibe)
  }

  // Fallback palette if a slug ever misses
  const LOVE_COLORS = [
    '#A0C4FFFF', '#F15BB5FF', '#9B5DE5FF', '#00BBF9FF', '#00F5D4FF'
  ]

  // 🗣️ Unique one-liners
  const AVATAR_LINES = {
    'lovable-figgy': '🫧 Figgy materializes—mischief meter pegged at 11.',
    'lovable-loop': '🔁 Loop locks the hard hat—constructing certified bops.',
    'lovable-nova': '🌟 Nova ignites—tiny astronaut, galaxy-sized energy.',
    'lovable-pixel': '🤖 Pixel online—LED smile, latency zero.',
    'lovable-vee': '💜 Vee vibes in—soft glow, big heart, bigger jams.'
  }

  const filtered = getAvatarsBySlugs(allowedSlugs)
  if (!filtered || filtered.length === 0) {
    await postMessage({ room, message: 'No avatars found in your allowed list. 🫤' })
    return
  }

  // pick one at random
  const chosen = filtered[Math.floor(Math.random() * filtered.length)]
  const slug = chosen?.slug
  if (!slug) {
    console.warn('[lovable] No slug on selected avatar object:', chosen)
    await postMessage({ room, message: 'No avatars available right now 😬' })
    return
  }

  const color = COLOR_BY_SLUG[slug] ?? LOVE_COLORS[Math.floor(Math.random() * LOVE_COLORS.length)]
  const line = AVATAR_LINES[slug] ?? `💖 ${slugToTitle(slug)} equipped—spreading wholesome waves.`

  // logs for debugging
  console.log('[lovable] attempt', { senderUuid, slug, color, title: slugToTitle(slug) })

  try {
    await updateUserAvatar(userToken, slug, color)
    console.log('[lovable] success', { senderUuid, slug, color })
    await postMessage({ room, message: line })
  } catch (error) {
    console.error('[handleRandomLovableCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    })
    await postMessage({ room, message: 'Failed to update avatar 😞' })
  }

  function slugToTitle (s) {
    return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
}
