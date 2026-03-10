import { postMessage } from '../libs/cometchat.js'
import { handleSlotsCommand } from './slots.js'
import { createSlotsRegistryHandler as createSlotsRegistryHandlerBase } from './handlerFactories.js'

export function buildSlotsInfoMessage () {
  return [
    '🎰 Slots Commands',
    '- `/slots <bet>` play a spin (default bet is 1)',
    '- `/slots bonus` spin bonus mode (when active)',
    '- `/slots free` spin free mode (when active)',
    '- `/slots stats` show jackpot contribution stats',
    '- `/slots effective` (or `/slots eff`) show active contribution/share',
    '- `/slots lifetime` (or `/slots life`) show lifetime contribution',
    '- `/jackpot` show the current jackpot'
  ].join('\n')
}

export function createSlotsRegistryHandler (deps = {}) {
  return createSlotsRegistryHandlerBase({
    postMessage,
    handleSlotsCommand,
    buildSlotsInfoMessage,
    ...deps
  })
}
