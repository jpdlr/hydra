import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    const agent = manager.create({
      name: 'EP',
      projectDir: '/tmp/project',
      provider: 'claude',
      model: 'sonnet',
      yolo: false,
      initialPrompt: ''
    })

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
      name: 'EP',
      projectDir: '/tmp/project',
      provider: 'claude',
      model: 'sonnet',
      yolo: false,
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
    const created = manager.create({
      name: 'race-check',
      projectDir: '/tmp/project',
      provider: 'claude',
      model: 'sonnet',
      yolo: false,
      initialPrompt: ''
    })

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
    const created = manager.create({
      name: 'timeout-check',
      projectDir: '/tmp/project',
      provider: 'claude',
      model: 'sonnet',
      yolo: false,
      initialPrompt: ''
    })

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
})
