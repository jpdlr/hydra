// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatView } from './ChatView'
import type { AgentState } from '@shared/types'

const terminalPaneMock = vi.fn(
  ({ rawOutput, onData, autoFocus }: { rawOutput: string; onData?: (data: string) => void; autoFocus?: boolean }) => (
    <div
      data-testid="terminal-pane"
      data-output={rawOutput}
      data-input-enabled={onData ? 'true' : 'false'}
      data-autofocus={autoFocus ? 'true' : 'false'}
    />
  )
)

vi.mock('../Terminal/TerminalPane', () => ({
  TerminalPane: (props: { rawOutput: string; onData?: (data: string) => void; autoFocus?: boolean }) =>
    terminalPaneMock(props)
}))

vi.mock('../Terminal/FreeTerminalPanel', () => ({
  FreeTerminalPanel: () => <div>free-terminal</div>
}))

vi.mock('./InputBar', () => ({
  InputBar: () => <div>input-bar</div>
}))

vi.mock('../EditorPanel', () => ({
  EditorPanel: () => <div>editor-panel</div>
}))

vi.mock('../EditorPanel/SplitHandle', () => ({
  SplitHandle: () => <div>split-handle</div>
}))

vi.mock('../Header/OpenInButton', () => ({
  OpenInButton: () => <div>open-in</div>
}))

function createAgent(id: string, overrides: Partial<AgentState> = {}): AgentState {
  return {
    id,
    name: `Agent ${id}`,
    projectDir: '/tmp/project',
    provider: 'claude',
    model: 'sonnet',
    yolo: false,
    isManager: false,
    sessionId: null,
    initialPrompt: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'idle',
    pid: null,
    restartCount: 0,
    startedAt: null,
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    workMode: 'local',
    worktreePath: null,
    worktreeBranch: null,
    ...overrides
  }
}

describe('ChatView', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    terminalPaneMock.mockClear()
    window.hydra = {
      ...window.hydra,
      getGitStatus: vi.fn().mockResolvedValue({ branch: 'main', modifiedFiles: [], stagedFiles: [], ahead: 0, behind: 0 })
    }
  })

  it('prioritizes the selected terminal first, then warms running background terminals', async () => {
    const selected = createAgent('agent-a', { status: 'running' })
    const background = createAgent('agent-b', { status: 'running' })
    const idle = createAgent('agent-c', { status: 'idle' })
    const rawOutputs = new Map([
      [selected.id, 'selected output'],
      [background.id, 'background output'],
      [idle.id, 'idle output']
    ])

    render(
      <ChatView
        agents={[selected, background, idle]}
        agent={selected}
        selectedAgentId={selected.id}
        rawOutput={rawOutputs.get(selected.id) ?? ''}
        rawOutputs={rawOutputs}
        onSendInput={vi.fn()}
        onTerminalData={vi.fn()}
        onTerminalResize={vi.fn()}
        onRestartAgent={vi.fn()}
        onToggleYolo={vi.fn()}
        onKillAgent={vi.fn()}
      />
    )

    let panes = screen.getAllByTestId('terminal-pane')
    expect(panes).toHaveLength(1)
    expect(panes[0].getAttribute('data-output')).toBe('selected output')
    expect(panes[0].getAttribute('data-input-enabled')).toBe('true')
    expect(panes[0].getAttribute('data-autofocus')).toBe('true')

    await waitFor(() => {
      expect(screen.getAllByTestId('terminal-pane')).toHaveLength(2)
    })

    panes = screen.getAllByTestId('terminal-pane')
    expect(panes).toHaveLength(2)
    expect(panes[0].getAttribute('data-output')).toBe('selected output')
    expect(panes[0].getAttribute('data-input-enabled')).toBe('true')
    expect(panes[0].getAttribute('data-autofocus')).toBe('true')
    expect(panes[1].getAttribute('data-output')).toBe('background output')
    expect(panes[1].getAttribute('data-input-enabled')).toBe('false')
    expect(panes[1].getAttribute('data-autofocus')).toBe('false')
  })

  it('can transition from no selected agent to a selected agent without crashing hooks', async () => {
    const selected = createAgent('agent-a', { status: 'running' })
    const rawOutputs = new Map([[selected.id, 'selected output']])

    const { rerender } = render(
      <ChatView
        agents={[]}
        agent={null}
        selectedAgentId={null}
        rawOutput=""
        rawOutputs={new Map()}
        onSendInput={vi.fn()}
        onTerminalData={vi.fn()}
        onTerminalResize={vi.fn()}
        onRestartAgent={vi.fn()}
        onToggleYolo={vi.fn()}
        onKillAgent={vi.fn()}
      />
    )

    expect(screen.getByText('No agent selected')).toBeTruthy()

    rerender(
      <ChatView
        agents={[selected]}
        agent={selected}
        selectedAgentId={selected.id}
        rawOutput={rawOutputs.get(selected.id) ?? ''}
        rawOutputs={rawOutputs}
        onSendInput={vi.fn()}
        onTerminalData={vi.fn()}
        onTerminalResize={vi.fn()}
        onRestartAgent={vi.fn()}
        onToggleYolo={vi.fn()}
        onKillAgent={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('terminal-pane').getAttribute('data-output')).toBe('selected output')
    })
  })
})
