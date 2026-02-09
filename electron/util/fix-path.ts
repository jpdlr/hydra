/**
 * Fix process.env.PATH for packaged Electron apps.
 *
 * - macOS: Finder / Dock launches provide a minimal PATH, so we source the
 *   login shell and fall back to common binary locations.
 * - Windows: append common global npm / Node install locations used by CLI tools.
 */

import { execSync } from 'child_process'
import { delimiter, join } from 'path'

function appendPathEntries(entries: Array<string | null | undefined>): void {
  const current = process.env.PATH ?? ''
  const existing = new Set(current.split(delimiter).filter((entry) => entry.length > 0))
  const merged = [...existing]

  for (const entry of entries) {
    if (!entry || entry.length === 0 || existing.has(entry)) continue
    existing.add(entry)
    merged.push(entry)
  }

  process.env.PATH = merged.join(delimiter)
}

export function fixPath(): void {
  if (process.platform === 'win32') {
    const userHome = process.env.USERPROFILE || process.env.HOME
    appendPathEntries([
      process.env.APPDATA ? join(process.env.APPDATA, 'npm') : null,
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs', 'nodejs') : null,
      userHome ? join(userHome, '.local', 'bin') : null
    ])
    return
  }

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
    const home = process.env.HOME
    appendPathEntries([
      '/usr/local/bin',
      '/opt/homebrew/bin',
      home ? `${home}/.local/bin` : null,
      home ? `${home}/.nvm/versions/node/current/bin` : null
    ])
  }
}
