import { spawn as ptySpawn, IPty } from 'node-pty'
import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import { SessionCatalog } from '../sessions/SessionCatalog'
import { getProvider } from './providers'
import { MAX_CONCURRENT_AGENTS_HARD_LIMIT } from '@shared/types'
import type { PersistedWorkspaceAgent } from '../workspace/WorkspaceStore'
import type {
  AgentState,
  AgentStatus,
  CreateAgentPayload,
  ModelId,
  ProviderId,
  ClaudeSessionSummary
} from '@shared/types'

interface ManagedAgent {
  state: AgentState
  pty: IPty | null
  outputBuffer: string[]
  killTimeout: ReturnType<typeof setTimeout> | null
  submitQueue: Promise<void>
  cols: number
  rows: number
  source: 'hydra' | 'imported'
  latestUserPrompt: string | null
  sessionSyncTimer: ReturnType<typeof setTimeout> | null
  sessionDiscoveryAttempts: number
  notifiedIdle: boolean
  lastOutputAt: number
}

const MAX_BUFFER_LINES = 5000
const GRACEFUL_KILL_TIMEOUT = 5000
const INPUT_SUBMIT_DELAY_MS = 75
const DEFAULT_PTY_COLS = 120
const DEFAULT_PTY_ROWS = 30
const SESSION_DISCOVERY_INITIAL_INTERVAL_MS = 2500
const SESSION_DISCOVERY_MAX_INTERVAL_MS = 30000
const SESSION_DISCOVERY_BACKOFF_FACTOR = 1.6
const SESSION_DISCOVERY_GRACE_MS = 5 * 60 * 1000
const SESSION_HINT_MAX_LENGTH = 400
const IDLE_DETECTION_MS = 5000
const IDLE_RESTART_WAKE_DELAY_MS = 350
type SpawnOutcome = 'spawned' | 'capped' | 'errored'

export class AgentManager extends EventEmitter {
  private agents: Map<string, ManagedAgent> = new Map()
  private providerPaths: Map<ProviderId, string> = new Map()
  private activityPollInterval: ReturnType<typeof setInterval> | null = null

  constructor(private readonly sessionCatalog: SessionCatalog = new SessionCatalog()) {
    super()
    this.startActivityPolling()
  }

  private startActivityPolling(): void {
    this.activityPollInterval = setInterval(() => {
      const now = Date.now()
      for (const managed of this.agents.values()) {
        if (managed.state.status !== 'running') continue
        if (!managed.pty) continue
        if (managed.notifiedIdle) continue
        if (managed.lastOutputAt === 0) continue
        if (now - managed.lastOutputAt >= IDLE_DETECTION_MS) {
          managed.notifiedIdle = true
          this.emit('agent_waiting', { agentId: managed.state.id })
        }
      }
    }, 2000)
  }

  private countActiveAgents(excludeAgentId?: string): number {
    let count = 0
    for (const [id, managed] of this.agents.entries()) {
      if (excludeAgentId && id === excludeAgentId) continue
      if (managed.pty || managed.state.status === 'running' || managed.state.status === 'starting') {
        count++
      }
    }
    return count
  }

  async preflight(providerId: ProviderId = 'claude'): Promise<{
    ok: boolean
    claudePath: string | null
    version: string | null
    error: string | null
  }> {
    const provider = getProvider(providerId)
    const result = await provider.preflight()
    if (result.ok && result.path) {
      this.providerPaths.set(providerId, result.path)
    }
    return {
      ok: result.ok,
      claudePath: result.path,
      version: result.version,
      error: result.error
    }
  }

