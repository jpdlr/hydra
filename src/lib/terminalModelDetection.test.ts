import { describe, expect, it } from 'vitest'
import { detectLatestModelFromTerminalOutput } from '@shared/terminalModelDetection'

describe('detectLatestModelFromTerminalOutput', () => {
  it('detects codex model changes from terminal output', () => {
    expect(detectLatestModelFromTerminalOutput('codex', 'Model changed to gpt-5.4 high')).toBe('gpt-5.4')
  })

  it('ignores unrelated claude terminal text', () => {
    expect(detectLatestModelFromTerminalOutput('claude', 'Checking for updates...')).toBeNull()
  })

  it('maps claude family names to hydra model ids', () => {
    expect(detectLatestModelFromTerminalOutput('claude', 'Opus 4.6 | session stats')).toBe('opus')
  })
})
