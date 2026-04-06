// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InputBar } from './InputBar'
import type { SkillScanResult } from '@shared/types'

const mockSkills: SkillScanResult = {
  claude: [
    {
      id: 'brainstorming',
      name: 'Brainstorming',
      description: 'Creative ideation support',
      provider: 'claude',
      group: 'user',
      enabled: true,
      path: '/tmp/brainstorming/SKILL.md'
    }
  ],
  codex: [
    {
      id: 'commit',
      name: 'Commit',
      description: 'Generate commit messages',
      provider: 'codex',
      group: 'user',
      enabled: true,
      path: '/tmp/commit/SKILL.md'
    }
  ],
  opencode: [],
  scannedAt: '2026-03-23T00:00:00.000Z'
}

describe('InputBar', () => {
  beforeEach(() => {
    window.hydra = {
      ...window.hydra,
      listProviderModels: vi.fn().mockResolvedValue([]),
      scanSkills: vi.fn().mockResolvedValue(mockSkills)
    } as any
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a filtered slash menu for provider commands', async () => {
    render(
      <InputBar
        onSend={() => undefined}
        provider="codex"
        model="gpt-5.4"
      />
    )

    const input = screen.getByPlaceholderText('Send a message...') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '/mo', selectionStart: 3 } })

    await waitFor(() => {
      expect(screen.getByText('model')).toBeTruthy()
      expect(screen.queryByText('Commit')).toBeNull()
    })
  })

  it('inserts a skill prompt when selecting a slash skill item', async () => {
    render(
      <InputBar
        onSend={() => undefined}
        provider="codex"
        model="gpt-5.4"
      />
    )

    const input = screen.getByPlaceholderText('Send a message...') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '/com', selectionStart: 4 } })

    await waitFor(() => {
      expect(screen.getByText('Commit')).toBeTruthy()
    })

    fireEvent.click(screen.getByText('Commit'))

    expect(input.value).toBe('Use the "Commit" skill for this task. ')
  })

  it('cycles through previous prompts with arrow up and arrow down', async () => {
    const onSend = vi.fn()

    render(
      <InputBar
        onSend={onSend}
        provider="codex"
        model="gpt-5.4"
      />
    )

    const input = screen.getByPlaceholderText('Send a message...') as HTMLTextAreaElement

    fireEvent.change(input, { target: { value: 'first prompt', selectionStart: 12 } })
    fireEvent.keyDown(input, { key: 'Enter' })

    fireEvent.change(input, { target: { value: 'second prompt', selectionStart: 13 } })
    fireEvent.keyDown(input, { key: 'Enter' })

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('second prompt')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('first prompt')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('second prompt')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('')
  })
})
