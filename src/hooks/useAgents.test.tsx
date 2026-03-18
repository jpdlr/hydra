// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgents } from './useAgents'
import type {
  AgentOutputPayload,
  AgentState,
  AgentStatusPayload,
  CreateAgentPayload
} from '@shared/types'

function makeAgent(id: string, overrides: Partial<AgentState> = {}): AgentState {
  return {
    id,
    name: 'Agent',
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

describe('useAgents', () => {
  let outputHandler: ((payload: AgentOutputPayload) => void) | null
  let statusHandler: ((payload: AgentStatusPayload) => void) | null

  const listAgents = vi.fn<() => Promise<AgentState[]>>()
  const getAgentBuffer = vi.fn<(agentId: string) => Promise<string[]>>()
  const createAgent = vi.fn<(payload: CreateAgentPayload) => Promise<AgentState>>()
  const restartAgent = vi.fn<(agentId: string) => Promise<AgentState | null>>()

  beforeEach(() => {
    outputHandler = null
    statusHandler = null
    vi.clearAllMocks()

    listAgents.mockResolvedValue([])
    getAgentBuffer.mockResolvedValue([])
    createAgent.mockResolvedValue(makeAgent('new-agent', { status: 'running' }))
    restartAgent.mockResolvedValue(makeAgent('agent-1', { status: 'running', restartCount: 1 }))

    window.hydra = {
      ...window.hydra,
      listAgents,
      getAgentBuffer,
      createAgent,
      restartAgent,
      killAgent: vi.fn().mockResolvedValue(true),
      removeAgent: vi.fn().mockResolvedValue(true),
      toggleYolo: vi.fn().mockResolvedValue(null),
      renameAgent: vi.fn().mockResolvedValue(null),
      setAgentModel: vi.fn().mockResolvedValue(null),
      sendInput: vi.fn(),
      sendRawInput: vi.fn(),
      resizeAgent: vi.fn(),
      broadcast: vi.fn().mockResolvedValue([]),
      onAgentOutput: vi.fn().mockImplementation((cb: (payload: AgentOutputPayload) => void) => {
        outputHandler = cb
        return () => undefined
      }),
      onAgentStatus: vi.fn().mockImplementation((cb: (payload: AgentStatusPayload) => void) => {
        statusHandler = cb
        return () => undefined
      })
    } as typeof window.hydra
  })

  it('preserves output that arrives before restart resolves', async () => {
    listAgents.mockResolvedValue([makeAgent('agent-1', { status: 'idle' })])
    getAgentBuffer.mockResolvedValue([])

    let resolveRestart: ((state: AgentState) => void) | null = null
    restartAgent.mockImplementation(
      () =>
        new Promise<AgentState>((resolve) => {
          resolveRestart = resolve
        })
    )

    const { result } = renderHook(() => useAgents('agent-1'))

    await waitFor(() => {
      expect(result.current.agentList.length).toBe(1)
    })

    let restartPromise: Promise<void> | null = null
    act(() => {
      restartPromise = result.current.restartAgent('agent-1')
    })

    act(() => {
      outputHandler?.({ agentId: 'agent-1', data: 'boot output' })
      statusHandler?.({ agentId: 'agent-1', status: 'running', sessionId: null })
    })

    await act(async () => {
      resolveRestart?.(makeAgent('agent-1', { status: 'running', restartCount: 1 }))
      await restartPromise
    })

    await waitFor(() => {
      expect(result.current.agents.get('agent-1')?.rawOutput).toContain('boot output')
    })
  })

  it('backfills terminal output after create from daemon buffer', async () => {
    const created = makeAgent('created-1', { status: 'running' })
    createAgent.mockResolvedValue(created)
    getAgentBuffer.mockImplementation(async (agentId: string) =>
      agentId === created.id ? ['line one\nline two'] : []
    )

    const { result } = renderHook(() => useAgents())

    await act(async () => {
      await result.current.createAgent({
        name: 'Created',
        projectDir: '/tmp/project',
        provider: 'claude',
        model: 'sonnet',
        yolo: false,
        initialPrompt: '',
        resumeSessionId: null
      })
    })

    expect(result.current.agents.get(created.id)?.rawOutput).toBe('line one\nline two')
  })
})
