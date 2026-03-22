import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KEYBINDINGS,
  mergeKeybindingsWithDefaults,
  matchKeybindingEvent
} from '@shared/keybindings'

describe('keybindings', () => {
  it('merges partial overrides onto defaults', () => {
    const merged = mergeKeybindingsWithDefaults([
      { command: 'new-agent', keys: 'mod+shift+n' }
    ])

    expect(merged.find((binding) => binding.command === 'new-agent')?.keys).toBe('mod+shift+n')
    expect(merged.find((binding) => binding.command === 'toggle-view')?.keys).toBe('mod+\\')
  })

  it('matches ranged shortcuts and returns the pressed digit', () => {
    const match = matchKeybindingEvent(
      {
        key: '3',
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: false
      },
      DEFAULT_KEYBINDINGS,
      true
    )

    expect(match).toEqual({ command: 'switch-agent-by-index', argument: '3' })
  })
})
