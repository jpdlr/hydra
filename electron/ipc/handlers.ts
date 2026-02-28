import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import { DaemonClient } from '../daemon/DaemonClient'
import { ConfigStore } from '../config/ConfigStore'
import { NotificationService } from '../notifications/NotificationService'
import { UsageTracker } from '../usage/UsageTracker'
import { UpdateService } from '../updates/UpdateService'
import { FileSystemService } from '../fs/FileSystemService'
import { GitService } from '../git/GitService'
import { RemoteControlService } from '../remote/RemoteControlService'
import { IPC, EDITOR_REGISTRY } from '@shared/types'
import type {
  CreateAgentPayload,
  AppConfig,
  ObservabilityLogEventPayload,
  ExportDiagnosticsResult,
  UsageDashboardOptions
} from '@shared/types'
import { z } from 'zod'

const editorIdSchema = z.enum(['vscode', 'cursor', 'windsurf', 'zed', 'finder', 'terminal'])
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
    defaultEditor: editorIdSchema.optional(),
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
    includeSensitiveDiagnostics: z.boolean().optional(),
    remoteControlEnabled: z.boolean().optional(),
    remoteSessionTimeoutMinutes: z.number().int().min(30).max(1440).optional()
  })
  .strict()
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
const sessionListOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(20000).optional(),
    maxAgeDays: z.number().int().min(1).max(365).optional(),
    projectPathPrefix: z.string().trim().min(1).max(4096).optional(),
    includeHidden: z.boolean().optional()
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
  daemonClient: DaemonClient,
  configStore: ConfigStore,
  usageTracker: UsageTracker,
  updateService: UpdateService,
  observability: ObservabilityHandlers,
  notificationService?: NotificationService | null,
  fileSystemService?: FileSystemService | null,
  gitService?: GitService | null,
  remoteControlService?: RemoteControlService | null
): void {
  // ── Preflight ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.PREFLIGHT_CHECK, async (_event, provider?: string) => {
    const providerId = providerSchema.catch('claude').parse(provider ?? 'claude')
    return daemonClient.preflight(providerId)
  })

  // ── Agent lifecycle ──────────────────────────────────────────────────────

  ipcMain.handle(IPC.AGENT_CREATE, async (_event, payload: CreateAgentPayload) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.create.request',
      projectId: payload?.projectDir || undefined,
      meta: { isManager: payload?.isManager }
    })

    // Manager agent: inject workspace path
    if (payload?.isManager) {
      const status = await daemonClient.getMcpStatus()
      if (!status?.running || !status.managerWorkspace) {
        throw new Error('MCP server is not running — cannot create manager agent')
      }
      payload.projectDir = status.managerWorkspace
    }

    const parsedPayload = createAgentPayloadSchema.parse(payload)
    return daemonClient.create(parsedPayload)
  })

  ipcMain.handle(IPC.AGENT_KILL, async (_event, agentId: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.kill.request',
      agentId
    })
    return daemonClient.kill(agentIdSchema.parse(agentId))
  })

  ipcMain.handle(IPC.AGENT_REMOVE, async (_event, agentId: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.remove.request',
      agentId
    })
    return daemonClient.remove(agentIdSchema.parse(agentId))
  })

  ipcMain.handle(IPC.AGENT_RESTART, async (_event, agentId: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.restart.request',
      agentId
    })
    return daemonClient.restart(agentIdSchema.parse(agentId))
  })

  ipcMain.handle(IPC.AGENT_LIST, async () => {
    return daemonClient.list()
  })

  ipcMain.handle(IPC.AGENT_YOLO_TOGGLE, async (_event, agentId: string, yolo: boolean) => {
    return daemonClient.toggleYolo(agentIdSchema.parse(agentId), z.boolean().parse(yolo))
  })

  ipcMain.handle(IPC.AGENT_GET_BUFFER, async (_event, agentId: string) => {
    return daemonClient.getBuffer(agentIdSchema.parse(agentId))
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
    daemonClient.sendInput(parsed.agentId, parsed.input)
  })

  ipcMain.on(IPC.AGENT_INPUT_RAW, (_event, agentId: string, data: string) => {
    const parsed = rawInputSchema.parse({ agentId, data })
    daemonClient.sendRawInput(parsed.agentId, parsed.data)
  })

  ipcMain.on(IPC.AGENT_RESIZE, (_event, agentId: string, cols: number, rows: number) => {
    const parsed = resizeSchema.parse({ agentId, cols, rows })
    daemonClient.resize(parsed.agentId, parsed.cols, parsed.rows)
  })

  ipcMain.handle(IPC.AGENT_BROADCAST, async (_event, projectDir: string, input: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'agent.broadcast.request',
      projectId: projectDir,
      message: 'Broadcast prompt submitted'
    })
    const parsed = broadcastSchema.parse({ projectDir, input })
    return daemonClient.broadcast(parsed.projectDir, parsed.input)
  })

  // ── Sessions ────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.SESSIONS_LIST, async (_event, options?: unknown) => {
    const parsedOptions = sessionListOptionsSchema.parse(options)
    return daemonClient.listSessions(parsedOptions)
  })

  // ── Headless runs ────────────────────────────────────────────────────────

  ipcMain.handle(IPC.HEADLESS_RUN_START, async (_event, payload: unknown) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'headless.start.request'
    })
    return daemonClient.startHeadlessRun(headlessStartSchema.parse(payload))
  })

  ipcMain.handle(IPC.HEADLESS_RUN_LIST, async (_event, options?: unknown) => {
    return daemonClient.listHeadlessRuns(headlessListOptionsSchema.parse(options))
  })

  ipcMain.handle(IPC.HEADLESS_RUN_GET, async (_event, runId: string) => {
    return daemonClient.getHeadlessRun(agentIdSchema.parse(runId))
  })

  ipcMain.handle(IPC.HEADLESS_RUN_CANCEL, async (_event, runId: string) => {
    observability.logMainEvent?.({
      level: 'info',
      event: 'headless.cancel.request',
      sessionId: runId
    })
    return daemonClient.cancelHeadlessRun(agentIdSchema.parse(runId))
  })

  ipcMain.handle(IPC.HEADLESS_RUN_GET_LOG, async (_event, runId: string, options?: unknown) => {
    return daemonClient.getHeadlessRunLog(
      agentIdSchema.parse(runId),
      headlessLogOptionsSchema.parse(options)
    )
  })

  // ── Config ───────────────────────────────────────────────────────────────

  ipcMain.handle(IPC.CONFIG_GET, () => {
    return configStore.get()
  })

  ipcMain.handle(IPC.CONFIG_SET, async (_event, partial: Partial<AppConfig>) => {
    const validated = appConfigPatchSchema.parse(partial)
    const updated = configStore.set(validated)
    observability.logMainEvent?.({
      level: 'info',
      event: 'config.updated',
      message: 'Config patch saved',
      meta: { keys: Object.keys(validated) }
    })
    // Also update daemon-side config
    try {
      await daemonClient.setConfig(validated)
    } catch {
      // Best-effort sync to daemon
    }
    // Notify all windows
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.CONFIG_ON_CHANGE, updated)
      win.webContents.send(IPC.USAGE_UPDATED, usageTracker.getDashboard(updated, { days: 14 }))
    })
    return updated
  })

  // ── Global YOLO ──────────────────────────────────────────────────────────

  ipcMain.handle(IPC.GLOBAL_YOLO_TOGGLE, async (_event, enabled: boolean) => {
    const toggle = z.boolean().parse(enabled)
    configStore.set({ globalYolo: toggle })

    // Toggle all agents via daemon
    const agents = await daemonClient.list()
    const results: string[] = []
    for (const agent of agents) {
      if (agent.yolo !== toggle) {
        await daemonClient.toggleYolo(agent.id, toggle)
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
          shell.openPath(validated).then(() => resolve(true)).catch(() => resolve(false))
          return
        }
        resolve(true)
      })
    })
  })

  ipcMain.handle(IPC.OPEN_IN_APP, (_event, editorId: string, dir: string) => {
    const validEditor = editorIdSchema.parse(editorId)
    const validated = projectDirSchema.parse(dir)

    const editorDef = EDITOR_REGISTRY.find((e) => e.id === validEditor)
    if (!editorDef) {
      return shell.openPath(validated).then(() => true).catch(() => false)
    }

    return new Promise<boolean>((resolve) => {
      const args = [...(editorDef.extraArgs || []), validated]
      execFile(editorDef.command, args, (err) => {
        if (err) {
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

  ipcMain.handle(IPC.MCP_SERVER_STATUS, async () => {
    try {
      return await daemonClient.getMcpStatus()
    } catch {
      return { running: false, port: null, error: null, managerWorkspace: null }
    }
  })

  // ── File System (Editor Panel) ──────────────────────────────────────────

  if (fileSystemService) {
    ipcMain.handle(IPC.FS_READ_DIR, async (_event, agentId: string, dirPath: string) => {
      const id = agentIdSchema.parse(agentId)
      const path = fsPathSchema.parse(dirPath)
      const agent = await daemonClient.get(id)
      if (!agent) throw new Error(`Agent ${id} not found`)
      return fileSystemService.readDir(path, agent.projectDir)
    })

    ipcMain.handle(IPC.FS_READ_FILE, async (_event, agentId: string, filePath: string) => {
      const id = agentIdSchema.parse(agentId)
      const path = fsPathSchema.parse(filePath)
      const agent = await daemonClient.get(id)
      if (!agent) throw new Error(`Agent ${id} not found`)
      return fileSystemService.readFile(path, agent.projectDir)
    })

    ipcMain.handle(
      IPC.FS_WRITE_FILE,
      async (_event, agentId: string, filePath: string, content: string) => {
        const id = agentIdSchema.parse(agentId)
        const path = fsPathSchema.parse(filePath)
        const body = fsWriteContentSchema.parse(content)
        const agent = await daemonClient.get(id)
        if (!agent) throw new Error(`Agent ${id} not found`)
        await fileSystemService.writeFile(path, body, agent.projectDir)
        return true
      }
    )

    ipcMain.on(IPC.FS_WATCH_START, async (_event, agentId: string) => {
      const id = agentIdSchema.parse(agentId)
      const agent = await daemonClient.get(id)
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
        const agent = await daemonClient.get(id)
        if (!agent) throw new Error(`Agent ${id} not found`)
        return fileSystemService.searchFiles(q, agent.projectDir, limit)
      }
    )
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  ipcMain.on(IPC.NOTIFICATION_DISMISS, (_event, id: string) => {
    const validated = z.string().trim().min(1).max(128).parse(id)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.NOTIFICATION_DISMISS, validated)
    })
  })

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

    ipcMain.handle(IPC.GIT_LIST_BRANCHES, async (_event, projectDir: string) => {
      const dir = projectDirSchema.parse(projectDir)
      return gitService.listBranches(dir)
    })

    ipcMain.handle(IPC.GIT_CHECKOUT, async (_event, projectDir: string, branchName: string) => {
      const dir = projectDirSchema.parse(projectDir)
      const branch = z.string().trim().min(1).max(256).parse(branchName)
      return gitService.checkout(dir, branch)
    })

    ipcMain.handle(
      IPC.GIT_CREATE_BRANCH,
      async (_event, projectDir: string, branchName: string, startPoint?: string) => {
        const dir = projectDirSchema.parse(projectDir)
        const branch = z
          .string()
          .trim()
          .min(1)
          .max(256)
          .regex(/^[a-zA-Z0-9._\-/]+$/, 'Invalid branch name characters')
          .parse(branchName)
        const sp = startPoint ? z.string().trim().max(256).parse(startPoint) : undefined
        return gitService.createBranch(dir, branch, sp)
      }
    )

    ipcMain.handle(IPC.GIT_FILE_CONTENTS, async (_event, projectDir: string, filePath: string) => {
      const dir = projectDirSchema.parse(projectDir)
      const fp = z.string().max(8192).parse(filePath)
      return gitService.getFileContents(dir, fp)
    })

    ipcMain.handle(IPC.GIT_PR_FETCH, async (_event, projectDir: string, prIdentifier: string) => {
      const dir = projectDirSchema.parse(projectDir)
      const pr = z.string().trim().min(1).max(1024).parse(prIdentifier)
      return gitService.fetchPr(dir, pr)
    })

    ipcMain.handle(
      IPC.GIT_PR_FILE_DIFF,
      async (_event, projectDir: string, prNumber: number, filePath: string) => {
        const dir = projectDirSchema.parse(projectDir)
        const num = z.number().int().min(1).parse(prNumber)
        const fp = z.string().max(8192).parse(filePath)
        return gitService.getPrFileDiff(dir, num, fp)
      }
    )
  }

  // ── Remote Control ──────────────────────────────────────────────────────────

  if (remoteControlService) {
    ipcMain.handle(IPC.REMOTE_ENABLE, async () => {
      observability.logMainEvent?.({
        level: 'info',
        event: 'remote.enable.request'
      })
      return remoteControlService.enable()
    })

    ipcMain.handle(IPC.REMOTE_DISABLE, async () => {
      observability.logMainEvent?.({
        level: 'info',
        event: 'remote.disable.request'
      })
      return remoteControlService.disable()
    })

    ipcMain.handle(IPC.REMOTE_GET_STATE, () => {
      return remoteControlService.getState()
    })

    remoteControlService.on('state-changed', (state) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC.REMOTE_STATE_CHANGED, state)
      })
    })
  }
}
