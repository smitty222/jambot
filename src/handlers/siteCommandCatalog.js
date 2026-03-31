import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const dir = dirname(fileURLToPath(import.meta.url))

export const PUBLIC_SITE_COMMAND_GROUPS = JSON.parse(
  readFileSync(join(dir, '../../site/commands.public.json'), 'utf8')
)

export const MOD_SITE_COMMAND_GROUPS = JSON.parse(
  readFileSync(join(dir, '../../site/commands.mod.json'), 'utf8')
)
