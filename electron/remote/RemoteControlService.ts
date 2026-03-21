import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import type { NotificationService } from '../notifications/NotificationService'
import type { DaemonNotificationService } from '../daemon/DaemonNotificationService'
import { getFirebaseConfig, getFirebaseProjectId } from './firebaseConfig'
import type {
  AgentState,
  RemoteControlState,
  RemoteInboxMessage,
  RemoteAgentSummary,
  AgentStatusPayload,
  AgentOutputPayload,
  HydraNotification,
  CreateAgentPayload
} from '@shared/types'
import { readTranscriptHistory } from '../sessions/TranscriptReader'

/**
 * Minimal interface satisfied by both AgentManager (direct) and DaemonClient (proxy).
 */
interface AgentBackend extends EventEmitter {
  list(): AgentState[] | Promise<AgentState[]>
  get(agentId: string): AgentState | null | Promise<AgentState | null>
  create(payload: CreateAgentPayload): AgentState | Promise<AgentState>
  kill(agentId: string): boolean | Promise<boolean>
  restart(agentId: string): AgentState | null | Promise<AgentState | null>
  sendInput(agentId: string, input: string): boolean | void | Promise<void>
  broadcast(projectDir: string, input: string): string[] | Promise<string[]>
}

// Firebase SDK — lazy-imported so the module can be loaded even if firebase
// is not yet installed (tests, builds without the dep, etc.).
type FirebaseApp = import('firebase/app').FirebaseApp
type Firestore = import('firebase/firestore').Firestore
type Auth = import('firebase/auth').Auth
type Unsubscribe = () => void

const OUTPUT_FLUSH_INTERVAL_MS = 2000
const MAX_OUTBOX_PAYLOAD_BYTES = 50_000
const ENABLE_PHASE_TIMEOUT_MS = 15_000

export class RemoteControlService extends EventEmitter {
  private state: RemoteControlState = {
    enabled: false,
    status: 'disconnected',
    sessionId: null,
    qrPayload: null,
    connectedAt: null,
    expiresAt: null,
    mobileConnected: false,
    error: null
  }

  private firebaseApp: FirebaseApp | null = null
  private firestore: Firestore | null = null
  private auth: Auth | null = null

  private inboxUnsubscribe: Unsubscribe | null = null
  private agentOutputUnsub: Unsubscribe | null = null
  private agentStatusUnsub: Unsubscribe | null = null
  private notificationUnsub: Unsubscribe | null = null

