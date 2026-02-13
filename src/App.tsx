import { useState, useEffect, useCallback, useMemo } from 'react'
import { Header } from './components/Header/Header'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatView } from './components/ChatView/ChatView'
import { GridView } from './components/GridView/GridView'
import { SettingsPanel } from './components/Settings/SettingsPanel'
import { NewAgentDialog } from './components/NewAgent/NewAgentDialog'
import { HeadlessPanel } from './components/Headless/HeadlessPanel'
import { UsageDashboard } from './components/UsageDashboard/UsageDashboard'
import { UpdatePanel } from './components/Updates/UpdatePanel'
import { NotificationToast } from './components/Notifications/NotificationToast'
import { FileSearchPopup } from './components/FileSearchPopup/FileSearchPopup'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { GitPanel } from './components/GitPanel/GitPanel'
import { useAgents } from './hooks/useAgents'
import { useConfig } from './hooks/useConfig'
import { useViewMode } from './hooks/useViewMode'
import { useNotifications } from './hooks/useNotifications'
import { useEditorPanel } from './hooks/useEditorPanel'
import { useUpdates } from './hooks/useUpdates'
import type { PreflightResult, ViewMode, EditorId } from '@shared/types'
import styles from './App.module.css'

interface PersistedWorkspaceUiState {
  selectedProject: string | null
  selectedAgentId: string | null
  viewMode: ViewMode | null
  expandedTilesByProject: Record<string, string | null>
  sidebarWidth: number | null
  editorOpen: boolean | null
}

const WORKSPACE_UI_STORAGE_KEY = 'hydra:workspace-ui:v1'

function readWorkspaceUiState(): PersistedWorkspaceUiState {
  try {
    const raw = localStorage.getItem(WORKSPACE_UI_STORAGE_KEY)
    if (!raw) {
      return {
        selectedProject: null,
        selectedAgentId: null,
        viewMode: null,
        expandedTilesByProject: {},
        sidebarWidth: null,
        editorOpen: null
      }
    }

    const parsed = JSON.parse(raw) as Partial<PersistedWorkspaceUiState>
    const viewMode = parsed.viewMode
    const safeViewMode: ViewMode | null = viewMode === 'grid' || viewMode === 'chat' ? viewMode : null

    return {
      selectedProject: typeof parsed.selectedProject === 'string' ? parsed.selectedProject : null,
      selectedAgentId: typeof parsed.selectedAgentId === 'string' ? parsed.selectedAgentId : null,
      viewMode: safeViewMode,
      expandedTilesByProject:
        parsed.expandedTilesByProject && typeof parsed.expandedTilesByProject === 'object'
          ? parsed.expandedTilesByProject
          : {},
      sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : null,
      editorOpen: typeof parsed.editorOpen === 'boolean' ? parsed.editorOpen : null
    }
  } catch {
    return {
      selectedProject: null,
      selectedAgentId: null,
      viewMode: null,
      expandedTilesByProject: {},
      sidebarWidth: null,
      editorOpen: null
    }
  }
}

