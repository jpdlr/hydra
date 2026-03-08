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
      selectDirectory: vi.fn().mockResolvedValue(null),
      getMcpServerStatus: vi.fn().mockResolvedValue({
        running: false,
        port: null,
        error: null,
        managerWorkspace: null
      }),
      listProviderModels: vi.fn().mockResolvedValue([]),
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue({ content: '', path: '' }),
      writeFile: vi.fn().mockResolvedValue(true),
      watchDir: vi.fn(),
      unwatchDir: vi.fn(),
      onFsWatchEvent: vi.fn().mockReturnValue(() => undefined),
      renameAgent: vi.fn().mockResolvedValue(null),
      searchFiles: vi.fn().mockResolvedValue([]),
      enableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      disableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      getRemoteControlState: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      onRemoteStateChange: vi.fn().mockReturnValue(() => undefined)
    }
  })

  it('loads existing sessions and submits resume payload', async () => {
    const onSubmit = vi.fn()

    render(
      <NewAgentDialog
        defaultProvider="claude"
        defaultModel="sonnet"
        defaultProjectDir=""
        globalYolo={false}
        onSubmit={onSubmit}
        onClose={() => undefined}
      />
    )

    const nameInput = screen.getByPlaceholderText('Optional — auto-generated from prompt')
    fireEvent.change(nameInput, { target: { value: 'EP inventory' } })

    const resumeCheckbox = screen.getByRole('checkbox', { name: /resume existing claude session/i })
    fireEvent.click(resumeCheckbox)

    await waitFor(
      () => {
        expect(window.hydra.listClaudeSessions).toHaveBeenCalledWith({
          includeHidden: true,
          limit: 2000
        })
      },
      { timeout: 10000 }
    )

    const projectInput = screen.getByPlaceholderText('/path/to/project') as HTMLInputElement
    await waitFor(
      () => {
        expect(projectInput.value).toBe('/Users/jp/projects/ep_inventory')
      },
      { timeout: 10000 }
    )

    fireEvent.click(screen.getByRole('button', { name: 'Create Agent' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'EP inventory',
        projectDir: '/Users/jp/projects/ep_inventory',
        provider: 'claude',
        model: 'sonnet',
        resumeSessionId: 'abc12345'
      })
    )
  }, 15000)
})