  create(payload: CreateAgentPayload): AgentState {
    if (this.countActiveAgents() >= MAX_CONCURRENT_AGENTS_HARD_LIMIT) {
      throw new Error(`Maximum concurrent agents (${MAX_CONCURRENT_AGENTS_HARD_LIMIT}) reached`)
    }

    const id = randomUUID().slice(0, 8)
    const now = new Date().toISOString()

    const state: AgentState = {
      id,
      name: payload.name,
      projectDir: payload.projectDir,
      provider: payload.provider,
      model: payload.model,
      reasoningEffort: payload.reasoningEffort,
      yolo: payload.yolo,
      isManager: payload.isManager ?? false,
      sessionId: payload.resumeSessionId ?? null,
      initialPrompt: payload.initialPrompt,
      createdAt: now,
      status: 'starting',
      pid: null,
      restartCount: 0,
      startedAt: null,
      lastActivityAt: now
    }

    const managed: ManagedAgent = {
      state,
      pty: null,
      outputBuffer: [],
      killTimeout: null,
      submitQueue: Promise.resolve(),
      cols: DEFAULT_PTY_COLS,
      rows: DEFAULT_PTY_ROWS,
      source: 'hydra',
      latestUserPrompt: payload.initialPrompt.trim() || null,
      sessionSyncTimer: null,
      sessionDiscoveryAttempts: 0,
      notifiedIdle: false,
      lastOutputAt: 0
    }

    this.agents.set(id, managed)
    const spawnOutcome = this.spawnProcess(managed)
    if (spawnOutcome === 'capped') {
      this.agents.delete(id)
      throw new Error(`Maximum concurrent agents (${MAX_CONCURRENT_AGENTS_HARD_LIMIT}) reached`)
    }

    return { ...state }
  }

  importSessions(sessions: ClaudeSessionSummary[], defaultModel: ModelId, defaultProvider: ProviderId = 'claude'): number {
    let imported = 0

    for (const session of sessions) {
      if (!session.sessionId || !session.projectPath) continue

      const exists = Array.from(this.agents.values()).some(
        (managed) => managed.state.sessionId === session.sessionId
      )
      if (exists) continue

      const state: AgentState = {
        id: this.buildImportedAgentId(session.sessionId),
        name: this.buildImportedAgentName(session),
        projectDir: session.projectPath,
        provider: defaultProvider,
        model: defaultModel,
        yolo: false,
        isManager: false,
        sessionId: session.sessionId,
        initialPrompt: '',
        createdAt: session.createdAt || new Date().toISOString(),
        status: 'idle',
        pid: null,
        restartCount: 0,
        startedAt: null,
        lastActivityAt: session.createdAt || new Date().toISOString()
      }

      this.agents.set(state.id, {
        state,
        pty: null,
        outputBuffer: [],
        killTimeout: null,
        submitQueue: Promise.resolve(),
        cols: DEFAULT_PTY_COLS,
        rows: DEFAULT_PTY_ROWS,
        source: 'imported',
        latestUserPrompt: session.firstPrompt.trim() || null,
        sessionSyncTimer: null,
        sessionDiscoveryAttempts: 0,
        notifiedIdle: false,
      lastOutputAt: 0
      })
      imported++
    }

    return imported
  }

  hydrateWorkspaceAgents(agents: PersistedWorkspaceAgent[]): number {
    let restored = 0
    for (const persisted of agents) {
      if (!persisted.id || !persisted.projectDir) continue

      const id = this.buildHydraAgentId(persisted.id)
      const alreadyHasSession = persisted.sessionId
        ? Array.from(this.agents.values()).some((managed) => managed.state.sessionId === persisted.sessionId)
        : false
      if (alreadyHasSession) continue

      const state: AgentState = {
        id,
        name: persisted.name,
        projectDir: persisted.projectDir,
        provider: persisted.provider ?? 'claude',
        model: persisted.model,
        yolo: persisted.yolo,
        isManager: persisted.isManager ?? false,
        sessionId: persisted.sessionId,
        initialPrompt: '',
        createdAt: persisted.createdAt || new Date().toISOString(),
        status: 'idle',
        pid: null,
        restartCount: 0,
        startedAt: null,
        lastActivityAt: persisted.lastActivityAt || persisted.createdAt || new Date().toISOString()
      }

      this.agents.set(id, {
        state,
        pty: null,
        outputBuffer: [],
        killTimeout: null,
        submitQueue: Promise.resolve(),
        cols: DEFAULT_PTY_COLS,
        rows: DEFAULT_PTY_ROWS,
        source: 'hydra',
        latestUserPrompt: null,
        sessionSyncTimer: null,
        sessionDiscoveryAttempts: 0,
        notifiedIdle: false,
      lastOutputAt: 0
      })
      restored++
    }
    return restored
  }

