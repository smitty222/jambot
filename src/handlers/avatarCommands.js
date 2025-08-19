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
  
    // ✅ Define your allowed avatar slugs
    const allowedSlugs = ['cyber-bear-visor', 'cyber-bear-angry', 'cyber-girl', 'cyber-gorilla', 'cyber-guy', 'cyber-helmet', 'cyber-hood-purple', 'cyber-hood-yellow']; // Replace with your chosen avatar slugs
  
    const filteredAvatars = getAvatarsBySlugs(allowedSlugs)

    if (filteredAvatars.length === 0) {
      await postMessage({ room, message: 'No avatars found in your allowed list. 🫤' });
      return;
    }

    const randomAvatar = filteredAvatars[Math.floor(Math.random() * filteredAvatars.length)].slug

    const randomColor = randomColors[Math.floor(Math.random() * randomColors.length)];
  
    try {
      await updateUserAvatar(userToken, randomAvatar, randomColor);
        if (!randomAvatar) {
      await postMessage({ room, message: 'No avatars available right now 😬' })
      return
      }
      await postMessage({ room, message: '⚡ You’ve been cyber-ized. Welcome to the grid.' });
    } catch (error) {
      await postMessage({ room, message: `Failed to update avatar 😞` });
    }
  }
  