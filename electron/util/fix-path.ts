/**
 * Fix process.env.PATH for packaged macOS Electron apps.
 *
 * When launched from Finder / Dock, macOS gives Electron a minimal PATH
 * (/usr/bin:/bin:/usr/sbin:/sbin) that does not include user-installed
 * binaries like ~/.local/bin/claude.  This function runs the user's
 * login shell once, extracts the full PATH, and patches process.env.
 */

import { execSync } from 'child_process'

export function fixPath(): void {
  if (process.platform !== 'darwin') return

  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const result = execSync(`${shell} -ilc 'echo -n "__PATH__=$PATH"'`, {
      encoding: 'utf-8',
      timeout: 5000
    })

    const match = result.match(/__PATH__=(.+)/)
    if (match?.[1]) {
      process.env.PATH = match[1]
    }
  } catch {
    // Fallback: append common binary locations
    const extra = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      `${process.env.HOME}/.local/bin`,
      `${process.env.HOME}/.nvm/versions/node/current/bin`
    ].join(':')
    process.env.PATH = `${process.env.PATH}:${extra}`
  }
}
