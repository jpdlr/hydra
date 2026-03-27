import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { unlinkSync, existsSync } from 'fs'
import { homedir } from 'os'
import { spawn as ptySpawn, type IPty } from 'node-pty'
import { AgentManager } from '../agents/AgentManager'
import { MAX_CONCURRENT_AGENTS_HARD_LIMIT } from '@shared/types'
import type { ConfigStore } from '../config/ConfigStore'
import type { SessionCatalog } from '../sessions/SessionCatalog'
import type { CodexSessionCatalog } from '../sessions/CodexSessionCatalog'
import type { HeadlessOrchestrator } from '../headless/HeadlessOrchestrator'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'
import type { DaemonNotificationService } from './DaemonNotificationService'
import type { HydraMcpServer } from '../mcp/McpServer'
import type { SkillScanner } from '../skills/SkillScanner'
import { readTranscriptHistory } from '../sessions/TranscriptReader'
import type { WsServerMessage } from './protocol'
import type {
  AgentOutputPayload,
  AgentStatusPayload,
  HydraNotification,
  CreateAgentPayload,
  AppConfig,
  StartHeadlessRunPayload
} from '@shared/types'

interface DaemonServerOptions {
  socketPath: string
  agentManager: AgentManager
  configStore: ConfigStore
  sessionCatalog: SessionCatalog
  codexSessionCatalog: CodexSessionCatalog
  headlessOrchestrator: HeadlessOrchestrator
  workspaceStore: WorkspaceStore
  notificationService: DaemonNotificationService
  mcpServer: HydraMcpServer | null
  skillScanner: SkillScanner
  onShutdown: () => void
}

