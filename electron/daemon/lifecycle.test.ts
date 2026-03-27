import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import type { DaemonLockData } from './lock'

interface MockChildProcess {
  unref: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  emitError: (error: Error) => void
  emitExit: (code: number | null) => void
}

const mockState = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  openSyncMock: vi.fn(),
  closeSyncMock: vi.fn(),
  readLockFileMock: vi.fn(),
  removeLockFileMock: vi.fn(),
  connectMock: vi.fn(),
  healthMock: vi.fn(),
  shutdownMock: vi.fn(),
  daemonClientConstructedSockets: [] as string[]
}))

vi.mock('child_process', () => ({
  spawn: mockState.spawnMock
}))

vi.mock('fs', () => ({
  openSync: mockState.openSyncMock,
  closeSync: mockState.closeSyncMock
}))

vi.mock('./lock', () => ({
  readLockFile: mockState.readLockFileMock,
  removeLockFile: mockState.removeLockFileMock
}))

vi.mock('./DaemonClient', () => ({
  DaemonClient: class MockDaemonClient {
    constructor(public readonly socketPath: string) {
      mockState.daemonClientConstructedSockets.push(socketPath)
    }
    connect(): Promise<void> {
      return mockState.connectMock(this.socketPath)
    }
    health(): Promise<void> {
      return mockState.healthMock(this.socketPath)
    }
    shutdown(): Promise<void> {
      return mockState.shutdownMock(this.socketPath)
    }
  }
}))

function buildChildProcessMock(): MockChildProcess {
  const emitter = new EventEmitter()
  const child: MockChildProcess = {
    unref: vi.fn(),
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      emitter.on(event, callback)
      return child
    }),
    emitError: (error: Error) => {
      emitter.emit('error', error)
    },
    emitExit: (code: number | null) => {
      emitter.emit('exit', code)
    }
  }
  return child
}

