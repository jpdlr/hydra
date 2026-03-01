import { beforeEach, describe, expect, it, vi } from 'vitest'

const wsConstructor = vi.fn()
const createConnectionMock = vi.fn((_path: string) => ({}) as any)

vi.mock('ws', () => {
  class MockWebSocket {
    static OPEN = 1
    readyState = MockWebSocket.OPEN

    constructor(address: string, options?: Record<string, unknown>) {
      wsConstructor(address, options)
    }

    on(): this {
      return this
    }

    close(): void {
      // no-op
    }
  }

  return { default: MockWebSocket }
})

vi.mock('net', () => ({
  createConnection: (path: string) => createConnectionMock(path)
}))

import { DaemonClient } from './DaemonClient'

describe('DaemonClient websocket connection', () => {
  beforeEach(() => {
    wsConstructor.mockReset()
    createConnectionMock.mockReset()
    createConnectionMock.mockReturnValue({} as any)
  })

  it('uses createConnection to bind websocket traffic to the daemon Unix socket', () => {
    const socketPath = '/Users/test/Library/Application Support/hydra/daemon.sock'
    const client = new DaemonClient(socketPath)

    ;(client as any).connectWebSocket()

    expect(wsConstructor).toHaveBeenCalledTimes(1)
    expect(wsConstructor).toHaveBeenCalledWith(
      'ws://localhost/ws',
      expect.objectContaining({
        createConnection: expect.any(Function)
      })
    )

    const options = wsConstructor.mock.calls[0]?.[1] as { createConnection: () => unknown }
    options.createConnection()
    expect(createConnectionMock).toHaveBeenCalledWith(socketPath)
  })
})
