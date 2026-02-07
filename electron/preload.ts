import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/types'
import type {
  CreateAgentPayload,
  AgentState,
  AgentOutputPayload,
  AgentStatusPayload,
  AppConfig,
  PreflightResult,
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
  McpServerStatus
} from '@shared/types'

export type HydraAPI = typeof hydraApi

const hydraApi = {
  // Preflight
  preflight: (): Promise<PreflightResult> => ipcRenderer.invoke(IPC.PREFLIGHT_CHECK),

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

  // Dialog
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.DIALOG_SELECT_DIR),

  // Shell
  openInEditor: (dir: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.OPEN_IN_EDITOR, dir),

  // Session catalog
  listClaudeSessions: (options?: ListClaudeSessionsOptions): Promise<ClaudeSessionSummary[]> =>
    ipcRenderer.invoke(IPC.SESSIONS_LIST, options),

  // App quit flow
  onConfirmQuit: (callback: (runningCount: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, runningCount: number) =>
      callback(runningCount)
    ipcRenderer.on(IPC.APP_CONFIRM_QUIT, handler)
    return () => { ipcRenderer.removeListener(IPC.APP_CONFIRM_QUIT, handler) }
  },
  confirmQuit: (): Promise<boolean> => ipcRenderer.invoke(IPC.APP_QUIT_FORCE),

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

  // MCP
  getMcpServerStatus: (): Promise<McpServerStatus> =>
    ipcRenderer.invoke(IPC.MCP_SERVER_STATUS)
}

contextBridge.exposeInMainWorld('hydra', hydraApi)
