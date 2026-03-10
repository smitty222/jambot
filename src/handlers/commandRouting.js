function normalizeImplicitAlias(rawCmd, hasKnownCommand) {
  if (hasKnownCommand(rawCmd)) return rawCmd
  if (rawCmd.startsWith('songreview')) return 'songreview'
  if (rawCmd.startsWith('albumreview')) return 'albumreview'
  if (rawCmd.startsWith('review')) return 'review'
  if (rawCmd === 'q+' || rawCmd === 'q-') return rawCmd
  return rawCmd
}

export function resolveDispatchCommand (txt, knownCommands = null) {
  if (!txt || txt[0] !== '/') return null

  const parts = txt.trim().substring(1).split(/\s+/)
  const rawCmd = (parts[0] || '').toLowerCase()
  const hasKnownCommand = typeof knownCommands?.has === 'function'
    ? (candidate) => knownCommands.has(candidate)
    : () => false

  return {
    parts,
    rawCmd,
    cmd: normalizeImplicitAlias(rawCmd, hasKnownCommand),
    args: parts.slice(1).join(' ')
  }
}
