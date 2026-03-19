import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { isUserAuthorized, updateRoomInfo } from '../utils/API.js'
import { env } from '../config.js'
import { buildSportsInfoMessage } from './sportsCommands.js'

export function buildModSheet () {
  return [
    '🛠️ Moderator Commands',

    '--- Room Look ---',
    '- /room classic',
    '- /room ferry',
    '- /room barn',
    '- /room yacht',
    '- /room festival',
    '- /room stadium',
    '- /room theater',

    '--- Room Theme ---',
    '- /settheme <Albums|Covers|Rock|Country|Rap|...>',
    '- /removetheme',

    '--- Bot DJ Lineup ---',
    '- /addDJ   (Bot DJs from the default playlist)',
    '- /addDJ auto (Bot DJs from AI recommendations)',
    '- /addDJ discover (Bot DJs from discover playlists)',
    '- /removeDJ',

    '--- Bot Toggles ---',
    '- /status',
    '- /bopon | /bopoff',
    '- /autodjon | /autodjoff',
    '- /songstatson | /songstatsoff',
    '- /greeton | /greetoff',
    '- /infoon | /infooff | /infotoggle',
    '- /infotone <neutral|playful|cratedigger|hype|classy|chartbot|djtech|vibe>',

    '--- Avatars ---',
    'Bot:',
    '- /bot1',
    '- /botduck',
    '- /botdino',
    '- /botpenguin',
    '- /botwalrus',
    '- /botalien1',
    '- /botalien2',
    '- /botrandom',
    'User:',
    '- /randomavatar',
    '- /walrus',
    '- /dino',
    '- /spacebear',
    '- /duck',
    '- /cyber',
    '- /vibesguy',
    '- /faces'
  ].join('\n')
}

