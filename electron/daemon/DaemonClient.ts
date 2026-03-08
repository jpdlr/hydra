import { EventEmitter } from 'events'
import { request as httpRequest, type RequestOptions } from 'http'
import { createConnection } from 'net'
import WebSocket from 'ws'
import type {
  AgentState,
  CreateAgentPayload,
  AppConfig,
  PreflightResult,
  ProviderId,
  ClaudeSessionSummary,
  ListClaudeSessionsOptions,
  HeadlessRun,
  ListHeadlessRunsOptions,
  HeadlessRunLogPayload,
  HeadlessRunLogOptions,
  StartHeadlessRunPayload,
  McpServerStatus,
  SkillScanResult,
  SkillTogglePayload
} from '@shared/types'
import type { DaemonHealthResponse, WsServerMessage } from './protocol'

const WS_RECONNECT_INTERVAL = 2000
const WS_MAX_RECONNECT_INTERVAL = 30000

/**
 * HTTP + WebSocket client that communicates with the Hydra daemon.
 *
 * Emits the same events as AgentManager so it can be a drop-in replacement:
 *   - 'output'  → AgentOutputPayload
 *   - 'status'  → AgentStatusPayload
 *   - 'agent_waiting' → { agentId: string }
 */
export class DaemonClient extends EventEmitter {
  private ws: WebSocket | null = null
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private wsReconnectAttempts = 0
  private connected = false
  private destroyed = false

  constructor(private readonly socketPath: string) {
    super()
  }

  // ── Connection lifecycle ────────────────────────────────────────────────

  async connect(): Promise<void> {
    // Test daemon is alive
    await this.health()
    this.connectWebSocket()
    this.connected = true
  }

