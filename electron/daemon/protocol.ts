import type {
  AgentState,
  AgentOutputPayload,
  AgentStatusPayload,
  CreateAgentPayload,
  AppConfig,
  PreflightResult,
  ProviderId,
  HydraNotification,
  ClaudeSessionSummary,
  ListClaudeSessionsOptions,
  HeadlessRun,
  ListHeadlessRunsOptions,
  HeadlessRunLogPayload,
  HeadlessRunLogOptions,
  StartHeadlessRunPayload,
  McpServerStatus
} from '@shared/types'

// ── REST API ──────────────────────────────────────────────────────────────────

export interface DaemonHealthResponse {
  status: 'ok'
  pid: number
  uptime: number
  agentCount: number
  version: string
}

export interface DaemonErrorResponse {
  error: string
}

// ── WebSocket messages ────────────────────────────────────────────────────────

export type WsServerMessage =
  | { type: 'agent:output'; payload: AgentOutputPayload }
  | { type: 'agent:status'; payload: AgentStatusPayload }
  | { type: 'agent:waiting'; payload: { agentId: string } }
  | { type: 'notification'; payload: HydraNotification }
  | { type: 'config:changed'; payload: AppConfig }
  | { type: 'headless:event'; payload: { runId: string; data: string } }
  | { type: 'workspace:changed' }
  | { type: 'test-terminal:output'; payload: { data: string } }
  | { type: 'test-terminal:exit'; payload: { exitCode: number } }
  | { type: 'free-terminal:output'; payload: { data: string } }
  | { type: 'free-terminal:exit'; payload: { exitCode: number } }

export type WsClientMessage =
  | { type: 'ping' }

// ── REST route types ──────────────────────────────────────────────────────────

export interface AgentInputBody {
  input: string
}

export interface AgentRawInputBody {
  data: string
}

export interface AgentResizeBody {
  cols: number
  rows: number
}

export interface AgentBroadcastBody {
  projectDir: string
  input: string
}

export interface AgentToggleYoloBody {
  yolo: boolean
}

export interface ConfigPatchBody {
  config: Partial<AppConfig>
}

export interface PreflightBody {
  provider?: ProviderId
}

// Re-export shared types for convenience
export type {
  AgentState,
  AgentOutputPayload,
  AgentStatusPayload,
  CreateAgentPayload,
  AppConfig,
  PreflightResult,
  ProviderId,
  HydraNotification,
  ClaudeSessionSummary,
  ListClaudeSessionsOptions,
  HeadlessRun,
  ListHeadlessRunsOptions,
  HeadlessRunLogPayload,
  HeadlessRunLogOptions,
  StartHeadlessRunPayload,
  McpServerStatus
}
