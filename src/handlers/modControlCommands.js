import { postMessage } from '../libs/cometchat.js'
import { isUserAuthorized } from '../utils/API.js'
import { enableSongStats, disableSongStats, isSongStatsEnabled } from '../utils/voteCounts.js'
import {
  enableGreetingMessages,
  disableGreetingMessages,
  greetingMessagesEnabled,
  enableAIGreeting,
  disableAIGreeting,
  aiGreetingEnabled
} from '../handlers/userJoined.js'
import {
  enableNowPlayingInfoBlurb,
  disableNowPlayingInfoBlurb,
  isNowPlayingInfoBlurbEnabled,
  setNowPlayingInfoBlurbTone,
  getNowPlayingInfoBlurbTone
} from '../utils/announceNowPlaying.js'
import {
  enableMarchMadnessUpdates,
  disableMarchMadnessUpdates,
  isMarchMadnessUpdatesEnabled
} from '../scheduler/marchMadnessUpdates.js'

export const VALID_INFO_TONES = ['neutral', 'playful', 'cratedigger', 'hype', 'classy', 'chartbot', 'djtech', 'vibe']

export const INFO_TONE_ALIASES = {
  nerd: 'cratedigger',
  geek: 'cratedigger',
  crate: 'cratedigger',
  digger: 'cratedigger',
  n: 'neutral',
  neutral: 'neutral',
  p: 'playful',
  fun: 'playful',
  playful: 'playful',
  hype: 'hype',
  amp: 'hype',
  classy: 'classy',
  formal: 'classy',
  chart: 'chartbot',
  charts: 'chartbot',
  chartbot: 'chartbot',
  tech: 'djtech',
  djtech: 'djtech',
  vibe: 'vibe',
  chill: 'vibe'
}

function getToneHelpMessage (current, bullet = '-') {
  return [
    'ℹ️ Info Blurb Tone',
    `${bullet} Current: ${current}`,
    `${bullet} Available: ${VALID_INFO_TONES.join(', ')}`,
    `${bullet} Set: /infotone <tone>`
  ].join('\n')
}

function getInvalidToneMessage (current, bullet = '-') {
  return [
    'Invalid tone.',
    `${bullet} Current: ${current}`,
    `${bullet} Available: ${VALID_INFO_TONES.join(', ')}`,
    `${bullet} Try: /infotone neutral`
  ].join('\n')
}

export function normalizeInfoTone (raw) {
  const key = String(raw || '').trim().toLowerCase()
  if (!key) return null
  return INFO_TONE_ALIASES[key] || key
}

