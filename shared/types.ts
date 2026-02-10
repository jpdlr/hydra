// ── Agent ────────────────────────────────────────────────────────────────────

export type AgentStatus = 'running' | 'idle' | 'errored' | 'starting'

export interface AgentConfig {
  id: string
  name: string
  projectDir: string
  provider: ProviderId
  model: ModelId
  reasoningEffort?: string
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

// ── Providers ────────────────────────────────────────────────────────────────

export type ProviderId = 'claude' | 'codex'

/** Free-form model identifier — any string accepted so new models work without code changes. */
export type ModelId = string

export const PROVIDER_MODELS: Record<ProviderId, { id: ModelId; label: string }[]> = {
  claude: [
    { id: 'opus', label: 'Opus' },
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'haiku', label: 'Haiku' }
  ],
  codex: [
    { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
    { id: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' }
  ]
}

export const CODEX_REASONING_LEVELS = ['low', 'medium', 'high', 'extra_high'] as const
export type CodexReasoningLevel = (typeof CODEX_REASONING_LEVELS)[number]

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  claude: 'Claude',
  codex: 'Codex'
}

export function getDefaultModelForProvider(provider: ProviderId): ModelId {
  return PROVIDER_MODELS[provider][0].id
}

export function getProviderForModel(model: ModelId): ProviderId {
  for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
    if (models.some((m) => m.id === model)) return provider as ProviderId
  }
  return 'claude'
}

// ── Config ───────────────────────────────────────────────────────────────────
export type ThemeId = 'light' | 'dark' | 'midnight'
export type ViewMode = 'grid' | 'chat'
export interface AppConfig {
  schemaVersion: number
  defaultProvider: ProviderId
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
  usageDailyTokenBudget: number
  usageDailyCostBudgetUsd: number
  usageBudgetWarningThresholdPct: number
  enableRemoteErrorReporting: boolean
  errorReportingEndpoint: string
  includeSensitiveDiagnostics: boolean
}

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 1,
  defaultProvider: 'claude',
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
  usageDailyTokenBudget: 0,
  usageDailyCostBudgetUsd: 0,
  usageBudgetWarningThresholdPct: 80,
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

  // Usage dashboard
  USAGE_DASHBOARD_GET: 'usage:dashboard-get',
  USAGE_UPDATED: 'usage:updated',

  // App updates
  UPDATE_GET_STATE: 'update:get-state',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATE_CHANGED: 'update:state-changed',

  // MCP
  MCP_SERVER_STATUS: 'mcp:server-status',

  // Notifications
  NOTIFICATION: 'notification:push',
  NOTIFICATION_DISMISS: 'notification:dismiss'
} as const

// ── IPC Payloads ─────────────────────────────────────────────────────────────

export interface CreateAgentPayload {
  name: string
  projectDir: string
  provider: ProviderId
  model: ModelId
  reasoningEffort?: string
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
  provider: ProviderId
  model: ModelId
  reasoningEffort?: string
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
  provider: ProviderId
  model: ModelId
  reasoningEffort?: string
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

// ── Usage dashboard ──────────────────────────────────────────────────────────

export interface UsageAgentDailyStat {
  agentId: string
  agentName: string
  projectDir: string
  projectName: string
  provider: ProviderId
  model: ModelId
  tokens: number
  costUsd: number
  updatedAt: string
}

export interface UsageProjectDailyStat {
  projectDir: string
  projectName: string
  agentCount: number
  tokens: number
  costUsd: number
}

export interface UsageDailySummary {
  date: string
  tokens: number
  costUsd: number
  updatedAt: string
  agents: UsageAgentDailyStat[]
  projects: UsageProjectDailyStat[]
}

export interface UsageBudgetStatus {
  dailyTokenBudget: number | null
  dailyCostBudgetUsd: number | null
  warningThresholdPct: number
  tokenUsagePct: number | null
  costUsagePct: number | null
  tokenWarningReached: boolean
  costWarningReached: boolean
  tokenBudgetExceeded: boolean
  costBudgetExceeded: boolean
}

export interface UsageDashboardSnapshot {
  generatedAt: string
  today: UsageDailySummary | null
  days: UsageDailySummary[]
  budget: UsageBudgetStatus
}

export interface UsageDashboardOptions {
  days?: number
}

// ── App updates ───────────────────────────────────────────────────────────────

export interface AppUpdateState {
  supported: boolean
  platform: string
  checking: boolean
  available: boolean
  downloaded: boolean
  downloading: boolean
  currentVersion: string
  latestVersion: string | null
  releaseDate: string | null
  releaseNotes: string | null
  error: string | null
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

// ── Project grouping ─────────────────────────────────────────────────────────

export interface ProjectGroup {
  projectDir: string
  projectName: string
  agents: AgentState[]
}

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'agent_idle'
  | 'agent_errored'
  | 'agent_started'
  | 'headless_completed'
  | 'headless_errored'
  | 'usage_budget_warning'

export interface HydraNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  agentId?: string
  runId?: string
  timestamp: string
}

// ── MCP ──────────────────────────────────────────────────────────────────────

export interface McpServerStatus {
  running: boolean
  port: number | null
  error: string | null
  managerWorkspace: string | null
}
