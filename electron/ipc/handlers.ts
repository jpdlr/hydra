import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { AgentManager } from '../agents/AgentManager'
import { ConfigStore } from '../config/ConfigStore'
import { SessionCatalog } from '../sessions/SessionCatalog'
import { HeadlessOrchestrator } from '../headless/HeadlessOrchestrator'
import { NotificationService } from '../notifications/NotificationService'
import { UsageTracker } from '../usage/UsageTracker'
import { UpdateService } from '../updates/UpdateService'
import { FileSystemService } from '../fs/FileSystemService'
import { GitService } from '../git/GitService'
import { IPC } from '@shared/types'
import type { HydraMcpServer } from '../mcp/McpServer'
import type {
  CreateAgentPayload,
  AppConfig,
  ObservabilityLogEventPayload,
  ExportDiagnosticsResult,
  UsageDashboardOptions
} from '@shared/types'
import { z } from 'zod'

const agentIdSchema = z.string().trim().min(1).max(128)
const projectDirSchema = z.string().trim().min(1).max(4096)
const providerSchema = z.enum(['claude', 'codex'])
const modelSchema = z.string().trim().min(1).max(128)
const reasoningEffortSchema = z.string().trim().max(32).optional()
const createAgentPayloadSchema = z.object({
  name: z.string().trim().max(120),
  projectDir: projectDirSchema,
  provider: providerSchema,
  model: modelSchema,
  reasoningEffort: reasoningEffortSchema,
  yolo: z.boolean(),
  initialPrompt: z.string().max(20000),
  resumeSessionId: z.string().trim().min(1).max(128).nullable().optional(),
  isManager: z.boolean().optional()
})
const resizeSchema = z.object({
  agentId: agentIdSchema,
  cols: z.number().int().min(2).max(1000),
  rows: z.number().int().min(2).max(1000)
})
const inputSchema = z.object({
  agentId: agentIdSchema,
  input: z.string().max(20000)
})
const rawInputSchema = z.object({
  agentId: agentIdSchema,
  data: z.string().max(20000)
})
const broadcastSchema = z.object({
  projectDir: projectDirSchema,
  input: z.string().max(20000)
})
const appConfigPatchSchema = z
  .object({
    schemaVersion: z.number().int().min(1).max(100).optional(),
    defaultProvider: providerSchema.optional(),
    defaultModel: modelSchema.optional(),
    globalYolo: z.boolean().optional(),
    maxAgents: z.number().int().min(1).max(64).optional(),
    theme: z.enum(['light', 'dark', 'midnight']).optional(),
    defaultViewMode: z.enum(['grid', 'chat']).optional(),
    defaultProjectDir: z.string().max(4096).optional(),
    importSessionsOnStartup: z.boolean().optional(),
    sessionImportLimit: z.number().int().min(0).max(20000).optional(),
    sessionMaxAgeDays: z.number().int().min(0).max(365).optional(),
    sessionImportProjectPrefix: z.string().max(4096).optional(),
    hiddenSessionIds: z.array(z.string().trim().min(1).max(128)).max(10000).optional(),
    usageDailyTokenBudget: z.number().int().min(0).max(10_000_000).optional(),
    usageDailyCostBudgetUsd: z.number().min(0).max(100_000).optional(),
    usageBudgetWarningThresholdPct: z.number().int().min(1).max(99).optional(),
    enableSoundEffects: z.boolean().optional(),
    enableRemoteErrorReporting: z.boolean().optional(),
    errorReportingEndpoint: z.string().max(1024).optional(),
    includeSensitiveDiagnostics: z.boolean().optional()
  })
  .strict()
const sessionListOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(20000).optional(),
    maxAgeDays: z.number().int().min(1).max(365).optional(),
    projectPathPrefix: z.string().trim().min(1).max(4096).optional(),
    includeHidden: z.boolean().optional()
  })
  .optional()
const headlessStartSchema = z.object({
  prompt: z.string().trim().min(1).max(20000),
  projectDir: projectDirSchema,
  provider: providerSchema,
  model: modelSchema,
  reasoningEffort: reasoningEffortSchema,
  resumeSessionId: z.string().trim().min(1).max(128).nullable().optional()
})
const headlessListOptionsSchema = z
  .object({
    query: z.string().max(2000).optional(),
    status: z.enum(['running', 'completed', 'errored', 'canceled', 'all']).optional(),
    limit: z.number().int().min(1).max(5000).optional()
  })
  .optional()
