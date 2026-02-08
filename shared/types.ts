// ── Agent ────────────────────────────────────────────────────────────────────

export type AgentStatus = 'running' | 'idle' | 'errored' | 'starting'

export interface AgentConfig {
  id: string
  name: string
  projectDir: string
  model: ModelId
  yolo: boolean
  isManager: boolean
  sessionId: string | null
  initialPrompt: string
  createdAt: string
}

export interface AgentState extends AgentConfig {
  status: AgentStatus
  pid: number | null
  restartCount: number
  startedAt: string | null
}

// ── Config ───────────────────────────────────────────────────────────────────

export type ModelId = 'opus' | 'sonnet' | 'haiku'
export type ThemeId = 'light' | 'dark'
export type ViewMode = 'grid' | 'chat'
export type ChatRenderMode = 'terminal' | 'bubbles'

export interface AppConfig {
  schemaVersion: number
  defaultModel: ModelId
  globalYolo: boolean
  maxAgents: number
  theme: ThemeId
  defaultViewMode: ViewMode
  defaultProjectDir: string
  importSessionsOnStartup: boolean
  sessionImportLimit: number
  sessionMaxAgeDays: number
  sessionImportProjectPrefix: string
  hiddenSessionIds: string[]
  chatRenderMode: ChatRenderMode
  enableRemoteErrorReporting: boolean
  errorReportingEndpoint: string
  includeSensitiveDiagnostics: boolean
}

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 1,
  defaultModel: 'sonnet',
  globalYolo: false,
  maxAgents: 8,
  theme: 'dark',
  defaultViewMode: 'chat',
  defaultProjectDir: '',
  importSessionsOnStartup: true,
  sessionImportLimit: 500,
  sessionMaxAgeDays: 7,
  sessionImportProjectPrefix: '',
  hiddenSessionIds: [],
  chatRenderMode: 'terminal',
  enableRemoteErrorReporting: false,
  errorReportingEndpoint: '',
  includeSensitiveDiagnostics: false
}

// ── IPC Channels ─────────────────────────────────────────────────────────────

export const IPC = {
  // Agent lifecycle
  AGENT_CREATE: 'agent:create',
  AGENT_KILL: 'agent:kill',
  AGENT_REMOVE: 'agent:remove',
  AGENT_RESTART: 'agent:restart',
  AGENT_INPUT: 'agent:input',
  AGENT_INPUT_RAW: 'agent:input-raw',
  AGENT_RESIZE: 'agent:resize',
  AGENT_OUTPUT: 'agent:output',
  AGENT_STATUS: 'agent:status',
  AGENT_LIST: 'agent:list',
  AGENT_YOLO_TOGGLE: 'agent:yolo-toggle',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_ON_CHANGE: 'config:on-change',

  // Global YOLO
  GLOBAL_YOLO_TOGGLE: 'global:yolo-toggle',

  // Preflight
  PREFLIGHT_CHECK: 'preflight:check',

  // Dialog
  DIALOG_SELECT_DIR: 'dialog:select-dir',

  // Shell
  OPEN_IN_EDITOR: 'shell:open-in-editor',

  // Broadcast
  AGENT_BROADCAST: 'agent:broadcast',

  // Sessions
  SESSIONS_LIST: 'sessions:list',

  // App lifecycle
  APP_CONFIRM_QUIT: 'app:confirm-quit',
  APP_QUIT_FORCE: 'app:quit-force',

  // Headless orchestration
  HEADLESS_RUN_START: 'headless:run-start',
  HEADLESS_RUN_LIST: 'headless:run-list',
  HEADLESS_RUN_GET: 'headless:run-get',
  HEADLESS_RUN_CANCEL: 'headless:run-cancel',
  HEADLESS_RUN_GET_LOG: 'headless:run-get-log',
  HEADLESS_RUN_EVENT: 'headless:run-event',

  // Observability
  OBS_LOG_EVENT: 'obs:log-event',
  OBS_EXPORT_DIAGNOSTICS: 'obs:export-diagnostics',

  // MCP
  MCP_SERVER_STATUS: 'mcp:server-status'
} as const

// ── IPC Payloads ─────────────────────────────────────────────────────────────

export interface CreateAgentPayload {
  name: string
  projectDir: string
  model: ModelId
  yolo: boolean
  initialPrompt: string
  resumeSessionId?: string | null
  isManager?: boolean
}

export interface AgentOutputPayload {
  agentId: string
  data: string
}

export interface AgentStatusPayload {
  agentId: string
  status: AgentStatus
  sessionId?: string | null
}

export interface PreflightResult {
  ok: boolean
  claudePath: string | null
  version: string | null
  error: string | null
}

export interface ClaudeSessionSummary {
  sessionId: string
  projectPath: string
  firstPrompt: string
  messageCount: number
  createdAt: string
  modifiedAt: string
  gitBranch: string | null
  isSidechain: boolean
  sourcePath: string
}

export interface ListClaudeSessionsOptions {
  limit?: number
  maxAgeDays?: number
  projectPathPrefix?: string
  includeHidden?: boolean
}

// ── Headless runs ───────────────────────────────────────────────────────────

export type HeadlessRunStatus = 'running' | 'completed' | 'errored' | 'canceled'

export interface HeadlessRun {
  id: string
  prompt: string
  projectDir: string
  model: ModelId
  resumeSessionId: string | null
  status: HeadlessRunStatus
  startedAt: string
  endedAt: string | null
  sessionId: string | null
  error: string | null
}

export interface StartHeadlessRunPayload {
  prompt: string
  projectDir: string
  model: ModelId
  resumeSessionId?: string | null
}

export interface HeadlessRunEventPayload {
  runId: string
  data: string
}

export interface ListHeadlessRunsOptions {
  query?: string
  status?: HeadlessRunStatus | 'all'
  limit?: number
}

export interface HeadlessRunLogOptions {
  tailLines?: number
  maxChars?: number
}

export interface HeadlessRunLogPayload {
  runId: string
  content: string
  totalLines: number
  returnedLines: number
  truncated: boolean
}

// ── Observability ──────────────────────────────────────────────────────────

export type ObservabilityLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface ObservabilityLogEventPayload {
  level: ObservabilityLogLevel
  event: string
  message?: string
  traceId?: string
  agentId?: string
  sessionId?: string
  projectId?: string
  service?: 'main' | 'renderer' | 'preload'
  meta?: Record<string, unknown>
}

export interface ExportDiagnosticsResult {
  path: string | null
  error: string | null
}

// ── Chat Message (parsed from PTY output) ────────────────────────────────────

export type ChatMessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  role: ChatMessageRole
  content: string
  timestamp: number
  isThinking?: boolean
  toolCall?: {
    tool: string
    input: string
    output?: string
  }
  codeBlocks?: Array<{
    language: string
    code: string
    filePath?: string
  }>
}

// ── Project grouping ─────────────────────────────────────────────────────────

export interface ProjectGroup {
  projectDir: string
  projectName: string
  agents: AgentState[]
}

// ── MCP ──────────────────────────────────────────────────────────────────────

export interface McpServerStatus {
  running: boolean
  port: number | null
  error: string | null
  managerWorkspace: string | null
}
