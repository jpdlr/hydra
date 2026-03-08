/**
 * Hydra Daemon — standalone Node.js process that owns all PTY sessions.
 *
 * Usage: node daemon.js [--socket-path <path>] [--user-data <path>]
 *
 * The daemon serves HTTP + WebSocket on a Unix domain socket.
 * Hydra (Electron) connects as a client. If the daemon isn't running,
 * Electron spawns it automatically.
 */

import { join } from 'path'
import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { AgentManager } from '../agents/AgentManager'
import { ConfigStore } from '../config/ConfigStore'
import { SessionCatalog } from '../sessions/SessionCatalog'
import { CodexSessionCatalog } from '../sessions/CodexSessionCatalog'
import { HeadlessOrchestrator } from '../headless/HeadlessOrchestrator'
import { WorkspaceStore } from '../workspace/WorkspaceStore'
import { DaemonNotificationService } from './DaemonNotificationService'
import { DaemonServer } from './DaemonServer'
import { writeLockFile, removeLockFile } from './lock'
import { HydraMcpServer } from '../mcp/McpServer'
import { SkillScanner } from '../skills/SkillScanner'

// ── Parse CLI args ────────────────────────────────────────────────────────────

function parseArgs(): { socketPath: string; userDataPath: string; lockPath: string } {
  const args = process.argv.slice(2)
  let socketPath = ''
  let userDataPath = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--socket-path' && args[i + 1]) {
      socketPath = args[++i]
    } else if (args[i] === '--user-data' && args[i + 1]) {
      userDataPath = args[++i]
    }
  }

  if (!userDataPath) {
    userDataPath = join(homedir(), '.config', 'Hydra')
  }

  if (!socketPath) {
    socketPath = join(userDataPath, 'daemon.sock')
  }

  const lockPath = join(userDataPath, 'daemon.lock')

  return { socketPath, userDataPath, lockPath }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { socketPath, userDataPath, lockPath } = parseArgs()

  mkdirSync(userDataPath, { recursive: true })

  console.log(`[daemon] Starting — PID ${process.pid}`)
  console.log(`[daemon] userDataPath: ${userDataPath}`)
  console.log(`[daemon] socketPath:   ${socketPath}`)

  // ── Instantiate services ────────────────────────────────────────────────

  const configStore = new ConfigStore(userDataPath)
  const workspaceStore = new WorkspaceStore(userDataPath)
  const sessionCatalog = new SessionCatalog()
  const codexSessionCatalog = new CodexSessionCatalog()
  const agentManager = new AgentManager(sessionCatalog, codexSessionCatalog)
  const headlessOrchestrator = new HeadlessOrchestrator(join(userDataPath, 'headless-runs'))
  const notificationService = new DaemonNotificationService()

  // Restore workspace agents
  const config = configStore.get()
  const restored = agentManager.hydrateWorkspaceAgents(workspaceStore.getAgents())
  if (restored > 0) {
    console.log(`[daemon] Restored ${restored} workspace agents`)
  }

  // Import sessions
  if (config.importSessionsOnStartup) {
    try {
      const sessions = sessionCatalog.listSessions({
        limit: config.sessionImportLimit > 0 ? config.sessionImportLimit : undefined,
        projectPathPrefix: config.sessionImportProjectPrefix || undefined,
        hiddenSessionIds: config.hiddenSessionIds
      })
      const imported = agentManager.importSessions(sessions, config.defaultModel, config.defaultProvider)
      if (imported > 0) {
        console.log(`[daemon] Imported ${imported} Claude sessions`)
      }
    } catch (err) {
      console.warn('[daemon] Failed to import sessions:', err)
    }
  }
  workspaceStore.setAgents(agentManager.exportWorkspaceAgents())

  // Connect notifications to agent events
  notificationService.connectAgentEvents(agentManager, headlessOrchestrator)

  // Start MCP server
  let mcpServer: HydraMcpServer | null = null
  try {
    mcpServer = new HydraMcpServer(agentManager, userDataPath)
    mcpServer.setNotificationService(notificationService)
    await mcpServer.start()
    const status = mcpServer.getStatus()
    console.log(`[daemon] MCP server listening on port ${status.port}`)
  } catch (err) {
    console.warn('[daemon] MCP server failed to start:', err)
    mcpServer = null
  }

  // ── Start HTTP+WS server ────────────────────────────────────────────────

  const shutdown = (): void => {
    console.log('[daemon] Shutting down...')
    workspaceStore.setAgents(agentManager.exportWorkspaceAgents())
    agentManager.killAll()
    mcpServer?.stop()
    server.stop()
    removeLockFile(lockPath)
    // Give processes time to clean up
    setTimeout(() => process.exit(0), 2000)
  }

  const skillScanner = new SkillScanner()

  const server = new DaemonServer({
    socketPath,
    agentManager,
    configStore,
    sessionCatalog,
    codexSessionCatalog,
    headlessOrchestrator,
    workspaceStore,
    notificationService,
    mcpServer,
    skillScanner,
    onShutdown: shutdown
  })

  await server.start()

  // Write lock file
  writeLockFile(lockPath, {
    pid: process.pid,
    socketPath,
    startedAt: new Date().toISOString()
  })

  console.log(`[daemon] Ready — lock file written to ${lockPath}`)

  // ── Signal handling ─────────────────────────────────────────────────────

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  process.on('uncaughtException', (err) => {
    console.error('[daemon] Uncaught exception:', err)
    shutdown()
  })

  process.on('unhandledRejection', (reason) => {
    console.error('[daemon] Unhandled rejection:', reason)
  })
}

main().catch((err) => {
  console.error('[daemon] Fatal error during startup:', err)
  process.exit(1)
})
