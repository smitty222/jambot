#!/usr/bin/env node

import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

function logSection (title) {
  console.log(`\n== ${title} ==`)
}

function safeRequire (id) {
  try {
    return require(id)
  } catch (error) {
    return { error }
  }
}

function findFirstExisting (paths) {
  for (const candidate of paths) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return null
}

const betterSqlitePkgPath = (() => {
  try {
    return require.resolve('better-sqlite3/package.json')
  } catch {
    return null
  }
})()

const betterSqliteRoot = betterSqlitePkgPath ? path.dirname(betterSqlitePkgPath) : null
const abi = process.versions.modules
const nodeVersion = process.version
const platform = process.platform
const arch = process.arch
const pythonCandidates = [
  process.env.PYTHON,
  '/Library/Developer/CommandLineTools/usr/bin/python3',
  '/usr/bin/python3',
  '/opt/homebrew/bin/python3',
  '/usr/local/bin/python3'
]
const pythonPath = findFirstExisting(pythonCandidates)
const bindingCandidates = betterSqliteRoot
  ? [
      path.join(betterSqliteRoot, 'build', 'Release', 'better_sqlite3.node'),
      path.join(betterSqliteRoot, 'build', 'Debug', 'better_sqlite3.node'),
      path.join(betterSqliteRoot, 'lib', 'binding', `node-v${abi}-${platform}-${arch}`, 'better_sqlite3.node')
    ]
  : []
const bindingPath = findFirstExisting(bindingCandidates)
const nodeHeadersDir = findFirstExisting([
  path.join(process.execPath, '..', '..', 'include', 'node'),
  '/usr/local/include/node',
  '/opt/homebrew/include/node'
])

logSection('Environment')
console.log(`repo: ${repoRoot}`)
console.log(`node: ${nodeVersion}`)
console.log(`abi: ${abi}`)
console.log(`platform: ${platform}`)
console.log(`arch: ${arch}`)
console.log(`python: ${pythonPath || 'not found'}`)
console.log(`node headers: ${nodeHeadersDir || 'not found'}`)
console.log(`path has spaces: ${repoRoot.includes(' ') ? 'yes' : 'no'}`)

logSection('better-sqlite3')
if (!betterSqliteRoot) {
  console.log('better-sqlite3 is not installed in node_modules.')
} else {
  console.log(`package: ${betterSqliteRoot}`)
  console.log(`binding: ${bindingPath || 'not found'}`)
}

const runtimeLoad = safeRequire('better-sqlite3')
if (runtimeLoad?.error) {
  console.log(`runtime load: failed (${runtimeLoad.error.message})`)
} else {
  console.log('runtime load: ok')
}

logSection('Recommended steps')

const steps = []

if (repoRoot.includes(' ')) {
  steps.push('Use a clone or symlink path without spaces before rebuilding native modules.')
}

if (platform === 'darwin') {
  steps.push('Install Xcode Command Line Tools if needed: xcode-select --install')
}

if (!pythonPath) {
  steps.push('Install Python 3 and set PYTHON=/path/to/python3 before rebuilding.')
}

if (!nodeHeadersDir) {
  steps.push('Install Node 20 headers or a standard Node 20 distribution before rebuilding.')
}

steps.push('Ensure you are on Node 20.x for this repo.')
steps.push('Run npm install after switching Node versions.')

if (platform === 'darwin') {
  steps.push('If npm rebuild still fails, try: PYTHON=/Library/Developer/CommandLineTools/usr/bin/python3 npm rebuild better-sqlite3 --build-from-source')
}

if (repoRoot.includes(' ')) {
  steps.push('From a space-free path, rerun: npm rebuild better-sqlite3 --build-from-source')
}

for (const step of steps) {
  console.log(`- ${step}`)
}

logSection('Suggested test commands')
console.log('- npm run test:portable')
console.log('- npm run test:db')

