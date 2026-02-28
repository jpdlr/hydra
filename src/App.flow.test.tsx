// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { AgentState, AppConfig, PreflightResult, ViewMode } from '@shared/types'

const mockUpdateConfig = vi.fn()
const mockUseAgents = vi.fn()
const mockUseViewMode = vi.fn()

vi.mock('./hooks/useConfig', () => ({
  useConfig: () => ({
    config: currentConfig,
    updateConfig: mockUpdateConfig
  })
}))

vi.mock('./hooks/useAgents', () => ({
  useAgents: () => mockUseAgents()
}))

vi.mock('./hooks/useViewMode', () => ({
  useViewMode: () => mockUseViewMode()
}))

vi.mock('./hooks/useUpdates', () => ({
  useUpdates: () => ({
    updateState: {
      supported: false,
      platform: 'darwin',
      checking: false,
      available: false,
      downloaded: false,
      downloading: false,
      currentVersion: '0.1.0',
      latestVersion: null,
      releaseDate: null,
      releaseNotes: null,
      error: null
    },
    check: vi.fn(),
    download: vi.fn(),
    install: vi.fn()
  })
}))

vi.mock('./components/Header/Header', () => ({
  Header: (props: { onOpenSettings: () => void; onOpenHeadless: () => void; onOpenUsage: () => void }) => (
    <div>
      <button onClick={props.onOpenSettings}>settings</button>
      <button onClick={props.onOpenHeadless}>headless</button>
      <button onClick={props.onOpenUsage}>usage</button>
    </div>
  )
}))

vi.mock('./components/Sidebar/Sidebar', () => ({
  Sidebar: (props: { onNewAgent: () => void }) => (
    <button onClick={props.onNewAgent}>new-agent</button>
  )
}))

vi.mock('./components/ChatView/ChatView', () => ({
  ChatView: () => <div>chat-view</div>
}))

vi.mock('./components/GridView/GridView', () => ({
  GridView: (props: { onRemoveAgent: (id: string) => void }) => (
    <button onClick={() => props.onRemoveAgent('sess-abc12345')}>remove-imported</button>
  )
}))

vi.mock('./components/Settings/SettingsPanel', () => ({
  SettingsPanel: () => <div>settings-panel</div>
}))

vi.mock('./components/NewAgent/NewAgentDialog', () => ({
  NewAgentDialog: () => <div>new-agent-dialog</div>
}))

vi.mock('./components/Headless/HeadlessPanel', () => ({
  HeadlessPanel: () => <div>headless-panel</div>
}))

vi.mock('./components/Updates/UpdatePanel', () => ({
  UpdatePanel: () => <div>update-panel</div>
}))

vi.mock('./components/Notifications/NotificationToast', () => ({
  NotificationToast: () => null
}))

vi.mock('./hooks/useEditorPanel', () => ({
  useEditorPanel: () => ({
    isOpen: false,
    toggle: vi.fn(),
    tabs: [],
    activeTabPath: null,
    fileContents: new Map(),
    openFile: vi.fn(),
    closeTab: vi.fn(),
    selectTab: vi.fn(),
    updateContent: vi.fn(),
    saveFile: vi.fn()
  })
}))

const baseConfig: AppConfig = {
  schemaVersion: 1,
  defaultProvider: 'claude',
  defaultModel: 'sonnet',
  globalYolo: false,
  maxAgents: 8,
  theme: 'dark',
  defaultViewMode: 'chat',
  defaultProjectDir: '/tmp',
  defaultEditor: 'vscode',
  importSessionsOnStartup: true,
  sessionImportLimit: 500,
  sessionImportProjectPrefix: '',
  hiddenSessionIds: [],
  usageDailyTokenBudget: 0,
  usageDailyCostBudgetUsd: 0,
  usageBudgetWarningThresholdPct: 80,
  enableSoundEffects: true,
  enableRemoteErrorReporting: false,
  errorReportingEndpoint: '',
  includeSensitiveDiagnostics: false,
  sessionMaxAgeDays: 7,
  remoteControlEnabled: false,
  remoteSessionTimeoutMinutes: 480
}

let currentConfig: AppConfig = { ...baseConfig }
let currentViewMode: ViewMode = 'chat'

function createAgent(id: string, overrides: Partial<AgentState> = {}): AgentState {
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
    ...overrides
  }
}

function buildAgentsState(importedSessionId: string | null = null) {
  const imported = createAgent('sess-abc12345', {
    sessionId: importedSessionId,
    projectDir: '/tmp/project'
  })

  const map = new Map([
    [
      imported.id,
      {
        state: imported,
        rawOutput: ''
      }
    ]
  ])

  return {
    agents: map,
    agentList: [imported],
    projectGroups: [
      {
        projectDir: '/tmp/project',
        projectName: 'project',
        agents: [imported]
      }
    ],
    selectedAgentId: imported.id,
    selectedAgent: map.get(imported.id),
    setSelectedAgentId: vi.fn(),
    createAgent: vi.fn(),
    killAgent: vi.fn().mockResolvedValue(true),
    removeAgent: vi.fn().mockResolvedValue(true),
    restartAgent: vi.fn().mockResolvedValue(imported),
    toggleYolo: vi.fn().mockResolvedValue(imported),
    sendInput: vi.fn(),
    sendTerminalInput: vi.fn(),
    resizeTerminal: vi.fn(),
    broadcastInput: vi.fn().mockResolvedValue([])
  }
}