export class DaemonServer {
  private readonly outputFlushIntervalMs = 16
  private server: Server | null = null
  private wss: WebSocketServer | null = null
  private readonly socketPath: string
  private readonly agentManager: AgentManager
  private readonly configStore: ConfigStore
  private readonly sessionCatalog: SessionCatalog
  private readonly codexSessionCatalog: CodexSessionCatalog
  private readonly headlessOrchestrator: HeadlessOrchestrator
  private readonly workspaceStore: WorkspaceStore
  private readonly notificationService: DaemonNotificationService
  private readonly mcpServer: HydraMcpServer | null
  private readonly skillScanner: SkillScanner
  private readonly onShutdown: () => void
  private readonly startedAt = Date.now()
  private testPty: IPty | null = null
  private freePty: IPty | null = null
  private pendingAgentOutput = new Map<string, string>()
  private outputFlushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: DaemonServerOptions) {
    this.socketPath = options.socketPath
    this.agentManager = options.agentManager
    this.configStore = options.configStore
    this.sessionCatalog = options.sessionCatalog
    this.codexSessionCatalog = options.codexSessionCatalog
    this.headlessOrchestrator = options.headlessOrchestrator
    this.workspaceStore = options.workspaceStore
    this.notificationService = options.notificationService
    this.mcpServer = options.mcpServer
    this.skillScanner = options.skillScanner
    this.onShutdown = options.onShutdown
  }

  async start(): Promise<void> {
    // Remove stale socket file (not needed for Windows named pipes)
    if (!this.socketPath.startsWith('\\\\.\\pipe\\') && existsSync(this.socketPath)) {
      try { unlinkSync(this.socketPath) } catch { /* ignore */ }
    }

    this.server = createServer((req, res) => this.handleRequest(req, res))
    this.wss = new WebSocketServer({ server: this.server })

    this.wss.on('connection', (ws) => {
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }))
          }
        } catch { /* ignore bad messages */ }
      })
    })

    // Forward agent events over WebSocket
    this.agentManager.on('output', (payload: AgentOutputPayload) => {
      this.queueAgentOutput(payload)
    })

    this.agentManager.on('status', (payload: AgentStatusPayload) => {
      this.flushPendingAgentOutput()
      this.persistWorkspace()
      this.broadcast({ type: 'agent:status', payload })
    })

    this.agentManager.on('agent_waiting', (payload: { agentId: string }) => {
      this.broadcast({ type: 'agent:waiting', payload })
    })

    // Forward headless events
    this.headlessOrchestrator.on('event', (payload: { runId: string; data: string }) => {
      this.broadcast({ type: 'headless:event', payload })
    })

    // Forward notifications
    this.notificationService.subscribe((notification: HydraNotification) => {
      this.broadcast({ type: 'notification', payload: notification })
    })

    return new Promise((resolve, reject) => {
      this.server!.on('error', reject)
      this.server!.listen(this.socketPath, () => {
        console.log(`[daemon] HTTP+WS server listening on ${this.socketPath}`)
        resolve()
      })
    })
  }

  private killTestPty(): void {
    if (this.testPty) {
      try { this.testPty.kill() } catch { /* already dead */ }
      this.testPty = null
    }
  }

  private killFreePty(): void {
    if (this.freePty) {
      try { this.freePty.kill() } catch { /* already dead */ }
      this.freePty = null
    }
  }

  stop(): void {
    this.flushPendingAgentOutput()
    this.killTestPty()
    this.killFreePty()
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close()
      }
      this.wss.close()
      this.wss = null
    }
    if (this.server) {
      this.server.close()
      this.server = null
    }
    // Clean up socket file (named pipes on Windows don't leave files)
    if (!this.socketPath.startsWith('\\\\.\\pipe\\') && existsSync(this.socketPath)) {
      try { unlinkSync(this.socketPath) } catch { /* ignore */ }
    }
  }

  private broadcast(message: WsServerMessage): void {
    if (!this.wss) return
    const data = JSON.stringify(message)
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    }
  }

  private queueAgentOutput(payload: AgentOutputPayload): void {
    if (!payload.data) return
    this.pendingAgentOutput.set(
      payload.agentId,
      (this.pendingAgentOutput.get(payload.agentId) ?? '') + payload.data
    )
    if (this.outputFlushTimer) return
    this.outputFlushTimer = setTimeout(() => {
      this.outputFlushTimer = null
      this.flushPendingAgentOutput()
    }, this.outputFlushIntervalMs)
  }

  private flushPendingAgentOutput(): void {
    if (this.outputFlushTimer) {
      clearTimeout(this.outputFlushTimer)
      this.outputFlushTimer = null
    }
    if (this.pendingAgentOutput.size === 0) return

    const pending = this.pendingAgentOutput
    this.pendingAgentOutput = new Map()
    for (const [agentId, data] of pending.entries()) {
      this.broadcast({ type: 'agent:output', payload: { agentId, data } })
    }
  }

  private persistWorkspace(): void {
    try {
      this.workspaceStore.setAgents(this.agentManager.exportWorkspaceAgents())
    } catch {
      // Best-effort
    }
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', 'http://localhost')
    const method = req.method || 'GET'
    const path = url.pathname

    try {
      // Health
      if (method === 'GET' && path === '/health') {
        return this.json(res, 200, {
          status: 'ok',
          pid: process.pid,
          uptime: Math.floor((Date.now() - this.startedAt) / 1000),
          agentCount: this.agentManager.list().length,
          version: '1.0.0'
        })
      }

      // Shutdown
      if (method === 'POST' && path === '/shutdown') {
        this.json(res, 200, { status: 'shutting_down' })
        setTimeout(() => this.onShutdown(), 100)
        return
      }

      // ── Agents ──────────────────────────────────────────────────────────
      if (method === 'GET' && path === '/agents') {
        return this.json(res, 200, this.agentManager.list())
      }

      if (method === 'POST' && path === '/agents') {
        const body = await this.readBody<CreateAgentPayload>(req)
        if (!body.name) {
          body.name = AgentManager.generateName(body.initialPrompt, body.projectDir)
        }
        const preflight = await this.agentManager.preflight(body.provider)
        if (!preflight.ok) {
          return this.json(res, 400, { error: preflight.error || 'Preflight failed' })
        }
        const maxAgents = Math.min(this.configStore.get().maxAgents, MAX_CONCURRENT_AGENTS_HARD_LIMIT)
        if (this.agentManager.activeCount() >= maxAgents) {
          return this.json(res, 400, { error: `Maximum concurrent agents (${maxAgents}) reached` })
        }
        const created = await this.agentManager.create(body)
        this.persistWorkspace()
        return this.json(res, 201, created)
      }

      // Agent by ID routes
      const agentMatch = path.match(/^\/agents\/([^/]+)$/)
      if (agentMatch) {
        const agentId = decodeURIComponent(agentMatch[1])

        if (method === 'GET') {
          const agent = this.agentManager.get(agentId)
          if (!agent) return this.json(res, 404, { error: 'Agent not found' })
          return this.json(res, 200, agent)
        }

        if (method === 'DELETE') {
          const removed = await this.agentManager.remove(agentId)
          this.persistWorkspace()
          return this.json(res, 200, { removed })
        }
      }

      // Agent kill
      const killMatch = path.match(/^\/agents\/([^/]+)\/kill$/)
      if (method === 'POST' && killMatch) {
        const agentId = decodeURIComponent(killMatch[1])
        const killed = this.agentManager.kill(agentId)
        this.persistWorkspace()
        return this.json(res, 200, { killed })
      }

      // Agent restart
      const restartMatch = path.match(/^\/agents\/([^/]+)\/restart$/)
      if (method === 'POST' && restartMatch) {
        const agentId = decodeURIComponent(restartMatch[1])
        const restarted = this.agentManager.restart(agentId)
        this.persistWorkspace()
        return this.json(res, 200, restarted)
      }

      // Agent input
      const inputMatch = path.match(/^\/agents\/([^/]+)\/input$/)
      if (method === 'POST' && inputMatch) {
        const agentId = decodeURIComponent(inputMatch[1])
        const body = await this.readBody<{ input: string }>(req)
        this.agentManager.sendInput(agentId, body.input)
        return this.json(res, 200, { sent: true })
      }

      // Agent raw input
      const rawInputMatch = path.match(/^\/agents\/([^/]+)\/input-raw$/)
      if (method === 'POST' && rawInputMatch) {
        const agentId = decodeURIComponent(rawInputMatch[1])
        const body = await this.readBody<{ data: string }>(req)
        this.agentManager.sendRawInput(agentId, body.data)
        return this.json(res, 200, { sent: true })
      }

      // Agent resize
      const resizeMatch = path.match(/^\/agents\/([^/]+)\/resize$/)
      if (method === 'POST' && resizeMatch) {
        const agentId = decodeURIComponent(resizeMatch[1])
        const body = await this.readBody<{ cols: number; rows: number }>(req)
        this.agentManager.resize(agentId, body.cols, body.rows)
        return this.json(res, 200, { resized: true })
      }

      // Agent rename
      const renameMatch = path.match(/^\/agents\/([^/]+)\/rename$/)
      if (method === 'POST' && renameMatch) {
        const agentId = decodeURIComponent(renameMatch[1])
        const body = await this.readBody<{ name: string }>(req)
        const renamed = this.agentManager.renameAgent(agentId, body.name)
        this.persistWorkspace()
        return this.json(res, 200, renamed)
      }

      // Agent model update
      const modelMatch = path.match(/^\/agents\/([^/]+)\/model$/)
      if (method === 'POST' && modelMatch) {
        const agentId = decodeURIComponent(modelMatch[1])
        const body = await this.readBody<{ model: string }>(req)
        const updated = this.agentManager.setModel(agentId, body.model)
        this.persistWorkspace()
        return this.json(res, 200, updated)
      }

      // Agent YOLO toggle
      const yoloMatch = path.match(/^\/agents\/([^/]+)\/yolo$/)
      if (method === 'POST' && yoloMatch) {
        const agentId = decodeURIComponent(yoloMatch[1])
        const body = await this.readBody<{ yolo: boolean }>(req)
        const toggled = this.agentManager.toggleYolo(agentId, body.yolo)
        this.persistWorkspace()
        return this.json(res, 200, toggled)
      }

      // Agent output buffer
      const bufferMatch = path.match(/^\/agents\/([^/]+)\/buffer$/)
      if (method === 'GET' && bufferMatch) {
        const agentId = decodeURIComponent(bufferMatch[1])
        const buffer = this.agentManager.getBuffer(agentId)
        return this.json(res, 200, { lines: buffer })
      }

      // Agent conversation history (from JSONL transcript)
      const historyMatch = path.match(/^\/agents\/([^/]+)\/history$/)
      if (method === 'GET' && historyMatch) {
        const agentId = decodeURIComponent(historyMatch[1])
        const agent = this.agentManager.get(agentId)
        if (!agent) return this.json(res, 404, { error: 'Agent not found' })
        if (!agent.sessionId) return this.json(res, 200, { messages: [] })
        const messages = readTranscriptHistory(agent.sessionId, agent.provider)
        return this.json(res, 200, { messages })
      }

      // Broadcast
      if (method === 'POST' && path === '/broadcast') {
        const body = await this.readBody<{ projectDir: string; input: string }>(req)
        const sentTo = this.agentManager.broadcast(body.projectDir, body.input)
        return this.json(res, 200, { sentTo })
      }

      // ── Config ──────────────────────────────────────────────────────────
      if (method === 'GET' && path === '/config') {
        return this.json(res, 200, this.configStore.get())
      }

      if (method === 'PATCH' && path === '/config') {
        const body = await this.readBody<Partial<AppConfig>>(req)
        const updated = this.configStore.set(body)
        this.broadcast({ type: 'config:changed', payload: updated })
        return this.json(res, 200, updated)
      }

      // ── Preflight ───────────────────────────────────────────────────────
      if (method === 'POST' && path === '/preflight') {
        const body = await this.readBody<{ provider?: string }>(req)
        const provider = (body.provider as 'claude' | 'codex') || 'claude'
        const result = await this.agentManager.preflight(provider)
        return this.json(res, 200, result)
      }

      // ── Sessions ────────────────────────────────────────────────────────
      if (method === 'GET' && path === '/sessions') {
        const config = this.configStore.get()
        const provider = url.searchParams.get('provider') === 'codex' ? 'codex' : 'claude'
        const limit = parseInt(url.searchParams.get('limit') || '0') || (config.sessionImportLimit > 0 ? config.sessionImportLimit : undefined)
        const maxAgeDays = parseInt(url.searchParams.get('maxAgeDays') || '0') || (config.sessionMaxAgeDays > 0 ? config.sessionMaxAgeDays : undefined)
        const projectPathPrefix = url.searchParams.get('projectPathPrefix') || config.sessionImportProjectPrefix || undefined
        const catalog = provider === 'codex' ? this.codexSessionCatalog : this.sessionCatalog
        const sessions = catalog.listSessions({
          limit,
          maxAgeDays,
          projectPathPrefix,
          hiddenSessionIds: config.hiddenSessionIds
        })
        return this.json(res, 200, sessions)
      }

      // ── Headless ────────────────────────────────────────────────────────
      if (method === 'POST' && path === '/headless') {
        const body = await this.readBody<StartHeadlessRunPayload>(req)
        const run = this.headlessOrchestrator.start(body)
        return this.json(res, 201, run)
      }

      if (method === 'GET' && path === '/headless') {
        const query = url.searchParams.get('query') || undefined
        const status = url.searchParams.get('status') || undefined
        const limit = parseInt(url.searchParams.get('limit') || '0') || undefined
        const runs = this.headlessOrchestrator.list({ query, status: status as 'running' | 'completed' | 'errored' | 'canceled' | 'all', limit })
        return this.json(res, 200, runs)
      }

      const headlessMatch = path.match(/^\/headless\/([^/]+)$/)
      if (headlessMatch) {
        const runId = decodeURIComponent(headlessMatch[1])
        if (method === 'GET') {
          const run = this.headlessOrchestrator.get(runId)
          if (!run) return this.json(res, 404, { error: 'Run not found' })
          return this.json(res, 200, run)
        }
        if (method === 'DELETE') {
          const canceled = this.headlessOrchestrator.cancel(runId)
          return this.json(res, 200, { canceled })
        }
      }

      const headlessLogMatch = path.match(/^\/headless\/([^/]+)\/log$/)
      if (method === 'GET' && headlessLogMatch) {
        const runId = decodeURIComponent(headlessLogMatch[1])
        const tailLines = parseInt(url.searchParams.get('tailLines') || '0') || undefined
        const maxChars = parseInt(url.searchParams.get('maxChars') || '0') || undefined
        const log = this.headlessOrchestrator.getLog(runId, { tailLines, maxChars })
        if (!log) return this.json(res, 404, { error: 'Run not found' })
        return this.json(res, 200, log)
      }

      // ── MCP ─────────────────────────────────────────────────────────────
      if (method === 'GET' && path === '/mcp/status') {
        const status = this.mcpServer?.getStatus() ?? { running: false, port: null, error: null, managerWorkspace: null }
        return this.json(res, 200, status)
      }

      // ── Notifications ───────────────────────────────────────────────────
      if (method === 'GET' && path === '/notifications') {
        const limit = parseInt(url.searchParams.get('limit') || '50')
        return this.json(res, 200, this.notificationService.getRecent(limit))
      }

      // ── Skills ────────────────────────────────────────────────────────
      if (method === 'GET' && path === '/skills') {
        return this.json(res, 200, this.skillScanner.scan())
      }

      if (method === 'POST' && path === '/skills/toggle') {
        const body = await this.readBody<{ provider: string; id: string; enabled: boolean }>(req)
        const success = this.skillScanner.toggle({
          provider: body.provider as 'claude' | 'codex',
          id: body.id,
          enabled: body.enabled
        })
        return this.json(res, 200, { success })
      }

      // ── Test Terminal ──────────────────────────────────────────────────
      if (method === 'POST' && path === '/test-terminal/spawn') {
        this.killTestPty()
        const shellPath = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
        const env: Record<string, string> = { ...process.env as Record<string, string>, TERM: 'xterm-256color', FORCE_COLOR: '1' }
        delete env.ELECTRON_RUN_AS_NODE
        this.testPty = ptySpawn(shellPath, ['-l', '-i'], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: homedir(),
          env
        })
        this.testPty.onData((data: string) => {
          this.broadcast({ type: 'test-terminal:output', payload: { data } })
        })
        this.testPty.onExit(({ exitCode }) => {
          this.testPty = null
          this.broadcast({ type: 'test-terminal:exit', payload: { exitCode } })
        })
        return this.json(res, 200, { ok: true })
      }

      if (method === 'POST' && path === '/test-terminal/input') {
        const body = await this.readBody<{ data: string }>(req)
        this.testPty?.write(body.data)
        return this.json(res, 200, { ok: true })
      }

      if (method === 'POST' && path === '/test-terminal/resize') {
        const body = await this.readBody<{ cols: number; rows: number }>(req)
        try { this.testPty?.resize(body.cols, body.rows) } catch { /* ignore */ }
        return this.json(res, 200, { ok: true })
      }

      if (method === 'POST' && path === '/test-terminal/kill') {
        this.killTestPty()
        return this.json(res, 200, { ok: true })
      }

      // ── Free Terminal (integrated shell) ─────────────────────────────────
      if (method === 'POST' && path === '/free-terminal/spawn') {
        this.killFreePty()
        const body = await this.readBody<{ cwd?: string }>(req)
        const shellPath = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
        const env: Record<string, string> = { ...process.env as Record<string, string>, TERM: 'xterm-256color', FORCE_COLOR: '1' }
        delete env.ELECTRON_RUN_AS_NODE
        this.freePty = ptySpawn(shellPath, ['-l', '-i'], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: body.cwd || homedir(),
          env
        })
        this.freePty.onData((data: string) => {
          this.broadcast({ type: 'free-terminal:output', payload: { data } })
        })
        this.freePty.onExit(({ exitCode }) => {
          this.freePty = null
          this.broadcast({ type: 'free-terminal:exit', payload: { exitCode } })
        })
        return this.json(res, 200, { ok: true })
      }

      if (method === 'POST' && path === '/free-terminal/input') {
        const body = await this.readBody<{ data: string }>(req)
        this.freePty?.write(body.data)
        return this.json(res, 200, { ok: true })
      }

      if (method === 'POST' && path === '/free-terminal/resize') {
        const body = await this.readBody<{ cols: number; rows: number }>(req)
        try { this.freePty?.resize(body.cols, body.rows) } catch { /* ignore */ }
        return this.json(res, 200, { ok: true })
      }

      if (method === 'POST' && path === '/free-terminal/kill') {
        this.killFreePty()
        return this.json(res, 200, { ok: true })
      }

      // 404
      this.json(res, 404, { error: 'Not found' })
    } catch (err) {
      console.error(`[daemon] Request error ${method} ${path}:`, err)
      this.json(res, 500, { error: err instanceof Error ? err.message : 'Internal error' })
    }
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  private readBody<T = Record<string, unknown>>(req: IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf-8')
          resolve(text ? JSON.parse(text) : {} as T)
        } catch {
          reject(new Error('Invalid JSON body'))
        }
      })
      req.on('error', reject)
    })
  }
}
