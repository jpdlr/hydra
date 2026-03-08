// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalPane } from './TerminalPane'

const { terminalState } = vi.hoisted(() => ({
  terminalState: {
    instances: [] as Array<{
      options: Record<string, unknown>
      write: ReturnType<typeof vi.fn>
      reset: ReturnType<typeof vi.fn>
      dispose: ReturnType<typeof vi.fn>
      loadAddon: ReturnType<typeof vi.fn>
      open: ReturnType<typeof vi.fn>
      onDataHandler: ((data: string) => void) | null
      onData: (handler: (data: string) => void) => void
    }>
  }
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    cols = 80
    rows = 24
    options: Record<string, unknown>
    write = vi.fn()
    reset = vi.fn()
    dispose = vi.fn()
    loadAddon = vi.fn()
    open = vi.fn()
    attachCustomKeyEventHandler = vi.fn()
    scrollToBottom = vi.fn()
    focus = vi.fn()
    buffer = { active: { baseY: 0, viewportY: 0, length: 24 } }
    onDataHandler: ((data: string) => void) | null = null

    constructor(options: Record<string, unknown> = {}) {
      this.options = options
      terminalState.instances.push(this)
    }

    onData(handler: (data: string) => void) {
      this.onDataHandler = handler
    }

    onScroll() {
      return { dispose: vi.fn() }
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit = vi.fn()
  }
}))

vi.mock('@xterm/addon-image', () => ({
  ImageAddon: class MockImageAddon {}
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: class MockWebLinksAddon {}
}))

describe('TerminalPane', () => {
  beforeEach(() => {
    terminalState.instances = []
    vi.clearAllMocks()

    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    }
  })

  it('writes output incrementally and resets when output shrinks', () => {
    const { rerender } = render(<TerminalPane rawOutput="hello" />)
    const term = terminalState.instances[0]

    expect(term.write).toHaveBeenCalledWith('hello', expect.any(Function))

    rerender(<TerminalPane rawOutput="hello world" />)
    expect(term.write).toHaveBeenLastCalledWith(' world', expect.any(Function))

    rerender(<TerminalPane rawOutput="x" />)
    expect(term.reset).toHaveBeenCalledTimes(1)
    expect(term.write).toHaveBeenLastCalledWith('x', expect.any(Function))
  })

  it('forwards terminal keystrokes through onData', () => {
    const onData = vi.fn()
    render(<TerminalPane rawOutput="" onData={onData} />)
    const term = terminalState.instances[0]

    term.onDataHandler?.('\r')
    term.onDataHandler?.('a')

    expect(onData).toHaveBeenNthCalledWith(1, '\r')
    expect(onData).toHaveBeenNthCalledWith(2, 'a')
  })

  it('preserves raw line-ending semantics for TUI apps', () => {
    render(<TerminalPane rawOutput="" />)
    const term = terminalState.instances[0]

    expect(term.options.convertEol).toBe(false)
  })

  it('notifies terminal size changes through onResize', () => {
    const onResize = vi.fn()
    render(<TerminalPane rawOutput="" onResize={onResize} />)
    expect(onResize).toHaveBeenCalledWith(80, 24)
  })
})