function writeWorkspaceUiState(state: PersistedWorkspaceUiState): void {
  try {
    localStorage.setItem(WORKSPACE_UI_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Best effort persistence.
  }
}

export default function App() {
  const persistedUi = useMemo(() => readWorkspaceUiState(), [])
  const { config, updateConfig } = useConfig()
  const { notifications, dismiss: dismissNotification } = useNotifications(config.enableSoundEffects)
  const { updateState, check: checkForUpdates, download: downloadUpdate, install: installUpdate } =
    useUpdates()
  const {
    agents,
    agentList,
    projectGroups,
    selectedAgentId,
    selectedAgent,
    setSelectedAgentId,
    createAgent,
    killAgent,
    removeAgent,
    restartAgent,
    toggleYolo,
    sendInput,
    sendTerminalInput,
    resizeTerminal,
    broadcastInput
  } = useAgents(persistedUi.selectedAgentId)

  const { viewMode, setViewMode, toggleViewMode } = useViewMode(
    persistedUi.viewMode ?? config.defaultViewMode
  )

  const editorPanel = useEditorPanel(selectedAgentId, selectedAgent?.state.projectDir)

  const [sidebarWidth, setSidebarWidth] = useState(persistedUi.sidebarWidth ?? 260)

  const [showSettings, setShowSettings] = useState(false)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [newAgentPrefillDir, setNewAgentPrefillDir] = useState<string | null>(null)
  const [showHeadless, setShowHeadless] = useState(false)
  const [showUsageDashboard, setShowUsageDashboard] = useState(false)
  const [showUpdatePanel, setShowUpdatePanel] = useState(false)
  const [showYoloConfirm, setShowYoloConfirm] = useState(false)
  const [showPreflightGate, setShowPreflightGate] = useState(false)
  const [showFileSearch, setShowFileSearch] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showGitPanel, setShowGitPanel] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string | null>(persistedUi.selectedProject)
  const [expandedTilesByProject, setExpandedTilesByProject] = useState<Record<string, string | null>>(
    persistedUi.expandedTilesByProject
  )
  const [preflight, setPreflight] = useState<PreflightResult | null>(null)
  const [isCheckingPreflight, setIsCheckingPreflight] = useState(true)
  const [quitConfirmRunningCount, setQuitConfirmRunningCount] = useState<number | null>(
    null
  )

  const runPreflightCheck = useCallback(async (): Promise<PreflightResult> => {
    setIsCheckingPreflight(true)
    try {
      const result = await window.hydra.preflight()
      setPreflight(result)
      setShowPreflightGate(!result.ok)
      return result
    } catch (error) {
      const failed: PreflightResult = {
        ok: false,
        claudePath: null,
        version: null,
        error: error instanceof Error ? error.message : 'Failed to run Claude preflight check'
      }
      setPreflight(failed)
      setShowPreflightGate(true)
      return failed
    } finally {
      setIsCheckingPreflight(false)
    }
  }, [])

  const ensurePreflightReady = useCallback(async (): Promise<boolean> => {
    if (preflight?.ok) return true
    const result = await runPreflightCheck()
    if (!result.ok) {
      setShowPreflightGate(true)
      return false
    }
    return true
  }, [preflight, runPreflightCheck])

  useEffect(() => {
    void runPreflightCheck()
  }, [runPreflightCheck])

  useEffect(() => {
    return window.hydra.onConfirmQuit((runningCount) => {
      setQuitConfirmRunningCount(runningCount)
    })
  }, [])

  const handleOpenNewAgent = useCallback(async () => {
    if (await ensurePreflightReady()) {
      setNewAgentPrefillDir(null)
      setShowNewAgent(true)
    }
  }, [ensurePreflightReady])

  const handleNewAgentForProject = useCallback(async (projectDir: string) => {
    if (await ensurePreflightReady()) {
      setNewAgentPrefillDir(projectDir)
      setShowNewAgent(true)
    }
  }, [ensurePreflightReady])

  const handleOpenNewAgentForCurrentProject = useCallback(() => {
    if (selectedProject) {
      void handleNewAgentForProject(selectedProject)
      return
    }
    void handleOpenNewAgent()
  }, [selectedProject, handleNewAgentForProject, handleOpenNewAgent])

  const handleRemoveAgent = useCallback(
    async (agentId: string) => {
      const removed = agents.get(agentId)?.state
      await removeAgent(agentId)

      if (!removed?.sessionId || !removed.id.startsWith('sess-')) {
        return
      }

      if (!config.hiddenSessionIds.includes(removed.sessionId)) {
        const nextHidden = [...config.hiddenSessionIds, removed.sessionId]
        await updateConfig({ hiddenSessionIds: nextHidden })
      }
    },
    [agents, removeAgent, config.hiddenSessionIds, updateConfig]
  )

  const handleRestartAgent = useCallback(
    async (agentId: string) => {
      if (!(await ensurePreflightReady())) return
      await restartAgent(agentId)
    },
    [ensurePreflightReady, restartAgent]
  )

  const handleSendInput = useCallback(
    async (agentId: string, input: string) => {
      const state = agents.get(agentId)?.state
      if (!state) return
      if (state.status !== 'running' && !(await ensurePreflightReady())) return
      sendInput(agentId, input)
    },
    [agents, ensurePreflightReady, sendInput]
  )

  const handleBroadcast = useCallback(
    async (projectDir: string, input: string) => {
      if (!(await ensurePreflightReady())) return
      await broadcastInput(projectDir, input)
    },
    [ensurePreflightReady, broadcastInput]
  )

  const handleConfirmQuit = useCallback(async () => {
    setQuitConfirmRunningCount(null)
    await window.hydra.confirmQuit()
  }, [])

  // Sync view mode with config preference only when no persisted runtime view.
  useEffect(() => {
    if (persistedUi.viewMode) return
    setViewMode(config.defaultViewMode)
  }, [config.defaultViewMode, persistedUi.viewMode, setViewMode])

  // Auto-select project for grid view
  useEffect(() => {
    if (projectGroups.length === 0) return
    const currentExists = selectedProject
      ? projectGroups.some((group) => group.projectDir === selectedProject)
      : false
    if (!currentExists) {
      setSelectedProject(projectGroups[0].projectDir)
    }
  }, [projectGroups, selectedProject])

  // Keep selected project synced while navigating agents in chat mode.
  useEffect(() => {
    if (viewMode !== 'chat') return
    const agentProject = selectedAgent?.state.projectDir
    if (!agentProject) return
    if (selectedProject !== agentProject) {
      setSelectedProject(agentProject)
    }
  }, [viewMode, selectedAgent, selectedProject])

  // Keep selected chat agent synced to the active grid project.
  useEffect(() => {
    if (viewMode !== 'grid' || !selectedProject) return
    const group = projectGroups.find((item) => item.projectDir === selectedProject)
    if (!group || group.agents.length === 0) return

    const selectedAgentProject = selectedAgentId
      ? agents.get(selectedAgentId)?.state.projectDir
      : null

    if (selectedAgentProject !== selectedProject) {
      setSelectedAgentId(group.agents[0].id)
    }
  }, [viewMode, selectedProject, projectGroups, selectedAgentId, agents, setSelectedAgentId])

  useEffect(() => {
    writeWorkspaceUiState({
      selectedProject,
      selectedAgentId,
      viewMode,
      expandedTilesByProject,
      sidebarWidth,
      editorOpen: editorPanel.isOpen
    })
  }, [selectedProject, selectedAgentId, viewMode, expandedTilesByProject, sidebarWidth, editorPanel.isOpen])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Cmd+\ — toggle view
      if (meta && e.key === '\\') {
        e.preventDefault()
        toggleViewMode()
        return
      }

      // Cmd+E — toggle code editor (chat mode only)
      if (meta && e.key === 'e' && viewMode === 'chat') {
        e.preventDefault()
        editorPanel.toggle()
        return
      }

      // Cmd+Shift+P — command palette
      if (meta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setShowCommandPalette(true)
        return
      }

      // Cmd+P — file search (requires selected agent)
      if (meta && e.key === 'p' && selectedAgentId) {
        e.preventDefault()
        setShowFileSearch(true)
        return
      }

      // Cmd+N — new agent
      if (meta && e.key === 'n') {
        e.preventDefault()
        void handleOpenNewAgent()
        return
      }

      // Cmd+, — settings
      if (meta && e.key === ',') {
        e.preventDefault()
        setShowSettings(true)
        return
      }

      // Cmd+Shift+U — updates panel
      if (meta && e.shiftKey && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        if (updateState.supported) {
          setShowUpdatePanel(true)
        }
        return
      }

      // Cmd+U — usage dashboard
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'u') {
        e.preventDefault()
        setShowUsageDashboard(true)
        return
      }

      // Cmd+G — git panel
      if (meta && !e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setShowGitPanel(true)
        return
      }

      // Cmd+W — close selected agent
      if (meta && e.key === 'w' && selectedAgentId) {
        e.preventDefault()
        void handleRemoveAgent(selectedAgentId)
        return
      }

      // Cmd+R — restart selected agent
      if (meta && e.key === 'r' && selectedAgentId) {
        e.preventDefault()
        void handleRestartAgent(selectedAgentId)
        return
      }

      // Cmd+Y — toggle YOLO for selected agent
      if (meta && e.key === 'y' && !e.shiftKey && selectedAgentId) {
        e.preventDefault()
        const agent = agents.get(selectedAgentId)
        if (agent) toggleYolo(selectedAgentId, !agent.state.yolo)
        return
      }

      // Cmd+Shift+Y — toggle global YOLO
      if (meta && e.key === 'Y' && e.shiftKey) {
        e.preventDefault()
        setShowYoloConfirm(true)
        return
      }

      // Cmd+1-9 — quick switch to agent by index
      if (meta && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        if (index < agentList.length) {
          setSelectedAgentId(agentList[index].id)
        }
        return
      }

      // Escape — close dialogs
      if (e.key === 'Escape') {
        if (showCommandPalette) setShowCommandPalette(false)
        if (showFileSearch) setShowFileSearch(false)
        if (showSettings) setShowSettings(false)
        if (showNewAgent) setShowNewAgent(false)
        if (showHeadless) setShowHeadless(false)
        if (showUsageDashboard) setShowUsageDashboard(false)
        if (showUpdatePanel) setShowUpdatePanel(false)
        if (showGitPanel) setShowGitPanel(false)
        if (showYoloConfirm) setShowYoloConfirm(false)
        if (showPreflightGate) setShowPreflightGate(false)
        if (quitConfirmRunningCount !== null) setQuitConfirmRunningCount(null)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    selectedAgentId,
    agentList,
    agents,
    showCommandPalette,
    showFileSearch,
    showSettings,
    showNewAgent,
    showHeadless,
    showUsageDashboard,
    showUpdatePanel,
    showGitPanel,
    showYoloConfirm,
    showPreflightGate,
    quitConfirmRunningCount,
    viewMode,
    editorPanel.toggle,
    toggleViewMode,
    handleOpenNewAgent,
    handleRemoveAgent,
    handleRestartAgent,
    toggleYolo,
    setSelectedAgentId,
    updateState.supported
  ])

  // Handle global YOLO toggle
  const handleGlobalYoloToggle = useCallback(() => {
    if (config.globalYolo) {
      // Turn off — no confirmation needed
      window.hydra.toggleGlobalYolo(false)
    } else {
      setShowYoloConfirm(true)
    }
  }, [config.globalYolo])

  const confirmGlobalYolo = useCallback(() => {
    window.hydra.toggleGlobalYolo(true)
    setShowYoloConfirm(false)
  }, [])

  const handleKillAgent = useCallback(async () => {
    if (!selectedAgentId) return
    await killAgent(selectedAgentId)
  }, [selectedAgentId, killAgent])

  // Build raw outputs map for grid view
  const rawOutputs = useMemo(() => {
    const map = new Map<string, string>()
    for (const [id, data] of agents) {
      map.set(id, data.rawOutput)
    }
    return map
  }, [agents])

  // Selected project name for header
  const selectedProjectName = projectGroups.find(
    (g) => g.projectDir === selectedProject
  )?.projectName

  const headerProjectDir = selectedAgent?.state.projectDir ?? selectedProject ?? null

  const handleSetDefaultEditor = useCallback(
    (editorId: EditorId) => {
      void updateConfig({ defaultEditor: editorId })
    },
    [updateConfig]
  )

  const expandedTileId = selectedProject ? expandedTilesByProject[selectedProject] ?? null : null

  const handleExpandedTileChange = useCallback(
    (agentId: string | null) => {
      if (!selectedProject) return
      setExpandedTilesByProject((prev) => ({
        ...prev,
        [selectedProject]: agentId
      }))
    },
    [selectedProject]
  )

  return (
    <div className={styles.app}>
      <Header
        viewMode={viewMode}
        onToggleViewMode={toggleViewMode}
        onOpenNewAgent={handleOpenNewAgentForCurrentProject}
        globalYolo={config.globalYolo}
        onToggleGlobalYolo={handleGlobalYoloToggle}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHeadless={() => setShowHeadless(true)}
        onOpenUsage={() => setShowUsageDashboard(true)}
        onOpenUpdates={() => setShowUpdatePanel(true)}
        showUpdateAction={updateState.supported}
        updateReadyToInstall={updateState.downloaded}
        updateAvailable={updateState.available}
        selectedProjectName={viewMode === 'grid' ? selectedProjectName : undefined}
        projectDir={headerProjectDir}
        defaultEditor={config.defaultEditor}
        onSetDefaultEditor={handleSetDefaultEditor}
      />

      <div className={styles.body}>
        {viewMode === 'chat' && (
            <Sidebar
              projectGroups={projectGroups}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
              onNewAgent={() => {
                void handleOpenNewAgent()
              }}
              onNewAgentForProject={(projectDir) => {
                void handleNewAgentForProject(projectDir)
              }}
              width={sidebarWidth}
              onWidthChange={setSidebarWidth}
              sessionMaxAgeDays={config.sessionMaxAgeDays}
            />
          )}

        <main className={styles.main}>
          {viewMode === 'chat' ? (
            <ChatView
              agent={selectedAgent?.state || null}
              rawOutput={selectedAgent?.rawOutput || ''}
              onSendInput={(input) => {
                if (selectedAgentId) {
                  void handleSendInput(selectedAgentId, input)
                }
              }}
              onTerminalData={(data) => {
                if (selectedAgentId) sendTerminalInput(selectedAgentId, data)
              }}
              onTerminalResize={(cols, rows) => {
                if (selectedAgentId) resizeTerminal(selectedAgentId, cols, rows)
              }}
              onRestartAgent={() => {
                if (selectedAgentId) {
                  void handleRestartAgent(selectedAgentId)
                }
              }}
              onToggleYolo={() => {
                if (selectedAgentId && selectedAgent) {
                  toggleYolo(selectedAgentId, !selectedAgent.state.yolo)
                }
              }}
              onKillAgent={() => {
                void handleKillAgent()
              }}
              editorOpen={editorPanel.isOpen}
              onToggleEditor={editorPanel.toggle}
              editorTabs={editorPanel.tabs}
              editorActiveTabPath={editorPanel.activeTabPath}
              editorFileContents={editorPanel.fileContents}
              onEditorOpenFile={(path) => { void editorPanel.openFile(path) }}
              onEditorCloseTab={editorPanel.closeTab}
              onEditorSelectTab={editorPanel.selectTab}
              onEditorContentChange={editorPanel.updateContent}
              onEditorSaveFile={(path) => { void editorPanel.saveFile(path) }}
              theme={config.theme}
            />
          ) : (
            <GridView
              projectGroups={projectGroups}
              selectedProject={selectedProject}
              onSelectProject={setSelectedProject}
              onTerminalData={(agentId, data) => sendTerminalInput(agentId, data)}
              onTerminalResize={(agentId, cols, rows) =>
                resizeTerminal(agentId, cols, rows)
              }
              onStartAgent={(agentId) => {
                void handleRestartAgent(agentId)
              }}
              onRemoveAgent={(agentId) => {
                void handleRemoveAgent(agentId)
              }}
              onBroadcast={(input) => {
                if (selectedProject) {
                  void handleBroadcast(selectedProject, input)
                }
              }}
              onNewAgent={() => {
                handleOpenNewAgentForCurrentProject()
              }}
              rawOutputs={rawOutputs}
              expandedTileId={expandedTileId}
              onExpandedTileChange={handleExpandedTileChange}
            />
          )}
        </main>
      </div>

      {/* Dialogs */}
      {showSettings && (
        <SettingsPanel
          config={config}
          onUpdate={updateConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showNewAgent && (
        <NewAgentDialog
          defaultProvider={config.defaultProvider}
          defaultModel={config.defaultModel}
          defaultProjectDir={newAgentPrefillDir || config.defaultProjectDir}
          globalYolo={config.globalYolo}
          onSubmit={async (payload) => {
            if (!(await ensurePreflightReady())) return
            await createAgent(payload)
            setShowNewAgent(false)
            setNewAgentPrefillDir(null)
          }}
          onClose={() => {
            setShowNewAgent(false)
            setNewAgentPrefillDir(null)
          }}
        />
      )}

      {showHeadless && (
        <HeadlessPanel
          defaultProjectDir={selectedProject || config.defaultProjectDir}
          defaultProvider={config.defaultProvider}
          defaultModel={config.defaultModel}
          onClose={() => setShowHeadless(false)}
        />
      )}

      {showUsageDashboard && (
        <UsageDashboard
          config={config}
          onUpdateConfig={updateConfig}
          onClose={() => setShowUsageDashboard(false)}
        />
      )}

      {showUpdatePanel && (
        <UpdatePanel
          state={updateState}
          onClose={() => setShowUpdatePanel(false)}
          onCheck={async () => {
            await checkForUpdates()
          }}
          onDownload={async () => {
            await downloadUpdate()
          }}
          onInstall={async () => {
            await installUpdate()
          }}
        />
      )}

      {showYoloConfirm && (
        <div className={styles.confirmOverlay} onClick={() => setShowYoloConfirm(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmIcon}>⚠️</div>
            <h3>Enable Global YOLO Mode?</h3>
            <p>
              This will restart all agents with <code>--dangerously-skip-permissions</code>.
              All agents will be able to execute code, write files, and run commands without
              asking for permission.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowYoloConfirm(false)}
              >
                Cancel
              </button>
              <button className={styles.yoloBtn} onClick={confirmGlobalYolo}>
                Enable YOLO
              </button>
            </div>
          </div>
        </div>
      )}

      {showPreflightGate && (
        <div className={styles.confirmOverlay} onClick={() => setShowPreflightGate(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmIcon}>⚙️</div>
            <h3>Claude CLI Required</h3>
            <p>
              Hydra could not run Claude Code from your shell environment. Install Claude Code
              and verify the <code>claude</code> command works in your terminal before starting agents.
            </p>
            <p className={styles.preflightMeta}>
              {preflight?.error || 'Preflight check has not completed yet.'}
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowPreflightGate(false)}
              >
                Close
              </button>
              <button
                className={styles.primaryBtn}
                onClick={() => {
                  void runPreflightCheck()
                }}
                disabled={isCheckingPreflight}
              >
                {isCheckingPreflight ? 'Checking...' : 'Retry Check'}
              </button>
            </div>
          </div>
        </div>
      )}

      {quitConfirmRunningCount !== null && (
        <div
          className={styles.confirmOverlay}
          onClick={() => setQuitConfirmRunningCount(null)}
        >
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmIcon}>⏻</div>
            <h3>Quit Hydra?</h3>
            <p>
              {quitConfirmRunningCount === 1
                ? '1 agent is still running.'
                : `${quitConfirmRunningCount} agents are still running.`}{' '}
              Quitting now will stop all active sessions.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setQuitConfirmRunningCount(null)}
              >
                Cancel
              </button>
              <button className={styles.dangerBtn} onClick={handleConfirmQuit}>
                Quit
              </button>
            </div>
          </div>
        </div>
      )}

      {showFileSearch && selectedAgentId && (
        <FileSearchPopup
          agentId={selectedAgentId}
          onOpenFile={(path) => {
            if (!editorPanel.isOpen) editorPanel.toggle()
            void editorPanel.openFile(path)
          }}
          onClose={() => setShowFileSearch(false)}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          onExecute={(id) => {
            switch (id) {
              case 'toggle-view': toggleViewMode(); break
              case 'new-agent': void handleOpenNewAgent(); break
              case 'kill-agent': if (selectedAgentId) void handleRemoveAgent(selectedAgentId); break
              case 'restart-agent': if (selectedAgentId) void handleRestartAgent(selectedAgentId); break
              case 'toggle-yolo': {
                if (selectedAgentId) {
                  const agent = agents.get(selectedAgentId)
                  if (agent) toggleYolo(selectedAgentId, !agent.state.yolo)
                }
                break
              }
              case 'toggle-global-yolo': setShowYoloConfirm(true); break
              case 'toggle-editor': if (viewMode === 'chat') editorPanel.toggle(); break
              case 'file-search': if (selectedAgentId) setShowFileSearch(true); break
              case 'settings': setShowSettings(true); break
              case 'usage-dashboard': setShowUsageDashboard(true); break
              case 'updates': if (updateState.supported) setShowUpdatePanel(true); break
              case 'headless': setShowHeadless(true); break
              case 'git-panel': setShowGitPanel(true); break
              case 'export-diagnostics': void window.hydra.exportDiagnostics(); break
            }
          }}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {showGitPanel && selectedAgent?.state.projectDir && (
        <GitPanel
          projectDir={selectedAgent.state.projectDir}
          onClose={() => setShowGitPanel(false)}
        />
      )}

      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
    </div>
  )
}