  private outputBuffers = new Map<string, string[]>()
  private flushTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private agentManager: AgentBackend,
    private notificationService: NotificationService | DaemonNotificationService,
    private timeoutMinutes: number = 480,
    private enablePhaseTimeoutMs: number = ENABLE_PHASE_TIMEOUT_MS
  ) {
    super()
  }

  getState(): RemoteControlState {
    return { ...this.state }
  }

  async enable(): Promise<RemoteControlState> {
    if (this.state.enabled) return this.getState()

    this.updateState({
      enabled: true,
      status: 'creating',
      error: null,
      connectedAt: null,
      mobileConnected: false
    })

    try {
      await this.withTimeout(
        this.initFirebase(),
        this.enablePhaseTimeoutMs,
        'Timed out initializing remote control.'
      )
      await this.withTimeout(
        this.createSession(),
        this.enablePhaseTimeoutMs,
        'Timed out creating remote session.'
      )
      this.attachAgentListeners()
      this.startOutputFlushing()
      await this.withTimeout(
        this.syncAgentState(),
        this.enablePhaseTimeoutMs,
        'Timed out syncing remote agent state.'
      )

      this.updateState({ status: 'active', connectedAt: new Date().toISOString() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.detachAllListeners()
      this.stopOutputFlushing()
      this.updateState({
        enabled: false,
        status: 'error',
        sessionId: null,
        qrPayload: null,
        connectedAt: null,
        expiresAt: null,
        mobileConnected: false,
        error: message
      })
    }

    return this.getState()
  }

  async disable(): Promise<RemoteControlState> {
    if (!this.state.enabled) return this.getState()

    this.detachAllListeners()
    this.stopOutputFlushing()

    // Clean up Firestore session
    if (this.firestore && this.state.sessionId) {
      try {
        const { doc, deleteDoc } = await import('firebase/firestore')
        await deleteDoc(doc(this.firestore, 'sessions', this.state.sessionId))
      } catch {
        // Best-effort cleanup
      }
    }

    // Sign out
    if (this.auth) {
      try {
        const { signOut } = await import('firebase/auth')
        await signOut(this.auth)
      } catch {
        // Best effort
      }
    }

    this.updateState({
      enabled: false,
      status: 'disconnected',
      sessionId: null,
      qrPayload: null,
      connectedAt: null,
      expiresAt: null,
      mobileConnected: false,
      error: null
    })

    return this.getState()
  }

  destroy(): void {
    this.detachAllListeners()
    this.stopOutputFlushing()

    if (this.firebaseApp) {
      const app = this.firebaseApp
      this.firebaseApp = null
      import('firebase/app').then(({ deleteApp }) => {
        return deleteApp(app)
      }).catch(() => {/* ignore */})
    }
  }

  setTimeoutMinutes(minutes: number): void {
    this.timeoutMinutes = Math.min(Math.max(minutes, 30), 1440)
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error(message))
      }, timeoutMs)

      promise
        .then((value) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(value)
        })
        .catch((err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(err)
        })
    })
  }

  // ── Firebase init ─────────────────────────────────────────────────────────

  private async initFirebase(): Promise<void> {
    if (this.firebaseApp) return

    const firebaseConfig = getFirebaseConfig()
    const { initializeApp } = await import('firebase/app')
    const { getFirestore } = await import('firebase/firestore')
    const { getAuth } = await import('firebase/auth')

    this.firebaseApp = initializeApp(firebaseConfig, 'hydra-remote')
    this.firestore = getFirestore(this.firebaseApp)
    this.auth = getAuth(this.firebaseApp)
  }

  // ── Session creation ──────────────────────────────────────────────────────

  private async createSession(): Promise<void> {
    if (!this.firebaseApp) throw new Error('Firebase not initialized')

    const { getFunctions, httpsCallable } = await import('firebase/functions')
    const { signInWithCustomToken } = await import('firebase/auth')

    const functions = getFunctions(this.firebaseApp)
    const createSessionFn = httpsCallable<
      { hostName: string; timeoutMinutes: number },
      { sessionId: string; hostToken: string; mobileToken: string; expiresAt: string }
    >(functions, 'createSession')

    const result = await createSessionFn({
      hostName: hostname(),
      timeoutMinutes: this.timeoutMinutes
    })

    const { sessionId, hostToken, mobileToken, expiresAt } = result.data

    // Authenticate as host
    if (!this.auth) throw new Error('Auth not initialized')
    await signInWithCustomToken(this.auth, hostToken)

    // Build QR payload (mobile scans this to connect)
    const qrPayload = JSON.stringify({
      sessionId,
      mobileToken,
      projectId: getFirebaseProjectId()
    })

    this.updateState({ sessionId, qrPayload, expiresAt })

    // Attach inbox listener
    this.attachInboxListener(sessionId)
  }

  // ── Inbox listener ────────────────────────────────────────────────────────

  private async attachInboxListener(sessionId: string): Promise<void> {
    if (!this.firestore) return

    const { collection, query, where, onSnapshot, doc, updateDoc } =
      await import('firebase/firestore')

    const inboxRef = collection(this.firestore, 'sessions', sessionId, 'inbox')
    const unprocessedQuery = query(inboxRef, where('processed', '==', false))

    this.inboxUnsubscribe = onSnapshot(unprocessedQuery, (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue

        const data = change.doc.data() as RemoteInboxMessage
        const msgRef = doc(this.firestore!, 'sessions', sessionId, 'inbox', change.doc.id)

        // Mark as processed immediately
        void updateDoc(msgRef, { processed: true })

        // If first inbox message, mark mobile as connected
        if (!this.state.mobileConnected) {
          this.updateState({ mobileConnected: true })
        }

        this.processInboxMessage(data)
      }
    })
  }

  // ── Command dispatch ──────────────────────────────────────────────────────

  private processInboxMessage(msg: RemoteInboxMessage): void {
    const payload = msg.payload

    switch (msg.type) {
      case 'handshake': {
        // Presence signal from mobile app after authentication.
        break
      }
      case 'prompt': {
        const agentId = payload.agentId as string
        const input = payload.input as string
        if (agentId && input) {
          void Promise.resolve(this.agentManager.sendInput(agentId, input))
        }
        break
      }
      case 'kill': {
        const agentId = payload.agentId as string
        if (agentId) {
          void Promise.resolve(this.agentManager.kill(agentId))
        }
        break
      }
      case 'create': {
        const createPayload = payload as unknown as CreateAgentPayload
        if (createPayload.projectDir) {
          void Promise.resolve(this.agentManager.create(createPayload))
        }
        break
      }
      case 'restart': {
        const agentId = payload.agentId as string
        if (agentId) {
          void Promise.resolve(this.agentManager.restart(agentId))
        }
        break
      }
      case 'broadcast': {
        const projectDir = payload.projectDir as string
        const input = payload.input as string
        if (projectDir && input) {
          void Promise.resolve(this.agentManager.broadcast(projectDir, input))
        }
        break
      }
      case 'get_history': {
        const agentId = payload.agentId as string
        if (agentId) {
          void this.sendConversationHistory(agentId)
        }
        break
      }
    }
  }

  private async sendConversationHistory(agentId: string): Promise<void> {
    const agent = await Promise.resolve(this.agentManager.get(agentId))
    if (!agent?.sessionId) return
    const messages = readTranscriptHistory(agent.sessionId, agent.provider)
    await this.writeOutbox('conversation_history', { agentId, messages })
  }

  // ── Agent state sync ──────────────────────────────────────────────────────

  private async syncAgentState(): Promise<void> {
    if (!this.firestore || !this.state.sessionId) return

    const { doc, setDoc } = await import('firebase/firestore')
    const agents = await Promise.resolve(this.agentManager.list())

    for (const agent of agents) {
      const summary: RemoteAgentSummary = {
        agentId: agent.id,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        provider: agent.provider,
        projectDir: agent.projectDir,
        sessionId: agent.sessionId,
        createdAt: agent.createdAt,
        startedAt: agent.startedAt
      }

      const stateRef = doc(
        this.firestore,
        'sessions',
        this.state.sessionId,
        'state',
        agent.id
      )

      void setDoc(stateRef, summary)
    }
  }

  // ── Outbox writing ────────────────────────────────────────────────────────

  private async writeOutbox(
    type: 'output' | 'status' | 'notification' | 'agent_list' | 'conversation_history',
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.firestore || !this.state.sessionId) return

    const { collection, addDoc } = await import('firebase/firestore')
    const outboxRef = collection(
      this.firestore,
      'sessions',
      this.state.sessionId,
      'outbox'
    )

    const msgPayload = JSON.stringify(payload)
    // Respect Firestore doc size limits
    if (msgPayload.length > MAX_OUTBOX_PAYLOAD_BYTES) {
      // Truncate output data to fit
      const truncated: Record<string, unknown> = { ...payload, truncated: true }
      if (Array.isArray(truncated.lines)) {
        truncated.lines = (truncated.lines as string[]).slice(-100)
      }
      await addDoc(outboxRef, {
        id: randomUUID().slice(0, 12),
        type,
        payload: truncated,
        timestamp: new Date().toISOString()
      })
      return
    }

    await addDoc(outboxRef, {
      id: randomUUID().slice(0, 12),
      type,
      payload,
      timestamp: new Date().toISOString()
    })
  }

  // ── Output batching ───────────────────────────────────────────────────────

  private startOutputFlushing(): void {
    this.flushTimer = setInterval(() => {
      void this.flushOutputBatch()
    }, OUTPUT_FLUSH_INTERVAL_MS)
  }

  private stopOutputFlushing(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  private async flushOutputBatch(): Promise<void> {
    if (this.outputBuffers.size === 0) return

    const batches = new Map(this.outputBuffers)
    this.outputBuffers.clear()

    for (const [agentId, lines] of batches) {
      await this.writeOutbox('output', { agentId, lines })
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  private attachAgentListeners(): void {
    const onOutput = (payload: AgentOutputPayload) => {
      const existing = this.outputBuffers.get(payload.agentId) ?? []
      existing.push(payload.data)
      this.outputBuffers.set(payload.agentId, existing)
    }

    const onStatus = (payload: AgentStatusPayload) => {
      // Update state subcollection
      void this.syncSingleAgentState(payload.agentId)
      // Write status change to outbox
      void this.writeOutbox('status', {
        agentId: payload.agentId,
        status: payload.status,
        sessionId: payload.sessionId ?? null
      })
    }

    this.agentManager.on('output', onOutput)
    this.agentManager.on('status', onStatus)

    this.agentOutputUnsub = () => {
      this.agentManager.removeListener('output', onOutput)
    }
    this.agentStatusUnsub = () => {
      this.agentManager.removeListener('status', onStatus)
    }

    // Notification subscription
    this.notificationUnsub = this.notificationService.subscribe(
      (notification: HydraNotification) => {
        void this.writeOutbox('notification', {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          agentId: notification.agentId ?? null,
          timestamp: notification.timestamp
        })
      }
    )
  }

  private async syncSingleAgentState(agentId: string): Promise<void> {
    if (!this.firestore || !this.state.sessionId) return

    const { doc, setDoc, deleteDoc } = await import('firebase/firestore')
    const agent = await Promise.resolve(this.agentManager.get(agentId))
    const stateRef = doc(
      this.firestore,
      'sessions',
      this.state.sessionId,
      'state',
      agentId
    )

    if (!agent) {
      // Agent removed
      void deleteDoc(stateRef)
      return
    }

    const summary: RemoteAgentSummary = {
      agentId: agent.id,
      name: agent.name,
      status: agent.status,
      model: agent.model,
      provider: agent.provider,
      projectDir: agent.projectDir,
      sessionId: agent.sessionId,
      createdAt: agent.createdAt,
      startedAt: agent.startedAt
    }

    void setDoc(stateRef, summary)
  }

  private detachAllListeners(): void {
    this.inboxUnsubscribe?.()
    this.inboxUnsubscribe = null

    this.agentOutputUnsub?.()
    this.agentOutputUnsub = null

    this.agentStatusUnsub?.()
    this.agentStatusUnsub = null

    this.notificationUnsub?.()
    this.notificationUnsub = null
  }

  // ── State management ──────────────────────────────────────────────────────

  private updateState(partial: Partial<RemoteControlState>): void {
    this.state = { ...this.state, ...partial }
    this.emit('state-changed', this.getState())
  }
}
