import type { TerminalShellMode } from '@shared/types'

export interface ShellConfig {
  mode: TerminalShellMode
  /** Absolute path to a custom shell. Only used when mode === 'custom'. */
  path: string
  /** Whitespace-separated shell args. E.g. "-lc". Empty means use defaults for the chosen shell. */
  args: string
}

export interface SpawnSpec {
  cmd: string
  args: string[]
}

/**
 * Quote a single argv element for POSIX sh.
 * Wraps in single quotes and escapes embedded single quotes.
 */
function shPosixQuote(value: string): string {
  if (value === '') return "''"
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Quote a single argv element for PowerShell (single-quoted literal).
 */
function pwshQuote(value: string): string {
  return `'${value.replace(/'/g, `''`)}'`
}

/**
 * Parse whitespace-separated shell args into an array. Very intentionally
 * simple — users who need quoting can use "custom" mode with a wrapper script.
 */
function splitArgs(input: string): string[] {
  const trimmed = input.trim()
  if (!trimmed) return []
  return trimmed.split(/\s+/)
}

function buildPosixCommandString(cmd: string, args: string[]): string {
  return [cmd, ...args].map(shPosixQuote).join(' ')
}

function buildPwshCommandString(cmd: string, args: string[]): string {
  // `& 'cmd' 'arg1' 'arg2'` — call operator so paths with spaces work.
  return `& ${pwshQuote(cmd)} ${args.map(pwshQuote).join(' ')}`
}

function resolveAutoMode(platform: NodeJS.Platform): TerminalShellMode {
  return platform === 'win32' ? 'direct' : 'login'
}

function defaultLoginShell(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): {
  cmd: string
  args: string[]
  style: 'posix' | 'pwsh'
} {
  if (platform === 'win32') {
    const shell = env.PWSH || 'powershell.exe'
    return { cmd: shell, args: ['-NoLogo', '-NoProfile', '-Command'], style: 'pwsh' }
  }
  const shell = env.SHELL || '/bin/bash'
  return { cmd: shell, args: ['-lc'], style: 'posix' }
}

/**
 * Wrap a raw command invocation through a user-selectable shell so that login
 * rc files (PATH, nvm, rbenv, etc.) are picked up. This fixes a class of
 * "command not found" failures on Arch/CachyOS/NixOS and other distros that
 * populate PATH via the shell profile rather than the system-wide environment
 * Electron inherits at launch.
 */
export function wrapWithShell(
  spec: SpawnSpec,
  config: ShellConfig,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): SpawnSpec {
  const mode = config.mode === 'auto' ? resolveAutoMode(platform) : config.mode
  if (mode === 'direct') return spec

  if (mode === 'custom') {
    if (!config.path) return spec
    const style: 'posix' | 'pwsh' = platform === 'win32' ? 'pwsh' : 'posix'
    const shellArgs = splitArgs(config.args || (style === 'pwsh' ? '-Command' : '-lc'))
    const commandString =
      style === 'pwsh'
        ? buildPwshCommandString(spec.cmd, spec.args)
        : buildPosixCommandString(spec.cmd, spec.args)
    return { cmd: config.path, args: [...shellArgs, commandString] }
  }

  // mode === 'login'
  const defaults = defaultLoginShell(platform, env)
  const shellArgs = config.args ? splitArgs(config.args) : defaults.args
  const commandString =
    defaults.style === 'pwsh'
      ? buildPwshCommandString(spec.cmd, spec.args)
      : buildPosixCommandString(spec.cmd, spec.args)
  return { cmd: defaults.cmd, args: [...shellArgs, commandString] }
}