export const COMMAND_GUIDES = {
  games: [
    '🎮 Games Commands',
    '',
    'Start with the game trigger below, then use that game\'s help/instructions:',
    '',
    '- Lottery: `/lottery`',
    '- Roulette: `/roulette`',
    '- Slots info: `/slots info`',
    '- Blackjack: `/blackjack` (or `/bj`)',
    '- Craps help: `/craps help`',
    '- Horse Race: `/horserace`',
    '- Horse Race help: `/horsehelp`',
    '- F1 Race: `/f1 start`',
    '- F1 help: `/f1help`',
    '- Trivia: `/triviastart` (or `/trivia`)'
  ].join('\n'),
  queue: [
    '🎚️ Queue & Playlist Commands',
    '',
    'Queue',
    '- `/q`',
    '- `/q+`',
    '- `/q-`',
    '',
    'Playlist tools',
    '- `/searchplaylist`',
    '- `/qplaylist <spotifyPlaylistId>`',
    '- `/qalbum <spotifyAlbumId|url|uri>`',
    '- `/searchalbum <artist>`',
    '- `/newalbums [countryCode]`',
    '- `/albumlist`',
    '- `/albumadd <spotifyAlbumId>`',
    '- `/albumremove <spotifyAlbumId>`',
    '- `/addsong [beach]`',
    '- `/removesong [beach]`'
  ].join('\n'),
  trivia: [
    '🧠 Trivia Commands',
    '',
    '- `/trivia`',
    '- `/triviastart [rounds]`',
    '- `/triviaend`',
    '- Answer with `/a`, `/b`, `/c`, or `/d` once a question is live'
  ].join('\n'),
  fun: [
    '🎉 Fun & Room Commands',
    '',
    'Reactions',
    '- `/gifs`',
    '- `/burp` `/dance` `/party` `/beer` `/fart` `/cheers` `/tomatoes`',
    '- `/trash` `/bonk` `/rigged` `/banger` `/peace`',
    '- `/dog [breed] [sub-breed]`',
    '',
    'Room actions',
    '- `/jump`',
    '- `/like`',
    '- `/dive`',
    '- `/escortme`',
    '- `/djbeer` `/djbeers` `/getdjdrunk`',
    '- `/spotlight`',
    '',
    'Extras',
    '- `/8ball <question>`',
    '- `/store`',
    '- `/site`'
  ].join('\n'),
  crypto: [
    '🪙 Crypto Commands',
    '',
    '- `/crypto help`',
    '- `/crypto price <symbol>`',
    '- `/crypto buy <symbol> <amount>`',
    '- `/crypto sell <symbol> <amount|all>`',
    '- `/crypto portfolio`',
    '- `/crypto top`',
    '- `/crypto trending`'
  ].join('\n'),
  music: [
    '🎵 Music, Queue & Reviews',
    '',
    'Now playing & stats',
    '- `/album`',
    '- `/art`',
    '- `/score`',
    '- `/song`',
    '- `/stats`',
    '- `/mostplayed`',
    '- `/topliked`',
    '- `/topsongs`',
    '- `/mytopsongs`',
    '- `/topalbums`',
    '- `/mytopalbums`',
    '',
    'Reviews',
    '- `/reviewhelp`',
    '- `/songreview <1-10>`',
    '- `/albumreview <1-10>`',
    '- `/rating`',
    '',
    'Suggestions & queue tools',
    '- `/suggestsongs`',
    '- `/q`',
    '- `/q+`',
    '- `/q-`',
    '- `/searchalbum <artist>`',
    '- `/newalbums [countryCode]`',
    '- `/searchplaylist`',
    '- `/qplaylist <spotifyPlaylistId>`',
    '- `/qalbum <spotifyAlbumId|url|uri>`',
    '- `/albumadd <spotifyAlbumId>`',
    '- `/albumremove <spotifyAlbumId>`',
    '- `/albumlist`',
    '- `/addsong <song>`',
    '- `/removesong <song>`',
    '',
    'Theme',
    '- `/theme`',
    '- `/settheme <name>` (mods)',
    '- `/removetheme` (mods)'
  ].join('\n'),
  sports: buildSportsInfoMessage(),
  wallet: [
    '💰 Wallet, Betting & Scores',
    '',
    'Wallet',
    '- `/balance`',
    '- `/bankroll`',
    '- `/topnetworth`',
    '- `/networth`',
    '- `/career`',
    '- `/careerlosses [count]`',
    '- `/biggestlosers [count]`',
    '- `/economy [days]`',
    '- `/monthly [count]`',
    '- `/monthlydj [count]`',
    '- `/monthlyf1 [count]`',
    '- `/monthlygamblers [count]`',
    '',
    'Prestige',
    '- `/djstreak`',
    '- `/badges`',
    '- `/titles`',
    '- `/title equip <key>`',
    '- `/title clear`',
    '- `/profile`',
    '',
    'Transfers & checks',
    '- `/getwallet`',
    '- `/checkbalance <@user>`',
    '- `/tip <@user> <amount>`',
    '',
    'Sports',
    '- `/sportsinfo`',
    '- `/sports scores <sport> [YYYY-MM-DD]`',
    '- `/sports odds <sport>`',
    '- `/sports bet <sport> <index> <team> <ml|spread> <amount>`',
    '- `/madness odds`',
    '- `/madness bet <index> <team> <ml|spread> <amount>`',
    '- `/madness bets [<@uid:USER>]`',
    '- `/sports bets [<@uid:USER>]`',
    '- `/sports resolve [sport]`'
  ].join('\n'),
  avatars: [
    '🧑‍🎤 Avatar Commands',
    '',
    'User avatars',
    '- `/randomavatar`',
    '- `/dino` `/duck` `/spacebear` `/walrus`',
    '- `/vibesguy` `/faces` `/dodo` `/dumdum` `/flowerpower`',
    '- `/teacup` `/alien` `/alien2` `/roy` `/spooky` `/bouncer`',
    '- `/record` `/jester` `/jukebox`',
    '- `/anon` `/cyber` `/ghost` `/cosmic` `/lovable` `/grime`',
    '- `/bearparty` `/winter` `/tvguy` `/pinkblanket`',
    '- `/gaycam` `/gayian` `/gayalex` `/pajama`',
    '',
    'Bot avatars (mod-only)',
    '- `/botrandom`',
    '- `/bot1` `/bot2` `/bot3`',
    '- `/botdino` `/botduck` `/botalien` `/botalien2`',
    '- `/botpenguin` `/botwalrus`',
    '- `/botspooky` `/botstaff` `/botwinter`'
  ].join('\n'),
  mod: [
    '🛠️ Moderator Commands',
    '',
    '- `/status`',
    '- `/bopon` `/bopoff`',
    '- `/autodjon` `/autodjoff`',
    '- `/songstatson` `/songstatsoff`',
    '- `/greeton` `/greetoff`',
    '- `/infoon` `/infooff` `/infotoggle`',
    '- `/infotone <tone>`',
    '- `/room <classic|ferry|barn|yacht|festival|stadium|theater>`',
    '- `/settheme <name>`',
    '- `/removetheme`',
    '- `/addDJ [auto|discover]`',
    '- `/removeDJ`',
    '- `/spotlight`',
    '- `/addavatar ...`',
    '- `/removeavatar ...`',
    '- `/blacklist+ ...`',
    '- `/site`',
    '- `/store`',
    '- `/mod` (DM full moderator sheet)'
  ].join('\n')
}

