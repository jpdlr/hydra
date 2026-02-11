import { Notification, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { IPC } from '@shared/types'
import type { AgentManager } from '../agents/AgentManager'
import type { HeadlessOrchestrator } from '../headless/HeadlessOrchestrator'
import type { HydraNotification, NotificationType, AgentStatusPayload } from '@shared/types'

const MAX_RECENT = 50

type Subscriber = (notification: HydraNotification) => void

export class NotificationService {
  private recent: HydraNotification[] = []
  private subscribers = new Set<Subscriber>()

  push(notification: HydraNotification): void {
    this.recent.push(notification)
    if (this.recent.length > MAX_RECENT) {
      this.recent = this.recent.slice(-MAX_RECENT)
    }

    // Native OS notification
    if (Notification.isSupported()) {
      const native = new Notification({
        title: notification.title,
        body: notification.body,
        silent: true
      })
      native.show()
    }

    // Broadcast to renderer windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.NOTIFICATION, notification)
    })

    // Broadcast to SSE subscribers
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