export function createModControlHandlers (deps = {}) {
  const {
    postMessage: post = postMessage,
    isUserAuthorized: isAuthorized = isUserAuthorized,
    isSongStatsEnabled: readSongStats = isSongStatsEnabled,
    enableSongStats: enableSongStatsImpl = enableSongStats,
    disableSongStats: disableSongStatsImpl = disableSongStats,
    enableGreetingMessages: enableGreetingMessagesImpl = enableGreetingMessages,
    disableGreetingMessages: disableGreetingMessagesImpl = disableGreetingMessages,
    enableAIGreeting: enableAIGreetingImpl = enableAIGreeting,
    disableAIGreeting: disableAIGreetingImpl = disableAIGreeting,
    getGreetingState = () => ({
      standardEnabled: greetingMessagesEnabled,
      aiEnabled: aiGreetingEnabled
    }),
    enableNowPlayingInfoBlurb: enableInfoImpl = enableNowPlayingInfoBlurb,
    disableNowPlayingInfoBlurb: disableInfoImpl = disableNowPlayingInfoBlurb,
    isNowPlayingInfoBlurbEnabled: isInfoEnabled = isNowPlayingInfoBlurbEnabled,
    setNowPlayingInfoBlurbTone: setToneImpl = setNowPlayingInfoBlurbTone,
    getNowPlayingInfoBlurbTone: getTone = getNowPlayingInfoBlurbTone,
    enableMarchMadnessUpdates: enableMadnessUpdatesImpl = enableMarchMadnessUpdates,
    disableMarchMadnessUpdates: disableMadnessUpdatesImpl = disableMarchMadnessUpdates,
    isMarchMadnessUpdatesEnabled: isMadnessUpdatesEnabled = isMarchMadnessUpdatesEnabled
  } = deps

  async function requireModerator (payload, room, ttlUserToken) {
    const ok = await isAuthorized(payload.sender, ttlUserToken)
    if (!ok) {
      await post({ room, message: 'You need to be a moderator to execute this command.' })
      return false
    }
    return true
  }

  return {
    status: async ({ room, roomBot }) => {
      const greetingState = getGreetingState()
      const statusMessage =
        `Bot Mod Toggles:
      - Autobop: ${roomBot?.autobop ? 'enabled' : 'disabled'}
      - Song stats: ${readSongStats() ? 'enabled' : 'disabled'}
      - Greet users: ${greetingState.standardEnabled ? 'enabled' : 'disabled'}
      - Info blurb: ${isInfoEnabled() ? 'enabled' : 'disabled'} (tone: ${getTone()})
      - March Madness updates: ${isMadnessUpdatesEnabled() ? 'enabled' : 'disabled'}`

      await post({ room, message: statusMessage })
    },

    bopon: async ({ payload, room, roomBot, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return
      await roomBot.enableAutoBop()
      await post({ room, message: 'Autobop enabled.' })
    },

    bopoff: async ({ payload, room, roomBot, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return
      await roomBot.disableAutoBop()
      await post({ room, message: 'Autobop disabled.' })
    },

    songstatson: async ({ payload, room, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return
      enableSongStatsImpl()
      await post({ room, message: 'Song stats enabled' })
    },

    songstatsoff: async ({ payload, room, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return
      disableSongStatsImpl()
      await post({ room, message: 'Song stats disabled' })
    },

    greet: async ({ payload, room }) => {
      const parts = payload.message.trim().split(/\s+/)
      const sub = (parts[1] || '').toLowerCase()

      if (sub === 'standard') {
        enableGreetingMessagesImpl()
        disableAIGreetingImpl()
        await post({
          room,
          message: '👋 Greeting mode: **STANDARD** (Standard=ON, AI=OFF). Custom greets still take priority.'
        })
        return
      }

      if (sub === 'ai') {
        enableGreetingMessagesImpl()
        enableAIGreetingImpl()
        await post({
          room,
          message: '🧠 Greeting mode: **AI** (AI=ON, Standard=ON as fallback). Custom greets still take priority.'
        })
        return
      }

      if (sub === 'status') {
        const greetingState = getGreetingState()
        await post({
          room,
          message:
            '📊 Greeting status:\n' +
            `• Standard: ${greetingState.standardEnabled ? 'ON' : 'OFF'}\n` +
            `• AI: ${greetingState.aiEnabled ? 'ON' : 'OFF'}\n` +
            'Precedence: custom > AI (if ON) > standard (if ON)'
        })
        return
      }

      if (sub === 'off' || payload.message.toLowerCase() === '/greetoff') {
        disableAIGreetingImpl()
        disableGreetingMessagesImpl()
        await post({
          room,
          message: '🙈 Greeting mode: **OFF** (Standard=OFF, AI=OFF). Custom greets still fire if configured.'
        })
        return
      }

      const greetingState = getGreetingState()
      await post({
        room,
        message:
          'Usage:\n' +
          '• /greet standard — Standard greeting ON, AI OFF\n' +
          '• /greet ai — AI greeting ON (standard kept ON as fallback)\n' +
          '• /greet status — Show current settings\n' +
          '• /greetoff — Turn both OFF\n\n' +
          `Current: Standard=${greetingState.standardEnabled ? 'ON' : 'OFF'}, AI=${greetingState.aiEnabled ? 'ON' : 'OFF'}`
      })
    },

    infoon: async ({ payload, room, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return
      enableInfoImpl()
      await post({ room, message: 'Info blurb enabled.' })
    },

    infooff: async ({ payload, room, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return
      disableInfoImpl()
      await post({ room, message: 'Info blurb disabled.' })
    },

    infotoggle: async ({ payload, room, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return
      if (isInfoEnabled()) {
        disableInfoImpl()
        await post({ room, message: 'Info blurb disabled.' })
        return
      }
      enableInfoImpl()
      await post({ room, message: 'Info blurb enabled.' })
    },

    infotone: async ({ payload, room, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return

      const args = payload.message.trim().split(/\s+/).slice(1)
      const current = getTone()

      if (args.length === 0 || /^(help|\?)$/i.test(args[0] || '')) {
        await post({ room, message: getToneHelpMessage(current) })
        return
      }

      const wanted = normalizeInfoTone(args[0])
      if (!VALID_INFO_TONES.includes(wanted)) {
        await post({ room, message: getInvalidToneMessage(current) })
        return
      }

      if (wanted === current) {
        await post({ room, message: `Info blurb tone is already set to ${current}.` })
        return
      }

      setToneImpl(wanted)
      await post({ room, message: `Info blurb tone set to ${wanted}.` })
    },

    madnessupdates: async ({ payload, room, ttlUserToken }) => {
      if (!await requireModerator(payload, room, ttlUserToken)) return

      const action = String(payload?.message || '').trim().split(/\s+/)[1]?.toLowerCase() || 'status'

      if (action === 'on' || action === 'enable') {
        enableMadnessUpdatesImpl()
        await post({ room, message: 'March Madness live updates enabled.' })
        return
      }

      if (action === 'off' || action === 'disable') {
        disableMadnessUpdatesImpl()
        await post({ room, message: 'March Madness live updates disabled.' })
        return
      }

      await post({
        room,
        message: `March Madness live updates are currently ${isMadnessUpdatesEnabled() ? 'enabled' : 'disabled'}.\nUsage: /madnessupdates <on|off|status>`
      })
    }
  }
}