export function createRoomUtilityHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    sendDirectMessage: sendDm = sendDirectMessage,
    isUserAuthorized: isAuthorized = isUserAuthorized,
    updateRoomInfo: updateRoom = updateRoomInfo
  } = deps

  return {
    commands: async ({ payload, room, ttlUserToken }) => {
      const isMod = await isAuthorized(payload.sender, ttlUserToken)
      const arg = payload.message.trim().split(/\s+/)[1]?.toLowerCase()
      const askedForMod = /^(mod|mods|moderator|admin)$/.test(arg || '')
      const guideMap = {
        avatar: COMMAND_GUIDES.avatars,
        avatars: COMMAND_GUIDES.avatars,
        fun: COMMAND_GUIDES.fun,
        game: COMMAND_GUIDES.games,
        games: COMMAND_GUIDES.games,
        gif: COMMAND_GUIDES.fun,
        gifs: COMMAND_GUIDES.fun,
        crypto: COMMAND_GUIDES.crypto,
        music: COMMAND_GUIDES.music,
        playlist: COMMAND_GUIDES.queue,
        playlists: COMMAND_GUIDES.queue,
        q: COMMAND_GUIDES.queue,
        queue: COMMAND_GUIDES.queue,
        sports: COMMAND_GUIDES.sports,
        sport: COMMAND_GUIDES.sports,
        store: COMMAND_GUIDES.fun,
        trivia: COMMAND_GUIDES.trivia,
        wallet: COMMAND_GUIDES.wallet
      }

      if (askedForMod) {
        if (!isMod) {
          await post({
            room,
            message: 'Moderator commands are mod-only. Use `/games`, `/gifs`, `/music`, `/wallet`, or `/avatars`.'
          })
          return
        }
        await post({ room, message: COMMAND_GUIDES.mod })
        await sendDm(payload.sender, buildModSheet())
        await post({ room, message: 'Mod Commands sent via DM' })
        return
      }

      if (arg && guideMap[arg]) {
        await post({ room, message: guideMap[arg] })
        return
      }

      const sections = []
      sections.push([
        '— Essentials —',
        '- `/theme` — Show current room theme',
        '- `/games` — List game commands',
        '- `/music` — Music, queue, and review commands',
        '- `/wallet` — Wallet and betting commands',
        '- `/commands sports` — Sports scores, odds, and betting',
        '- `/commands crypto` — Crypto portfolio game commands',
        '- `/gifs` — GIF and fun commands',
        '- `/avatars` — Avatar commands'
      ].join('\n'))

      sections.push([
        '— Popular —',
        '- `/album` — Album info for current song',
        '- `/score` — Spotify popularity score',
        '- `/reviewhelp` — How to review songs',
        '- `/bankroll` — Wallet leaderboard',
        '- `/badges` — See your unlocked badges',
        '- `/monthly` — Monthly leaderboard',
        '- `/suggestsongs` — Song suggestions',
        '- `/store` — Buyable novelty commands'
      ].join('\n'))

      sections.push([
        '— Prestige & Leaderboards —',
        '- `/commands wallet` or `/wallet` — Wallet, leaderboards, badges, and titles',
        '- `/monthly` `/monthlydj` `/monthlyf1` `/monthlygamblers` — Monthly boards',
        '- `/bankroll` `/topnetworth` — Top money boards',
        '- `/djstreak` `/badges` `/titles` `/profile` — Prestige progress',
        '- `/title equip <key>` — Equip a title you own'
      ].join('\n'))

      sections.push([
        '— Command Hubs —',
        '- `/commands games` or `/games`',
        '- `/commands music` or `/music`',
        '- `/commands queue`',
        '- `/commands wallet` or `/wallet`',
        '- `/commands sports`',
        '- `/commands crypto`',
        '- `/commands fun` or `/gifs`',
        '- `/commands trivia`',
        '- `/commands avatars` or `/avatars`'
      ].join('\n'))

      sections.push([
        '— Standalone Helpers —',
        '- `/theme` — Current room theme',
        '- `/reviewhelp` — Review instructions',
        '- `/sportsinfo` — Sports commands',
        '- `/store` — Shop items and priced novelty commands',
        '- `/site` — Bot hub link'
      ].join('\n'))

      if (isMod) {
        sections.push('- `/commands mod` — Moderator command list')
      } else {
        sections.push('- Mods can use `/commands mod` or `/mod`')
      }

      await post({ room, message: ['📖 Commands', ...sections].join('\n\n') })
    },

    mod: async ({ payload, room, ttlUserToken }) => {
      const ok = await isAuthorized(payload.sender, ttlUserToken)
      if (!ok) {
        await post({ room, message: 'You need to be a moderator to execute this command.' })
        return
      }
      await sendDm(payload.sender, buildModSheet())
      await post({ room, message: 'Mod Commands sent via DM' })
    },

    games: async ({ room }) => {
      await post({ room, message: COMMAND_GUIDES.games })
    },

    music: async ({ room }) => {
      await post({ room, message: COMMAND_GUIDES.music })
    },

    wallet: async ({ room }) => {
      await post({ room, message: COMMAND_GUIDES.wallet })
    },

    avatars: async ({ room }) => {
      await post({ room, message: COMMAND_GUIDES.avatars })
    },

    room: async ({ payload, room, ttlUserToken }) => {
      const ok = await isAuthorized(payload.sender, ttlUserToken)
      if (!ok) {
        await post({ room, message: 'You need to be a moderator to execute this command.' })
        return
      }

      const theme = payload.message.replace('/room', '').trim()
      if (!theme) {
        await post({
          room,
          message: 'Please specify a room design. Available options: Barn, Festival, Underground, Tomorrowland, Classic.'
        })
        return
      }

      const roomLower = theme.toLowerCase()
      const designMap = {
        yacht: 'YACHT',
        barn: 'BARN',
        festival: 'FESTIVAL',
        underground: 'UNDERGROUND',
        tomorrowland: 'TOMORROWLAND',
        classic: 'CLUB',
        'turntable classic': 'CLUB',
        ferry: 'FERRY_BUILDING',
        'ferry building': 'FERRY_BUILDING',
        stadium: 'STADIUM',
        theater: 'THEATER',
        lights: 'CHAT_ONLY',
        dark: 'CHAT_ONLY'
      }

      if (!designMap[roomLower]) {
        await post({
          room,
          message: `Invalid room design: ${theme}. Available options: Yacht, Barn, Festival, Underground, Tomorrowland, Classic, Ferry, Stadium, Theater, or Dark.`
        })
        return
      }

      await updateRoom({ design: designMap[roomLower] })
      await post({ room, message: `Room design updated to: ${designMap[roomLower]}` })
    },

    adddj: async ({ roomBot }) => {
      const args = roomBot?.lastCommandText?.trim().split(/\s+/) || []
      const option = (args[1] || '').toLowerCase()

      if (option === 'auto') {
        if (typeof roomBot.disableDiscoverDJ === 'function') {
          roomBot.disableDiscoverDJ()
        }
        await roomBot.addDJ()
        await post({
          room: env.roomUuid,
          message: '🎵 *Auto DJ added!*\n\nThe bot will now play AI-recommended songs.'
        })
        return
      }

      if (option === 'discover') {
        const discoverIdsEnv = env.discoverPlaylistIds || ''
        let discoverIds = discoverIdsEnv.split(',').map((s) => s.trim()).filter(Boolean)
        if (discoverIds.length === 0) {
          discoverIds = [
            '37i9dQZF1DX4JAvHpjipBk',
            '37i9dQZF1DX5trt9i14X7j',
            '37i9dQZF1DWVqfgj8NZEp1'
          ]
        }
        if (typeof roomBot.enableDiscoverDJ === 'function') {
          await roomBot.enableDiscoverDJ(discoverIds)
        }
        await roomBot.addDJ()
        await post({
          room: env.roomUuid,
          message: `🎶 *Discover DJ added!*\n\nThe bot will now play tracks from ${discoverIds.length} curated playlist(s) and avoid repeats.`
        })
        return
      }

      if (typeof roomBot.disableDiscoverDJ === 'function') {
        roomBot.disableDiscoverDJ()
      }
      await roomBot.addDJFromDefaultPlaylist()
      await post({
        room: env.roomUuid,
        message: '🎧 *DJ added from default playlist!*\n\nThe bot will now play songs from the configured default playlist.'
      })
    },

    removedj: async ({ roomBot }) => {
      const isBotDJ = roomBot.state?.djs.some(dj => dj.uuid === env.botUserUuid)
      if (isBotDJ) {
        await roomBot.removeDJ(env.botUserUuid)
      }
    }
  }
}
