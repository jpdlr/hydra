import { describe, expect, it } from 'vitest'
import { wrapWithShell, type ShellConfig } from './shellWrapper'

const spec = { cmd: '/usr/local/bin/claude', args: ['--yolo', 'hello world'] }

function cfg(partial: Partial<ShellConfig>): ShellConfig {
  return { mode: 'auto', path: '', args: '', ...partial }
}

describe('wrapWithShell', () => {
  it('direct mode passes the command through unchanged', () => {
    const out = wrapWithShell(spec, cfg({ mode: 'direct' }), 'darwin')
    expect(out).toEqual(spec)
  })

  it('auto mode on posix wraps through the user login shell', () => {
    const out = wrapWithShell(spec, cfg({ mode: 'auto' }), 'linux', { SHELL: '/bin/zsh' })
    expect(out.cmd).toBe('/bin/zsh')
    expect(out.args[0]).toBe('-lc')
    expect(out.args[1]).toContain('/usr/local/bin/claude')
    expect(out.args[1]).toContain("'hello world'")
  })

  it('auto mode on windows stays direct (preserves cmd.exe fallback)', () => {
    const out = wrapWithShell(spec, cfg({ mode: 'auto' }), 'win32')
    expect(out).toEqual(spec)
  })

  it('login mode falls back to /bin/bash when $SHELL is unset', () => {
    const out = wrapWithShell(spec, cfg({ mode: 'login' }), 'linux', {})
    expect(out.cmd).toBe('/bin/bash')
    expect(out.args[0]).toBe('-lc')
  })

  it('login mode on windows uses powershell with -Command', () => {
    const out = wrapWithShell(spec, cfg({ mode: 'login' }), 'win32', {})
    expect(out.cmd).toMatch(/powershell/i)
    expect(out.args).toContain('-Command')
    expect(out.args.join(' ')).toContain("'/usr/local/bin/claude'")
  })

  it('custom mode uses the provided shell path and args', () => {
    const out = wrapWithShell(
      spec,
      cfg({ mode: 'custom', path: '/usr/bin/fish', args: '-lc' }),
      'linux',
      {}
    )
    expect(out.cmd).toBe('/usr/bin/fish')
    expect(out.args[0]).toBe('-lc')
    expect(out.args[1]).toContain('/usr/local/bin/claude')
  })

  it('custom mode with empty path is ignored (no wrapping)', () => {
    const out = wrapWithShell(spec, cfg({ mode: 'custom', path: '' }), 'linux', {})
    expect(out).toEqual(spec)
  })

  it('quotes args containing single quotes safely for posix', () => {
    const tricky = { cmd: 'echo', args: ["it's tricky"] }
    const out = wrapWithShell(tricky, cfg({ mode: 'login' }), 'linux', { SHELL: '/bin/bash' })
    // Argument must be wrapped with escaped inner quote so sh sees a single token.
    expect(out.args[1]).toContain(`'it'\\''s tricky'`)
  })
})
