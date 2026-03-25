// src/handlers/avatar/avatarConfig.js
//
// Config tables for every avatar command.
// To add a new command: add one entry here and one export in the
// appropriate command file. No other files need to change.

import { slugToTitle } from './shared.js'

// ─────────────────────────────────────────────────────────────────────────────
// USER POOL CONFIGS — pick a random themed avatar from a slug pool
// ─────────────────────────────────────────────────────────────────────────────

export const USER_POOL_CONFIGS = {
  dino: {
    key: 'dino',
    errorLabel: 'handleDinoCommand',
    unauthorizedMessage: "Sorry, this command is only available to authorized users \uD83E\uDD95.",
    allowedSlugs: ['jurassic-01', 'jurassic-02', 'jurassic-03', 'jurassic-05', 'jurassic-06', 'jurassic-07'],
    colorBySlug: {
      'jurassic-01': '#FF7A1CFF',
      'jurassic-02': '#A6FF00FF',
      'jurassic-03': '#9B5DE5FF',
      'jurassic-05': '#FFB347FF',
      'jurassic-06': '#FFECC2FF',
      'jurassic-07': '#FFD500FF'
    },
    fallbackColors: ['#A6FF00FF', '#FF7A1CFF', '#9B5DE5FF', '#FFB347FF', '#FFECC2FF', '#FFD500FF'],
    lines: {
      'jurassic-01': "\uD83E\uDD96 Frill Lizard deployed. Back up \u2014 the warning display means you're already too close.",
      'jurassic-02': "\uD83E\uDD95 Trike Tank online. Horns polished, tail swaying, crowd control engaged.",
      'jurassic-03': "\uD83D\uDE0E Cretaceous Cool slid in. Shades on. Herbivores free. Mammals behave.",
      'jurassic-05': "\uD83D\uDFE4 Desert Drake emerges. Warm scales, steady stare, zero fear.",
      'jurassic-06': "\uD83D\uDC80 Bonebreaker is awake. Heavy steps. Low patience.",
      'jurassic-07': "\uD83D\uDC9A Baby Rex activated. Absolutely adorable. Absolutely still a predator."
    },
    defaultLine: (slug) => `\uD83E\uDD96 ${slugToTitle(slug)} enters the timeline. Please keep arms and snacks inside the vehicle.`,
    warnLabel: 'dino',
    emptyMessage: "No Jurassic avatars found in the allowed list \uD83E\uDDB4",
    missingSlugMessage: "No dinosaur avatars available right now \uD83D\uDE2C",
    failureMessage: "Failed to update dinosaur avatar \uD83D\uDE1E"
  },

  bouncer: {
    key: 'bouncer',
    errorLabel: 'handleBouncerCommand',
    unauthorizedMessage: "\uD83D\uDEAB This command is only available to authorized users.",
    allowedSlugs: ['mod-bear-black', 'mod-bear-orange', 'staff-bear', 'staff'],
    colorBySlug: {
      'mod-bear-black': '#1A1A1AFF',
      'mod-bear-orange': '#FF6A00FF',
      'staff-bear': '#FFC300FF',
      staff: '#1A1A1AFF'
    },
    fallbackColors: ['#1A1A1AFF', '#FF6A00FF', '#FFC300FF'],
    lines: {
      'mod-bear-black': "\uD83D\uDD76\uFE0F Black Ops Bear on duty. If your name's not on the list, you're not on the stage.",
      'mod-bear-orange': "\uD83D\uDFE0 Floor Security online. Badge visible, attitude checked, behave in the booth.",
      'staff-bear': "\uD83D\uDC9B Staff Bear reporting in \u2014 cute face, zero tolerance.",
      staff: "\uD83D\uDC54 Venue Staff present. Keep the energy up and the drama down."
    },
    defaultLine: (slug) => `\uD83D\uDD76\uFE0F ${slugToTitle(slug)} on patrol. Respect the booth.`,
    warnLabel: 'bouncer',
    emptyMessage: "No security avatars are available right now. \uD83D\uDD12",
    missingSlugMessage: "Could not equip security mode \uD83D\uDE2C",
    failureMessage: "Avatar update failed. Security is temporarily offline \uD83D\uDE1E"
  },

  spooky: {
    key: 'spooky',
    errorLabel: 'handleSpookyCommand',
    unauthorizedMessage: "Sorry, this command is only available to authorized users \uD83E\uDD87.",
    allowedSlugs: [
      'harvest-08', 'harvest-07', 'harvest-06', 'harvest-05',
      'dj-mummyv1-1', 'dj-mummyv2-1', 'ghost', 'dj-vamplife-1',
      'dj-witchv1-1', 'dj-witchv2-1', 'dj-malezombie-1', 'dj-femalezombie-1'
    ],
    colorBySlug: {
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
    },
    fallbackColors: ['#FF6A00FF', '#00FF66FF', '#FFFFFFFF', '#B00020FF', '#C9C9C9FF'],
    lines: {
      'harvest-08': "\uD83C\uDF83 Pumpkin Beast online. The candle's real, the smile is not.",
      'harvest-07': "\uD83D\uDD6F\uFE0F Harvest Lantern lit. Cozy vibe, suspicious grin.",
      'harvest-06': "\uD83C\uDF3E Field Watcher reports in. Stitch-smile, zero heartbeat.",
      'harvest-05': "\uD83C\uDF3D Haunted Scarecrow rises \u2014 eyes glowing green, birds evacuated.",
      'dj-mummyv1-1': "\uD83E\uDDFB Ancient Wrap v1 awakened. Do not tug the bandages.",
      'dj-mummyv2-1': "\uD83E\uDDDF\u200D\u2642\uFE0F Experimental Wrap v2 online. Extra stitches, extra curse.",
      ghost: "\uD83D\uDC7B Friendly Ghost materialized. Floating. Watching. Vibing.",
      'dj-vamplife-1': "\uD83E\uDE78 Vamplife engaged. Pale face, dark night, louder than midnight.",
      'dj-witchv1-1': "\uD83E\uDDEA Swamp Witch enters the booth \u2014 cauldron bass only.",
      'dj-witchv2-1': "\uD83E\uDDF9 Midnight Witch glides in. Hat sharp, spell sharper.",
      'dj-malezombie-1': "\uD83E\uDDDF\u200D\u2642\uFE0F Male Zombie staggers into the booth \u2014 smell of bass and decay.",
      'dj-femalezombie-1': "\uD83E\uDDDF\u200D\u2640\uFE0F Undead Diva awakens \u2014 beats fresher than her complexion."
    },
    defaultLine: (slug) => `\uD83E\uDD87 ${slugToTitle(slug)} has entered the haunt.`,
    warnLabel: 'spooky',
    emptyMessage: "No spooky avatars found in the allowed set \uD83E\uDEA6",
    missingSlugMessage: "No spooky avatar available right now \uD83D\uDE2C",
    failureMessage: "Failed to equip spooky avatar \uD83D\uDE1E"
  },

  cyber: {
    key: 'cyber',
    errorLabel: 'handleRandomCyberCommand',
    unauthorizedMessage: "Sorry, this command is only available to authorized users \uD83C\uDFAD.",
    allowedSlugs: [
      'cyber-bear-visor', 'cyber-bear-angry', 'cyber-girl', 'cyber-gorilla',
      'cyber-guy', 'cyber-helmet', 'cyber-hood-purple', 'cyber-hood-yellow'
    ],
    colorBySlug: {
      'cyber-girl': '#FFD54FFF',
      'cyber-guy': '#FF5AB1FF',
      'cyber-helmet': '#FF4D97FF',
      'cyber-bear-visor': '#16E7E4FF',
      'cyber-gorilla': '#FF5C5CFF',
      'cyber-bear-angry': '#8AFF64FF',
      'cyber-hood-purple': '#8A2BE2FF',
      'cyber-hood-yellow': '#FFD500FF'
    },
    fallbackColors: ['#00E6D3FF', '#5B8CFFFF', '#C200FBFF', '#00BBF9FF', '#FF7A00FF', '#F15BB5FF', '#9B5DE5FF', '#A6FFCBFF'],
    lines: {
      'cyber-bear-visor': "\uD83E\uDDF8\uD83D\uDEE1\uFE0F Bear with a visor online\u2014scanning synthwave.",
      'cyber-bear-angry': "\uD83D\uDC3B\u26A1 Angry Bear boots up\u2014do not feed after midnight.",
      'cyber-girl': "\uD83D\uDC69\u200D\uD83C\uDFA4 Neon Girl synced\u2014city lights set to groove.",
      'cyber-gorilla': "\uD83E\uDD8D\uD83D\uDCC5 Cyber Gorilla stomps the grid\u2014bass endangered.",
      'cyber-guy': "\uD83D\uDD76\uFE0F\uD83D\uDCBE Neon Guy: visor down, volume up.",
      'cyber-helmet': "\uD83E\uDD16\uD83D\uDD0A Helm online\u2014systems green, subwoofers armed.",
      'cyber-hood-purple': "\uD83D\uDFE3\uD83D\uDD76\uFE0F Purple Hood in stealth\u2014low light, loud beats.",
      'cyber-hood-yellow': "\uD83D\uDFE1\u26A1 Yellow Hood engaged\u2014high voltage incoming."
    },
    defaultLine: (slug) => `\u26A1 ${slugToTitle(slug)} equipped\u2014welcome to the grid.`,
    warnLabel: 'cyber',
    emptyMessage: "No avatars found in your allowed list. \uD83E\uDEE4",
    missingSlugMessage: "No avatars available right now \uD83D\uDE2C",
    failureMessage: "Failed to update avatar \uD83D\uDE1E"
  },

  cosmic: {
    key: 'cosmic',
    errorLabel: 'handleRandomCosmicCommand',
    unauthorizedMessage: "Sorry, this command is only available to authorized users \uD83C\uDFAD.",
    allowedSlugs: [
      'cosmic-alien-bear', 'cosmic-galactic-bear', 'cosmic-space-guardian-bear',
      'cosmic-blue-alien', 'cosmic-helmet-alien', 'cosmic-baby-alien',
      'cosmic-meteor-guy', 'cosmic-cloudy-planet', 'cosmic-crescent-moon-guy',
      'cosmic-galaxy-cloak', 'cosmic-magical-gem', 'cosmic-sun-star',
      'cosmic-golden-chibi', 'cosmic-moon-chibi', 'cosmic-saturn-cloudy',
      'cosmic-celestial-chibi-alien', 'cosmic-celestial-chibi-goddess', 'cosmic-celestial-lady'
    ],
    colorBySlug: {
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
    },
    fallbackColors: [
      '#1FA2FFFF', '#9B5DE5FF', '#F15BB5FF', '#00F5D4FF',
      '#FFD700FF', '#00BBF9FF', '#FF7A00FF', '#A6FFCBFF', '#C200FBFF', '#5B8CFFFF'
    ],
    lines: {
      'cosmic-alien-bear': "\uD83D\uDC3B\u200D\u2744\uFE0F\uD83D\uDEF8 Alien Bear online\u2014gravity off, paw prints on the moon.",
      'cosmic-galactic-bear': "\uD83D\uDC3B\uD83C\uDF0C Galactic Bear roars\u2014Ursa Major just subscribed.",
      'cosmic-space-guardian': "\uD83D\uDEE1\uFE0F\uD83D\uDE80 Space Guardian deployed\u2014shields up, bass protected.",
      'cosmic-blue-alien': "\uD83D\uDEF8\uD83D\uDC99 Blue Alien beamed in\u2014frequency set to chill.",
      'cosmic-helmet-alien': "\uD83D\uDC68\u200D\uD83D\uDE80\uD83D\uDD0A Helmet Alien sealed\u2014comm check: one-two into the nebula.",
      'cosmic-baby-alien': "\uD83D\uDC76\uD83E\uFA90 Baby Alien coos\u2014cuteness at warp speed.",
      'cosmic-meteor-guy': "\u2604\uFE0F\uD83D\uDD25 Meteor Guy streaks by\u2014expect heavy drops.",
      'cosmic-cloudy-planet': "\u2601\uFE0F\uD83E\uFA90 Cloudy Planet ascends\u2014overcast with a chance of bops.",
      'cosmic-crescent-moon-guy': "\uD83C\uDF19\uD83C\uDF9A\uFE0F Crescent Moon Guy\u2014night mode engaged.",
      'cosmic-galaxy-cloak': "\uD83C\uDF00\uD83E\uDDE5 Galaxy Cloak swirls\u2014stars stitched into the drip.",
      'cosmic-magical-gem': "\uD83D\uDC8E\u2728 Magical Gem glows\u2014facet-cut frequencies unlocked.",
      'cosmic-sun-star': "\u2600\uFE0F\u26A1 Sun Star flares\u2014SPF 100 beats recommended.",
      'cosmic-golden-chibi': "\uD83C\uDF1F\uD83E\uDD47 Golden Chibi shines\u2014solid gold set list coming up.",
      'cosmic-moon-chibi': "\uD83C\uDF15\uD83C\uDF0A Moon Chibi floats\u2014low tide, high vibes.",
      'cosmic-saturn-cloudy': "\uD83E\uFA90\uD83C\uDF2B\uFE0F Saturn Cloudy rolls in\u2014ringside seats for the groove.",
      'cosmic-celestial-chibi-alien': "\uD83D\uDC7E\u2728 Celestial Chibi Alien\u2014cute but cosmic, abducting silence.",
      'cosmic-celestial-chibi-goddess': "\uD83D\uDC51\uD83C\uDF20 Celestial Chibi Goddess descends\u2014divinity with reverb.",
      'cosmic-celestial-lady': "\uD83D\uDCAB\uD83C\uDFBC Celestial Lady arrives\u2014elegance in orbit."
    },
    defaultLine: (slug) => `\uD83C\uDF0C ${slugToTitle(slug)} engaged\u2014orbiting the vibe.`,
    warnLabel: 'cosmic',
    emptyMessage: "No avatars found in your allowed list. \uD83E\uDEE4",
    missingSlugMessage: "No avatars available right now \uD83D\uDE2C",
    failureMessage: "Failed to update avatar \uD83D\uDE1E"
  },

  pajama: {
    key: 'pajama',
    errorLabel: 'handleRandomPajamaCommand',
    unauthorizedMessage: "Sorry, this command is only available to authorized users \uD83C\uDFAD.",
    directPick: true,
    allowedSlugs: [
      'pajamas-classic-bear-frog', 'pajamas-classic-bear-panda', 'pajamas-eyeball',
      'pajamas-pink-skin-black', 'pajamas-pixel-boy-blue', 'pajamas-pixel-girl-pink',
      'pajamas-bunny-blue', 'pajamas-bunny-pink', 'pajamas-witch',
      'pajamas-black-penguin', 'pajamas-blue-penguin', 'pajamas-penguin-onesies',
      'pajamas-clown-cap', 'pajamas-clown-jester-cap', 'pajamas-yellow-cloak',
      'pajamas-brown-onsies-goblin', 'pajamas-orange-onsies-goblin', 'pajamas-yellow-fire'
    ],
    colorBySlug: {
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
    },
    fallbackColors: [
      '#FFD966FF', '#A7D2CBFF', '#FFB6B9FF', '#FFDAC1FF', '#E2F0CBFF', '#B5EAD7FF',
      '#C7CEEAFF', '#F7A072FF', '#D5AAFFFF', '#ACE7FFFF', '#FFB347FF', '#B0E57CFF',
      '#FF9AA2FF', '#E6E6FAFF', '#FFDEADFF', '#C0FDFBFF', '#FAF3DDFF', '#FDCB82FF'
    ],
    lines: {
      'pajamas-classic-bear-frog': "\uD83D\uDC38\uD83D\uDC3B Frog Bear onesie engaged \u2014 ribbit, then cuddle.",
      'pajamas-classic-bear-panda': "\uD83D\uDC3C\uD83D\uDC3B Panda Bear mode \u2014 black, white, and bedtime-ready.",
      'pajamas-eyeball': "\uD83D\uDC41\uFE0F\uD83D\uDECC Eyeball pajama mode \u2014 I'm watching\u2026 the vibes.",
      'pajamas-pink-skin-black': "\uD83E\uDE77\uD83D\uDDA4 Pink Skin (Black) \u2014 cozy, but make it dangerous.",
      'pajamas-pixel-boy-blue': "\uD83D\uDFE6\uD83D\uDE34 Pixel Boy Blue \u2014 low-res, high comfort.",
      'pajamas-pixel-girl-pink': "\uD83E\uDE77\uD83D\uDE34 Pixel Girl Pink \u2014 bedtime but still cute.",
      'pajamas-bunny-blue': "\uD83D\uDC30\uD83D\uDC99 Blue Bunny \u2014 hop into sleep mode.",
      'pajamas-bunny-pink': "\uD83D\uDC30\uD83E\uDE77 Pink Bunny \u2014 soft steps, softer vibes.",
      'pajamas-witch': "\uD83E\uDDD9\u200D\u2640\uFE0F\uD83C\uDF19 Pajama Witch online \u2014 spells cast, lights out.",
      'pajamas-black-penguin': "\uD83D\uDC27\uD83D\uDDA4 Black Penguin \u2014 waddle into cozy season.",
      'pajamas-blue-penguin': "\uD83D\uDC27\uD83D\uDC99 Blue Penguin \u2014 chill mode: max.",
      'pajamas-penguin-onesies': "\uD83D\uDC27\uD83E\uDDF8 Penguin onesie squad \u2014 cold outside, warm inside.",
      'pajamas-clown-cap': "\uD83E\uDD21\uD83C\uDF88 Clown Cap pajamas \u2014 goofy, but comfy.",
      'pajamas-clown-jester': "\uD83C\uDFAD\uD83D\uDECC Jester pajamas \u2014 mischief, then sleep.",
      'pajamas-yellow-cloak': "\uD83D\uDFE1\uD83E\uDDE5 Yellow Cloak \u2014 mysterious\u2026 and extremely cozy.",
      'pajamas-brown-onsies-goblin': "\uD83D\uDC7A\uD83D\uDFE4 Brown Goblin onesie \u2014 menace in slippers.",
      'pajamas-orange-onsies-goblin': "\uD83D\uDC7A\uD83D\uDFE0 Orange Goblin onesie \u2014 chaos, but bedtime.",
      'pajamas-yellow-fire': "\uD83D\uDD25\uD83D\uDFE1 Yellow Fire \u2014 hot cocoa energy, warm beats only."
    },
    defaultLine: (slug) => `\uD83D\uDECC ${slugToTitle(slug)} equipped\u2014cozy mode enabled.`,
    emptyMessage: "No pajamas configured \uD83D\uDE2C",
    missingSlugMessage: "No pajamas configured \uD83D\uDE2C",
    failureMessage: "Failed to update avatar \uD83D\uDE1E"
  },

  lovable: {
    key: 'lovable',
    errorLabel: 'handleRandomLovableCommand',
    unauthorizedMessage: "Sorry, this command is only available to authorized users \uD83C\uDFAD.",
    allowedSlugs: ['lovable-figgy', 'lovable-loop', 'lovable-nova', 'lovable-pixel', 'lovable-bee'],
    colorBySlug: {
      'lovable-figgy': '#9B5DE5FF',
      'lovable-loop': '#FF8C00FF',
      'lovable-nova': '#00E6D3FF',
      'lovable-pixel': '#FF4D97FF',
      'lovable-bee': '#FFD54FFF'
    },
    fallbackColors: ['#A0C4FFFF', '#F15BB5FF', '#9B5DE5FF', '#00BBF9FF', '#00F5D4FF'],
    lines: {
      'lovable-figgy': "\uD83E\uDEA7 Figgy materializes\u2014mischief meter pegged at 11.",
      'lovable-loop': "\uD83D\uDD01 Loop locks the hard hat\u2014constructing certified bops.",
      'lovable-nova': "\uD83C\uDF1F Nova ignites\u2014tiny astronaut, galaxy-sized energy.",
      'lovable-pixel': "\uD83E\uDD16 Pixel online\u2014LED smile, latency zero.",
      'lovable-vee': "\uD83D\uDC9C Vee vibes in\u2014soft glow, big heart, bigger jams."
    },
    defaultLine: (slug) => `\uD83D\uDC96 ${slugToTitle(slug)} equipped\u2014spreading wholesome waves.`,
    warnLabel: 'lovable',
    emptyMessage: "No avatars found in your allowed list. \uD83E\uDEE4",
    missingSlugMessage: "No avatars available right now \uD83D\uDE2C",
    failureMessage: "Failed to update avatar \uD83D\uDE1E"
  },

  bearparty: {
    key: 'bearparty',
    errorLabel: 'handleBearPartyCommand',
    unauthorizedMessage: "Sorry, this command is only available to authorized users \uD83D\uDC3B.",
    allowedSlugs: [
      'mod-bear-black', 'mod-bear-orange', 'staff-bear', 'dj-spacebear-1',
      'cyber-bear-visor', 'cyber-bear-angry', 'cosmic-alien-bear', 'cosmic-galactic-bear',
      '19', '20', 'dj-christian-2', '28', '21', '10'
    ],
    colorBySlug: {
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
    },
    fallbackColors: ['#FFD54FFF', '#FF6A00FF', '#8DE2FFFF', '#16E7E4FF', '#8AFF64FF', '#54E38BFF', '#FF1A1AFF', '#FFD500FF'],
    lines: {
      'mod-bear-black': "\uD83D\uDD76\uFE0F Midnight Bear enters \u2014 mysterious, cool, and judging your playlist.",
      'mod-bear-orange': "\uD83D\uDFE0 Orange Alert Bear crashes the party \u2014 high visibility, higher vibes.",
      'staff-bear': "\uD83D\uDC9B Staff Bear arrives \u2014 adorable\u2026 but enforcing the party rules.",
      'dj-spacebear-1': "\uD83D\uDE80 Spacebear descends from orbit \u2014 gravitational bangers inbound.",
      'cyber-bear-visor': "\uD83D\uDD37 Cyber Visor Bear uploaded \u2014 scanning frequencies for fun.",
      'cyber-bear-angry': "\uD83D\uDCA2 Angry Cyber Bear online \u2014 the bass better behave.",
      'cosmic-alien-bear': "\uD83D\uDC7D Alien Bear beams in \u2014 abducting all weak beats.",
      'cosmic-galactic-bear': "\uD83C\uDF0C Galactic Bear materializes \u2014 entire star systems feeling the groove.",
      19: "\uD83D\uDC3B\u200D\uD83D\uDD25 Red-Eyed Shadow Bear emerges \u2014 watching\u2026 always.",
      20: "\uD83D\uDC9B Honey Glow Bear arrives \u2014 sweet vibes, sticky bass."
    },
    defaultLine: (slug) => `\uD83D\uDC3B ${slugToTitle(slug)} joins the Bear Party!`,
    warnLabel: 'bearparty',
    emptyMessage: "No bear party avatars found \uD83D\uDC3B\uD83E\uDD72",
    missingSlugMessage: "No bear party avatar available right now \uD83D\uDE2C",
    failureMessage: "Failed to equip Bear Party avatar \uD83D\uDE1E"
  },

  winter: {
    key: 'winter',
    errorLabel: 'handleWinterCommand',
    unauthorizedMessage: "Sorry, this command is only available to authorized users \u2744\uFE0F.",
    allowedSlugs: [
      'winter-01', 'winter-02', 'winter-03', 'winter-04',
      'winter-05', 'winter-06', 'winter-07', 'winter-08',
      'winter2-01', 'winter2-02', 'winter2-03', 'winter2-04',
      'winter2-05', 'winter2-06', 'winter2-07', 'winter2-08'
    ],
    colorBySlug: null,
    fallbackColors: ['#E6F7FFFF', '#B3E5FFFF', '#8DE2FFFF', '#C7CEEAFF', '#DDEBFFFF', '#A7D2CBFF', '#F0F8FFFF', '#FFFFFFFF'],
    lines: null,
    defaultLine: () => "\u2744\uFE0F Winter avatar equipped!",
    warnLabel: 'winter',
    emptyMessage: "No winter avatars found in the allowed set \u2603\uFE0F",
    missingSlugMessage: "No winter avatar available right now \uD83D\uDE2C",
    failureMessage: "Failed to equip winter avatar \uD83D\uDE1E"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER STATIC CONFIGS — fixed avatarId + color per command
// ─────────────────────────────────────────────────────────────────────────────

// logged: true → uses runLoggedStaticUserAvatarCommand (info logs on attempt/success)
// logged: false → uses runStaticUserAvatarCommand (no logging)

export const USER_STATIC_CONFIGS = {
  grimehouse: {
    logged: true,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'dj-grimehouse-1',
    color: '#EDEDEDFF',
    successMessage: "\uD83C\uDFA7\uD83D\uDD76\uFE0F Grimehouse unlocked \u2014 mask up, bass down, vibes heavy.",
    failureMessage: "Failed to equip Grimehouse avatar \uD83D\uDE1E",
    attemptLabel: 'grimehouse',
    errorLabel: 'handleGrimehouseCommand'
  },
  recordguy: {
    logged: true,
    unauthorizedMessage: "\uD83C\uDF9F\uFE0F Sorry, this command is only available to authorized users.",
    avatarId: 'stadiumseason-04a',
    color: '#FF9A00FF',
    successMessage: "\uD83C\uDFDF\uFE0F Record Mascot on the floor \u2014 crowd noise activated, hype levels rising.",
    failureMessage: "Could not equip Record Mascot \uD83D\uDE1E",
    attemptLabel: 'recordguy',
    errorLabel: 'handleRecordGuyCommand'
  },
  jester: {
    logged: true,
    unauthorizedMessage: "\uD83C\uDF9F\uFE0F Sorry, this command is only available to authorized users.",
    avatarId: 'ttfm-jester-1',
    color: '#8A2BE2FF',
    successMessage: "\uD83C\uDFAD The Jester enters \u2014 chaos enabled, mischief guaranteed.",
    failureMessage: "The Jester slipped on a banana peel \uD83E\uDD21",
    attemptLabel: 'jester',
    errorLabel: 'handleJesterCommand'
  },
  jukebox: {
    logged: true,
    unauthorizedMessage: "\uD83D\uDCFB Sorry, this command is only available to authorized users.",
    avatarId: 'dj-jukbox-1',
    color: '#FFF000FF',
    successMessage: "\uD83D\uDCFC Jukebox engaged. Old hits, deep cuts, all requests considered.",
    failureMessage: "Could not equip Jukebox \uD83D\uDE1E",
    attemptLabel: 'jukebox',
    errorLabel: 'handleJukeboxCommand'
  },
  tvguy: {
    logged: true,
    unauthorizedMessage: "\uD83C\uDF9F\uFE0F Sorry, this command is only available to authorized users.",
    avatarId: 'dj-jamopi-1',
    color: '#9ED3D3FF',
    successMessage: "\uD83D\uDCFA TVguy online \u2014 static fades, picture locks in, channel changed.",
    failureMessage: "\uD83D\uDCE1 TVguy lost signal\u2026 try adjusting the rabbit ears.",
    attemptLabel: 'tvguy',
    errorLabel: 'handleTVguyCommand'
  },
  pinkblanket: {
    logged: true,
    unauthorizedMessage: "\uD83C\uDF9F\uFE0F Sorry, this command is only available to authorized users.",
    avatarId: 'dj-pnkblnkt-1',
    color: '#FFB7D5FF',
    successMessage: "\uD83E\uDE77 Pink Blanket mode activated \u2014 cozy beats, zero stress.",
    failureMessage: "Pink Blanket slipped off\u2026 please re-tuck \uD83E\uDEE3",
    attemptLabel: 'pinkblanket',
    errorLabel: 'handlePinkBlanketCommand'
  },
  gayian: {
    logged: true,
    unauthorizedMessage: "\uD83C\uDF9F\uFE0F Sorry, this command is only available to authorized users.",
    avatarId: 'dj-festseason-4',
    color: '#FF4FA3FF',
    successMessage: "\uD83D\uDD7A\u2728 Gay Ian activated \u2014 glitter on, volume up",
    failureMessage: "Gay Ian dropped the beat\u2026 and the glitter \uD83D\uDC94",
    attemptLabel: 'gayIan',
    errorLabel: 'handleGayIanCommand'
  },
  roy: {
    logged: true,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'dj-roy-1',
    color: '#E5D47FFF',
    successMessage: "\u2623\uFE0F The Roy Protocol is active \u2014 mask on, beats hazardous.",
    failureMessage: "Failed to equip Roy avatar \uD83D\uDE1E",
    attemptLabel: 'roy',
    errorLabel: 'handleRoyCommand'
  },
  duck: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized dino users \uD83E\uDD96.",
    avatarId: 'stadiumseason-02',
    color: '#FFDE21',
    successMessage: "\uD83D\uDC24\uD83E\uDDE3 Cool, calm, and quackin'. Looking fly, my feather-friend.\uD83D\uDD76\uFE0F",
    failureMessage: "Duck transformation failed"
  },
  teacup: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized dino users \uD83E\uDD96.",
    avatarId: 'dj-greentea-1',
    color: '#6EFAC8FF',
    successMessage: "\uD83C\uDF75 Green Tea avatar equipped \u2014 serenity and caffeine achieved.",
    failureMessage: "Teacup transformation failed"
  },
  spacebear: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'dj-spacebear-1',
    color: '#FFD966',
    successMessage: "You are now a spacebear! \uD83D\uDC3B\u200D\u2744\uFE0F\uD83D\uDE80",
    failureMessage: "Something went wrong trying to launch you into space. \uD83E\uDD72"
  },
  walrus: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'winter-07',
    color: '#8de2ff',
    successMessage: "\uD83E\uDDAD Splash! You're officially a walrus now. Blub blub. \u2744\uFE0F",
    failureMessage: "Something went wrong transforming you into a"
  },
  vibesguy: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'dj-aurision-1',
    color: '#FFA500',
    successMessage: "All time vibes guy is back",
    failureMessage: "Something went wrong transforming you into a vibes guy"
  },
  gaycam: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'festivalseason-02',
    color: '#ff00bbff',
    successMessage: "Haaa.........GAYYYYY",
    failureMessage: "Something went wrong transforming you into a gay cam"
  },
  gayalex: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'dj-akemie50-1',
    color: '#ff00bbff',
    successMessage: "Cute mask \uD83D\uDC97\u0F00\u0F00",
    failureMessage: "Something went wrong transforming you into a gay Alex"
  },
  faces: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'dj-FACES-1',
    color: '#007CF0',
    successMessage: "Smile!",
    failureMessage: "Something went wrong transforming you into a smiley face"
  },
  alien: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'season-0001-underground-thehuman',
    color: '#39FF14',
    successMessage: "ET Phone Home! \uD83D\uDC7D",
    failureMessage: "Something went wrong transforming you into an alien"
  },
  alien2: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to authorized users.",
    avatarId: 'stadiumseason-01',
    color: '#39FF14',
    successMessage: "ET Phone Home! \uD83D\uDC7D",
    failureMessage: "Something went wrong transforming you into an alien"
  },
  dodo: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to people i like",
    avatarId: 'lennnie-01',
    color: '#A67C52',
    successMessage: "The DoDo bird...Proof you don't need wings to elevate the room",
    failureMessage: "Something went wrong transforming you into a dodo bird"
  },
  dumdum: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to people i like",
    avatarId: 'stadiumseason-03',
    color: '#767573ff',
    successMessage: "dum dum want gum gum \uD83D\uDDFF",
    failureMessage: "Something went wrong transforming you...dum dum"
  },
  flowerpower: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to people i like",
    avatarId: 'dj-petalsupply-1',
    color: '#ef55ddff',
    successMessage: "You've gone full Flower Power\u2014expect photosynthesis-level energy",
    failureMessage: "Something went wrong transforming you into a flower"
  },
  anon: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to people i like",
    avatarId: 'dj-tybolden-1',
    color: '#a199a0ff',
    successMessage: "Hello Mr. Anonymous",
    failureMessage: "Something went wrong transforming you into anon"
  },
  ghost: {
    logged: false,
    unauthorizedMessage: "Sorry, this command is only available to people i like",
    avatarId: 'ghost',
    color: '#ffffffff',
    successMessage: "Boo!",
    failureMessage: "Something went wrong transforming you into a ghost"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT POOL CONFIGS — moderator-auth pool commands for the bot avatar
// ─────────────────────────────────────────────────────────────────────────────

export const BOT_POOL_CONFIGS = {
  botstaff: {
    key: 'botstaff',
    errorLabel: 'handleBotStaffCommand',
    unauthorizedMessage: "\uD83D\uDEAB You need to be a moderator to execute this command.",
    allowedSlugs: ['mod-bear-black', 'mod-bear-orange', 'staff-bear', 'staff'],
    colorBySlug: {
      'mod-bear-black': '#1A1A1AFF',
      'mod-bear-orange': '#FF6A00FF',
      'staff-bear': '#FFC300FF',
      staff: '#1A1A1AFF'
    },
    fallbackColors: ['#1A1A1AFF', '#FF6A00FF', '#FFC300FF'],
    lines: {
      'mod-bear-black': "\uD83D\uDD76\uFE0F Black Ops Bot on duty. If your name's not on the list, you're not on the stage.",
      'mod-bear-orange': "\uD83D\uDFE0 Floor Security Bot online. Badge visible, attitude checked, behave in the booth.",
      'staff-bear': "\uD83D\uDC9B Staff Bear Bot reporting in \u2014 cute face, zero tolerance.",
      staff: "\uD83D\uDC54 Venue Staff Bot present. Keep the energy up and the drama down."
    },
    defaultLine: (slug) => `\uD83D\uDD76\uFE0F ${slugToTitle(slug)} Bot on patrol. Respect the booth.`,
    warnLabel: 'botstaff',
    emptyMessage: "No security avatars are available right now. \uD83D\uDD12",
    missingSlugMessage: "Could not equip security mode \uD83D\uDE2C",
    failureMessage: "Avatar update failed. Security bot is temporarily offline \uD83D\uDE1E"
  },

  botspooky: {
    key: 'botSpooky',
    errorLabel: 'handleBotSpookyCommand',
    unauthorizedMessage: "You need to be a moderator to execute this command. \uD83E\uDD87",
    allowedSlugs: [
      'harvest-08', 'harvest-07', 'harvest-06', 'harvest-05',
      'dj-mummyv1-1', 'dj-mummyv2-1', 'ghost', 'dj-vamplife-1',
      'dj-witchv1-1', 'dj-witchv2-1', 'dj-malezombie-1', 'dj-femalezombie-1'
    ],
    colorBySlug: {
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
    },
    fallbackColors: ['#FF6A00FF', '#00FF66FF', '#FFFFFFFF', '#B00020FF', '#C9C9C9FF'],
    lines: {
      'harvest-08': "\uD83C\uDF83 Pumpkin Beast online. The candle's real, the smile is not.",
      'harvest-07': "\uD83D\uDD6F\uFE0F Harvest Lantern lit. Cozy vibe, suspicious grin.",
      'harvest-06': "\uD83C\uDF3E Field Watcher reports in. Stitch-smile, zero heartbeat.",
      'harvest-05': "\uD83C\uDF3D Haunted Scarecrow rises \u2014 eyes glowing green, birds evacuated.",
      'dj-mummyv1-1': "\uD83E\uDDFB Ancient Wrap v1 awakened. Do not tug the bandages.",
      'dj-mummyv2-1': "\uD83E\uDDDF\u200D\u2642\uFE0F Experimental Wrap v2 online. Extra stitches, extra curse.",
      ghost: "\uD83D\uDC7B Friendly Ghost materialized. Floating. Watching. Vibing.",
      'dj-vamplife-1': "\uD83E\uDE78 Vamplife engaged. Pale face, dark night, louder than midnight.",
      'dj-witchv1-1': "\uD83E\uDDEA Swamp Witch enters the booth \u2014 cauldron bass only.",
      'dj-witchv2-1': "\uD83E\uDDF9 Midnight Witch glides in. Hat sharp, spell sharper.",
      'dj-malezombie-1': "\uD83E\uDDDF\u200D\u2642\uFE0F Male Zombie staggers into the booth \u2014 smell of bass and decay.",
      'dj-femalezombie-1': "\uD83E\uDDDF\u200D\u2640\uFE0F Undead Diva awakens \u2014 beats fresher than her complexion."
    },
    defaultLine: (slug) => `\uD83E\uDD87 ${slugToTitle(slug)} has taken control of the booth.`,
    warnLabel: 'botSpooky',
    emptyMessage: "No spooky avatars found in the allowed set \uD83E\uDEA6",
    missingSlugMessage: "No spooky avatar available right now \uD83D\uDE2C",
    failureMessage: "Failed to update bot spooky avatar \uD83D\uDE1E"
  },

  botwinter: {
    key: 'botwinter',
    errorLabel: 'handleBotWinterCommand',
    unauthorizedMessage: "\uD83D\uDEAB You need to be a moderator to execute this command. \u2744\uFE0F",
    allowedSlugs: [
      'winter-01', 'winter-02', 'winter-03', 'winter-04',
      'winter-05', 'winter-06', 'winter-07', 'winter-08',
      'winter2-01', 'winter2-02', 'winter2-03', 'winter2-04',
      'winter2-05', 'winter2-06', 'winter2-07', 'winter2-08'
    ],
    colorBySlug: null,
    fallbackColors: ['#E6F7FFFF', '#B3E5FFFF', '#8DE2FFFF', '#C7CEEAFF', '#DDEBFFFF', '#A7D2CBFF', '#F0F8FFFF', '#FFFFFFFF'],
    lines: null,
    successMessage: "\u2744\uFE0F Bot winter avatar equipped!",
    warnLabel: 'botwinter',
    emptyMessage: "No winter avatars found in the allowed set \u2603\uFE0F",
    missingSlugMessage: "No winter avatar available right now \uD83D\uDE2C",
    failureMessage: "Failed to equip bot winter avatar \uD83D\uDE1E"
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOT STATIC CONFIGS — moderator-auth static avatar for the bot
// ─────────────────────────────────────────────────────────────────────────────

const BOT_UNAUTH = "You need to be a moderator to execute this command."
const BOT_FAIL = "Failed to update bot profile"

export const BOT_STATIC_CONFIGS = {
  botdino: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'jurassic-05',
    color: '#8B6C5C',
    successMessage: 'Roar!',
    failureMessage: BOT_FAIL
  },
  botduck: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'stadiumseason-02',
    color: '#FFDE21',
    successMessage: "Quack Quack \uD83E\uDD86\uD83E\uDDF4\uD83E\uDEA7",
    failureMessage: BOT_FAIL
  },
  botalien: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'season-0001-underground-thehuman',
    color: '#39FF14',
    successMessage: "\uD83D\uDC7D Alien transformation complete! Take me to your leader. \uD83D\uDE80",
    failureMessage: BOT_FAIL
  },
  botalien2: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'stadiumseason-01',
    color: '#39FF14',
    successMessage: "\uD83C\uDF0C Beep boop. I'm not from around here... \uD83D\uDC7E",
    failureMessage: BOT_FAIL
  },
  botwalrus: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'winter-07',
    color: '#8DE2FF',
    successMessage: "\uD83E\uDDAD Don't mind me\u2026 just lounging like a majestic sea sausage.\uD83E\uDDE3",
    failureMessage: BOT_FAIL
  },
  botpenguin: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'pinguclub-03',
    color: '#B026FF',
    successMessage: "\uD83D\uDC9C\uD83D\uDC27 Initiating purple penguin protocol\u2026 waddling in style now.",
    failureMessage: BOT_FAIL
  },
  bot2: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'bot-2',
    color: '#FF5F1F',
    successMessage: "\u2699\uFE0F\uD83D\uDFE0 They said I needed a fresh coat\u2026 I went full fire.\uD83E\uDD16",
    failureMessage: BOT_FAIL
  },
  bot1: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'bot-01',
    color: '#04D9FF',
    successMessage: "\uD83D\uDC99\uD83E\uDD16 Classic look, timeless tech.",
    failureMessage: BOT_FAIL
  },
  bot3: {
    unauthorizedMessage: BOT_UNAUTH,
    avatarId: 'lovable-pixel',
    color: '#FF4D97FF',
    successMessage: "\uD83E\uDD16\uD83D\uDC96 Pixel mode engaged \u2014 LED grin, latency zero.",
    failureMessage: BOT_FAIL
  }
}
