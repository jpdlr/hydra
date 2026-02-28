// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Monaco editor (heavy dependency)
vi.mock('@monaco-editor/react', () => ({
  Editor: (props: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="mock-editor"
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  ),
  loader: { config: vi.fn() }
}))

vi.mock('../../lib/monacoSetup', () => ({}))
vi.mock('../../lib/monacoThemes', () => ({
  THEME_MAP: {
    dark: { name: 'hydra-dark', data: {} },
    light: { name: 'hydra-light', data: {} }
  }
}))

import { TabBar, type EditorTab } from './TabBar'
import { FileTree } from './FileTree'
import { EditorPanel } from './EditorPanel'

describe('TabBar', () => {
  const baseTabs: EditorTab[] = [
    { path: 'src/index.ts', dirty: false },
    { path: 'src/app.tsx', dirty: true }
  ]

  it('renders tabs with file names', () => {
    render(
      <TabBar
        tabs={baseTabs}
        activeTabPath="src/index.ts"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    )
    expect(screen.getByText('index.ts')).toBeTruthy()
    expect(screen.getByText('app.tsx')).toBeTruthy()
  })

  it('shows dirty indicator for modified files', () => {
    const { container } = render(
      <TabBar
        tabs={baseTabs}
        activeTabPath="src/index.ts"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    )
    // The dirty dot should exist (in the app.tsx tab)
    const dots = container.querySelectorAll('[class*="dirtyDot"]')
    expect(dots.length).toBe(1)
  })

  it('calls onSelectTab when tab is clicked', () => {
    const onSelect = vi.fn()
    const { container } = render(
      <TabBar
        tabs={baseTabs}
        activeTabPath="src/index.ts"
        onSelectTab={onSelect}
        onCloseTab={vi.fn()}
      />
    )
    // Each tab div has title={tab.path}
    const tab = container.querySelector('[title="src/app.tsx"]')
    expect(tab).toBeTruthy()
    fireEvent.click(tab!)
    expect(onSelect).toHaveBeenCalledWith('src/app.tsx')
  })

  it('calls onCloseTab when close button is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(
      <TabBar
        tabs={baseTabs}
        activeTabPath="src/index.ts"
        onSelectTab={vi.fn()}
        onCloseTab={onClose}
      />
    )
    const closeButtons = container.querySelectorAll('[class*="closeBtn"]')
    fireEvent.click(closeButtons[0])
    expect(onClose).toHaveBeenCalledWith('src/index.ts')
  })

  it('returns null when no tabs', () => {
    const { container } = render(
      <TabBar
        tabs={[]}
        activeTabPath={null}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />
    )
    expect(container.innerHTML).toBe('')
  })
})

describe('FileTree', () => {
  beforeEach(() => {
    window.hydra = {
      ...window.hydra,
      readDir: vi.fn().mockResolvedValue([
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false }
      ]),
      readFile: vi.fn().mockResolvedValue({ content: '', path: '' }),
      writeFile: vi.fn().mockResolvedValue(true),
      searchFiles: vi.fn().mockResolvedValue([]),
      watchDir: vi.fn(),
      unwatchDir: vi.fn(),
      onFsWatchEvent: vi.fn().mockReturnValue(() => undefined),
      enableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      disableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      getRemoteControlState: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      onRemoteStateChange: vi.fn().mockReturnValue(() => undefined)
    }
  })

  it('renders directory entries after loading', async () => {
    render(
      <FileTree
        agentId="agent-1"
        rootPath="/project"
        activeFilePath={null}
        onOpenFile={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(screen.getByText('src')).toBeTruthy()
      expect(screen.getByText('README.md')).toBeTruthy()
    })
  })

  it('calls onOpenFile when a file is clicked', async () => {
    const onOpenFile = vi.fn()
    const { container } = render(
      <FileTree
        agentId="agent-1"
        rootPath="/project"
        activeFilePath={null}
        onOpenFile={onOpenFile}
      />
    )
    await waitFor(() => {
      expect(container.querySelector('[title="README.md"]')).toBeTruthy()
    })
    fireEvent.click(container.querySelector('[title="README.md"]')!)
    expect(onOpenFile).toHaveBeenCalledWith('README.md')
  })

  it('expands directory on click', async () => {
    const childEntries = [{ name: 'index.ts', isDirectory: false }]
    ;(window.hydra.readDir as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false }
      ])
      .mockResolvedValueOnce(childEntries)

    const { container } = render(
      <FileTree
        agentId="agent-1"
        rootPath="/project"
        activeFilePath={null}
        onOpenFile={vi.fn()}
      />
    )
    await waitFor(() => {
      expect(container.querySelector('[title="src"]')).toBeTruthy()
    })
    fireEvent.click(container.querySelector('[title="src"]')!)
    await waitFor(() => {
      expect(container.querySelector('[title="src/index.ts"]')).toBeTruthy()
    })
  })
})

describe('EditorPanel filter', () => {
  beforeEach(() => {
    window.hydra = {
      ...window.hydra,
      readDir: vi.fn().mockResolvedValue([
        { name: 'src', isDirectory: true },
        { name: 'README.md', isDirectory: false }
      ]),
      readFile: vi.fn().mockResolvedValue({ content: '', path: '' }),
      writeFile: vi.fn().mockResolvedValue(true),
      searchFiles: vi.fn().mockResolvedValue([
        { path: 'src/utils.ts', name: 'utils.ts', isDirectory: false }
      ]),
      watchDir: vi.fn(),
      unwatchDir: vi.fn(),
      onFsWatchEvent: vi.fn().mockReturnValue(() => undefined),
      enableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      disableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      getRemoteControlState: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      onRemoteStateChange: vi.fn().mockReturnValue(() => undefined)
    }
  })

  it('shows filter results when query is entered', async () => {
    render(
      <EditorPanel
        agentId="agent-1"
        projectDir="/project"
        theme="dark"
        tabs={[]}
        activeTabPath={null}
        fileContents={new Map()}
        onOpenFile={vi.fn()}
        onCloseTab={vi.fn()}
        onSelectTab={vi.fn()}
        onContentChange={vi.fn()}
        onSaveFile={vi.fn()}
      />
    )

    const filterInput = screen.getByPlaceholderText('Filter files...')
    fireEvent.change(filterInput, { target: { value: 'utils' } })

    await waitFor(() => {
      expect(window.hydra.searchFiles).toHaveBeenCalledWith('agent-1', 'utils', 100)
      expect(screen.getByText('utils.ts')).toBeTruthy()
    })
  })
})
