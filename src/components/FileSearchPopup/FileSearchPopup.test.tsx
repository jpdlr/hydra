// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FileSearchPopup } from './FileSearchPopup'

describe('FileSearchPopup', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.hydra = {
      ...window.hydra,
      searchFiles: vi.fn().mockResolvedValue([
        { path: 'src/index.ts', name: 'index.ts', isDirectory: false },
        { path: 'src/app.tsx', name: 'app.tsx', isDirectory: false },
        { path: 'README.md', name: 'README.md', isDirectory: false }
      ]),
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue({ content: '', path: '' }),
      writeFile: vi.fn().mockResolvedValue(true),
      watchDir: vi.fn(),
      unwatchDir: vi.fn(),
      onFsWatchEvent: vi.fn().mockReturnValue(() => undefined),
      renameAgent: vi.fn().mockResolvedValue(null),
      enableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      disableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      getRemoteControlState: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      onRemoteStateChange: vi.fn().mockReturnValue(() => undefined)
    }
  })

  it('auto-focuses the input on mount', () => {
    render(
      <FileSearchPopup
        agentId="agent-1"
        onOpenFile={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const input = screen.getByPlaceholderText('Search files by name...')
    expect(document.activeElement).toBe(input)
  })

  it('calls searchFiles after debounce and renders results', async () => {
    render(
      <FileSearchPopup
        agentId="agent-1"
        onOpenFile={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const input = screen.getByPlaceholderText('Search files by name...')
    fireEvent.change(input, { target: { value: 'index' } })

    await waitFor(() => {
      expect(window.hydra.searchFiles).toHaveBeenCalledWith('agent-1', 'index', 50)
    })

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeTruthy()
      expect(screen.getByText('app.tsx')).toBeTruthy()
    })
  })

  it('navigates with arrow keys and selects with Enter', async () => {
    const onOpenFile = vi.fn()
    const onClose = vi.fn()

    render(
      <FileSearchPopup
        agentId="agent-1"
        onOpenFile={onOpenFile}
        onClose={onClose}
      />
    )

    const input = screen.getByPlaceholderText('Search files by name...')
    fireEvent.change(input, { target: { value: 'index' } })

    await waitFor(() => {
      expect(screen.getByText('index.ts')).toBeTruthy()
    })

    // Navigate down once (from index 0 to 1)
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    // Press Enter to select second item (app.tsx)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onOpenFile).toHaveBeenCalledWith('src/app.tsx')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()

    render(
      <FileSearchPopup
        agentId="agent-1"
        onOpenFile={vi.fn()}
        onClose={onClose}
      />
    )

    const input = screen.getByPlaceholderText('Search files by name...')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when clicking the overlay', () => {
    const onClose = vi.fn()

    const { container } = render(
      <FileSearchPopup
        agentId="agent-1"
        onOpenFile={vi.fn()}
        onClose={onClose}
      />
    )

    const overlay = container.firstChild as HTMLElement
    fireEvent.mouseDown(overlay)
    expect(onClose).toHaveBeenCalled()
  })
})
