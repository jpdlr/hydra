import { randomUUID } from 'crypto'
import type { AgentManager } from '../agents/AgentManager'
import type { HeadlessOrchestrator } from '../headless/HeadlessOrchestrator'
import type { HydraNotification, NotificationType, AgentStatusPayload } from '@shared/types'

const MAX_RECENT = 50

type Subscriber = (notification: HydraNotification) => void

/**
 * Base notification service with no Electron dependencies.
 * Used directly by the daemon process. Extended by NotificationService
 * in Electron to add native OS notifications + IPC broadcasts.
 */
export class DaemonNotificationService {
  protected recent: HydraNotification[] = []
  protected subscribers = new Set<Subscriber>()
  private lastAgentStatus = new Map<string, string>()

  push(notification: HydraNotification): void {
    this.recent.push(notification)
    if (this.recent.length > MAX_RECENT) {
      this.recent = this.recent.slice(-MAX_RECENT)
    }

    for (const sub of this.subscribers) {
      try {
        sub(notification)
      } catch {
        // Best-effort delivery
      }
    }
  }

  getRecent(limit = MAX_RECENT): HydraNotification[] {
    const count = Math.min(limit, this.recent.length)
    return this.recent.slice(-count)
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback)
    return () => {
      this.subscribers.delete(callback)
    }
  }

  connectAgentEvents(
    agentManager: AgentManager,
    headlessOrchestrator: HeadlessOrchestrator
  ): void {
    agentManager.on('agent_waiting', (payload: { agentId: string }) => {
      const agent = agentManager.get(payload.agentId)
      const agentName = agent?.name ?? payload.agentId

      this.push({
        id: randomUUID().slice(0, 12),
        type: 'agent_waiting',
        title: 'Agent Finished',
        body: `${agentName} is waiting for input`,
        agentId: payload.agentId,
        timestamp: new Date().toISOString()
      })
    })

    agentManager.on('status', (payload: AgentStatusPayload) => {
      const prev = this.lastAgentStatus.get(payload.agentId)
      if (prev === payload.status) return
      this.lastAgentStatus.set(payload.agentId, payload.status)

      const agent = agentManager.get(payload.agentId)
      const agentName = agent?.name ?? payload.agentId

      let type: NotificationType | null = null
      let title = ''
      let body = ''

      switch (payload.status) {
        case 'idle':
          type = 'agent_idle'
          title = 'Agent Completed'
          body = `${agentName} has finished`
          break
        case 'errored':
          type = 'agent_errored'
          title = 'Agent Error'
          body = `${agentName} encountered an error`
          break
        case 'running':
          type = 'agent_started'
          title = 'Agent Started'
          body = `${agentName} is now running`
          break
        default:
          return
      }

      this.push({
        id: randomUUID().slice(0, 12),
        type,
        title,
        body,
        agentId: payload.agentId,
        timestamp: new Date().toISOString()
      })
    })

    headlessOrchestrator.on('event', (payload: { runId: string; data: string }) => {
      const run = headlessOrchestrator.get(payload.runId)
      if (!run) return

      let type: NotificationType | null = null
      let title = ''
      let body = ''

      if (run.status === 'completed') {
        type = 'headless_completed'
        title = 'Headless Run Completed'
        body = `Run ${run.id} finished successfully`
      } else if (run.status === 'errored') {
        type = 'headless_errored'
        title = 'Headless Run Error'
        body = `Run ${run.id} failed: ${run.error ?? 'unknown error'}`
      } else {
        return
      }

      this.push({
        id: randomUUID().slice(0, 12),
        type,
        title,
        body,
        runId: run.id,
        timestamp: new Date().toISOString()
      })
    })
  }
}