  disconnect(): void {
    this.destroyed = true
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer)
      this.wsReconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN
  }

  private connectWebSocket(): void {
    if (this.destroyed) return

    // Route websocket traffic over a raw Unix socket connection.
    // Using ws+unix URLs can URL-encode spaces in macOS paths
    // (e.g. `Application Support` -> `%20`) and fail with ENOENT.
    const ws = new WebSocket('ws://localhost/ws', {
      createConnection: () => createConnection(this.socketPath)
    })

    ws.on('open', () => {
      this.wsReconnectAttempts = 0
      this.ws = ws
    })

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsServerMessage
        switch (msg.type) {
          case 'agent:output':
            this.emit('output', msg.payload)
            break
          case 'agent:status':
            this.emit('status', msg.payload)
            break
          case 'agent:waiting':
            this.emit('agent_waiting', msg.payload)
            break
          case 'notification':
            this.emit('notification', msg.payload)
            break
          case 'config:changed':
            this.emit('config:changed', msg.payload)
            break
          case 'headless:event':
            this.emit('headless:event', msg.payload)
            break
          case 'workspace:changed':
            this.emit('workspace:changed')
            break
          case 'test-terminal:output':
            this.emit('test-terminal:output', msg.payload.data)
            break
          case 'test-terminal:exit':
            this.emit('test-terminal:exit', msg.payload.exitCode)
            break
          case 'free-terminal:output':
            this.emit('free-terminal:output', msg.payload.data)
            break
          case 'free-terminal:exit':
            this.emit('free-terminal:exit', msg.payload.exitCode)
            break
        }
      } catch {
        // Ignore malformed messages
      }
    })

    ws.on('close', () => {
      this.ws = null
      if (!this.destroyed) {
        this.scheduleReconnect()
      }
    })

    ws.on('error', () => {
      // 'close' event will follow
    })
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.wsReconnectTimer) return
    const delay = Math.min(
      WS_RECONNECT_INTERVAL * Math.pow(1.5, this.wsReconnectAttempts),
      WS_MAX_RECONNECT_INTERVAL
    )
    this.wsReconnectAttempts++
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null
      this.connectWebSocket()
    }, delay)
  }

  // ── HTTP methods (mirror AgentManager API) ──────────────────────────────

  async health(): Promise<DaemonHealthResponse> {
    return this.httpRequest('GET', '/health')
  }

  async list(): Promise<AgentState[]> {
    return this.httpRequest('GET', '/agents')
  }

  async get(agentId: string): Promise<AgentState | null> {
    try {
      return await this.httpRequest('GET', `/agents/${encodeURIComponent(agentId)}`)
    } catch {
      return null
    }
  }

  async create(payload: CreateAgentPayload): Promise<AgentState> {
    return this.post('/agents', payload)
  }

  async kill(agentId: string): Promise<boolean> {
    const result = await this.post(`/agents/${encodeURIComponent(agentId)}/kill`)
    return result?.killed ?? false
  }

  async remove(agentId: string): Promise<boolean> {
    const result = await this.httpRequest('DELETE', `/agents/${encodeURIComponent(agentId)}`)
    return result?.removed ?? false
  }

  async restart(agentId: string): Promise<AgentState | null> {
    return this.post(`/agents/${encodeURIComponent(agentId)}/restart`)
  }

  async toggleYolo(agentId: string, yolo: boolean): Promise<AgentState | null> {
    return this.post(`/agents/${encodeURIComponent(agentId)}/yolo`, { yolo })
  }

  async renameAgent(agentId: string, name: string): Promise<AgentState | null> {
    return this.post(`/agents/${encodeURIComponent(agentId)}/rename`, { name })
  }

  async setAgentModel(agentId: string, model: string): Promise<AgentState | null> {
    return this.post(`/agents/${encodeURIComponent(agentId)}/model`, { model })
  }

  sendInput(agentId: string, input: string): void {
    this.post(`/agents/${encodeURIComponent(agentId)}/input`, { input }).catch(() => {})
  }

  sendRawInput(agentId: string, data: string): void {
    this.post(`/agents/${encodeURIComponent(agentId)}/input-raw`, { data }).catch(() => {})
  }

  resize(agentId: string, cols: number, rows: number): void {
    this.post(`/agents/${encodeURIComponent(agentId)}/resize`, { cols, rows }).catch(() => {})
  }

  async broadcast(projectDir: string, input: string): Promise<string[]> {
    const result = await this.post('/broadcast', { projectDir, input })
    return result?.sentTo ?? []
  }

  async getBuffer(agentId: string): Promise<string[]> {
    const result = await this.httpRequest('GET', `/agents/${encodeURIComponent(agentId)}/buffer`)
    return result?.lines ?? []
  }

  activeCount(): number {
    // This is sync in AgentManager but async here — callers should use list() instead
    return 0
  }

  // ── Preflight ───────────────────────────────────────────────────────────

  async preflight(provider: ProviderId = 'claude'): Promise<PreflightResult> {
    return this.post('/preflight', { provider })
  }

  // ── Config ──────────────────────────────────────────────────────────────

  async getConfig(): Promise<AppConfig> {
    return this.httpRequest('GET', '/config')
  }

  async setConfig(partial: Partial<AppConfig>): Promise<AppConfig> {
    return this.httpRequest('PATCH', '/config', partial)
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  async listSessions(options?: ListClaudeSessionsOptions): Promise<ClaudeSessionSummary[]> {
    const params = new URLSearchParams()
    if (options?.provider) params.set('provider', options.provider)
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.maxAgeDays) params.set('maxAgeDays', String(options.maxAgeDays))
    if (options?.projectPathPrefix) params.set('projectPathPrefix', options.projectPathPrefix)
    const qs = params.toString()
    return this.httpRequest('GET', `/sessions${qs ? '?' + qs : ''}`)
  }

  // ── Headless ────────────────────────────────────────────────────────────

  async startHeadlessRun(payload: StartHeadlessRunPayload): Promise<HeadlessRun> {
    return this.post('/headless', payload)
  }

  async listHeadlessRuns(options?: ListHeadlessRunsOptions): Promise<HeadlessRun[]> {
    const params = new URLSearchParams()
    if (options?.query) params.set('query', options.query)
    if (options?.status) params.set('status', options.status)
    if (options?.limit) params.set('limit', String(options.limit))
    const qs = params.toString()
    return this.httpRequest('GET', `/headless${qs ? '?' + qs : ''}`)
  }

  async getHeadlessRun(runId: string): Promise<HeadlessRun | null> {
    try {
      return await this.httpRequest('GET', `/headless/${encodeURIComponent(runId)}`)
    } catch {
      return null
    }
  }

  async cancelHeadlessRun(runId: string): Promise<boolean> {
    const result = await this.httpRequest('DELETE', `/headless/${encodeURIComponent(runId)}`)
    return result?.canceled ?? false
  }

  async getHeadlessRunLog(runId: string, options?: HeadlessRunLogOptions): Promise<HeadlessRunLogPayload | null> {
    const params = new URLSearchParams()
    if (options?.tailLines) params.set('tailLines', String(options.tailLines))
    if (options?.maxChars) params.set('maxChars', String(options.maxChars))
    const qs = params.toString()
    try {
      return await this.httpRequest('GET', `/headless/${encodeURIComponent(runId)}/log${qs ? '?' + qs : ''}`)
    } catch {
      return null
    }
  }

  // ── MCP ─────────────────────────────────────────────────────────────────

  async getMcpStatus(): Promise<McpServerStatus> {
    return this.httpRequest('GET', '/mcp/status')
  }

  // ── Skills ─────────────────────────────────────────────────────────────

  async scanSkills(): Promise<SkillScanResult> {
    return this.httpRequest('GET', '/skills')
  }

  async toggleSkill(payload: SkillTogglePayload): Promise<{ success: boolean }> {
    return this.post('/skills/toggle', payload)
  }

  // ── Test Terminal ──────────────────────────────────────────────────────

  async spawnTestTerminal(): Promise<void> {
    await this.post('/test-terminal/spawn')
  }

  sendTestTerminalInput(data: string): void {
    this.post('/test-terminal/input', { data }).catch(() => {})
  }

  resizeTestTerminal(cols: number, rows: number): void {
    this.post('/test-terminal/resize', { cols, rows }).catch(() => {})
  }

  killTestTerminal(): void {
    this.post('/test-terminal/kill').catch(() => {})
  }

  // ── Free Terminal ─────────────────────────────────────────────────────

  async spawnFreeTerminal(cwd?: string): Promise<void> {
    await this.post('/free-terminal/spawn', { cwd })
  }

  sendFreeTerminalInput(data: string): void {
    this.post('/free-terminal/input', { data }).catch(() => {})
  }

  resizeFreeTerminal(cols: number, rows: number): void {
    this.post('/free-terminal/resize', { cols, rows }).catch(() => {})
  }

  killFreeTerminal(): void {
    this.post('/free-terminal/kill').catch(() => {})
  }

  // ── Shutdown ────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    await this.post('/shutdown')
  }

  // ── HTTP primitives ─────────────────────────────────────────────────────

  private post(path: string, body?: unknown): Promise<any> {
    return this.httpRequest('POST', path, body)
  }

  private httpRequest(method: string, path: string, body?: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const options: RequestOptions = {
        socketPath: this.socketPath,
        path,
        method,
        headers: { 'Content-Type': 'application/json' }
      }

      const req = httpRequest(options, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          try {
            const data = text ? JSON.parse(text) : {}
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(data.error || `HTTP ${res.statusCode}`))
            } else {
              resolve(data)
            }
          } catch {
            reject(new Error('Invalid JSON response'))
          }
        })
      })

      req.on('error', (err) => {
        reject(new Error(`Daemon connection error: ${err.message}`))
      })

      if (body !== undefined) {
        req.write(JSON.stringify(body))
      }
      req.end()
    })
  }
}
