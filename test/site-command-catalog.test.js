import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  PUBLIC_SITE_COMMAND_GROUPS,
  MOD_SITE_COMMAND_GROUPS
} from '../src/handlers/siteCommandCatalog.js'

test('site command JSON matches the public catalog source', () => {
  const json = JSON.parse(fs.readFileSync('site/commands.public.json', 'utf8'))

  assert.deepEqual(json, PUBLIC_SITE_COMMAND_GROUPS)
  assert.match(JSON.stringify(json), /\/commands crypto/)
  assert.match(JSON.stringify(json), /\/crypto portfolio/)
  assert.match(JSON.stringify(json), /\/f1help/)
})

test('site command JSON matches the moderator catalog source', () => {
  const json = JSON.parse(fs.readFileSync('site/commands.mod.json', 'utf8'))

  assert.deepEqual(json, MOD_SITE_COMMAND_GROUPS)
  assert.match(JSON.stringify(json), /\/commands mod/)
  assert.match(JSON.stringify(json), /\/addDJ discover/)
})
