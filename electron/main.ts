import { fixPath } from './util/fix-path'
import { loadProjectEnvFiles } from './util/load-env'

// Must run before any child_process / node-pty calls
fixPath()
loadProjectEnvFiles()

import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { DaemonClient } from './daemon/DaemonClient'
import { ensureDaemon, stopDaemon, getDaemonPaths } from './daemon/lifecycle'
import { ConfigStore } from './config/ConfigStore'
import { KeybindingStore } from './config/KeybindingStore'
import { registerIpcHandlers } from './ipc/handlers'
import { ObservabilityService } from './observability/ObservabilityService'
import { NotificationService } from './notifications/NotificationService'
import { UpdateService } from './updates/UpdateService'
import { FileSystemService } from './fs/FileSystemService'
import { GitService } from './git/GitService'
import { RemoteControlService } from './remote/RemoteControlService'
import { IPC } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let forceQuit = false
let isCheckingCloseGuard = false
let remoteControlService: RemoteControlService | null = null
let daemonClient: DaemonClient | null = null

const userDataPath = app.getPath('userData')
const daemonPaths = getDaemonPaths(userDataPath)
const configStore = new ConfigStore(userDataPath)
const keybindingStore = new KeybindingStore(userDataPath)
const updateService = new UpdateService()
const fileSystemService = new FileSystemService()
const gitService = new GitService()
const observability = new ObservabilityService({
  getConfig: () => configStore.get(),
  getAgents: () => daemonClient?.list().catch(() => []) as any ?? [],
  getHeadlessRuns: () => daemonClient?.listHeadlessRuns({ limit: 1000 }).catch(() => []) as any ?? []
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
      sandbox: false
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

  mainWindow.on('close', async (e) => {
    if (forceQuit) return

    // Prevent close immediately, then decide asynchronously whether to keep the
    // window open (show confirm modal) or continue closing.
    e.preventDefault()
    if (isCheckingCloseGuard) return
    isCheckingCloseGuard = true

    try {
      const agents = await daemonClient?.list() ?? []
      const active = agents.filter((a) => a.status === 'running' || a.status === 'starting')

      if (active.length > 0) {
        mainWindow?.webContents.send(IPC.APP_CONFIRM_QUIT, active.length)
        return
      }

      // No active agents; allow close to continue.
      forceQuit = true
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close()
      }
    } catch {
      // Daemon unreachable — allow close
      forceQuit = true
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close()
      }
    } finally {
      isCheckingCloseGuard = false
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

  ipcMain.handle(IPC.APP_QUIT_FORCE, async () => {
    // Kill all agents, stop daemon, then quit
    forceQuit = true
    try {
      const agents = await daemonClient?.list() ?? []
      for (const agent of agents) {
        if (agent.status === 'running') {
          await daemonClient?.kill(agent.id)
        }
      }
      await stopDaemon(daemonPaths)
    } catch {
      // Best-effort cleanup
    }
    daemonClient?.disconnect()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    } else {
      app.quit()
    }
    return true
  })

  ipcMain.handle(IPC.APP_QUIT_BACKGROUND, () => {
    // Close UI but leave daemon + agents running
    forceQuit = true
    daemonClient?.disconnect()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    } else {
      app.quit()
    }
    return true
  })

  // ── Connect to daemon ───────────────────────────────────────────────────

  try {
    daemonClient = await ensureDaemon(daemonPaths)
    observability.logMain({
      level: 'info',
      event: 'daemon.connected',
      message: 'Connected to Hydra daemon'
    })
  } catch (err) {
    observability.logMain({
      level: 'error',
      event: 'daemon.connect-failed',
      message: `Failed to connect to daemon: ${err instanceof Error ? err.message : String(err)}`,
      meta: { daemonLogPath: daemonPaths.logPath }
    })
    // Still create the window — user can retry
  }

  // ── Forward daemon events to renderer ────────────────────────────────

  const notificationService = new NotificationService()

  if (daemonClient) {
    daemonClient.on('output', (payload) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC.AGENT_OUTPUT, payload)
      })
    })

    daemonClient.on('status', (payload) => {
      observability.logMain({
        level: payload.status === 'errored' ? 'error' : 'info',
        event: 'agent.status.changed',
        agentId: payload.agentId,
        sessionId: payload.sessionId ?? undefined,
        message: payload.status
      })
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC.AGENT_STATUS, payload)
      })
    })

    daemonClient.on('notification', (notification) => {
      notificationService.push(notification)
    })

    daemonClient.on('config:changed', (config) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC.CONFIG_ON_CHANGE, config)
      })
    })

    daemonClient.on('headless:event', (payload) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC.HEADLESS_RUN_EVENT, payload)
      })
    })

    // Remote control service
    const remoteControlConfig = configStore.get()
    remoteControlService = new RemoteControlService(
      daemonClient,
      notificationService,
      remoteControlConfig.remoteSessionTimeoutMinutes
    )

    if (remoteControlConfig.remoteControlEnabled) {
      remoteControlService.enable().catch((err) => {
        observability.logMain({
          level: 'warn',
          event: 'remote.auto-enable-failed',
          message: err instanceof Error ? err.message : String(err)
        })
      })
    }
  }

  keybindingStore.subscribe((bindings) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.KEYBINDINGS_ON_CHANGE, bindings)
    })
  })

  registerIpcHandlers(
    daemonClient,
    configStore,
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
    notificationService,
    keybindingStore,
    fileSystemService,
    gitService,
    remoteControlService
  )
  if (!daemonClient) {
    observability.logMain({
      level: 'warn',
      event: 'daemon.unavailable',
      message: 'Hydra started without a daemon connection',
      meta: { daemonLogPath: daemonPaths.logPath }
    })
  }
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

  updateService.on('state-changed', (state) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IPC.UPDATE_STATE_CHANGED, state)
    })
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  observability.logMain({
    level: 'info',
    event: 'app.window-all-closed'
  })

  fileSystemService.stopAll()
  remoteControlService?.destroy()

  // Check if daemon has running agents
  try {
    const agents = await daemonClient?.list() ?? []
    const running = agents.filter((a) => a.status === 'running')

    if (running.length > 0) {
      // Leave daemon running — agents continue in background
      observability.logMain({
        level: 'info',
        event: 'app.quit-with-daemon',
        message: `Leaving daemon running with ${running.length} active agents`
      })
    } else {
      // No running agents — stop daemon
      await stopDaemon(daemonPaths)
    }
  } catch {
    // Daemon unreachable — nothing to stop
  }

  daemonClient?.disconnect()
  app.quit()
})

app.on('before-quit', () => {
  observability.logMain({
    level: 'info',
    event: 'app.before-quit'
  })
  forceQuit = true
  fileSystemService.stopAll()
  remoteControlService?.destroy()
  daemonClient?.disconnect()
})
