import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_CONCURRENT_AGENTS_HARD_LIMIT } from '@shared/types'
import type { ClaudeSessionSummary } from '@shared/types'
import { AgentManager } from './AgentManager'
import type { SessionCatalog } from '../sessions/SessionCatalog'

interface MockPty {
  pid: number
  write: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
  emitData: (data: string) => void
  emitExit: (event: { exitCode: number; signal?: number }) => void
}

const { spawnMock, createdPtys } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  createdPtys: [] as MockPty[]
}))

vi.mock('node-pty', () => ({
  spawn: spawnMock
}))

function makePty(pid: number): MockPty {
  const dataListeners: Array<(data: string) => void> = []
  const exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = []

  return {
    pid,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((callback: (data: string) => void) => {
      dataListeners.push(callback)
    }),
    onExit: vi.fn((callback: (event: { exitCode: number; signal?: number }) => void) => {
      exitListeners.push(callback)
    }),
    emitData: (data: string) => {
      for (const listener of dataListeners) listener(data)
    },
    emitExit: (event: { exitCode: number; signal?: number }) => {
      for (const listener of exitListeners) listener(event)
    }
  }
}

describe('AgentManager', () => {
  const basePayload = {
    name: 'EP',
    projectDir: '/tmp/project',
    provider: 'claude' as const,
    model: 'sonnet',
    yolo: false,
    initialPrompt: ''
  }

  beforeEach(() => {
    createdPtys.length = 0
    spawnMock.mockReset()
    spawnMock.mockImplementation(() => {
      const pty = makePty(1234 + createdPtys.length)
      createdPtys.push(pty)
      return pty
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('splits submitted input into text and delayed carriage return', async () => {
    const manager = new AgentManager()
    const agent = manager.create(basePayload)

    expect(manager.sendInput(agent.id, 'Hi Claude')).toBe(true)
    await vi.advanceTimersByTimeAsync(0)

    const writes = createdPtys[0].write.mock.calls.map((call) => call[0])
    expect(writes).toEqual(['Hi Claude'])

    await vi.advanceTimersByTimeAsync(74)
    const beforeSubmit = createdPtys[0].write.mock.calls.map((call) => call[0])
    expect(beforeSubmit).toEqual(['Hi Claude'])

    await vi.advanceTimersByTimeAsync(1)
    const afterSubmit = createdPtys[0].write.mock.calls.map((call) => call[0])
    expect(afterSubmit).toEqual(['Hi Claude', '\r'])
  })

  it('persists resize dimensions for idle imported sessions before they start', async () => {
    const manager = new AgentManager()
    const importedSession: ClaudeSessionSummary = {
      sessionId: 'session-12345',
      projectPath: '/tmp/imported',
      firstPrompt: 'Resume me',
      messageCount: 10,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T01:00:00.000Z',
      gitBranch: 'main',
      isSidechain: false,
      sourcePath: '/tmp/imported/session-12345.jsonl'
    }

    manager.importSessions([importedSession], 'sonnet')
    const imported = manager.list()[0]
    expect(imported.status).toBe('idle')

    manager.resize(imported.id, 96, 28)
    expect(manager.sendInput(imported.id, 'Start')).toBe(true)
    await vi.advanceTimersByTimeAsync(0)

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock.mock.calls[0][2]).toMatchObject({
      cols: 96,
      rows: 28,
      cwd: '/tmp/imported'
    })
  })

  it('discovers session ids for new interactive agents and exports them for workspace restore', async () => {
    const fakeCatalog = {
      listSessions: vi.fn().mockReturnValue([
        {
          sessionId: 'session-discovered-01',
          projectPath: '/tmp/project',
          firstPrompt: 'Hi Claude',
          messageCount: 4,
          createdAt: '2026-01-01T00:00:00.000Z',
          modifiedAt: new Date().toISOString(),
          gitBranch: 'main',
          isSidechain: false,
          sourcePath: '/tmp/project/session-discovered-01.jsonl'
        } satisfies ClaudeSessionSummary
      ])
    } satisfies Partial<SessionCatalog>

    const manager = new AgentManager(fakeCatalog as unknown as SessionCatalog)
    const created = manager.create({
      ...basePayload,
      initialPrompt: 'Hi Claude'
    })

    await vi.advanceTimersByTimeAsync(0)
    const hydrated = manager.get(created.id)
    expect(hydrated?.sessionId).toBe('session-discovered-01')

    const exported = manager.exportWorkspaceAgents()
    expect(exported).toHaveLength(1)
    expect(exported[0]).toMatchObject({
      id: created.id,
      sessionId: 'session-discovered-01'
    })
  })

  it('ignores stale exit callbacks from replaced PTYs during restart', async () => {
    const manager = new AgentManager()
    const created = manager.create({ ...basePayload, name: 'race-check' })

    expect(createdPtys).toHaveLength(1)
    const firstPty = createdPtys[0]

    const restarted = manager.restart(created.id)
    expect(restarted).not.toBeNull()
    expect(createdPtys).toHaveLength(2)
    const secondPty = createdPtys[1]

    // Simulate the old process exiting after the replacement PTY has started.
    firstPty.emitExit({ exitCode: 137 })

    // New process should remain attached.
    expect(manager.sendInput(created.id, 'still attached')).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(secondPty.write).toHaveBeenCalledWith('still attached')
  })

  it('does not let force-kill timeout terminate a newly restarted PTY', async () => {
    const manager = new AgentManager()
    const created = manager.create({ ...basePayload, name: 'timeout-check' })

    expect(createdPtys).toHaveLength(1)
    const firstPty = createdPtys[0]

    manager.kill(created.id)
    const restarted = manager.restart(created.id)
    expect(restarted).not.toBeNull()
    expect(createdPtys).toHaveLength(2)
    const secondPty = createdPtys[1]

    // Even after the old grace timeout window, the new PTY must stay alive.
    await vi.advanceTimersByTimeAsync(5000)

    expect(firstPty.kill).toHaveBeenCalled()
    expect(secondPty.kill).not.toHaveBeenCalled()
  })

  it('enforces hard cap for concurrently active agents', () => {
    const manager = new AgentManager()

    for (let i = 0; i < MAX_CONCURRENT_AGENTS_HARD_LIMIT; i++) {
      const created = manager.create({
        ...basePayload,
        name: `agent-${i + 1}`
      })
      expect(created.status).toBe('running')
    }

    expect(() =>
      manager.create({
        ...basePayload,
        name: 'agent-over-limit'
      })
    ).toThrow(`Maximum concurrent agents (${MAX_CONCURRENT_AGENTS_HARD_LIMIT}) reached`)
  })

  it('does not auto-start an idle session when active cap is reached', () => {
    const manager = new AgentManager()

    for (let i = 0; i < MAX_CONCURRENT_AGENTS_HARD_LIMIT; i++) {
      manager.create({
        ...basePayload,
        name: `agent-${i + 1}`
      })
    }

    const importedSession: ClaudeSessionSummary = {
      sessionId: 'session-idle-over-cap',
      projectPath: '/tmp/imported',
      firstPrompt: 'Resume me',
      messageCount: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T01:00:00.000Z',
      gitBranch: 'main',
      isSidechain: false,
      sourcePath: '/tmp/imported/session-idle-over-cap.jsonl'
    }
    manager.importSessions([importedSession], 'sonnet')
    const idleImported = manager.list().find((agent) => agent.id.startsWith('sess-'))
    expect(idleImported?.status).toBe('idle')

    const sent = manager.sendInput(idleImported!.id, 'Start please')
    expect(sent).toBe(false)
    expect(spawnMock).toHaveBeenCalledTimes(MAX_CONCURRENT_AGENTS_HARD_LIMIT)
    expect(manager.get(idleImported!.id)?.status).toBe('idle')
  })

  it('allows restart of an existing running agent even when at active cap', () => {
    const manager = new AgentManager()
    const ids: string[] = []
    for (let i = 0; i < MAX_CONCURRENT_AGENTS_HARD_LIMIT; i++) {
      const created = manager.create({
        ...basePayload,
        name: `agent-${i + 1}`
      })
      ids.push(created.id)
    }

    const restarted = manager.restart(ids[0])
    expect(restarted).not.toBeNull()
    expect(spawnMock).toHaveBeenCalledTimes(MAX_CONCURRENT_AGENTS_HARD_LIMIT + 1)
  })

  it('does not transition idle agent to starting when restart is blocked by cap', () => {
    const manager = new AgentManager()
    for (let i = 0; i < MAX_CONCURRENT_AGENTS_HARD_LIMIT; i++) {
      manager.create({
        ...basePayload,
        name: `agent-${i + 1}`
      })
    }

    const importedSession: ClaudeSessionSummary = {
      sessionId: 'session-restart-over-cap',
      projectPath: '/tmp/imported',
      firstPrompt: 'Resume me',
      messageCount: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      modifiedAt: '2026-01-01T01:00:00.000Z',
      gitBranch: 'main',
      isSidechain: false,
      sourcePath: '/tmp/imported/session-restart-over-cap.jsonl'
    }
    manager.importSessions([importedSession], 'sonnet')
    const idleImported = manager.list().find((agent) => agent.id.startsWith('sess-'))
    expect(idleImported?.status).toBe('idle')

    const restarted = manager.restart(idleImported!.id)
    expect(restarted?.status).toBe('idle')
    expect(manager.get(idleImported!.id)?.status).toBe('idle')
    expect(spawnMock).toHaveBeenCalledTimes(MAX_CONCURRENT_AGENTS_HARD_LIMIT)
  })

  it('never exceeds hard cap under repeated spawn attempts', () => {
    const manager = new AgentManager()

    const createdIds: string[] = []
    for (let i = 0; i < MAX_CONCURRENT_AGENTS_HARD_LIMIT; i++) {
      const created = manager.create({
        ...basePayload,
        name: `agent-${i + 1}`
      })
      createdIds.push(created.id)
    }

    for (let i = 0; i < 50; i++) {
      expect(() =>
        manager.create({
          ...basePayload,
          name: `blocked-${i + 1}`
        })
      ).toThrow(`Maximum concurrent agents (${MAX_CONCURRENT_AGENTS_HARD_LIMIT}) reached`)
      expect(manager.activeCount()).toBe(MAX_CONCURRENT_AGENTS_HARD_LIMIT)
    }

    // Free one slot, then verify exactly one new agent can be created.
    const removed = manager.remove(createdIds[0])
    expect(removed).toBe(true)
    expect(manager.activeCount()).toBe(MAX_CONCURRENT_AGENTS_HARD_LIMIT - 1)

    const extra = manager.create({
      ...basePayload,
      name: 'one-more'
    })
    expect(extra.status).toBe('running')
    expect(manager.activeCount()).toBe(MAX_CONCURRENT_AGENTS_HARD_LIMIT)
  })
})