  exportWorkspaceAgents(): PersistedWorkspaceAgent[] {
    return Array.from(this.agents.values())
      .filter((managed) => managed.source === 'hydra')
      .map((managed) => ({
        id: managed.state.id,
        name: managed.state.name,
        projectDir: managed.state.projectDir,
        provider: managed.state.provider,
        model: managed.state.model,
        yolo: managed.state.yolo,
        isManager: managed.state.isManager,
        sessionId: managed.state.sessionId,
        createdAt: managed.state.createdAt,
        lastActivityAt: managed.state.lastActivityAt
      }))
  }

  activeCount(): number {
    return this.countActiveAgents()
  }

  private buildImportedAgentId(sessionId: string): string {
    const shortId = sessionId.slice(0, 8)
    const baseId = `sess-${shortId}`
    if (!this.agents.has(baseId)) return baseId

    let suffix = 2
    while (this.agents.has(`${baseId}-${suffix}`)) {
      suffix++
    }
    return `${baseId}-${suffix}`
  }

  static generateName(prompt: string, projectDir: string): string {
    const cleaned = prompt
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^<[^>]+>/, '')

    if (cleaned) {
      return cleaned.length > 44 ? `${cleaned.slice(0, 44)}...` : cleaned
    }

    const projectName = basename(projectDir) || 'Agent'
    return `${projectName} ${randomUUID().slice(0, 6)}`
  }

  private buildImportedAgentName(session: ClaudeSessionSummary): string {
    return AgentManager.generateName(session.firstPrompt, session.projectPath)
  }

  private buildHydraAgentId(preferredId: string): string {
    if (!this.agents.has(preferredId)) return preferredId

    let suffix = 2
    while (this.agents.has(`${preferredId}-${suffix}`)) {
      suffix++
    }
    return `${preferredId}-${suffix}`
  }

  private buildArgs(state: AgentState): string[] {
    const provider = getProvider(state.provider)
    return provider.buildArgs(state)
  }

  private killPtyProcess(pty: IPty, force: boolean): void {
    if (process.platform === 'win32') {
      pty.kill()
      return
    }
    pty.kill(force ? 'SIGKILL' : 'SIGTERM')
  }

  private spawnProcess(managed: ManagedAgent): SpawnOutcome {
    if (this.countActiveAgents(managed.state.id) >= MAX_CONCURRENT_AGENTS_HARD_LIMIT) {
      return 'capped'
    }

    const provider = getProvider(managed.state.provider)
    const cmd = this.providerPaths.get(managed.state.provider) || provider.command
    const args = this.buildArgs(managed.state)

    try {
      const pty = ptySpawn(cmd, args, {
        name: 'xterm-256color',
        cols: managed.cols,
        rows: managed.rows,
        cwd: managed.state.projectDir,
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          FORCE_COLOR: '1'
        }
      })

      managed.pty = pty
      managed.state.pid = pty.pid
      managed.state.startedAt = new Date().toISOString()
      this.updateStatus(managed.state.id, 'running')
      this.startSessionDiscovery(managed)

      pty.onData((data: string) => {
        if (managed.pty !== pty) return
        this.captureSessionIdFromOutput(managed, data)

        // Buffer output
        const lines = data.split('\n')
        managed.outputBuffer.push(...lines)
        if (managed.outputBuffer.length > MAX_BUFFER_LINES) {
          managed.outputBuffer = managed.outputBuffer.slice(-MAX_BUFFER_LINES)
        }

        this.emit('output', { agentId: managed.state.id, data })

        // Track last output time for activity polling
        managed.lastOutputAt = Date.now()
        managed.state.lastActivityAt = new Date().toISOString()
      })

      pty.onExit(({ exitCode }) => {
        if (managed.pty !== pty) return

        if (managed.killTimeout) {
          clearTimeout(managed.killTimeout)
          managed.killTimeout = null
        }
        managed.pty = null
        managed.state.pid = null
        this.stopSessionDiscovery(managed)
        this.probeSessionIdFromCatalog(managed, { forceRefresh: true })

        if (exitCode === 0) {
          this.updateStatus(managed.state.id, 'idle')
        } else {
          this.updateStatus(managed.state.id, 'errored')
        }
      })

      // Send initial prompt once after startup (supports both fresh and resumed sessions).
      if (managed.state.initialPrompt) {
        const startupPrompt = managed.state.initialPrompt
        managed.state.initialPrompt = ''
        setTimeout(() => {
          this.queueSubmittedInput(managed, startupPrompt)
        }, 1500)
      }
      return 'spawned'
    } catch (err) {
      console.error(`Failed to spawn agent ${managed.state.id}:`, err)
      this.updateStatus(managed.state.id, 'errored')
      return 'errored'
    }
  }


  private updateStatus(agentId: string, status: AgentStatus): void {
    const managed = this.agents.get(agentId)
    if (!managed) return
    managed.state.status = status
    this.emit('status', {
      agentId,
      status,
      sessionId: managed.state.sessionId
    })
  }

  private updateSessionId(managed: ManagedAgent, sessionId: string): void {
    const normalized = sessionId.trim()
    if (!normalized || managed.state.sessionId === normalized) return
    managed.state.sessionId = normalized
    this.emit('status', {
      agentId: managed.state.id,
      status: managed.state.status,
      sessionId: managed.state.sessionId
    })
  }

  private captureSessionIdFromOutput(managed: ManagedAgent, data: string): void {
    if (managed.state.sessionId) return

    const provider = getProvider(managed.state.provider)

    // Try provider-specific session ID regex
    if (provider.sessionIdRegex) {
      const directMatch = data.match(provider.sessionIdRegex)
      if (directMatch?.[1]) {
        this.updateSessionId(managed, directMatch[1])
        return
      }
    }

    // Fallback: generic UUID pattern
    const uuidMatch = data.match(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
    )
    if (uuidMatch?.[0]) {
      this.updateSessionId(managed, uuidMatch[0])
    }
  }

  private startSessionDiscovery(managed: ManagedAgent): void {
    const provider = getProvider(managed.state.provider)
    if (!provider.supportsResume) return
    if (managed.state.sessionId || managed.source !== 'hydra') return
    this.stopSessionDiscovery(managed)
    this.probeSessionIdFromCatalog(managed, { forceRefresh: true })
    if (!managed.state.sessionId) {
      this.scheduleSessionDiscovery(managed)
    }
  }

  private stopSessionDiscovery(managed: ManagedAgent): void {
    if (!managed.sessionSyncTimer) return
    clearTimeout(managed.sessionSyncTimer)
    managed.sessionSyncTimer = null
    managed.sessionDiscoveryAttempts = 0
  }

  private scheduleSessionDiscovery(managed: ManagedAgent): void {
    if (managed.state.sessionId || managed.source !== 'hydra') return

    const attempts = managed.sessionDiscoveryAttempts
    const delay =
      attempts === 0
        ? SESSION_DISCOVERY_INITIAL_INTERVAL_MS
        : Math.min(
            SESSION_DISCOVERY_INITIAL_INTERVAL_MS * Math.pow(SESSION_DISCOVERY_BACKOFF_FACTOR, attempts),
            SESSION_DISCOVERY_MAX_INTERVAL_MS
          )

    managed.sessionDiscoveryAttempts = attempts + 1
    managed.sessionSyncTimer = setTimeout(() => {
      managed.sessionSyncTimer = null
      this.probeSessionIdFromCatalog(managed)
      if (!managed.state.sessionId) {
        this.scheduleSessionDiscovery(managed)
      }
    }, delay)
  }

  private probeSessionIdFromCatalog(managed: ManagedAgent, options: { forceRefresh?: boolean } = {}): void {
    if (managed.state.sessionId || managed.source !== 'hydra') return
    if (!managed.state.projectDir) return

    try {
      const sessions = this.sessionCatalog.listSessions({
        limit: 120,
        projectPathPrefix: managed.state.projectDir,
        forceRefresh: options.forceRefresh === true
      })
      if (sessions.length === 0) return

      const usedSessionIds = new Set(
        Array.from(this.agents.values())
          .map((agent) => agent.state.sessionId)
          .filter((value): value is string => !!value)
      )

      const startedAtMs = Date.parse(managed.state.startedAt ?? managed.state.createdAt)
      const promptHint = this.normalizePromptHint(managed.latestUserPrompt)

      const candidates = sessions.filter((session) => !usedSessionIds.has(session.sessionId))
      if (candidates.length === 0) return

      const hinted = promptHint
        ? candidates.find((session) =>
            this.normalizePromptHint(session.firstPrompt).includes(promptHint)
          )
        : null

      if (hinted) {
        this.updateSessionId(managed, hinted.sessionId)
        this.stopSessionDiscovery(managed)
        return
      }

      const graceCandidate = candidates.find((session) => {
        const modifiedAtMs = Date.parse(session.modifiedAt)
        return Number.isFinite(modifiedAtMs) && modifiedAtMs >= startedAtMs - SESSION_DISCOVERY_GRACE_MS
      })

      if (graceCandidate) {
        this.updateSessionId(managed, graceCandidate.sessionId)
        this.stopSessionDiscovery(managed)
      }
    } catch {
      // Best-effort sync; ignore catalog failures.
    }
  }

  private normalizePromptHint(input: string | null): string {
    if (!input) return ''
    return input
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .slice(0, SESSION_HINT_MAX_LENGTH)
  }

  kill(agentId: string): boolean {
    const managed = this.agents.get(agentId)
    if (!managed) return false

    if (managed.pty) {
      if (managed.killTimeout) {
        clearTimeout(managed.killTimeout)
        managed.killTimeout = null
      }

      // Graceful: send SIGTERM
      this.killPtyProcess(managed.pty, false)

      // Force kill after timeout
      const targetPty = managed.pty
      managed.killTimeout = setTimeout(() => {
        if (managed.pty === targetPty) {
          try {
            this.killPtyProcess(managed.pty, true)
          } catch {
            // Already dead
          }
        }
        managed.killTimeout = null
      }, GRACEFUL_KILL_TIMEOUT)
    }

    return true
  }

  remove(agentId: string): boolean {
    const managed = this.agents.get(agentId)
    if (!managed) return false
    this.stopSessionDiscovery(managed)
    this.kill(agentId)
    if (managed.killTimeout) {
      clearTimeout(managed.killTimeout)
      managed.killTimeout = null
    }
    return this.agents.delete(agentId)
  }

  restart(agentId: string): AgentState | null {
    const managed = this.agents.get(agentId)
    if (!managed) return null

    const previousStatus = managed.state.status
    const shouldWakeAfterRestart = previousStatus === 'idle' && !managed.state.initialPrompt
    if (this.countActiveAgents(agentId) >= MAX_CONCURRENT_AGENTS_HARD_LIMIT) {
      return { ...managed.state }
    }

    // Kill existing process
    if (managed.pty) {
      try {
        this.killPtyProcess(managed.pty, true)
      } catch {
        // Already dead
      }
      managed.pty = null
    }
    if (managed.killTimeout) {
      clearTimeout(managed.killTimeout)
      managed.killTimeout = null
    }

    managed.state.restartCount++
    managed.state.status = 'starting'
    managed.outputBuffer = []
    managed.submitQueue = Promise.resolve()
    managed.notifiedIdle = false
    managed.lastOutputAt = 0
    this.stopSessionDiscovery(managed)

    const spawnOutcome = this.spawnProcess(managed)
    if (spawnOutcome === 'capped') {
      managed.state.status = previousStatus
      this.updateStatus(managed.state.id, previousStatus)
      return { ...managed.state }
    }

    if (spawnOutcome === 'spawned' && shouldWakeAfterRestart) {
      const restartPty = managed.pty
      setTimeout(() => {
        if (restartPty === null || managed.pty !== restartPty) return
        ;(restartPty as IPty).write('\r')
      }, IDLE_RESTART_WAKE_DELAY_MS)
    }

    return { ...managed.state }
  }

  toggleYolo(agentId: string, yolo: boolean): AgentState | null {
    const managed = this.agents.get(agentId)
    if (!managed) return null

    managed.state.yolo = yolo
    // Restart with new flag, preserving session
    return this.restart(agentId)
  }

  private queueSubmittedInput(managed: ManagedAgent, input: string): boolean {
    const pty = managed.pty
    if (!pty) return false

    // Reset idle detection so we notify again after this task completes
    managed.notifiedIdle = false
    managed.lastOutputAt = Date.now()
    managed.state.lastActivityAt = new Date().toISOString()

    managed.submitQueue = managed.submitQueue
      .catch(() => undefined)
      .then(async () => {
        if (managed.pty !== pty) return
        const hint = input.trim()
        if (!managed.state.sessionId && hint) {
          managed.latestUserPrompt = hint.slice(0, SESSION_HINT_MAX_LENGTH)
        }
        pty.write(input)
        await new Promise<void>((resolve) => {
          setTimeout(resolve, INPUT_SUBMIT_DELAY_MS)
        })
        if (managed.pty !== pty) return
        pty.write('\r')
        // Claude CLI may show long/pasted input as "[Pasted text ...]" and
        // require a second Enter to confirm.  Always send a follow-up \r
        // for Claude agents so it submits automatically.
        if (managed.state.provider === 'claude') {
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 300)
          })
          if (managed.pty !== pty) return
          pty.write('\r')
        }
      })

    return true
  }

  private ensureProcess(managed: ManagedAgent): boolean {
    if (managed.pty) return true
    if (this.countActiveAgents(managed.state.id) >= MAX_CONCURRENT_AGENTS_HARD_LIMIT) {
      return false
    }
    return this.spawnProcess(managed) === 'spawned'
  }

  sendInput(agentId: string, input: string): boolean {
    const managed = this.agents.get(agentId)
    if (!managed) return false

    if (!this.ensureProcess(managed)) return false

    return this.queueSubmittedInput(managed, input)
  }

  sendRawInput(agentId: string, data: string): boolean {
    const managed = this.agents.get(agentId)
    if (!managed) return false
    if (!this.ensureProcess(managed)) return false

    const pty = managed.pty
    if (!pty) return false
    pty.write(data)
    return true
  }

  broadcast(projectDir: string, input: string): string[] {
    const sentTo: string[] = []
    for (const [id, managed] of this.agents) {
      if (
        managed.state.projectDir === projectDir &&
        this.ensureProcess(managed) &&
        this.queueSubmittedInput(managed, input)
      ) {
        sentTo.push(id)
      }
    }
    return sentTo
  }

  list(): AgentState[] {
    return Array.from(this.agents.values()).map((m) => ({ ...m.state }))
  }

  get(agentId: string): AgentState | null {
    const managed = this.agents.get(agentId)
    return managed ? { ...managed.state } : null
  }

  getBuffer(agentId: string): string[] {
    const managed = this.agents.get(agentId)
    return managed ? [...managed.outputBuffer] : []
  }

  setSessionId(agentId: string, sessionId: string): void {
    const managed = this.agents.get(agentId)
    if (managed) {
      this.updateSessionId(managed, sessionId)
      if (managed.state.sessionId) {
        this.stopSessionDiscovery(managed)
      }
    }
  }

  resize(agentId: string, cols: number, rows: number): void {
    const managed = this.agents.get(agentId)
    if (!managed) return
    if (cols < 2 || rows < 2) return

    managed.cols = cols
    managed.rows = rows

    if (managed.pty) {
      managed.pty.resize(cols, rows)
    }
  }

  killAll(): void {
    if (this.activityPollInterval) {
      clearInterval(this.activityPollInterval)
      this.activityPollInterval = null
    }
    for (const [id] of this.agents) {
      this.kill(id)
    }

    // Force kill stragglers after timeout
    setTimeout(() => {
      for (const [, managed] of this.agents) {
        this.stopSessionDiscovery(managed)
        if (managed.pty) {
          try {
            this.killPtyProcess(managed.pty, true)
          } catch {
            // Already dead
          }
        }
      }
    }, GRACEFUL_KILL_TIMEOUT + 1000)
  }

  getProjectDirs(): string[] {
    const dirs = new Set<string>()
    for (const [, managed] of this.agents) {
      dirs.add(managed.state.projectDir)
    }
    return Array.from(dirs)
  }
}
