import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type {
  CreateAgentPayload,
  AgentState,
  AgentOutputPayload,
  AgentStatusPayload,
  AppConfig,
  PreflightResult,
  ProviderId,
  ProviderModelOption,
  ClaudeSessionSummary,
  ListClaudeSessionsOptions,
  HeadlessRun,
  ListHeadlessRunsOptions,
  HeadlessRunLogOptions,
  HeadlessRunLogPayload,
  StartHeadlessRunPayload,
  HeadlessRunEventPayload,
  ObservabilityLogEventPayload,
  ExportDiagnosticsResult,
  McpServerStatus,
  HydraNotification,
  CcusageOptions,
  CcusageSnapshot,
  AppUpdateState,
  FsDirEntry,
  FsReadFileResult,
  FsSearchResult,
  FsWatchEventPayload,
  GitStatus,
  GitCommit,
  GitBranch,
  GitFileContents,
  GitPrDiff,
  EditorId,
  RemoteControlState,
  SkillScanResult,
  SkillTogglePayload
} from '@shared/types'

export type HydraAPI = typeof hydraApi

const hydraApi = {
  // Preflight
  preflight: (provider?: ProviderId): Promise<PreflightResult> => ipcRenderer.invoke(IPC.PREFLIGHT_CHECK, provider),

  // Agent lifecycle
  createAgent: (payload: CreateAgentPayload): Promise<AgentState> =>
    ipcRenderer.invoke(IPC.AGENT_CREATE, payload),

  killAgent: (agentId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.AGENT_KILL, agentId),
  removeAgent: (agentId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.AGENT_REMOVE, agentId),

  restartAgent: (agentId: string): Promise<AgentState | null> =>
    ipcRenderer.invoke(IPC.AGENT_RESTART, agentId),

  listAgents: (): Promise<AgentState[]> => ipcRenderer.invoke(IPC.AGENT_LIST),

  toggleYolo: (agentId: string, yolo: boolean): Promise<AgentState | null> =>
    ipcRenderer.invoke(IPC.AGENT_YOLO_TOGGLE, agentId, yolo),

  renameAgent: (agentId: string, name: string): Promise<AgentState | null> =>
    ipcRenderer.invoke(IPC.AGENT_RENAME, agentId, name),
  setAgentModel: (agentId: string, model: string): Promise<AgentState | null> =>
    ipcRenderer.invoke(IPC.AGENT_MODEL_SET, agentId, model),

  getAgentBuffer: (agentId: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.AGENT_GET_BUFFER, agentId),

  // Agent I/O
  sendInput: (agentId: string, input: string): void =>
    ipcRenderer.send(IPC.AGENT_INPUT, agentId, input),
  sendRawInput: (agentId: string, data: string): void =>
    ipcRenderer.send(IPC.AGENT_INPUT_RAW, agentId, data),
  resizeAgent: (agentId: string, cols: number, rows: number): void =>
    ipcRenderer.send(IPC.AGENT_RESIZE, agentId, cols, rows),

  broadcast: (projectDir: string, input: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.AGENT_BROADCAST, projectDir, input),

  // Agent events
  onAgentOutput: (callback: (payload: AgentOutputPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentOutputPayload) =>
      callback(payload)
    ipcRenderer.on(IPC.AGENT_OUTPUT, handler)
    return () => { ipcRenderer.removeListener(IPC.AGENT_OUTPUT, handler) }
  },

  onAgentStatus: (callback: (payload: AgentStatusPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: AgentStatusPayload) =>
      callback(payload)
    ipcRenderer.on(IPC.AGENT_STATUS, handler)
    return () => { ipcRenderer.removeListener(IPC.AGENT_STATUS, handler) }
  },

  // Config
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),

  setConfig: (partial: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.CONFIG_SET, partial),

  onConfigChange: (callback: (config: AppConfig) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, config: AppConfig) =>
      callback(config)
    ipcRenderer.on(IPC.CONFIG_ON_CHANGE, handler)
    return () => { ipcRenderer.removeListener(IPC.CONFIG_ON_CHANGE, handler) }
  },

  // Global YOLO
  toggleGlobalYolo: (enabled: boolean): Promise<string[]> =>
    ipcRenderer.invoke(IPC.GLOBAL_YOLO_TOGGLE, enabled),

  // Clipboard
  writeClipboardImage: (dataUrl: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.CLIPBOARD_WRITE_IMAGE, dataUrl),

  // Dialog
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.DIALOG_SELECT_DIR),

  // Shell
  openInEditor: (dir: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OPEN_IN_EDITOR, dir),
  openInApp: (editorId: EditorId, dir: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OPEN_IN_APP, editorId, dir),
  getInstalledEditors: (): Promise<EditorId[]> =>
    ipcRenderer.invoke(IPC.GET_INSTALLED_EDITORS),

  // Session catalog
  listClaudeSessions: (options?: ListClaudeSessionsOptions): Promise<ClaudeSessionSummary[]> =>
    ipcRenderer.invoke(IPC.SESSIONS_LIST, options),
  listProviderModels: (provider: ProviderId): Promise<ProviderModelOption[]> =>
    ipcRenderer.invoke(IPC.PROVIDER_MODELS_LIST, provider),

  // App quit flow
  onConfirmQuit: (callback: (runningCount: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, runningCount: number) =>
      callback(runningCount)
    ipcRenderer.on(IPC.APP_CONFIRM_QUIT, handler)
    return () => { ipcRenderer.removeListener(IPC.APP_CONFIRM_QUIT, handler) }
  },
  confirmQuit: (): Promise<boolean> => ipcRenderer.invoke(IPC.APP_QUIT_FORCE),
  quitBackground: (): Promise<boolean> => ipcRenderer.invoke(IPC.APP_QUIT_BACKGROUND),

  // Headless runs
  startHeadlessRun: (payload: StartHeadlessRunPayload): Promise<HeadlessRun> =>
    ipcRenderer.invoke(IPC.HEADLESS_RUN_START, payload),
  listHeadlessRuns: (options?: ListHeadlessRunsOptions): Promise<HeadlessRun[]> =>
    ipcRenderer.invoke(IPC.HEADLESS_RUN_LIST, options),
  getHeadlessRun: (runId: string): Promise<HeadlessRun | null> =>
    ipcRenderer.invoke(IPC.HEADLESS_RUN_GET, runId),
  cancelHeadlessRun: (runId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.HEADLESS_RUN_CANCEL, runId),
  getHeadlessRunLog: (
    runId: string,
    options?: HeadlessRunLogOptions
  ): Promise<HeadlessRunLogPayload | null> =>
    ipcRenderer.invoke(IPC.HEADLESS_RUN_GET_LOG, runId, options),
  onHeadlessRunEvent: (
    callback: (payload: HeadlessRunEventPayload) => void
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: HeadlessRunEventPayload) =>
      callback(payload)
    ipcRenderer.on(IPC.HEADLESS_RUN_EVENT, handler)
    return () => { ipcRenderer.removeListener(IPC.HEADLESS_RUN_EVENT, handler) }
  },

  // Observability
  logEvent: (payload: ObservabilityLogEventPayload): void =>
    ipcRenderer.send(IPC.OBS_LOG_EVENT, payload),
  exportDiagnostics: (): Promise<ExportDiagnosticsResult> =>
    ipcRenderer.invoke(IPC.OBS_EXPORT_DIAGNOSTICS),

  // Usage dashboard (ccusage)
  getUsageDashboard: (options?: CcusageOptions): Promise<CcusageSnapshot> =>
    ipcRenderer.invoke(IPC.USAGE_DASHBOARD_GET, options),

  // App updates
  getUpdateState: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke(IPC.UPDATE_GET_STATE),
  checkForUpdates: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: (): Promise<AppUpdateState> =>
    ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdateAndRestart: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  onUpdateStateChange: (callback: (state: AppUpdateState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppUpdateState) =>
      callback(state)
    ipcRenderer.on(IPC.UPDATE_STATE_CHANGED, handler)
    return () => { ipcRenderer.removeListener(IPC.UPDATE_STATE_CHANGED, handler) }
  },

  // MCP
  getMcpServerStatus: (): Promise<McpServerStatus> =>
    ipcRenderer.invoke(IPC.MCP_SERVER_STATUS),

  // Notifications
  onNotification: (callback: (notification: HydraNotification) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, notification: HydraNotification) =>
      callback(notification)
    ipcRenderer.on(IPC.NOTIFICATION, handler)
    return () => { ipcRenderer.removeListener(IPC.NOTIFICATION, handler) }
  },
  dismissNotification: (id: string): void =>
    ipcRenderer.send(IPC.NOTIFICATION_DISMISS, id),

  // File system (editor panel)
  readDir: (agentId: string, dirPath: string): Promise<FsDirEntry[]> =>
    ipcRenderer.invoke(IPC.FS_READ_DIR, agentId, dirPath),
  readFile: (agentId: string, filePath: string): Promise<FsReadFileResult> =>
    ipcRenderer.invoke(IPC.FS_READ_FILE, agentId, filePath),
  writeFile: (agentId: string, filePath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.FS_WRITE_FILE, agentId, filePath, content),
  watchDir: (agentId: string): void =>
    ipcRenderer.send(IPC.FS_WATCH_START, agentId),
  unwatchDir: (agentId: string): void =>
    ipcRenderer.send(IPC.FS_WATCH_STOP, agentId),
  searchFiles: (agentId: string, query: string, maxResults?: number): Promise<FsSearchResult[]> =>
    ipcRenderer.invoke(IPC.FS_SEARCH_FILES, agentId, query, maxResults),
  onFsWatchEvent: (callback: (payload: FsWatchEventPayload) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: FsWatchEventPayload) =>
      callback(payload)
    ipcRenderer.on(IPC.FS_WATCH_EVENT, handler)
    return () => { ipcRenderer.removeListener(IPC.FS_WATCH_EVENT, handler) }
  },

  // Git
  getGitStatus: (projectDir: string): Promise<GitStatus> =>
    ipcRenderer.invoke(IPC.GIT_STATUS, projectDir),
  getGitLog: (projectDir: string, limit?: number): Promise<GitCommit[]> =>
    ipcRenderer.invoke(IPC.GIT_LOG, projectDir, limit),
  getGitDiff: (projectDir: string, filePath?: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_DIFF, projectDir, filePath),
  gitCommit: (projectDir: string, message: string, files?: string[]): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_COMMIT, projectDir, message, files),
  gitPush: (projectDir: string): Promise<void> =>
    ipcRenderer.invoke(IPC.GIT_PUSH, projectDir),

  // Git — branches
  gitListBranches: (projectDir: string): Promise<GitBranch[]> =>
    ipcRenderer.invoke(IPC.GIT_LIST_BRANCHES, projectDir),
  gitCheckout: (projectDir: string, branchName: string): Promise<void> =>
    ipcRenderer.invoke(IPC.GIT_CHECKOUT, projectDir, branchName),
  gitCreateBranch: (projectDir: string, branchName: string, startPoint?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.GIT_CREATE_BRANCH, projectDir, branchName, startPoint),

  // Git — worktrees
  gitWorktreeCreate: (projectDir: string, branchName: string): Promise<{ worktreePath: string; branch: string }> =>
    ipcRenderer.invoke(IPC.GIT_WORKTREE_CREATE, projectDir, branchName),
  gitWorktreeRemove: (projectDir: string, worktreePath: string, deleteBranch?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.GIT_WORKTREE_REMOVE, projectDir, worktreePath, deleteBranch),

  // Git — file contents for diff viewer
  gitFileContents: (projectDir: string, filePath: string): Promise<GitFileContents> =>
    ipcRenderer.invoke(IPC.GIT_FILE_CONTENTS, projectDir, filePath),

  // Git — PR review
  gitFetchPr: (projectDir: string, prIdentifier: string): Promise<GitPrDiff> =>
    ipcRenderer.invoke(IPC.GIT_PR_FETCH, projectDir, prIdentifier),
  gitPrFileDiff: (projectDir: string, prNumber: number, filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_PR_FILE_DIFF, projectDir, prNumber, filePath),

  // Remote control
  enableRemoteControl: (): Promise<RemoteControlState> =>
    ipcRenderer.invoke(IPC.REMOTE_ENABLE),
  disableRemoteControl: (): Promise<RemoteControlState> =>
    ipcRenderer.invoke(IPC.REMOTE_DISABLE),
  getRemoteControlState: (): Promise<RemoteControlState> =>
    ipcRenderer.invoke(IPC.REMOTE_GET_STATE),
  onRemoteStateChange: (callback: (state: RemoteControlState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: RemoteControlState) =>
      callback(state)
    ipcRenderer.on(IPC.REMOTE_STATE_CHANGED, handler)
    return () => { ipcRenderer.removeListener(IPC.REMOTE_STATE_CHANGED, handler) }
  },

  // Skills
  scanSkills: (): Promise<SkillScanResult> =>
    ipcRenderer.invoke(IPC.SKILLS_SCAN),
  toggleSkill: (payload: SkillTogglePayload): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.SKILLS_TOGGLE, payload),

  // Test terminal (preflight)
  spawnTestTerminal: (): Promise<void> =>
    ipcRenderer.invoke(IPC.TEST_TERMINAL_SPAWN),
  sendTestTerminalInput: (data: string): void =>
    ipcRenderer.send(IPC.TEST_TERMINAL_INPUT, data),
  resizeTestTerminal: (cols: number, rows: number): void =>
    ipcRenderer.send(IPC.TEST_TERMINAL_RESIZE, cols, rows),
  killTestTerminal: (): void =>
    ipcRenderer.send(IPC.TEST_TERMINAL_KILL),
  onTestTerminalOutput: (callback: (data: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on(IPC.TEST_TERMINAL_OUTPUT, handler)
    return () => { ipcRenderer.removeListener(IPC.TEST_TERMINAL_OUTPUT, handler) }
  },
  onTestTerminalExit: (callback: (exitCode: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, exitCode: number) => callback(exitCode)
    ipcRenderer.on(IPC.TEST_TERMINAL_EXIT, handler)
    return () => { ipcRenderer.removeListener(IPC.TEST_TERMINAL_EXIT, handler) }
  },

  // Free terminal (integrated shell)
  spawnFreeTerminal: (cwd?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FREE_TERMINAL_SPAWN, cwd),
  sendFreeTerminalInput: (data: string): void =>
    ipcRenderer.send(IPC.FREE_TERMINAL_INPUT, data),
  resizeFreeTerminal: (cols: number, rows: number): void =>
    ipcRenderer.send(IPC.FREE_TERMINAL_RESIZE, cols, rows),
  killFreeTerminal: (): void =>
    ipcRenderer.send(IPC.FREE_TERMINAL_KILL),
  onFreeTerminalOutput: (callback: (data: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on(IPC.FREE_TERMINAL_OUTPUT, handler)
    return () => { ipcRenderer.removeListener(IPC.FREE_TERMINAL_OUTPUT, handler) }
  },
  onFreeTerminalExit: (callback: (exitCode: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, exitCode: number) => callback(exitCode)
    ipcRenderer.on(IPC.FREE_TERMINAL_EXIT, handler)
    return () => { ipcRenderer.removeListener(IPC.FREE_TERMINAL_EXIT, handler) }
  }
}

contextBridge.exposeInMainWorld('hydra', hydraApi)
