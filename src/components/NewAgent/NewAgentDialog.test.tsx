// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeSessionSummary } from '@shared/types'
import { NewAgentDialog } from './NewAgentDialog'

describe('NewAgentDialog', () => {
  beforeEach(() => {
    const sessions: ClaudeSessionSummary[] = [
      {
        sessionId: 'abc12345',
        projectPath: '/Users/jp/projects/ep_inventory',
        firstPrompt: 'Fix grid scaling',
        messageCount: 12,
        createdAt: '2026-01-01T10:00:00.000Z',
        modifiedAt: '2026-01-03T08:30:00.000Z',
        gitBranch: 'main',
        isSidechain: false,
        sourcePath: '/tmp/abc12345.jsonl'
      }
    ]

    window.hydra = {
      ...window.hydra,
      listClaudeSessions: vi.fn().mockResolvedValue(sessions),
      selectDirectory: vi.fn().mockResolvedValue(null)
    }
  })

  it('loads existing sessions and submits resume payload', async () => {
    const onSubmit = vi.fn()

    render(
      <NewAgentDialog
        defaultModel="sonnet"
        defaultProjectDir=""
        globalYolo={false}
        onSubmit={onSubmit}
        onClose={() => undefined}
      />
    )

    const nameInput = screen.getByPlaceholderText('Auth Module')
    fireEvent.change(nameInput, { target: { value: 'EP inventory' } })

    const resumeLabel = screen.getByText('Resume existing Claude session').closest('label')
    const resumeCheckbox = resumeLabel?.querySelector('input') as HTMLInputElement
    fireEvent.click(resumeCheckbox)

    await waitFor(() => {
      expect(window.hydra.listClaudeSessions).toHaveBeenCalledWith({
        includeHidden: true,
        limit: 2000
      })
    })

    const projectInput = screen.getByPlaceholderText('/path/to/project') as HTMLInputElement
    await waitFor(() => {
      expect(projectInput.value).toBe('/Users/jp/projects/ep_inventory')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Create Agent' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'EP inventory',
        projectDir: '/Users/jp/projects/ep_inventory',
        model: 'sonnet',
        resumeSessionId: 'abc12345'
      })
    )
  })
})
