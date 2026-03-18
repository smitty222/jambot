import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('site index does not hardcode the dev API origin override', () => {
  const html = fs.readFileSync('site/index.html', 'utf8')

  assert.doesNotMatch(html, /jamflow-site-api-dev\.jamflowbot\.workers\.dev/)
  assert.doesNotMatch(html, /window\.JJ_API_ORIGIN/)
})
