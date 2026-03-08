// ── Agent ────────────────────────────────────────────────────────────────────

export type AgentStatus = 'running' | 'idle' | 'errored' | 'starting'

export type WorkMode = 'local' | 'worktree'

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
  workMode: WorkMode
  worktreePath: string | null
  worktreeBranch: string | null
}

export interface AgentState extends AgentConfig {
  status: AgentStatus
  pid: number | null
  restartCount: number
  startedAt: string | null
  lastActivityAt: string
}

// ── Providers ────────────────────────────────────────────────────────────────

export type ProviderId = 'claude' | 'codex'

/** Free-form model identifier — any string accepted so new models work without code changes. */
export type ModelId = string

export interface ProviderModelOption {
  id: ModelId
  label: string
  description?: string
  hidden?: boolean
  isDefault?: boolean
  reasoningEfforts?: string[]
  defaultReasoningEffort?: string | null
}

export const PROVIDER_MODELS: Record<ProviderId, ProviderModelOption[]> = {
  claude: [
    { id: 'opus', label: 'Opus' },
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'haiku', label: 'Haiku' }
  ],
  codex: [
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', isDefault: true },
    { id: 'gpt-5.4', label: 'GPT-5.4' },
    { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
    { id: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max' },
    { id: 'gpt-5.2', label: 'GPT-5.2' },
    { id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' }
  ]
}

export const CODEX_REASONING_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
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

// ── Editors ──────────────────────────────────────────────────────────────────

export type EditorId = 'vscode' | 'cursor' | 'windsurf' | 'antigravity' | 'zed' | 'finder' | 'terminal'

export interface EditorDefinition {
  id: EditorId
  label: string
  command: string
  extraArgs?: string[]
}

export const EDITOR_REGISTRY: EditorDefinition[] = [
  { id: 'vscode', label: 'VS Code', command: 'code' },
  { id: 'cursor', label: 'Cursor', command: 'cursor' },
  { id: 'windsurf', label: 'Windsurf', command: 'windsurf' },
  { id: 'antigravity', label: 'Antigravity', command: 'antigravity' },
  { id: 'zed', label: 'Zed', command: 'zed' },
  { id: 'finder', label: 'Finder', command: 'open' },
  { id: 'terminal', label: 'Terminal', command: 'open', extraArgs: ['-a', 'Terminal'] }
]

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
  defaultEditor: EditorId
  importSessionsOnStartup: boolean
  sessionImportLimit: number
  sessionMaxAgeDays: number
  sessionImportProjectPrefix: string
  hiddenSessionIds: string[]
  /** @deprecated Kept for backward compat with old config files */
  usageDailyTokenBudget?: number
  /** @deprecated */
  usageDailyCostBudgetUsd?: number
  /** @deprecated */
  usageBudgetWarningThresholdPct?: number
  enableSoundEffects: boolean
  enableRemoteErrorReporting: boolean
  errorReportingEndpoint: string
  includeSensitiveDiagnostics: boolean
  remoteControlEnabled: boolean
  remoteSessionTimeoutMinutes: number
}

export const MAX_CONCURRENT_AGENTS_HARD_LIMIT = 10

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 1,
  defaultProvider: 'claude',
  defaultModel: 'sonnet',
  globalYolo: false,
  maxAgents: 8,
  theme: 'dark',
  defaultViewMode: 'chat',
  defaultProjectDir: '',
  defaultEditor: 'vscode',
  importSessionsOnStartup: true,
  sessionImportLimit: 500,
  sessionMaxAgeDays: 7,
  sessionImportProjectPrefix: '',
  hiddenSessionIds: [],
  enableSoundEffects: true,
  enableRemoteErrorReporting: false,
  errorReportingEndpoint: '',
  includeSensitiveDiagnostics: false,
  remoteControlEnabled: false,
  remoteSessionTimeoutMinutes: 480
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
  AGENT_RENAME: 'agent:rename',
  AGENT_MODEL_SET: 'agent:model-set',
  AGENT_GET_BUFFER: 'agent:get-buffer',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_ON_CHANGE: 'config:on-change',

  // Global YOLO
  GLOBAL_YOLO_TOGGLE: 'global:yolo-toggle',

  // Preflight
  PREFLIGHT_CHECK: 'preflight:check',

  // Clipboard
  CLIPBOARD_WRITE_IMAGE: 'clipboard:write-image',

  // Dialog
  DIALOG_SELECT_DIR: 'dialog:select-dir',

  // Shell
  OPEN_IN_EDITOR: 'shell:open-in-editor',
  OPEN_IN_APP: 'shell:open-in-app',
  GET_INSTALLED_EDITORS: 'shell:get-installed-editors',

  // Broadcast
  AGENT_BROADCAST: 'agent:broadcast',

  // Sessions
  SESSIONS_LIST: 'sessions:list',
  PROVIDER_MODELS_LIST: 'provider-models:list',

  // App lifecycle
  APP_CONFIRM_QUIT: 'app:confirm-quit',
  APP_QUIT_FORCE: 'app:quit-force',
  APP_QUIT_BACKGROUND: 'app:quit-background',

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

  // Usage dashboard (ccusage)
  USAGE_DASHBOARD_GET: 'usage:dashboard-get',

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
  NOTIFICATION_DISMISS: 'notification:dismiss',

  // File system (editor panel)
  FS_READ_DIR: 'fs:read-dir',
  FS_READ_FILE: 'fs:read-file',
  FS_WRITE_FILE: 'fs:write-file',
  FS_WATCH_START: 'fs:watch-start',
  FS_WATCH_STOP: 'fs:watch-stop',
  FS_WATCH_EVENT: 'fs:watch-event',
  FS_SEARCH_FILES: 'fs:search-files',

  // Git
  GIT_STATUS: 'git:status',
  GIT_LOG: 'git:log',
  GIT_DIFF: 'git:diff',
  GIT_COMMIT: 'git:commit',
  GIT_PUSH: 'git:push',

  // Git — branches
  GIT_LIST_BRANCHES: 'git:list-branches',
  GIT_CHECKOUT: 'git:checkout',
  GIT_CREATE_BRANCH: 'git:create-branch',

  // Git — file contents for diff viewer
  GIT_FILE_CONTENTS: 'git:file-contents',

  // Git — worktrees
  GIT_WORKTREE_CREATE: 'git:worktree-create',
  GIT_WORKTREE_REMOVE: 'git:worktree-remove',

  // Git — PR review
  GIT_PR_FETCH: 'git:pr-fetch',
  GIT_PR_FILE_DIFF: 'git:pr-file-diff',

  // Remote control
  REMOTE_ENABLE: 'remote:enable',
  REMOTE_DISABLE: 'remote:disable',
  REMOTE_GET_STATE: 'remote:get-state',
  REMOTE_STATE_CHANGED: 'remote:state-changed',

  // Skills
  SKILLS_SCAN: 'skills:scan',
  SKILLS_TOGGLE: 'skills:toggle',

  // Test terminal (preflight)
  TEST_TERMINAL_SPAWN: 'test-terminal:spawn',
  TEST_TERMINAL_INPUT: 'test-terminal:input',
  TEST_TERMINAL_RESIZE: 'test-terminal:resize',
  TEST_TERMINAL_OUTPUT: 'test-terminal:output',
  TEST_TERMINAL_EXIT: 'test-terminal:exit',
  TEST_TERMINAL_KILL: 'test-terminal:kill',

  // Free terminal (integrated shell)
  FREE_TERMINAL_SPAWN: 'free-terminal:spawn',
  FREE_TERMINAL_INPUT: 'free-terminal:input',
  FREE_TERMINAL_RESIZE: 'free-terminal:resize',
  FREE_TERMINAL_OUTPUT: 'free-terminal:output',
  FREE_TERMINAL_EXIT: 'free-terminal:exit',
  FREE_TERMINAL_KILL: 'free-terminal:kill'
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
  workMode?: WorkMode
}

