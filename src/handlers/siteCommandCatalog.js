export const PUBLIC_SITE_COMMAND_GROUPS = [
  {
    group: 'Command Hubs',
    items: [
      '/commands',
      '/commands games',
      '/commands music',
      '/commands queue',
      '/commands wallet',
      '/commands sports',
      '/commands crypto',
      '/commands fun',
      '/commands trivia',
      '/commands avatars',
      '/games',
      '/music',
      '/wallet',
      '/gifs',
      '/avatars',
      '/sportsinfo',
      '/site'
    ]
  },
  {
    group: 'Games',
    items: [
      '/lottery',
      '/lotto',
      '/lottostats',
      '/lottowinners',
      '/jackpot',
      '/slots <amount>',
      '/slots info',
      '/roulette',
      '/bets',
      '/red',
      '/black',
      '/green',
      '/odd',
      '/even',
      '/high',
      '/low',
      '/number <0-36>',
      '/dozen <1-3>',
      '/blackjack',
      '/bj',
      '/join',
      '/bet <amount>',
      '/hit',
      '/stand',
      '/double',
      '/surrender',
      '/split',
      '/craps help',
      '/crapsrecord',
      '/horserace',
      '/horsehelp',
      '/f1 start',
      '/f1help'
    ]
  },
  {
    group: 'Trivia',
    items: [
      '/trivia',
      '/triviastart [rounds]',
      '/triviaend',
      '/a',
      '/b',
      '/c',
      '/d'
    ]
  },
  {
    group: 'Music & Reviews',
    items: [
      '/theme',
      '/album',
      '/art',
      '/score',
      '/song',
      '/stats',
      '/mostplayed',
      '/topliked',
      '/topsongs',
      '/mytopsongs',
      '/topalbums',
      '/mytopalbums',
      '/reviewhelp',
      '/review <1-10>',
      '/songreview <1-10>',
      '/albumreview <1-10>',
      '/rating',
      '/suggestsongs'
    ]
  },
  {
    group: 'Queue & Playlists',
    items: [
      '/q',
      '/q+',
      '/q-',
      '/searchalbum <artist>',
      '/newalbums [countryCode]',
      '/searchplaylist',
      '/qplaylist <spotifyPlaylistId>',
      '/qalbum <spotifyAlbumId|url|uri>',
      '/albumlist',
      '/albumadd <spotifyAlbumId>',
      '/albumremove <spotifyAlbumId>',
      '/addsong [beach]',
      '/removesong [beach]'
    ]
  },
  {
    group: 'Wallet & Leaderboards',
    items: [
      '/balance',
      '/getwallet',
      '/bankroll',
      '/career',
      '/careerlosses [count]',
      '/biggestlosers [count]',
      '/networth',
      '/topnetworth',
      '/economy [days]',
      '/monthly [count]',
      '/monthlydj [count]',
      '/monthlyf1 [count]',
      '/monthlygamblers [count]',
      '/profile',
      '/djstreak',
      '/badges',
      '/titles',
      '/title equip <key>',
      '/title clear',
      '/checkbalance <@user>',
      '/tip <@user> <amount>'
    ]
  },
  {
    group: 'Prestige',
    items: [
      '/djstreak',
      '/badges',
      '/titles',
      '/title equip <key>',
      '/title clear',
      '/profile',
      '/monthly [count]',
      '/monthlydj [count]',
      '/monthlyf1 [count]',
      '/monthlygamblers [count]',
      '/bankroll',
      '/topnetworth'
    ]
  },
  {
    group: 'Sports Betting',
    items: [
      '/sports',
      '/sportsinfo',
      '/sports scores <sport> [YYYY-MM-DD]',
      '/sports odds <sport>',
      '/sports bet <sport> <index> <team> <ml|spread> <amount>',
      '/sports bets [<@uid:USER>]',
      '/sports resolve [sport]',
      '/nba [YYYY-MM-DD]',
      '/odds <mlb|nba|ncaab|nhl|nfl>',
      '/sportsbet SPORT INDEX TEAM TYPE AMOUNT'
    ]
  },
  {
    group: 'Crypto',
    items: [
      '/crypto help',
      '/crypto price <symbol>',
      '/crypto buy <symbol> <amount>',
      '/crypto sell <symbol> <amount|all>',
      '/crypto portfolio',
      '/crypto top',
      '/crypto trending'
    ]
  },
  {
    group: 'Avatars',
    items: [
      '/randomavatar',
      '/dino',
      '/duck',
      '/spacebear',
      '/walrus',
      '/vibesguy',
      '/faces',
      '/dodo',
      '/dumdum',
      '/flowerpower',
      '/teacup',
      '/alien',
      '/alien2',
      '/roy',
      '/spooky',
      '/bouncer',
      '/record',
      '/jester',
      '/jukebox',
      '/anon',
      '/cyber',
      '/ghost',
      '/cosmic',
      '/lovable',
      '/grime',
      '/bearparty',
      '/winter',
      '/tvguy',
      '/pinkblanket',
      '/gaycam',
      '/gayian',
      '/gayalex',
      '/pajama'
    ]
  },
  {
    group: 'Reactions & Fun',
    items: [
      '/gifs',
      '/burp',
      '/dance',
      '/party',
      '/beer',
      '/fart',
      '/cheers',
      '/tomatoes',
      '/trash',
      '/bonk',
      '/rigged',
      '/banger',
      '/peace',
      '/dog [breed] [sub-breed]',
      '/djbeer',
      '/djbeers',
      '/getdjdrunk',
      '/jump',
      '/dive',
      '/escortme',
      '/spotlight',
      '/begonebitch',
      '/store',
      '/8ball <question>'
    ]
  },
  {
    group: 'Secret & Novelty',
    items: [
      '/secret',
      '/bark',
      '/barkbark',
      '/jam',
      '/berad',
      '/cam',
      '/drink',
      '/shirley',
      '/ello',
      '/allen',
      '/props',
      '/ass',
      '/titties',
      '/azz',
      '/shred'
    ]
  }
]

