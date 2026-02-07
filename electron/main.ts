import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { AgentManager } from './agents/AgentManager'
import { ConfigStore } from './config/ConfigStore'
import { registerIpcHandlers } from './ipc/handlers'
import { SessionCatalog } from './sessions/SessionCatalog'
import { HeadlessOrchestrator } from './headless/HeadlessOrchestrator'
import { WorkspaceStore } from './workspace/WorkspaceStore'
import { IPC } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let forceQuit = false
const agentManager = new AgentManager()
const configStore = new ConfigStore()
const sessionCatalog = new SessionCatalog()
const workspaceStore = new WorkspaceStore()
let headlessOrchestrator: HeadlessOrchestrator | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    backgroundColor: '#1A1714',
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

app.whenReady().then(() => {
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
      console.log(`[Hydra] Restored ${restored} workspace agents`)
    }

    if (config.importSessionsOnStartup) {
      const sessions = sessionCatalog.listSessions({
        limit: config.sessionImportLimit > 0 ? config.sessionImportLimit : undefined,
        projectPathPrefix: config.sessionImportProjectPrefix || undefined,
        hiddenSessionIds: config.hiddenSessionIds
      })
      const imported = agentManager.importSessions(sessions, config.defaultModel)
      if (imported > 0) {
        console.log(`[Hydra] Imported ${imported} Claude sessions`)
      }
    }
    workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
  } catch (err) {
    console.warn('[Hydra] Failed to import Claude sessions on startup', err)
  }

  headlessOrchestrator = new HeadlessOrchestrator(join(app.getPath('userData'), 'headless-runs'))
  registerIpcHandlers(
    agentManager,
    configStore,
    sessionCatalog,
    headlessOrchestrator,
    () => {
      workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
    }
  )
  createWindow()

  if (!is.dev) {
    autoUpdater.autoDownload = false
    void autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      console.warn('[Hydra] Auto-update check failed', error)
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
  agentManager.killAll()
  app.quit()
})

app.on('before-quit', () => {
  forceQuit = true
  workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
  agentManager.killAll()
})