export interface AgentOutputPayload {
  agentId: string
  data: string
}

export interface AgentStatusPayload {
  agentId: string
  status: AgentStatus
  sessionId?: string | null
  model?: ModelId
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
  provider?: ProviderId
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

// ── Usage dashboard (ccusage) ────────────────────────────────────────────────

export interface CcusageModelBreakdown {
  modelName: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  cost: number
}

export interface CcusageDailyEntry {
  date: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  totalTokens: number
  totalCost: number
  modelsUsed: string[]
  modelBreakdowns: CcusageModelBreakdown[]
}

export interface CcusageSnapshot {
  available: boolean
  installHint?: string
  generatedAt: string
  daily: CcusageDailyEntry[]
  /** project key → daily entries */
  projects: Record<string, CcusageDailyEntry[]>
}

export interface CcusageOptions {
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

/** Sentinel value for the "Running" meta-tab in GridView. */
export const RUNNING_PROJECT_ID = '__running__' as const

// ── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'agent_idle'
  | 'agent_waiting'
  | 'agent_errored'
  | 'agent_started'
  | 'headless_completed'
  | 'headless_errored'

export interface HydraNotification {
  id: string
  type: NotificationType
  title: string
  body: string
  agentId?: string
  runId?: string
  timestamp: string
}

// ── Remote Control ──────────────────────────────────────────────────────────

export type RemoteSessionStatus = 'creating' | 'active' | 'disconnected' | 'expired' | 'error'

export interface RemoteControlState {
  enabled: boolean
  status: RemoteSessionStatus
  sessionId: string | null
  qrPayload: string | null
  connectedAt: string | null
  expiresAt: string | null
  mobileConnected: boolean
  error: string | null
}

export interface RemoteInboxMessage {
  id: string
  type: 'handshake' | 'prompt' | 'kill' | 'create' | 'restart' | 'broadcast' | 'get_history'
  payload: Record<string, unknown>
  timestamp: string
  processed: boolean
}

export interface RemoteOutboxMessage {
  id: string
  type: 'output' | 'status' | 'notification' | 'agent_list'
  payload: Record<string, unknown>
  timestamp: string
}

export interface RemoteAgentSummary {
  agentId: string
  name: string
  status: AgentStatus
  model: ModelId
  provider: ProviderId
  projectDir: string
  sessionId: string | null
  createdAt?: string
  startedAt?: string | null
}

// ── Skills ──────────────────────────────────────────────────────────────────

export interface SkillInfo {
  id: string
  name: string
  description: string
  provider: ProviderId
  /** For Claude: plugin name (e.g. "superpowers@claude-plugins-official"). For Codex: skill directory name. */
  group: string
  enabled: boolean
  /** Filesystem path to the SKILL.md (or SKILL.md.disabled) */
  path: string
}

export interface SkillScanResult {
  claude: SkillInfo[]
  codex: SkillInfo[]
  scannedAt: string
}

export interface SkillTogglePayload {
  provider: ProviderId
  /** For Claude: the plugin key (e.g. "superpowers@claude-plugins-official"). For Codex: the skill id. */
  id: string
  enabled: boolean
}

// ── MCP ──────────────────────────────────────────────────────────────────────

export interface McpServerStatus {
  running: boolean
  port: number | null
  error: string | null
  managerWorkspace: string | null
}

// ── File System (Editor Panel) ──────────────────────────────────────────────

export interface FsDirEntry {
  name: string
  isDirectory: boolean
}

export interface FsReadFileResult {
  content: string
  path: string
}

export interface FsSearchResult {
  path: string
  name: string
  isDirectory: false
}

export interface FsWatchEventPayload {
  agentId: string
  eventType: 'change' | 'rename'
  path: string
}

// ── Git ──────────────────────────────────────────────────────────────────────

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  modified: string[]
  staged: string[]
  untracked: string[]
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
}

export interface GitBranch {
  name: string
  isCurrent: boolean
  isRemote: boolean
  upstream: string | null
  aheadOfUpstream: number
  behindUpstream: number
}

export interface GitFileContents {
  original: string
  modified: string
  language: string
}

export interface GitPrMetadata {
  number: number
  title: string
  author: string
  state: string
  baseRef: string
  headRef: string
  body: string
  url: string
  additions: number
  deletions: number
  changedFiles: number
  createdAt: string
  updatedAt: string
}

export interface GitPrFile {
  path: string
  status: string
  additions: number
  deletions: number
  patch: string
}

export interface GitPrDiff {
  metadata: GitPrMetadata
  files: GitPrFile[]
}
