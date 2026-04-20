import { useState, useEffect, useCallback, useMemo } from 'react'
import { Header } from './components/Header/Header'
import { Sidebar } from './components/Sidebar/Sidebar'
import { ChatView } from './components/ChatView/ChatView'
import type { AttachedImage } from './components/ChatView/InputBar'
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
import { RemoteControlModal } from './components/RemoteControl/RemoteControlModal'
import { PreflightTestModal } from './components/PreflightTestModal/PreflightTestModal'
import { useAgents } from './hooks/useAgents'
import { useConfig } from './hooks/useConfig'
import { useKeybindings } from './hooks/useKeybindings'
import { useViewMode } from './hooks/useViewMode'
import { useNotifications } from './hooks/useNotifications'
import { useEditorPanel } from './hooks/useEditorPanel'
import { useUpdates } from './hooks/useUpdates'
import { useRemoteControl } from './hooks/useRemoteControl'
import { RUNNING_PROJECT_ID } from '@shared/types'
import type { PreflightResult, ViewMode, EditorId } from '@shared/types'
import {
  matchKeybindingEvent,
  type HydraCommandId
} from '@shared/keybindings'
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
  const { keybindings, keybindingsPath } = useKeybindings()
  const { notifications, dismiss: dismissNotification } = useNotifications(config.enableSoundEffects)
  const { updateState, check: checkForUpdates, download: downloadUpdate, install: installUpdate } =
    useUpdates()
  const remoteControl = useRemoteControl()
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
    renameAgent,
    setAgentModel,
    sendInput,
    sendTerminalInput,
    resizeTerminal,
    broadcastInput
  } = useAgents(persistedUi.selectedAgentId)

  const { viewMode, setViewMode, toggleViewMode } = useViewMode(
    persistedUi.viewMode ?? config.defaultViewMode
  )
  const [renderedViewMode, setRenderedViewMode] = useState<ViewMode>(
    persistedUi.viewMode ?? config.defaultViewMode
  )
  const [isViewSwitchPending, setIsViewSwitchPending] = useState(false)

  const editorPanel = useEditorPanel(selectedAgentId, selectedAgent?.state.projectDir)

  const [sidebarWidth, setSidebarWidth] = useState(persistedUi.sidebarWidth ?? 260)

  const [showSettings, setShowSettings] = useState(false)
  const [showNewAgent, setShowNewAgent] = useState(false)
  const [newAgentPrefillDir, setNewAgentPrefillDir] = useState<string | null>(null)
  const [showHeadless, setShowHeadless] = useState(false)
  const [showRemoteControl, setShowRemoteControl] = useState(false)
  const [showUsageDashboard, setShowUsageDashboard] = useState(false)
  const [showUpdatePanel, setShowUpdatePanel] = useState(false)
  const [showYoloConfirm, setShowYoloConfirm] = useState(false)
  const [showPreflightGate, setShowPreflightGate] = useState(false)
  const [showTestTerminal, setShowTestTerminal] = useState(false)
  const [showFileSearch, setShowFileSearch] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showGitPanel, setShowGitPanel] = useState(false)
  const [freeTerminalOpen, setFreeTerminalOpen] = useState(false)
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
        error: error instanceof Error ? error.message : 'Failed to run CLI preflight check'
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

  useEffect(() => {
    if (renderedViewMode === viewMode) {
      setIsViewSwitchPending(false)
      return
    }

    setIsViewSwitchPending(true)
    let cancelled = false
    let rafA = 0
    let rafB = 0

    // Let the lightweight loading shell paint before mounting the heavy view subtree.
    rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(() => {
        if (cancelled) return
        setRenderedViewMode(viewMode)
        setIsViewSwitchPending(false)
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafA)
      cancelAnimationFrame(rafB)
    }
  }, [renderedViewMode, viewMode])

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
    if (selectedProject && selectedProject !== RUNNING_PROJECT_ID) {
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
    async (agentId: string, input: string, images?: AttachedImage[]) => {
      const state = agents.get(agentId)?.state
      if (!state) return
      if (state.status !== 'running' && !(await ensurePreflightReady())) return

      if (images && images.length > 0) {
        // Write each image to system clipboard and send Ctrl+V to PTY
        for (const img of images) {
          await window.hydra.writeClipboardImage(img.dataUrl)
          // Small delay to ensure clipboard is written
          await new Promise((r) => setTimeout(r, 100))
          // Send Ctrl+V (0x16) to trigger Claude CLI image paste
          sendTerminalInput(agentId, '\x16')
          // Wait for CLI to process the image (Claude needs more time)
          const imageDelay = state.provider === 'claude' ? 400 : 200
          await new Promise((r) => setTimeout(r, imageDelay))
        }
        // Brief pause before sending prompt text after image paste completes
        await new Promise((r) => setTimeout(r, 100))
      }

      if (input) {
        sendInput(agentId, input)
      }
    },
    [agents, ensurePreflightReady, sendInput, sendTerminalInput]
  )

  const handleBroadcast = useCallback(
    async (projectDir: string, input: string) => {
      if (!(await ensurePreflightReady())) return
      await broadcastInput(projectDir, input)
    },
    [ensurePreflightReady, broadcastInput]
  )

  const handleQuitAndKillAgents = useCallback(async () => {
    setQuitConfirmRunningCount(null)
    await window.hydra.confirmQuit()
  }, [])

  const handleQuitKeepAgents = useCallback(async () => {
    setQuitConfirmRunningCount(null)
    await window.hydra.quitBackground()
  }, [])

  const handleCloseDialogs = useCallback(() => {
    if (showCommandPalette) setShowCommandPalette(false)
    if (showFileSearch) setShowFileSearch(false)
    if (showSettings) setShowSettings(false)
    if (showNewAgent) setShowNewAgent(false)
    if (showHeadless) setShowHeadless(false)
    if (showRemoteControl) setShowRemoteControl(false)
    if (showUsageDashboard) setShowUsageDashboard(false)
    if (showUpdatePanel) setShowUpdatePanel(false)
    if (showGitPanel) setShowGitPanel(false)
    if (showYoloConfirm) setShowYoloConfirm(false)
    if (showPreflightGate) setShowPreflightGate(false)
    if (quitConfirmRunningCount !== null) setQuitConfirmRunningCount(null)
  }, [
    quitConfirmRunningCount,
    showCommandPalette,
    showFileSearch,
    showGitPanel,
    showHeadless,
    showNewAgent,
    showPreflightGate,
    showRemoteControl,
    showSettings,
    showUpdatePanel,
    showUsageDashboard,
    showYoloConfirm
  ])

  const executeCommand = useCallback(
    (commandId: HydraCommandId, argument?: string): boolean => {
      switch (commandId) {
        case 'toggle-view':
          toggleViewMode()
          return true
        case 'switch-agent-by-index': {
          if (!argument) return false
          const index = parseInt(argument, 10) - 1
          if (index < 0 || index >= agentList.length) return false
          setSelectedAgentId(agentList[index].id)
          return true
        }
        case 'new-agent':
          void handleOpenNewAgent()
          return true
        case 'close-agent':
          if (!selectedAgentId) return false
          void handleRemoveAgent(selectedAgentId)
          return true
        case 'restart-agent':
          if (!selectedAgentId) return false
          void handleRestartAgent(selectedAgentId)
          return true
        case 'toggle-yolo': {
          if (!selectedAgentId) return false
          const agent = agents.get(selectedAgentId)
          if (!agent) return false
          void toggleYolo(selectedAgentId, !agent.state.yolo)
          return true
        }
        case 'toggle-global-yolo':
          setShowYoloConfirm(true)
          return true
        case 'toggle-editor':
          if (viewMode !== 'chat') return false
          editorPanel.toggle()
          return true
        case 'toggle-terminal':
          if (viewMode !== 'chat') return false
          setFreeTerminalOpen((prev) => !prev)
          return true
        case 'file-search':
          if (!selectedAgentId) return false
          setShowFileSearch(true)
          return true
        case 'save-file':
          if (!editorPanel.activeTabPath) return false
          void editorPanel.saveFile(editorPanel.activeTabPath)
          return true
        case 'command-palette':
          setShowCommandPalette(true)
          return true
        case 'settings':
          setShowSettings(true)
          return true
        case 'git-panel':
          setShowGitPanel(true)
          return true
        case 'usage-dashboard':
          setShowUsageDashboard(true)
          return true
        case 'updates':
          if (!updateState.supported) return false
          setShowUpdatePanel(true)
          return true
        case 'close-dialogs':
          handleCloseDialogs()
          return true
        case 'headless':
          setShowHeadless(true)
          return true
        case 'remote-control':
          setShowRemoteControl(true)
          return true
        case 'export-diagnostics':
          void window.hydra.exportDiagnostics()
          return true
        case 'open-keybindings-file':
          if (!keybindingsPath) return false
          void window.hydra.openPath(keybindingsPath)
          return true
      }
    },
    [
      agentList,
      agents,
      editorPanel,
      handleCloseDialogs,
      handleOpenNewAgent,
      handleRemoveAgent,
      handleRestartAgent,
      keybindingsPath,
      selectedAgentId,
      setSelectedAgentId,
      toggleViewMode,
      toggleYolo,
      updateState.supported,
      viewMode
    ]
  )

  // Sync view mode with config preference only when no persisted runtime view.
  useEffect(() => {
    if (persistedUi.viewMode) return
    setViewMode(config.defaultViewMode)
  }, [config.defaultViewMode, persistedUi.viewMode, setViewMode])

  // Auto-select project for grid view
  useEffect(() => {
    if (projectGroups.length === 0) return
    if (selectedProject === RUNNING_PROJECT_ID) return
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

  // Collapse the free terminal drawer when switching sessions.
  useEffect(() => {
    setFreeTerminalOpen(false)
  }, [selectedAgentId])

  // Keep selected chat agent synced to the active grid project.
  useEffect(() => {
    if (viewMode !== 'grid' || !selectedProject) return
    if (selectedProject === RUNNING_PROJECT_ID) return
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
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
      const match = matchKeybindingEvent(e, keybindings, isMac)
      if (!match) return
      if (!executeCommand(match.command, match.argument)) return
      e.preventDefault()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    executeCommand,
    keybindings
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
  const selectedProjectName = selectedProject === RUNNING_PROJECT_ID
    ? 'Running'
    : projectGroups.find((g) => g.projectDir === selectedProject)?.projectName

  const headerProjectDir = selectedAgent?.state.projectDir
    ?? (selectedProject && selectedProject !== RUNNING_PROJECT_ID ? selectedProject : null)

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
        onOpenRemote={() => setShowRemoteControl(true)}
        remoteActive={remoteControl.state.enabled}
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
          isViewSwitchPending ? (
            <aside className={styles.sidebarLoading} aria-hidden="true">
              <div className={styles.sidebarLoadingSearch} />
              <div className={styles.sidebarLoadingSection} />
              <div className={styles.sidebarLoadingList}>
                <div className={styles.sidebarLoadingItem} />
                <div className={styles.sidebarLoadingItem} />
                <div className={styles.sidebarLoadingItem} />
              </div>
            </aside>
          ) : (
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
              onRenameAgent={(agentId, newName) => {
                void renameAgent(agentId, newName)
              }}
              onRemoveAgent={(agentId) => {
                void handleRemoveAgent(agentId)
              }}
              width={sidebarWidth}
              onWidthChange={setSidebarWidth}
              sessionMaxAgeDays={config.sessionMaxAgeDays}
              defaultEditor={config.defaultEditor}
            />
          )
        )}

        <main className={styles.main}>
          {isViewSwitchPending ? (
            <ViewSwitchLoadingState targetMode={viewMode} />
          ) : renderedViewMode === 'chat' ? (
            <ChatView
              agent={selectedAgent?.state || null}
              rawOutput={selectedAgent?.rawOutput || ''}
              onSendInput={(input, images) => {
                if (selectedAgentId) {
                  void handleSendInput(selectedAgentId, input, images)
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
              onRemoveAgent={() => {
                if (selectedAgentId) void handleRemoveAgent(selectedAgentId)
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
              freeTerminalOpen={freeTerminalOpen}
              onToggleFreeTerminal={() => setFreeTerminalOpen((prev) => !prev)}
              gitPanelOpen={showGitPanel}
              onOpenGitPanel={() => setShowGitPanel(true)}
              onSwitchModel={(nextModel) => {
                if (!selectedAgentId || !selectedAgent) return
                if (selectedAgent.state.provider === 'codex') {
                  sendInput(selectedAgentId, '/model')
                  return
                }
                void setAgentModel(selectedAgentId, nextModel)
                sendTerminalInput(selectedAgentId, `/model ${nextModel}\r`)
              }}
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
              onStopAgent={(agentId) => {
                void killAgent(agentId)
              }}
              onRemoveAgent={(agentId) => {
                void handleRemoveAgent(agentId)
              }}
              onBroadcast={(input) => {
                if (selectedProject === RUNNING_PROJECT_ID) {
                  for (const group of projectGroups) {
                    void handleBroadcast(group.projectDir, input)
                  }
                } else if (selectedProject) {
                  void handleBroadcast(selectedProject, input)
                }
              }}
              onNewAgent={() => {
                handleOpenNewAgentForCurrentProject()
              }}
              rawOutputs={rawOutputs}
              expandedTileId={expandedTileId}
              onExpandedTileChange={handleExpandedTileChange}
              sessionMaxAgeDays={config.sessionMaxAgeDays}
              gridColumns={config.gridColumns}
              onGridColumnsChange={(cols) => updateConfig({ gridColumns: cols })}
            />
          )}
        </main>
      </div>

      {/* Dialogs */}
      {showSettings && (
        <SettingsPanel
          config={config}
          keybindings={keybindings}
          keybindingsPath={keybindingsPath}
          onUpdate={updateConfig}
          onClose={() => setShowSettings(false)}
          globalYolo={config.globalYolo}
          onToggleGlobalYolo={handleGlobalYoloToggle}
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

      {showRemoteControl && (
        <RemoteControlModal
          state={remoteControl.state}
          loading={remoteControl.loading}
          onEnable={remoteControl.enable}
          onDisable={remoteControl.disable}
          onClose={() => setShowRemoteControl(false)}
        />
      )}

      {showHeadless && (
        <HeadlessPanel
          defaultProjectDir={(selectedProject && selectedProject !== RUNNING_PROJECT_ID ? selectedProject : null) || config.defaultProjectDir}
          defaultProvider={config.defaultProvider}
          defaultModel={config.defaultModel}
          onClose={() => setShowHeadless(false)}
        />
      )}

      {showUsageDashboard && (
        <UsageDashboard
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

      {showPreflightGate && !showTestTerminal && (
        <div className={styles.confirmOverlay} onClick={() => setShowPreflightGate(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmIcon}>⚙️</div>
            <h3>No Supported CLI Found</h3>
            <p>
              Hydra could not find Claude, Codex, or OpenCode in your shell environment. Install at
              least one and make sure it is on your <code>PATH</code> so the command is available
              from any terminal.
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
                onClick={() => setShowTestTerminal(true)}
              >
                Test it out
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

      {showTestTerminal && (
        <PreflightTestModal
          onClose={() => setShowTestTerminal(false)}
          onRetryPreflight={() => { void runPreflightCheck() }}
        />
      )}

      {quitConfirmRunningCount !== null && (
        <div
          className={styles.confirmOverlay}
          onClick={() => setQuitConfirmRunningCount(null)}
        >
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmIcon}>⏻</div>
            <h3>
              {quitConfirmRunningCount === 1
                ? '1 agent is still running'
                : `${quitConfirmRunningCount} agents are still running`}
            </h3>
            <p>
              You can close Hydra and let agents continue in the background,
              or quit everything.
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setQuitConfirmRunningCount(null)}
              >
                Cancel
              </button>
              <button className={styles.primaryBtn} onClick={handleQuitKeepAgents}>
                Close
              </button>
              <button className={styles.dangerBtn} onClick={handleQuitAndKillAgents}>
                Quit All
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
          keybindings={keybindings}
          onExecute={(id) => {
            executeCommand(id)
          }}
          onClose={() => setShowCommandPalette(false)}
        />
      )}

      {showGitPanel && selectedAgent?.state.projectDir && (
        <GitPanel
          projectDir={selectedAgent.state.projectDir}
          theme={config.theme}
          defaultProvider={config.defaultProvider}
          defaultModel={config.defaultModel}
          onClose={() => setShowGitPanel(false)}
        />
      )}

      <NotificationToast notifications={notifications} onDismiss={dismissNotification} />
    </div>
  )
}

function ViewSwitchLoadingState({ targetMode }: { targetMode: ViewMode }) {
  return (
    <div className={styles.viewLoading}>
      <div className={styles.viewLoadingSpinner} aria-hidden="true" />
      <div className={styles.viewLoadingText}>
        <span className={styles.viewLoadingTitle}>
          Opening {targetMode === 'chat' ? 'chat' : 'grid'} view
        </span>
        <span className={styles.viewLoadingSubtitle}>
          Rendering the interface for this workspace.
        </span>
      </div>
    </div>
  )
}