describe('daemon lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-28T00:00:00.000Z'))

    mockState.spawnMock.mockReset()
    mockState.openSyncMock.mockReset()
    mockState.closeSyncMock.mockReset()
    mockState.readLockFileMock.mockReset()
    mockState.removeLockFileMock.mockReset()
    mockState.connectMock.mockReset()
    mockState.healthMock.mockReset()
    mockState.shutdownMock.mockReset()
    mockState.daemonClientConstructedSockets.length = 0

    mockState.spawnMock.mockImplementation(() => buildChildProcessMock())
    mockState.openSyncMock.mockReturnValue(99)
    mockState.readLockFileMock.mockReturnValue(null)
    mockState.connectMock.mockResolvedValue(undefined)
    mockState.healthMock.mockResolvedValue(undefined)
    mockState.shutdownMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('builds daemon paths from userDataPath', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    const { getDaemonPaths } = await import('./lifecycle')
    const paths = getDaemonPaths('/tmp/hydra-user-data')
    expect(paths).toEqual({
      socketPath: '/tmp/hydra-user-data/daemon.sock',
      lockPath: '/tmp/hydra-user-data/daemon.lock',
      logPath: '/tmp/hydra-user-data/daemon.log',
      userDataPath: '/tmp/hydra-user-data'
    })
  })

  it('uses named pipe socket path on Windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    const { getDaemonPaths } = await import('./lifecycle')
    const paths = getDaemonPaths('C:\\Users\\user\\AppData\\Roaming\\hydra')
    expect(paths.socketPath).toBe(
      '\\\\.\\pipe\\hydra-daemon-C__Users_user_AppData_Roaming_hydra'
    )
    expect(paths.lockPath).toBe('C:\\Users\\user\\AppData\\Roaming\\hydra\\daemon.lock')
  })

  it('connects to existing daemon when lock file is healthy', async () => {
    const lock: DaemonLockData = {
      pid: 1234,
      socketPath: '/tmp/existing.sock',
      startedAt: '2026-02-28T00:00:00.000Z'
    }
    mockState.readLockFileMock.mockReturnValue(lock)

    const { ensureDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: '/tmp/fallback.sock',
      lockPath: '/tmp/daemon.lock',
      logPath: '/tmp/daemon.log',
      userDataPath: '/tmp'
    }

    await expect(ensureDaemon(paths)).resolves.toBeDefined()
    expect(mockState.connectMock).toHaveBeenCalledTimes(1)
    expect(mockState.connectMock).toHaveBeenCalledWith('/tmp/existing.sock')
    expect(mockState.spawnMock).not.toHaveBeenCalled()
    expect(mockState.removeLockFileMock).not.toHaveBeenCalled()
  })

  it('respawns daemon when lock file is stale and sets node-mode env flag', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')

    const lock: DaemonLockData = {
      pid: 2222,
      socketPath: '/tmp/stale.sock',
      startedAt: '2026-02-28T00:00:00.000Z'
    }
    mockState.readLockFileMock.mockReturnValue(lock)
    mockState.connectMock
      .mockRejectedValueOnce(new Error('stale daemon'))
      .mockResolvedValueOnce(undefined)

    const { ensureDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: '/tmp/new.sock',
      lockPath: '/tmp/daemon.lock',
      logPath: '/tmp/hydra/daemon.log',
      userDataPath: '/tmp/hydra'
    }

    const pending = ensureDaemon(paths)
    await vi.advanceTimersByTimeAsync(300)
    await expect(pending).resolves.toBeDefined()

    expect(mockState.removeLockFileMock).toHaveBeenCalledWith('/tmp/daemon.lock')
    expect(mockState.spawnMock).toHaveBeenCalledTimes(1)

    const spawnCall = mockState.spawnMock.mock.calls[0]
    expect(spawnCall[0]).toBe(process.execPath)
    expect(spawnCall[1]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/daemon\.js$/),
        '--socket-path',
        '/tmp/new.sock',
        '--user-data',
        '/tmp/hydra'
      ])
    )
    expect(spawnCall[2]).toMatchObject({
      detached: true,
      stdio: 'ignore',
      env: expect.objectContaining({
        ELECTRON_RUN_AS_NODE: '1'
      })
    })
  })

  it('captures daemon stdout and stderr to a log file on windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')

    const { ensureDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: 'C:\\Hydra\\daemon.sock',
      lockPath: 'C:\\Hydra\\daemon.lock',
      logPath: 'C:\\Hydra\\daemon.log',
      userDataPath: 'C:\\Hydra'
    }

    const pending = ensureDaemon(paths)
    await vi.advanceTimersByTimeAsync(300)
    await expect(pending).resolves.toBeDefined()

    expect(mockState.openSyncMock).toHaveBeenCalledWith('C:\\Hydra\\daemon.log', 'a')
    expect(mockState.closeSyncMock).toHaveBeenCalledWith(99)
    expect(mockState.spawnMock.mock.calls[0][2]).toMatchObject({
      stdio: ['ignore', 99, 99]
    })
  })

  it('throws when spawned daemon never becomes connectable', async () => {
    mockState.connectMock.mockRejectedValue(new Error('still down'))

    const { ensureDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: '/tmp/new.sock',
      lockPath: '/tmp/daemon.lock',
      logPath: '/tmp/hydra/daemon.log',
      userDataPath: '/tmp/hydra'
    }

    const pending = expect(ensureDaemon(paths)).rejects.toThrow(
      'Daemon failed to start within timeout'
    )
    await vi.advanceTimersByTimeAsync(11_000)
    await pending
    expect(mockState.spawnMock).toHaveBeenCalledTimes(1)
  })

  it('rejects when daemon child process emits spawn error', async () => {
    const failingChild = buildChildProcessMock()
    mockState.spawnMock.mockReturnValue(failingChild)

    const { ensureDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: '/tmp/new.sock',
      lockPath: '/tmp/daemon.lock',
      logPath: '/tmp/hydra/daemon.log',
      userDataPath: '/tmp/hydra'
    }

    const pending = expect(ensureDaemon(paths)).rejects.toThrow(
      'Failed to spawn daemon: spawn failed'
    )
    failingChild.emitError(new Error('spawn failed'))
    await pending
  })

  it('rejects immediately when daemon exits before startup grace period', async () => {
    const crashingChild = buildChildProcessMock()
    mockState.spawnMock.mockReturnValue(crashingChild)

    const { ensureDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: '/tmp/new.sock',
      lockPath: '/tmp/daemon.lock',
      logPath: '/tmp/hydra/daemon.log',
      userDataPath: '/tmp/hydra'
    }

    const pending = expect(ensureDaemon(paths)).rejects.toThrow(
      'Daemon exited immediately with code 1'
    )
    crashingChild.emitExit(1)
    await pending
  })

  it('stopDaemon is a no-op when lock file is missing', async () => {
    mockState.readLockFileMock.mockReturnValue(null)
    const killSpy = vi.spyOn(process, 'kill')

    const { stopDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: '/tmp/new.sock',
      lockPath: '/tmp/daemon.lock',
      logPath: '/tmp/hydra/daemon.log',
      userDataPath: '/tmp/hydra'
    }

    await stopDaemon(paths)
    expect(mockState.shutdownMock).not.toHaveBeenCalled()
    expect(mockState.removeLockFileMock).not.toHaveBeenCalled()
    expect(killSpy).not.toHaveBeenCalled()
  })

  it('stopDaemon requests graceful shutdown and removes lock file', async () => {
    const lock: DaemonLockData = {
      pid: 3333,
      socketPath: '/tmp/live.sock',
      startedAt: '2026-02-28T00:00:00.000Z'
    }
    mockState.readLockFileMock.mockReturnValue(lock)

    const { stopDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: '/tmp/new.sock',
      lockPath: '/tmp/daemon.lock',
      logPath: '/tmp/hydra/daemon.log',
      userDataPath: '/tmp/hydra'
    }

    await stopDaemon(paths)
    expect(mockState.shutdownMock).toHaveBeenCalledWith('/tmp/live.sock')
    expect(mockState.removeLockFileMock).toHaveBeenCalledWith('/tmp/daemon.lock')
  })

  it('stopDaemon kills daemon pid when graceful shutdown fails', async () => {
    const lock: DaemonLockData = {
      pid: 4444,
      socketPath: '/tmp/broken.sock',
      startedAt: '2026-02-28T00:00:00.000Z'
    }
    mockState.readLockFileMock.mockReturnValue(lock)
    mockState.shutdownMock.mockRejectedValue(new Error('shutdown failed'))
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true)

    const { stopDaemon } = await import('./lifecycle')
    const paths = {
      socketPath: '/tmp/new.sock',
      lockPath: '/tmp/daemon.lock',
      logPath: '/tmp/hydra/daemon.log',
      userDataPath: '/tmp/hydra'
    }

    await stopDaemon(paths)
    expect(killSpy).toHaveBeenCalledWith(4444, 'SIGTERM')
    expect(mockState.removeLockFileMock).toHaveBeenCalledWith('/tmp/daemon.lock')
  })

  it('health monitor notifies disconnect/reconnect when daemon recovers', async () => {
    mockState.healthMock.mockRejectedValueOnce(new Error('lost connection'))
    mockState.connectMock.mockResolvedValue(undefined)

    const { startHealthMonitor } = await import('./lifecycle')
    const { DaemonClient } = await import('./DaemonClient')
    const client = new DaemonClient('/tmp/current.sock')
    const onReconnected = vi.fn()
    const onDisconnected = vi.fn()

    const stop = startHealthMonitor(
      client as unknown as import('./DaemonClient').DaemonClient,
      {
        socketPath: '/tmp/new.sock',
        lockPath: '/tmp/daemon.lock',
        logPath: '/tmp/hydra/daemon.log',
        userDataPath: '/tmp/hydra'
      },
      onReconnected,
      onDisconnected
    )

    await vi.advanceTimersByTimeAsync(10_000)
    await vi.advanceTimersByTimeAsync(300)

    expect(onDisconnected).toHaveBeenCalledTimes(1)
    expect(onReconnected).toHaveBeenCalledTimes(1)
    stop()
  })

  it('health monitor stop function prevents future checks', async () => {
    const { startHealthMonitor } = await import('./lifecycle')
    const { DaemonClient } = await import('./DaemonClient')
    const client = new DaemonClient('/tmp/current.sock')

    const stop = startHealthMonitor(
      client as unknown as import('./DaemonClient').DaemonClient,
      {
        socketPath: '/tmp/new.sock',
        lockPath: '/tmp/daemon.lock',
        logPath: '/tmp/hydra/daemon.log',
        userDataPath: '/tmp/hydra'
      }
    )

    await vi.advanceTimersByTimeAsync(10_000)
    expect(mockState.healthMock).toHaveBeenCalledTimes(1)

    stop()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(mockState.healthMock).toHaveBeenCalledTimes(1)
  })
})
