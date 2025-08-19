import { updateUserAvatar } from '../utils/API.js'
import { getAllAvatarSlugs, getAvatarsBySlugs, getRandomAvatarSlug } from '../database/dbavatars.js'


const userTokenMap = {
    '072b0bb3-518e-4422-97fd-13dc53e8ae7e': process.env.IAN_USER_TOKEN,
    '210141ad-6b01-4665-84dc-e47ea7c27dcb': process.env.SMITTY_USER_TOKEN,
    '92302b7d-ae5e-466f-975b-d3fee461f13f': process.env.CAM_USER_TOKEN,
    'fd2f1b47-b1d4-4100-8f88-6e56aa82e13f': process.env.GAB_USER_TOKEN

  }
  
  const randomColors = [
    '#FFD966', '#A7D2CB', '#FFB6B9', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA',
    '#F7A072', '#D5AAFF', '#ACE7FF', '#FFB347', '#B0E57C', '#FF9AA2', '#E6E6FA',
    '#FFDEAD', '#C0FDFB', '#FAF3DD', '#FDCB82'
  ];

  /////////////////////////// Bot Updates /////////////////////////////
  
  export async function handleBotRandomAvatarCommand(room, postMessage, ttlUserToken) {
    const avatarId = getRandomAvatarSlug()
    const color = randomColors[Math.floor(Math.random() * randomColors.length)]
  
    const randomReplies = [
      'Feeling fresh 🤖',
      'New look, who dis?',
      'Just changed into something more comfortable...',
      'Style upgraded ✨',
      'Bot makeover complete!',
      "Shapeshift complete. You never saw me. 👻",
      "I'm undercover now. 🤫",
      "Cloaking protocol activated. 🛸",
      "Incognito mode: engaged. 🕶️",
      "Just blending in with the crowd. 😎",
      "They'll never recognize me now. 🌀",
      "Now you see me, now you don’t. 🎩✨"
    ]
    const randomMessage = randomReplies[Math.floor(Math.random() * randomReplies.length)]
  
    try {
      await updateUserAvatar(ttlUserToken, avatarId, color)
      await postMessage({ room, message: randomMessage })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot avatar: ${error.message}` })
    }
  }
  
  export async function handleBotDinoCommand(room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
    const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isMod) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
  
    try {
      await updateUserAvatar(ttlUserToken, 'jurassic-05', '#8B6C5C')
      await postMessage({ room, message: 'Bot profile updating!' })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot profile` })
    }
  }
  export async function handleBotDuckCommand(room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
    const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isMod) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
  
    try {
      await updateUserAvatar(ttlUserToken, 'stadiumseason-02', '#FFDE21')
      await postMessage({ room, message: 'Quack Quack 🦆🧼🫧' })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot profile` })
    }
  }
  export async function handleBotAlienCommand(room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
    const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isMod) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
  
    try {
      await updateUserAvatar(ttlUserToken, 'season-0001-underground-thehuman', '#39FF14')
      await postMessage({ room, message: '👽 Alien transformation complete! Take me to your leader. 🚀' })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot profile` })
    }
  }
  export async function handleBotAlien2Command(room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
    const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isMod) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
  
    try {
      await updateUserAvatar(ttlUserToken, 'stadiumseason-01', '#39FF14')
      await postMessage({ room, message: '🌌 Beep boop. I’m not from around here... 👾' })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot profile` })
    }
  }

  export async function handleBotWalrusCommand(room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
    const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isMod) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
  
    try {
      await updateUserAvatar(ttlUserToken, 'winter-07', '#8de2ff')
      await postMessage({ room, message: '🦭 Don’t mind me… just lounging like a majestic sea sausage.🧊' })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot profile` })
    }
  }

  export async function handleBotPenguinCommand(room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
    const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isMod) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
  
    try {
      await updateUserAvatar(ttlUserToken, 'pinguclub-03', '#B026FF')
      await postMessage({ room, message: '💜🐧 Initiating purple penguin protocol… waddling in style now.' })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot profile` })
    }
  }
  export async function handleBot2Command(room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
    const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isMod) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
  
    try {
      await updateUserAvatar(ttlUserToken, 'bot-2', '#FF5F1F')
      await postMessage({ room, message: '⚙️🟠 They said I needed a fresh coat… I went full fire.🤖' })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot profile` })
    }
  }
  export async function handleBot1Command(room, postMessage, isUserAuthorized, senderUuid, ttlUserToken) {
    const isMod = await isUserAuthorized(senderUuid, ttlUserToken)
    if (!isMod) {
      await postMessage({ room, message: 'You need to be a moderator to execute this command.' })
      return
    }
  
    try {
      await updateUserAvatar(ttlUserToken, 'bot-01', '#04D9FF')
      await postMessage({ room, message: '💙🤖 Classic look, timeless tech.' })
    } catch (error) {
      await postMessage({ room, message: `Failed to update bot profile` })
    }
  }

  /////////////////////////////// User Updates //////////////////////////////
  export async function handleDinoCommand(senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid];
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users 🦕.' });
    return;
  }

  // 🦖 Allowed Jurassic avatars
  const allowedSlugs = [
    'jurassic-01',
    'jurassic-02',
    'jurassic-03',
    'jurassic-05',
    'jurassic-06',
    'jurassic-07'
  ];

  const filteredAvatars = getAvatarsBySlugs(allowedSlugs)


  if (filteredAvatars.length === 0) {
    await postMessage({ room, message: 'No Jurassic avatars found in the allowed list 🦴' });
    return;
  }

  const randomAvatar = getRandomAvatarSlug()
  const randomColor = randomColors[Math.floor(Math.random() * randomColors.length)];

  try {
    await updateUserAvatar(userToken, randomAvatar, randomColor);
    if (!randomAvatar) {
  await postMessage({ room, message: 'No avatars available right now 😬' })
  return
}

    await postMessage({ room, message: '🦖 You’ve gone full Jurassic. Roar on!' });
  } catch (error) {
    await postMessage({ room, message: `Failed to update to dinosaur avatar 😬` });
  }
}

  export async function handleDuckCommand(senderUuid, room, postMessage) {
    const userToken = userTokenMap[senderUuid]
    if (!userToken) {
      await postMessage({ room, message: 'Sorry, this command is only available to authorized dino users 🦖.' })
      return
    }
  
    try {
      await updateUserAvatar(userToken, 'stadiumseason-02', '#FFDE21')
      await postMessage({ room, message: '🐤🧊 Cool, calm, and quackin’. Looking fly, my feather-friend.🕶️' })
    } catch (error) {
      await postMessage({ room, message: `Duck transformation failed` })
    }
  }
  export async function handleSpaceBearCommand(senderUuid, room, postMessage) {
    const userToken = userTokenMap[senderUuid]
    if (!userToken) {
      await postMessage({ room, message: 'Sorry, this command is only available to authorized dino users 🦖.' })
      return
    }
  
    try {
      await updateUserAvatar(userToken, 'dj-spacebear-1', '#FFD966')
      await postMessage({ room, message: 'You are now a spacebear! 🐻‍❄️🚀' })
    } catch (error) {
      await postMessage({ room, message: `Something went wrong trying to launch you into space. 🥲` })
    }
  }
  export async function handleWalrusCommand(senderUuid, room, postMessage) {
    const userToken = userTokenMap[senderUuid]
    if (!userToken) {
      await postMessage({ room, message: 'Sorry, this command is only available to authorized dino users 🦖.' })
      return
    }
  
    try {
      await updateUserAvatar(userToken, 'winter-07', '#8de2ff')
      await postMessage({ room, message: '🦭 Splash! You’re officially a walrus now. Blub blub. ❄️' })
    } catch (error) {
      await postMessage({ room, message: `Something went wrong transforming you into a` })
    }
  }
  export async function handleVibesGuyCommand(senderUuid, room, postMessage) {
    const userToken = userTokenMap[senderUuid]
    if (!userToken) {
      await postMessage({ room, message: 'Sorry, this command is only available to authorized dino users 🦖.' })
      return
    }
  
    try {
      await updateUserAvatar(userToken, 'dj-aurision-1', '#FFA500')
      await postMessage({ room, message: 'All time vibes guy is back' })
    } catch (error) {
      await postMessage({ room, message: `Something went wrong transforming you into a vibes guy` })
    }
  }
  export async function handleFacesCommand(senderUuid, room, postMessage) {
    const userToken = userTokenMap[senderUuid]
    if (!userToken) {
      await postMessage({ room, message: 'Sorry, this command is only available to authorized dino users 🦖.' })
      return
    }
    try {
      await updateUserAvatar(userToken, 'dj-FACES-1', '#007CF0')
      await postMessage({ room, message: 'Smile!' })
    } catch (error) {
      await postMessage({ room, message: `Something went wrong transforming you into a smiley face` })
    }
  }
  export async function handleDoDoCommand(senderUuid, room, postMessage) {
    const userToken = userTokenMap[senderUuid]
    if (!userToken) {
      await postMessage({ room, message: 'Sorry, this command is only available to people i like' })
      return
    }
    try {
      await updateUserAvatar(userToken, 'lennnie-01', '#A67C52')
      await postMessage({ room, message: 'The DoDo bird...Proof you don’t need wings to elevate the room' })
    } catch (error) {
      await postMessage({ room, message: `Something went wrong transforming you into a dodo bird` })
    }
  }
  export async function handleDumDumCommand(senderUuid, room, postMessage) {
    const userToken = userTokenMap[senderUuid]
    if (!userToken) {
      await postMessage({ room, message: 'Sorry, this command is only available to people i like' })
      return
    }
    try {
      await updateUserAvatar(userToken, 'stadiumseason-03', '#767573ff')
      await postMessage({ room, message: 'dum dum want gum gum 🗿' })
    } catch (error) {
      await postMessage({ room, message: `Something went wrong transforming you...dum dum` })
    }
  }

  export async function handleFlowerPowerCommand(senderUuid, room, postMessage) {
    const userToken = userTokenMap[senderUuid]
    if (!userToken) {
      await postMessage({ room, message: 'Sorry, this command is only available to people i like' })
      return
    }
    try {
      await updateUserAvatar(userToken, 'dj-petalsupply-1', '#ef55ddff')
      await postMessage({ room, message: 'You’ve gone full Flower Power—expect photosynthesis-level energy' })
    } catch (error) {
      await postMessage({ room, message: `Something went wrong transforming you into a flower` })
    }
  }
  
  export async function handleRandomAvatarCommand(senderUuid, room, postMessage) {
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
      await postMessage({ room, message: `Failed to update avatar` })
    }
  }

  export async function handleRandomCyberCommand(senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid];
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users 🎭.' });
    return;
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
  ];

  // 🎨 Per-avatar chat colors (8-digit hex, opaque), tuned to the image L→R
  // Tier 1: girl, guy
  // Tier 2: helmet, bear-visor
  // Tier 3: gorilla, bear-angry
  // Tier 4: hood-purple, hood-yellow
  const COLOR_BY_SLUG = {
    'cyber-girl':         '#FFD54FFF', // honey yellow hair
    'cyber-guy':          '#FF5AB1FF', // neon pink visor
    'cyber-helmet':       '#FF4D97FF', // hot magenta accents
    'cyber-bear-visor':   '#16E7E4FF', // cyan visor on purple bear
    'cyber-gorilla':      '#FF5C5CFF', // cap red / accent
    'cyber-bear-angry':   '#8AFF64FF', // acid-lime face/accents
    'cyber-hood-purple':  '#8A2BE2FF', // blue-violet hood
    'cyber-hood-yellow':  '#FFD500FF'  // high-vis yellow hood
  };

  // Fallbacks if a slug ever misses mapping
  const CYBER_COLORS = [
    '#00E6D3FF', '#5B8CFFFF', '#C200FBFF', '#00BBF9FF',
    '#FF7A00FF', '#F15BB5FF', '#9B5DE5FF', '#A6FFCBFF'
  ];

  // 🗣️ One unique line per avatar
  const AVATAR_LINES = {
    'cyber-bear-visor':   '🧸🛡️ Bear with a visor online—scanning synthwave.',
    'cyber-bear-angry':   '🐻⚡ Angry Bear boots up—do not feed after midnight.',
    'cyber-girl':         '👩‍🎤 Neon Girl synced—city lights set to groove.',
    'cyber-gorilla':      '🦍💽 Cyber Gorilla stomps the grid—bass endangered.',
    'cyber-guy':          '🕶️💾 Neon Guy: visor down, volume up.',
    'cyber-helmet':       '🤖🔊 Helm online—systems green, subwoofers armed.',
    'cyber-hood-purple':  '🟣🕶️ Purple Hood in stealth—low light, loud beats.',
    'cyber-hood-yellow':  '🟡⚡ Yellow Hood engaged—high voltage incoming.'
  };

  const filtered = getAvatarsBySlugs(allowedSlugs);
  if (!filtered || filtered.length === 0) {
    await postMessage({ room, message: 'No avatars found in your allowed list. 🫤' });
    return;
  }

  const chosen = filtered[Math.floor(Math.random() * filtered.length)];
  const slug = chosen?.slug;
  if (!slug) {
    console.warn('[cyber] No slug on selected avatar object:', chosen);
    await postMessage({ room, message: 'No avatars available right now 😬' });
    return;
  }

  const color = COLOR_BY_SLUG[slug] ?? CYBER_COLORS[Math.floor(Math.random() * CYBER_COLORS.length)];
  const line  = AVATAR_LINES[slug] ?? `⚡ ${slugToTitle(slug)} equipped—welcome to the grid.`;

  // helpful logs
  console.log('[cyber] attempt', { senderUuid, slug, color, title: slugToTitle(slug) });

  try {
    await updateUserAvatar(userToken, slug, color);
    console.log('[cyber] success', { senderUuid, slug, color });
    await postMessage({ room, message: line });
  } catch (error) {
    console.error('[handleRandomCyberCommand] update failed', {
      senderUuid,
      slugTried: slug,
      colorTried: color,
      error: error?.message || String(error),
      stack: error?.stack
    });
    await postMessage({ room, message: 'Failed to update avatar 😞' });
  }

  function slugToTitle(s) {
    return s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}


  export async function handleRandomCosmicCommand(senderUuid, room, postMessage) {
  const userToken = userTokenMap[senderUuid];
  if (!userToken) {
    await postMessage({ room, message: 'Sorry, this command is only available to authorized users 🎭.' });
    return;
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
  ];

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
    '#5B8CFFFF'  // steel blue
  ];

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
  };

  // ✅ Per-slug preferred colors
