import { postMessage, sendDirectMessage } from '../libs/cometchat.js'
import { isUserAuthorized, updateRoomInfo } from '../utils/API.js'
import { env } from '../config.js'
import { buildSportsInfoMessage } from './sportsCommands.js'

export function buildModSheet () {
  return [
    '🛠️ Moderator Commands',

    '--- Room Design ---',
    '- /room <classic|ferry|barn|yacht|festival|stadium|theater>',

    '--- Room Theme ---',
    '- /settheme <Albums|Covers|Rock|Country|Rap|...>',
    '- /removetheme',

    '--- Bot DJ Lineup ---',
    '- /addDJ   (default playlist)',
    '- /addDJ auto  (AI recommendations)',
    '- /removeDJ',

    '--- Bot Toggles ---',
    '- /status',
    '- /bopon | /bopoff',
    '- /songstatson | /songstatsoff',
    '- /greeton | /greetoff',
    '- /infoon | /infooff | /infotoggle',
    '- /infotone <neutral|playful|cratedigger|hype|classy|chartbot|djtech|vibe>',
    '- /madnessupdates <on|off|status>',

    '--- Room Actions ---',
    '- /dislike  (mod-only: bot votes against current song)',
    '- /spotlight  (remove DJ after current song)',
    '- /playlistcreate <name>  (create a Spotify playlist)',
    '- /blacklist+  (remove song from playlists)',
    '- /addmoney <@user> <amount>  (admin only)',

    '--- Bot Avatars ---',
    '- /botrandom | /bot1 | /bot2 | /bot3',
    '- /botdino | /botduck | /botpenguin',
    '- /botwalrus | /botalien | /botalien2',
    '- /botspooky | /botstaff | /botwinter',

    '--- Custom Avatars ---',
    '- /addavatar ...',
    '- /removeavatar ...',

    '--- Links ---',
    '- /site  (bot hub)',
    '- /store  (novelty shop)'
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
    '- `/addsong` — Add current song to the default playlist',
    '- `/addsong beach` — Add to the beach playlist instead',
    '- `/removesong` — Remove current song from the default playlist'
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
    '- `/like` `/dislike` (mod-only)',
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
    '- `/allbadges` — full badge list',
    '- `/titles`',
    '- `/alltitles` — how to earn every title',
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
    'These commands change your avatar in the room. Type any of them to switch instantly.',
    '',
    'User avatars',
    '- `/randomavatar` — Pick a random avatar',
    '- `/dino` `/duck` `/spacebear` `/walrus`',
    '- `/vibesguy` `/faces` `/dodo` `/dumdum` `/flowerpower`',
    '- `/teacup` `/alien` `/alien2` `/roy` `/spooky` `/bouncer`',
    '- `/record` `/jester` `/jukebox`',
    '- `/anon` `/cyber` `/ghost` `/cosmic` `/lovable` `/grime`',
    '- `/bearparty` `/winter` `/tvguy` `/pinkblanket`',
    '- `/gaycam` `/gayian` `/gayalex` `/pajama`',
    '',
    'Bot avatars (mod-only) — changes the bot\'s appearance',
    '- `/botrandom`',
    '- `/bot1` `/bot2` `/bot3`',
    '- `/botdino` `/botduck` `/botalien` `/botalien2`',
    '- `/botpenguin` `/botwalrus`',
    '- `/botspooky` `/botstaff` `/botwinter`'
  ].join('\n'),
  mod: [
    '🛠️ Moderator Commands',
    '',
    'Room',
    '- `/room <classic|ferry|barn|yacht|festival|stadium|theater>`',
    '- `/settheme <name>` | `/removetheme`',
    '',
    'Bot DJ',
    '- `/addDJ [auto]` | `/removeDJ`',
    '',
    'Toggles',
    '- `/status`',
    '- `/bopon` | `/bopoff`',
    '- `/songstatson` | `/songstatsoff`',
    '- `/greeton` | `/greetoff`',
    '- `/infoon` | `/infooff` | `/infotoggle`',
    '- `/infotone <neutral|playful|cratedigger|hype|classy|chartbot|djtech|vibe>`',
    '- `/madnessupdates <on|off|status>`',
    '',
    'Actions',
    '- `/dislike` — bot votes against current song',
    '- `/spotlight` — remove DJ after current song',
    '- `/blacklist+` — remove song from playlists',
    '',
    'Admin',
    '- `/addavatar ...` | `/removeavatar ...`',
    '- `/addmoney <@user> <amount>`',
    '- `/mod` — full sheet via DM'
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
        '— Quick Picks —',
        '- `/album` — Album info for current song',
        '- `/score` — Spotify popularity score',
        '- `/review <1-10>` — Rate the current song',
        '- `/balance` — Your wallet balance',
        '- `/bankroll` — Wallet leaderboard',
        '- `/monthly` — Monthly leaderboard',
        '- `/badges` — Your unlocked badges',
        '- `/suggestsongs` — Song suggestions',
        '- `/store` — Novelty shop',
        '- `/8ball <question>` — Magic 8 ball'
      ].join('\n'))

      sections.push([
        '— Explore by Category —',
        '- `/games` — Lottery, slots, roulette, blackjack & more',
        '- `/music` — Reviews, stats, now playing info',
        '- `/wallet` — Wallet, leaderboards, prestige & titles',
        '- `/queue` — Queue & playlist tools',
        '- `/gifs` or `/fun` — GIF reactions & fun commands',
        '- `/avatars` — Change your avatar',
        '- `/commands sports` — Scores, odds & betting',
        '- `/commands crypto` — Crypto portfolio game',
        '- `/commands trivia` — Trivia game'
      ].join('\n'))

      sections.push([
        '— Reference —',
        '- `/reviewhelp` — Rating scale',
        '- `/sportsinfo` — Sports commands',
        '- `/site` — Bot hub link'
      ].join('\n'))

      if (isMod) {
        sections.push('Mods: `/commands mod` or `/mod` for moderator commands')
      } else {
        sections.push('Mods: `/commands mod` or `/mod`')
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

    queue: async ({ room }) => {
      await post({ room, message: COMMAND_GUIDES.queue })
    },

    playlist: async ({ room }) => {
      await post({ room, message: COMMAND_GUIDES.queue })
    },

    fun: async ({ room }) => {
      await post({ room, message: COMMAND_GUIDES.fun })
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