export const MOD_SITE_COMMAND_GROUPS = [
  {
    group: 'Moderator Hubs',
    items: [
      '/commands mod',
      '/mod'
    ]
  },
  {
    group: 'Room Design',
    items: [
      '/room classic',
      '/room ferry',
      '/room barn',
      '/room yacht',
      '/room festival',
      '/room stadium',
      '/room theater'
    ]
  },
  {
    group: 'Themes & Info',
    items: [
      '/settheme <name>',
      '/removetheme',
      '/status',
      '/infoon',
      '/infooff',
      '/infotoggle',
      '/infotone <neutral|playful|cratedigger|hype|classy|chartbot|djtech|vibe>'
    ]
  },
  {
    group: 'Bot DJ Controls',
    items: [
      '/addDJ',
      '/addDJ auto',
      '/addDJ discover',
      '/removeDJ',
      '/bopon',
      '/bopoff',
      '/autodjon',
      '/autodjoff',
      '/songstatson',
      '/songstatsoff',
      '/greeton',
      '/greetoff',
      '/spotlight'
    ]
  },
  {
    group: 'Avatar Admin',
    items: [
      '/addavatar ...',
      '/removeavatar ...',
      '/botrandom',
      '/bot1',
      '/bot2',
      '/bot3',
      '/botdino',
      '/botduck',
      '/botalien',
      '/botalien2',
      '/botpenguin',
      '/botwalrus',
      '/botspooky',
      '/botstaff',
      '/botwinter'
    ]
  },
  {
    group: 'Playlist & Admin Tools',
    items: [
      '/addmoney <@user> <amount>',
      '/blacklist+',
      '/site',
      '/store'
    ]
  }
]
