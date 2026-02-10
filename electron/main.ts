import { fixPath } from './util/fix-path'

// Must run before any child_process / node-pty calls
fixPath()

import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { AgentManager } from './agents/AgentManager'
import { ConfigStore } from './config/ConfigStore'
import { registerIpcHandlers } from './ipc/handlers'
import { SessionCatalog } from './sessions/SessionCatalog'
import { HeadlessOrchestrator } from './headless/HeadlessOrchestrator'
import { WorkspaceStore } from './workspace/WorkspaceStore'
import { ObservabilityService } from './observability/ObservabilityService'
import { HydraMcpServer } from './mcp/McpServer'
import { NotificationService } from './notifications/NotificationService'
import { UsageTracker } from './usage/UsageTracker'
import { UpdateService } from './updates/UpdateService'
import { FileSystemService } from './fs/FileSystemService'
import { IPC } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let forceQuit = false
const agentManager = new AgentManager()
const configStore = new ConfigStore()
const sessionCatalog = new SessionCatalog()
const workspaceStore = new WorkspaceStore()
let headlessOrchestrator: HeadlessOrchestrator | null = null
let mcpServer: HydraMcpServer | null = null
const usageTracker = new UsageTracker(app.getPath('userData'))
const updateService = new UpdateService()
const fileSystemService = new FileSystemService()
const observability = new ObservabilityService({
  getConfig: () => configStore.get(),
  getAgents: () => agentManager.list(),
  getHeadlessRuns: () => headlessOrchestrator?.list({ limit: 1000 }) ?? []
})

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 14 }
        }
      : {}),
    backgroundColor: '#262624',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Required for node-pty IPC
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', (e) => {
    const agents = agentManager.list()
    const running = agents.filter((a) => a.status === 'running')

    if (!forceQuit && running.length > 0) {
      // Let the renderer handle the confirmation
      e.preventDefault()
      mainWindow?.webContents.send(IPC.APP_CONFIRM_QUIT, running.length)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  observability.installProcessHandlers()
  observability.logMain({
    level: 'info',
    event: 'app.startup',
    message: 'Hydra boot sequence started'
  })

  electronApp.setAppUserModelId('com.hydra.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle(IPC.APP_QUIT_FORCE, () => {
    forceQuit = true
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    } else {
      app.quit()
    }
    return true
  })

  // Import saved Claude sessions before renderer boot.
  try {
    const config = configStore.get()
    const restored = agentManager.hydrateWorkspaceAgents(workspaceStore.getAgents())
    if (restored > 0) {
      observability.logMain({
        level: 'info',
        event: 'workspace.restored',
        message: `Restored ${restored} workspace agents`
      })
    }

    if (config.importSessionsOnStartup) {
      const sessions = sessionCatalog.listSessions({
        limit: config.sessionImportLimit > 0 ? config.sessionImportLimit : undefined,
        projectPathPrefix: config.sessionImportProjectPrefix || undefined,
        hiddenSessionIds: config.hiddenSessionIds
      })
      const imported = agentManager.importSessions(sessions, config.defaultModel, config.defaultProvider)
      if (imported > 0) {
        observability.logMain({
          level: 'info',
          event: 'sessions.imported',
          message: `Imported ${imported} Claude sessions`
        })
      }
    }
    workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
  } catch (err) {
    observability.logMain({
      level: 'warn',
      event: 'sessions.import-failed',
      message: 'Failed to import Claude sessions on startup',
      meta: { error: err instanceof Error ? err.message : String(err) }
    })
  }

  headlessOrchestrator = new HeadlessOrchestrator(join(app.getPath('userData'), 'headless-runs'))

  // Notification service
  const notificationService = new NotificationService()

  // Start MCP server for manager agents (non-fatal if it fails)
  mcpServer = new HydraMcpServer(agentManager, app.getPath('userData'))
  mcpServer.setNotificationService(notificationService)
  try {
    await mcpServer.start()
    const status = mcpServer.getStatus()
    observability.logMain({
      level: 'info',
      event: 'mcp.server-started',
      message: `MCP server listening on port ${status.port}`
    })
  } catch (err) {
    observability.logMain({
      level: 'warn',
      event: 'mcp.server-failed',
      message: 'Failed to start MCP server',
      meta: { error: err instanceof Error ? err.message : String(err) }
    })
    mcpServer = null
  }

  registerIpcHandlers(
    agentManager,
    configStore,
    sessionCatalog,
    headlessOrchestrator,
    usageTracker,
    updateService,
    {
      logRendererEvent: (payload) => {
        observability.logRenderer(payload)
      },
      exportDiagnostics: () => observability.exportDiagnostics(),
      logMainEvent: (payload) => {
        observability.logMain(payload)
      }
    },
    () => {
      workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
    },
    mcpServer,
    notificationService,
    fileSystemService
  )
  createWindow()

  if (!is.dev) {
    void updateService.checkForUpdates().catch((error) => {
      observability.logMain({
        level: 'warn',
        event: 'autoupdate.check-failed',
        message: error instanceof Error ? error.message : String(error)
      })
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  observability.logMain({
    level: 'info',
    event: 'app.window-all-closed'
  })
  workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
  agentManager.killAll()
  fileSystemService.stopAll()
  mcpServer?.stop()
  app.quit()
})

app.on('before-quit', () => {
  observability.logMain({
    level: 'info',
    event: 'app.before-quit'
  })
  forceQuit = true
  workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
  agentManager.killAll()
  fileSystemService.stopAll()
  mcpServer?.stop()
})