const COLOR_BY_SLUG = {
  // Tier 1
  'cosmic-alien-bear':            '#54E38BFF', // mint green bear
  'cosmic-galactic-bear':         '#B6E3FFFF', // icy suit blue
  'cosmic-space-guardian-bear':   '#FF8ED2FF', // pink/coral guardian

  // Tier 2
  'cosmic-blue-alien':            '#1EC8FFFF', // bright cyan/blue
  'cosmic-helmet-alien':          '#8CF15AFF', // lime suit green
  'cosmic-baby-alien':            '#A8F0C2FF', // soft pastel mint

  // Tier 3
  'cosmic-meteor-guy':            '#FF8C6BFF', // salmon/coral (meteor heat)
  'cosmic-cloudy-planet':         '#F5E46BFF', // muted sun-yellow
  'cosmic-crescent-moon-guy':     '#FF6A39FF', // flame orange

  // Tier 4
  'cosmic-galaxy-cloak':          '#4C3EDCFF', // deep indigo + halo gold vibe
  'cosmic-magical-gem':           '#D9B6FFFF', // lavender/pink hair
  'cosmic-sun-star':              '#FFA51CFF', // vivid solar orange

  // Tier 5
  'cosmic-golden-chibi':          '#FFD54FFF', // rich gold
  'cosmic-moon-chibi':            '#C267F8FF', // magenta-violet
  'cosmic-saturn-cloudy':         '#FFC4A9FF', // peachy saturn fit

  // Tier 6
  'cosmic-celestial-chibi-alien': '#B8F1FFFF', // frosty cyan hair
  'cosmic-celestial-chibi-goddess':'#6C49AFFF', // deep galaxy purple
  'cosmic-celestial-lady':        '#8C6DF1FF'  // lighter violet
};


  const filteredAvatars = getAvatarsBySlugs(allowedSlugs);
  if (!filteredAvatars || filteredAvatars.length === 0) {
    await postMessage({ room, message: 'No avatars found in your allowed list. 🫤' });
    return;
  }

  // pick a random allowed avatar
  const random = filteredAvatars[Math.floor(Math.random() * filteredAvatars.length)];
  const randomAvatar = random?.slug;

  if (!randomAvatar) {
    console.warn('[cosmic] No slug on selected avatar object:', random);
    await postMessage({ room, message: 'No avatars available right now 😬' });
    return;
  }

  const color = COLOR_BY_SLUG[randomAvatar] ?? COSMIC_COLORS[Math.floor(Math.random() * COSMIC_COLORS.length)];
  const line = AVATAR_LINES[randomAvatar] ?? `🌌 ${slugToTitle(randomAvatar)} engaged—orbiting the vibe.`;

  // 🔎 Helpful logs before the API call
  console.log('[cosmic] attempt', {
    senderUuid,
    slug: randomAvatar,
    color,
    title: slugToTitle(randomAvatar)
  });

  try {
    await updateUserAvatar(userToken, randomAvatar, color);
    console.log('[cosmic] success', { senderUuid, slug: randomAvatar, color });
    await postMessage({ room, message: line });
  } catch (error) {
    const errMsg = error?.message || String(error);
    // 🚨 This is the line you’ll want to look for in logs
    console.error('[handleRandomCosmicCommand] update failed', {
      senderUuid,
      slugTried: randomAvatar,
      colorTried: color,
      error: errMsg,
      stack: error?.stack
    });

    // keep the user-facing message generic
    await postMessage({ room, message: 'Failed to update avatar 😞' });
  }

  function slugToTitle(slug) {
    return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}


  