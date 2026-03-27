import { spawn } from 'child_process'
import { join } from 'path'
import { closeSync, openSync } from 'fs'
import { DaemonClient } from './DaemonClient'
import { readLockFile, removeLockFile } from './lock'

const HEALTH_CHECK_INTERVAL = 10000
const STARTUP_TIMEOUT = 10000
const STARTUP_POLL_INTERVAL = 200

export interface DaemonPaths {
  socketPath: string
  lockPath: string
  logPath: string
  userDataPath: string
}

function joinByInputPathStyle(basePath: string, filename: string): string {
  const trimmed = basePath.replace(/[\\/]+$/, '')
  const separator = trimmed.includes('\\') && !trimmed.includes('/') ? '\\' : '/'
  return `${trimmed}${separator}${filename}`
}

export function getDaemonPaths(userDataPath: string): DaemonPaths {
  return {
    socketPath: joinByInputPathStyle(userDataPath, 'daemon.sock'),
    lockPath: joinByInputPathStyle(userDataPath, 'daemon.lock'),
    logPath: joinByInputPathStyle(userDataPath, 'daemon.log'),
    userDataPath
  }
}

/**
 * Ensures the daemon is running. Returns a connected DaemonClient.
 * If the daemon isn't running, spawns it and waits for it to be ready.
 */
export async function ensureDaemon(paths: DaemonPaths): Promise<DaemonClient> {
  const { socketPath, lockPath } = paths

  // Check if daemon is already running
  const lock = readLockFile(lockPath)
  if (lock) {
    const client = new DaemonClient(lock.socketPath)
    try {
      await client.connect()
      console.log(`[lifecycle] Connected to existing daemon (PID ${lock.pid})`)
      return client
    } catch {
      console.log('[lifecycle] Stale lock file — daemon not responding, respawning')
      removeLockFile(lockPath)
    }
  }

  // Spawn daemon
  await spawnDaemon(paths)

  // Wait for daemon to be ready
  const client = new DaemonClient(socketPath)
  const deadline = Date.now() + STARTUP_TIMEOUT

  while (Date.now() < deadline) {
    try {
      await client.connect()
      console.log('[lifecycle] Connected to newly spawned daemon')
      return client
    } catch {
      await sleep(STARTUP_POLL_INTERVAL)
    }
  }

  throw new Error('Daemon failed to start within timeout')
}

function spawnDaemon(paths: DaemonPaths): Promise<void> {
  return new Promise((resolve, reject) => {
    // The daemon entry is compiled to out/main/daemon.js alongside index.js
    const daemonScript = join(__dirname, 'daemon.js')

    // Critical for packaged builds: run the child Electron binary as plain Node.
    // Without this, spawning the daemon can recursively launch full Hydra app instances.
    let logFd: number | null = null
    try {
      if (process.platform === 'win32') {
        logFd = openSync(paths.logPath, 'a')
      }

      const child = spawn(process.execPath, [daemonScript,
        '--socket-path', paths.socketPath,
        '--user-data', paths.userDataPath
      ], {
        detached: true,
        stdio: logFd === null ? 'ignore' : ['ignore', logFd, logFd],
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1'
        }
      })

      child.unref()

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn daemon: ${err.message}`))
      })

      // Don't wait for exit — the daemon runs forever
      // Give it a moment to start up
      setTimeout(resolve, 300)
    } finally {
      if (logFd !== null) {
        closeSync(logFd)
      }
    }
  })
}

/**
 * Stops the daemon by sending POST /shutdown.
 * Falls back to killing the PID from the lock file.
 */
export async function stopDaemon(paths: DaemonPaths): Promise<void> {
  const { lockPath } = paths

  const lock = readLockFile(lockPath)
  if (!lock) return

  const client = new DaemonClient(lock.socketPath)
  try {
    await client.shutdown()
  } catch {
    // Daemon unresponsive — kill by PID
    try {
      process.kill(lock.pid, 'SIGTERM')
    } catch {
      // Already dead
    }
  }

  removeLockFile(lockPath)
}

/**
 * Start periodic health checks. If daemon goes away, attempt to reconnect.
 */
export function startHealthMonitor(
  client: DaemonClient,
  paths: DaemonPaths,
  onReconnected?: () => void,
  onDisconnected?: () => void
): () => void {
  let running = true

  const check = async (): Promise<void> => {
    if (!running) return

    try {
      await client.health()
    } catch {
      onDisconnected?.()

      // Try to reconnect
      try {
        await ensureDaemon(paths)
        // Copy WebSocket events — the caller should handle this
        onReconnected?.()
      } catch {
        // Will retry on next interval
      }
    }

    if (running) {
      setTimeout(check, HEALTH_CHECK_INTERVAL)
    }
  }

  setTimeout(check, HEALTH_CHECK_INTERVAL)

  return () => {
    running = false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