const headlessLogOptionsSchema = z
  .object({
    tailLines: z.number().int().min(1).max(5000).optional(),
    maxChars: z.number().int().min(200).max(500000).optional()
  })
  .optional()
const usageDashboardOptionsSchema = z
  .object({
    days: z.number().int().min(1).max(90).optional()
  })
  .optional()
const fsPathSchema = z.string().trim().min(1).max(8192)
const fsWriteContentSchema = z.string().max(10_000_000)

const observabilityLogSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  event: z.string().trim().min(1).max(200),
  message: z.string().max(4000).optional(),
  traceId: z.string().trim().min(1).max(128).optional(),
  agentId: z.string().trim().min(1).max(128).optional(),
  sessionId: z.string().trim().min(1).max(128).optional(),
  projectId: z.string().trim().min(1).max(4096).optional(),
  service: z.enum(['renderer', 'preload']).optional(),
  meta: z.record(z.unknown()).optional()
})

interface ObservabilityHandlers {
  logRendererEvent: (payload: ObservabilityLogEventPayload) => void
  exportDiagnostics: () => Promise<ExportDiagnosticsResult>
  logMainEvent?: (payload: ObservabilityLogEventPayload) => void
}

export function registerIpcHandlers(
  agentManager: AgentManager,
  configStore: ConfigStore,
  sessionCatalog: SessionCatalog,
  headlessOrchestrator: HeadlessOrchestrator,
  usageTracker: UsageTracker,
  updateService: UpdateService,
  observability: ObservabilityHandlers,
  onWorkspaceChanged?: () => void,
  mcpServer?: HydraMcpServer | null,
  notificationService?: NotificationService | null,
  fileSystemService?: FileSystemService | null,
  gitService?: GitService | null
): void {
  // ── Preflight ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.PREFLIGHT_CHECK, async (_event, provider?: string) => {
    const providerId = providerSchema.catch('claude').parse(provider ?? 'claude')
    return agentManager.preflight(providerId)
  })

  // ── Agent lifecycle ──────────────────────────────────────────────────────

  ipcMain.handle(IPC.AGENT_CREATE, async (_event, payload: CreateAgentPayload) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.create.request',
      projectId: payload?.projectDir || undefined,
      meta: { isManager: payload?.isManager }
    })

    // Manager agent: inject workspace path before Zod validation (projectDir min(1))
    if (payload?.isManager) {
      const status = mcpServer?.getStatus()
      if (!status?.running || !status.managerWorkspace) {
        throw new Error('MCP server is not running — cannot create manager agent')
      }
      payload.projectDir = status.managerWorkspace
    }

    const parsedPayload = createAgentPayloadSchema.parse(payload)
    if (!parsedPayload.name) {
      parsedPayload.name = AgentManager.generateName(parsedPayload.initialPrompt, parsedPayload.projectDir)
    }
    const preflight = await agentManager.preflight(parsedPayload.provider)
    if (!preflight.ok) {
      throw new Error(preflight.error || `${parsedPayload.provider} CLI preflight check failed`)
    }
    const maxAgents = configStore.get().maxAgents
    const current = agentManager.activeCount()
    if (current >= maxAgents) {
      throw new Error(`Maximum concurrent agents (${maxAgents}) reached`)
    }
    const created = agentManager.create(parsedPayload)
    onWorkspaceChanged?.()
    return created
  })

  ipcMain.handle(IPC.AGENT_KILL, (_event, agentId: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.kill.request',
      agentId
    })
    const killed = agentManager.kill(agentIdSchema.parse(agentId))
    onWorkspaceChanged?.()
    return killed
  })

  ipcMain.handle(IPC.AGENT_REMOVE, (_event, agentId: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.remove.request',
      agentId
    })
    const removed = agentManager.remove(agentIdSchema.parse(agentId))
    onWorkspaceChanged?.()
    return removed
  })

  ipcMain.handle(IPC.AGENT_RESTART, (_event, agentId: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.restart.request',
      agentId
    })
    const restarted = agentManager.restart(agentIdSchema.parse(agentId))
    onWorkspaceChanged?.()
    return restarted
  })

  ipcMain.handle(IPC.AGENT_LIST, () => {
    return agentManager.list()
  })

  ipcMain.handle(IPC.AGENT_YOLO_TOGGLE, (_event, agentId: string, yolo: boolean) => {
    const toggled = agentManager.toggleYolo(agentIdSchema.parse(agentId), z.boolean().parse(yolo))
    onWorkspaceChanged?.()
    return toggled
  })

  // ── Agent I/O ────────────────────────────────────────────────────────────

  ipcMain.on(IPC.AGENT_INPUT, (_event, agentId: string, input: string) => {
    observability.logMainEvent?.({
      level: 'debug',
      event: 'agent.input.sent',
      agentId,
      message: 'Submitted user input'
    })
    const parsed = inputSchema.parse({ agentId, input })
    agentManager.sendInput(parsed.agentId, parsed.input)
  })

  ipcMain.on(IPC.AGENT_INPUT_RAW, (_event, agentId: string, data: string) => {
    const parsed = rawInputSchema.parse({ agentId, data })
    agentManager.sendRawInput(parsed.agentId, parsed.data)
  })

  ipcMain.on(IPC.AGENT_RESIZE, (_event, agentId: string, cols: number, rows: number) => {
    const parsed = resizeSchema.parse({ agentId, cols, rows })
    agentManager.resize(parsed.agentId, parsed.cols, parsed.rows)
  })

  ipcMain.handle(IPC.AGENT_BROADCAST, (_event, projectDir: string, input: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.broadcast.request',
      projectId: projectDir,
      message: 'Broadcast prompt submitted'
    })
    const parsed = broadcastSchema.parse({ projectDir, input })
    return agentManager.broadcast(parsed.projectDir, parsed.input)
  })

  // ── Sessions ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SESSIONS_LIST, (_event, options?: unknown) => {
    const config = configStore.get()
    const parsedOptions = sessionListOptionsSchema.parse(options)
    const projectPathPrefix =
      parsedOptions?.projectPathPrefix ??
      config.sessionImportProjectPrefix ??
      undefined

    const shouldIncludeHidden = parsedOptions?.includeHidden === true
    return sessionCatalog.listSessions({
      limit: parsedOptions?.limit ?? (config.sessionImportLimit > 0 ? config.sessionImportLimit : undefined),
      maxAgeDays: parsedOptions?.maxAgeDays ?? (config.sessionMaxAgeDays > 0 ? config.sessionMaxAgeDays : undefined),
      projectPathPrefix,
      hiddenSessionIds: shouldIncludeHidden ? undefined : config.hiddenSessionIds
    })
  })

  // ── Headless runs ────────────────────────────────────────────────────────

  ipcMain.handle(IPC.HEADLESS_RUN_START, (_event, payload: unknown) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'headless.start.request'
    })
    return headlessOrchestrator.start(headlessStartSchema.parse(payload))
  })

  ipcMain.handle(IPC.HEADLESS_RUN_LIST, (_event, options?: unknown) => {
    return headlessOrchestrator.list(headlessListOptionsSchema.parse(options))
  })

  ipcMain.handle(IPC.HEADLESS_RUN_GET, (_event, runId: string) => {
    return headlessOrchestrator.get(agentIdSchema.parse(runId))
  })

  ipcMain.handle(IPC.HEADLESS_RUN_CANCEL, (_event, runId: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'headless.cancel.request',
      sessionId: runId
    })
    return headlessOrchestrator.cancel(agentIdSchema.parse(runId))
  })

  ipcMain.handle(IPC.HEADLESS_RUN_GET_LOG, (_event, runId: string, options?: unknown) => {
    return headlessOrchestrator.getLog(
      agentIdSchema.parse(runId),
      headlessLogOptionsSchema.parse(options)
    )
  })

  // ── Config ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return configStore.get()
  })

  ipcMain.handle(IPC.CONFIG_SET, (_event, partial: Partial<AppConfig>) => {
    const validated = appConfigPatchSchema.parse(partial)
    const updated = configStore.set(validated)
    observability.logMainEvent?.({
      level: 'info',
      event: 'config.updated',
      message: 'Config patch saved',
      meta: { keys: Object.keys(validated) }
    })
    // Notify all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.CONFIG_ON_CHANGE, updated)
      win.webContents.send(IPC.USAGE_UPDATED, usageTracker.getDashboard(updated, { days: 14 }))
    })
    return updated
  })

  // ── Global YOLO ──────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GLOBAL_YOLO_TOGGLE, (_event, enabled: boolean) => {
    const toggle = z.boolean().parse(enabled)
    configStore.set({ globalYolo: toggle })

    // Toggle all agents
    const agents = agentManager.list()
    const results: string[] = []
    for (const agent of agents) {
      if (agent.yolo !== toggle) {
        agentManager.toggleYolo(agent.id, toggle)
        results.push(agent.id)
      }
    }

    // Notify all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.CONFIG_ON_CHANGE, configStore.get())
    })

    return results
  })

  // ── Dialog ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.DIALOG_SELECT_DIR, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Project Directory'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })

  // ── Shell ────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.OPEN_IN_EDITOR, (_event, dir: string) => {
    const validated = projectDirSchema.parse(dir)
    return new Promise<boolean>((resolve) => {
      const command = process.platform === 'win32' ? 'cmd' : 'code'
      const args = process.platform === 'win32' ? ['/c', 'code', validated] : [validated]
      execFile(command, args, (err) => {
        if (err) {
          // Fallback: try opening the folder in the OS default handler.
          shell.openPath(validated).then(() => resolve(true)).catch(() => resolve(false))
          return
        }
        resolve(true)
      })
    })
  })

  // ── Observability ───────────────────────────────────────────────────────

  ipcMain.on(IPC.OBS_LOG_EVENT, (_event, payload: unknown) => {
    observability.logRendererEvent(observabilityLogSchema.parse(payload))
  })

  ipcMain.handle(IPC.OBS_EXPORT_DIAGNOSTICS, () => {
    return observability.exportDiagnostics()
  })

  // ── Usage dashboard ───────────────────────────────────────────────────────

  ipcMain.handle(IPC.USAGE_DASHBOARD_GET, (_event, options?: UsageDashboardOptions) => {
    const parsed = usageDashboardOptionsSchema.parse(options)
    return usageTracker.getDashboard(configStore.get(), parsed)
  })

  // ── App updates ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.UPDATE_GET_STATE, () => {
    return updateService.getState()
  })

  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    return updateService.checkForUpdates()
  })

  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    return updateService.downloadUpdate()
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    return updateService.installAndRestart()
  })

  // ── MCP ────────────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.MCP_SERVER_STATUS, () => {
    return mcpServer?.getStatus() ?? { running: false, port: null, error: null, managerWorkspace: null }
  })

  // ── Forward agent events to renderer ─────────────────────────────────────

  agentManager.on('output', (payload) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.AGENT_OUTPUT, payload)
    })

    const agent = agentManager.get(payload.agentId)
    if (!agent) return

    const usageResult = usageTracker.recordAgentOutput(agent, payload.data, configStore.get())
    if (!usageResult.changed) return

    const dashboard = usageTracker.getDashboard(configStore.get(), { days: 14 })
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.USAGE_UPDATED, dashboard)
    })

    for (const alert of usageResult.alerts) {
      if (!notificationService) continue
      const metricLabel = alert.metric === 'tokens' ? 'Token' : 'Cost'
      const budgetLabel =
        alert.metric === 'tokens'
          ? `${Math.round(alert.budget).toLocaleString()} tokens`
          : `$${alert.budget.toFixed(2)}`
      const usageLabel =
        alert.metric === 'tokens'
          ? `${Math.round(alert.usage).toLocaleString()} tokens`
          : `$${alert.usage.toFixed(2)}`
      const percent = Math.round(alert.percent)
      const levelLabel = alert.level === 'exceeded' ? 'Exceeded' : 'Warning'

      notificationService.push({
        id: randomUUID().slice(0, 12),
        type: 'usage_budget_warning',
        title: `${metricLabel} Budget ${levelLabel}`,
        body: `${usageLabel} of ${budgetLabel} (${percent}%) today`,
        timestamp: new Date().toISOString()
      })
    }
  })

  agentManager.on('status', (payload) => {
    observability.logMainEvent?.({
      level: payload.status === 'errored' ? 'error' : 'info',
      event: 'agent.status.changed',
      agentId: payload.agentId,
      sessionId: payload.sessionId ?? undefined,
      message: payload.status
    })
    onWorkspaceChanged?.()
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.AGENT_STATUS, payload)
    })
  })

  headlessOrchestrator.on('event', (payload) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.HEADLESS_RUN_EVENT, payload)
    })
  })

  updateService.on('state-changed', (state) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.UPDATE_STATE_CHANGED, state)
    })
  })

  // ── File System (Editor Panel) ──────────────────────────────────────────

  if (fileSystemService) {
    ipcMain.handle(IPC.FS_READ_DIR, async (_event, agentId: string, dirPath: string) => {
      const id = agentIdSchema.parse(agentId)
      const path = fsPathSchema.parse(dirPath)
      const agent = agentManager.get(id)
      if (!agent) throw new Error(`Agent ${id} not found`)
      return fileSystemService.readDir(path, agent.projectDir)
    })

    ipcMain.handle(IPC.FS_READ_FILE, async (_event, agentId: string, filePath: string) => {
      const id = agentIdSchema.parse(agentId)
      const path = fsPathSchema.parse(filePath)
      const agent = agentManager.get(id)
      if (!agent) throw new Error(`Agent ${id} not found`)
      return fileSystemService.readFile(path, agent.projectDir)
    })

    ipcMain.handle(
      IPC.FS_WRITE_FILE,
      async (_event, agentId: string, filePath: string, content: string) => {
        const id = agentIdSchema.parse(agentId)
        const path = fsPathSchema.parse(filePath)
        const body = fsWriteContentSchema.parse(content)
        const agent = agentManager.get(id)
        if (!agent) throw new Error(`Agent ${id} not found`)
        await fileSystemService.writeFile(path, body, agent.projectDir)
        return true
      }
    )

    ipcMain.on(IPC.FS_WATCH_START, (_event, agentId: string) => {
      const id = agentIdSchema.parse(agentId)
      const agent = agentManager.get(id)
      if (!agent) return
      fileSystemService.startWatch(id, agent.projectDir, (payload) => {
        BrowserWindow.getAllWindows().forEach((win) => {
          win.webContents.send(IPC.FS_WATCH_EVENT, payload)
        })
      })
    })

    ipcMain.on(IPC.FS_WATCH_STOP, (_event, agentId: string) => {
      const id = agentIdSchema.parse(agentId)
      fileSystemService.stopWatch(id)
    })

    ipcMain.handle(
      IPC.FS_SEARCH_FILES,
      async (_event, agentId: string, query: string, maxResults?: number) => {
        const id = agentIdSchema.parse(agentId)
        const q = z.string().max(500).parse(query)
        const limit = z.number().int().min(1).max(500).optional().parse(maxResults)
        const agent = agentManager.get(id)
        if (!agent) throw new Error(`Agent ${id} not found`)
        return fileSystemService.searchFiles(q, agent.projectDir, limit)
      }
    )
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  ipcMain.on(IPC.NOTIFICATION_DISMISS, (_event, id: string) => {
    // Dismiss is renderer-side only (remove from toast stack).
    // Forward to all windows so multi-window setups stay in sync.
    const validated = z.string().trim().min(1).max(128).parse(id)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.NOTIFICATION_DISMISS, validated)
    })
  })

  // Connect NotificationService to agent/headless events
  if (notificationService) {
    notificationService.connectAgentEvents(agentManager, headlessOrchestrator)
  }

  // ── Git ───────────────────────────────────────────────────────────────────

  if (gitService) {
    ipcMain.handle(IPC.GIT_STATUS, async (_event, projectDir: string) => {
      const dir = projectDirSchema.parse(projectDir)
      return gitService.getStatus(dir)
    })

    ipcMain.handle(IPC.GIT_LOG, async (_event, projectDir: string, limit?: number) => {
      const dir = projectDirSchema.parse(projectDir)
      const n = z.number().int().min(1).max(200).optional().parse(limit)
      return gitService.getLog(dir, n)
    })

    ipcMain.handle(IPC.GIT_DIFF, async (_event, projectDir: string, filePath?: string) => {
      const dir = projectDirSchema.parse(projectDir)
      const fp = filePath ? z.string().max(8192).parse(filePath) : undefined
      return gitService.getDiff(dir, fp)
    })

    ipcMain.handle(
      IPC.GIT_COMMIT,
      async (_event, projectDir: string, message: string, files?: string[]) => {
        const dir = projectDirSchema.parse(projectDir)
        const msg = z.string().trim().min(1).max(4000).parse(message)
        const f = files ? z.array(z.string().max(4096)).max(500).parse(files) : undefined
        return gitService.stageAndCommit(dir, msg, f)
      }
    )

    ipcMain.handle(IPC.GIT_PUSH, async (_event, projectDir: string) => {
      const dir = projectDirSchema.parse(projectDir)
      return gitService.push(dir)
    })
  }
}