function setupViewModeMock() {
  const setViewMode = vi.fn((mode: ViewMode) => {
    currentViewMode = mode
  })
  const toggleViewMode = vi.fn(() => {
    currentViewMode = currentViewMode === 'chat' ? 'grid' : 'chat'
  })
  mockUseViewMode.mockImplementation(() => ({
    viewMode: currentViewMode,
    setViewMode,
    toggleViewMode
  }))
}

describe('App flow behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    currentConfig = { ...baseConfig }
    currentViewMode = currentConfig.defaultViewMode
    mockUpdateConfig.mockReset()
    mockUpdateConfig.mockImplementation(async (partial: Partial<AppConfig>) => {
      currentConfig = { ...currentConfig, ...partial }
      return currentConfig
    })
    setupViewModeMock()
    mockUseAgents.mockReset()
    mockUseAgents.mockReturnValue(buildAgentsState())

    // Ensure FS methods are always available on window.hydra
    window.hydra = {
      ...window.hydra,
      readDir: vi.fn().mockResolvedValue([]),
      readFile: vi.fn().mockResolvedValue({ content: '', path: '' }),
      writeFile: vi.fn().mockResolvedValue(true),
      watchDir: vi.fn(),
      unwatchDir: vi.fn(),
      onFsWatchEvent: vi.fn().mockReturnValue(() => undefined),
      searchFiles: vi.fn().mockResolvedValue([]),
      enableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      disableRemoteControl: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      getRemoteControlState: vi.fn().mockResolvedValue({ enabled: false, status: 'creating', sessionId: null, qrPayload: null, connectedAt: null, expiresAt: null, mobileConnected: false, error: null }),
      onRemoteStateChange: vi.fn().mockReturnValue(() => undefined)
    }
  })

  it('blocks opening new agent when preflight fails', async () => {
    const failedPreflight: PreflightResult = {
      ok: false,
      claudePath: null,
      version: null,
      error: 'Claude CLI missing'
    }

    window.hydra = {
      ...window.hydra,
      preflight: vi.fn().mockResolvedValue(failedPreflight),
      onConfirmQuit: vi.fn().mockReturnValue(() => undefined),
      confirmQuit: vi.fn().mockResolvedValue(true),
      onNotification: vi.fn().mockReturnValue(() => undefined),
      dismissNotification: vi.fn()
    }

    render(<App />)
    fireEvent.click(screen.getByText('new-agent'))

    expect(await screen.findByText('Claude CLI Required')).toBeTruthy()
    expect(screen.queryByText('new-agent-dialog')).toBeNull()
  })

  it('shows quit confirmation and confirms forced quit', async () => {
    let quitListener: ((count: number) => void) | null = null

    window.hydra = {
      ...window.hydra,
      preflight: vi.fn().mockResolvedValue({
        ok: true,
        claudePath: '/usr/local/bin/claude',
        version: '1.0.0',
        error: null
      } satisfies PreflightResult),
      onConfirmQuit: vi.fn().mockImplementation((cb: (count: number) => void) => {
        quitListener = cb
        return () => undefined
      }),
      confirmQuit: vi.fn().mockResolvedValue(true),
      onNotification: vi.fn().mockReturnValue(() => undefined),
      dismissNotification: vi.fn()
    }

    render(<App />)
    await waitFor(() => expect(quitListener).not.toBeNull())
    if (!quitListener) {
      throw new Error('Quit listener was not registered')
    }
    ;(quitListener as (count: number) => void)(2)
    expect(await screen.findByText('Quit Hydra?')).toBeTruthy()

    fireEvent.click(screen.getByText('Quit'))
    await waitFor(() => {
      expect(window.hydra.confirmQuit).toHaveBeenCalledTimes(1)
    })
  })

  it('adds removed imported session ids to hidden config list', async () => {
    currentConfig = {
      ...baseConfig,
      defaultViewMode: 'grid',
      hiddenSessionIds: []
    }
    currentViewMode = 'grid'
    setupViewModeMock()
    mockUseAgents.mockReturnValue(buildAgentsState('session-hidden-01'))

    window.hydra = {
      ...window.hydra,
      preflight: vi.fn().mockResolvedValue({
        ok: true,
        claudePath: '/usr/local/bin/claude',
        version: '1.0.0',
        error: null
      } satisfies PreflightResult),
      onConfirmQuit: vi.fn().mockReturnValue(() => undefined),
      confirmQuit: vi.fn().mockResolvedValue(true),
      onNotification: vi.fn().mockReturnValue(() => undefined),
      dismissNotification: vi.fn()
    }

    render(<App />)
    fireEvent.click(screen.getByText('remove-imported'))

    await waitFor(() => {
      expect(mockUpdateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          hiddenSessionIds: ['session-hidden-01']
        })
      )
    })
  })
})
