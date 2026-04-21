import { app, shell } from 'electron'
import { EventEmitter } from 'events'
import { spawn } from 'child_process'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateState, UpdateInstallMethod } from '@shared/types'

const GITHUB_RELEASES_LATEST_URL =
  'https://api.github.com/repos/jpdlr/hydra/releases/latest'

// Artifact name pattern per platform/arch. Must match electron-builder.yml
// artifactName templates.
function macDmgName(version: string): string {
  return `hydra-${version}.dmg`
}

function normalizeReleaseNotes(notes: unknown): string | null {
  if (typeof notes === 'string') {
    return notes.trim() || null
  }

  if (Array.isArray(notes)) {
    const lines = notes
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return ''
        const maybeNotes = (entry as { note?: unknown }).note
        return typeof maybeNotes === 'string' ? maybeNotes.trim() : ''
      })
      .filter(Boolean)
    return lines.length > 0 ? lines.join('\n\n') : null
  }

  return null
}

function isNewerVersion(latest: string, current: string): boolean {
  const stripV = (v: string) => v.replace(/^v/i, '').split(/[-+]/, 1)[0]
  const lp = stripV(latest).split('.').map((n) => Number.parseInt(n, 10) || 0)
  const cp = stripV(current).split('.').map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(lp.length, cp.length)
  for (let i = 0; i < len; i++) {
    const a = lp[i] ?? 0
    const b = cp[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

function detectInstallMethod(): UpdateInstallMethod {
  if (process.platform !== 'darwin') return 'unknown'
  const exe = process.execPath
  if (exe.includes('/Caskroom/hydra/') || exe.includes('/Caskroom/Hydra/')) {
    return 'brew'
  }
  if (exe.startsWith('/Applications/') || exe.includes('/Applications/Hydra.app/')) {
    return 'direct'
  }
  return 'unknown'
}

export class UpdateService extends EventEmitter {
  private state: AppUpdateState
  private pollTimer: NodeJS.Timeout | null = null
  private readonly useElectronUpdater: boolean
  private readonly useGithubPoller: boolean

  constructor() {
    super()
    this.useElectronUpdater =
      process.platform === 'win32' ||
      (process.platform === 'linux' && Boolean(process.env.APPIMAGE))
    this.useGithubPoller = process.platform === 'darwin'

    this.state = {
      supported: this.useElectronUpdater || this.useGithubPoller,
      platform: process.platform,
      checking: false,
      available: false,
      downloaded: false,
      downloading: false,
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseDate: null,
      releaseNotes: null,
      error: null,
      canAutoInstall: this.useElectronUpdater,
      installMethod: this.useGithubPoller ? detectInstallMethod() : null,
      downloadUrl: null,
      releaseUrl: null
    }

    if (this.useElectronUpdater) {
      this.wireElectronUpdater()
    }
  }

  private wireElectronUpdater(): void {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      this.patch({ checking: true, error: null })
    })

    autoUpdater.on('update-available', (info) => {
      this.patch({
        checking: false,
        available: true,
        downloaded: false,
        latestVersion: info.version ?? null,
        releaseDate: info.releaseDate ?? null,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        releaseUrl: info.version
          ? `https://github.com/jpdlr/hydra/releases/tag/v${info.version}`
          : this.state.releaseUrl,
        error: null
      })
    })

    autoUpdater.on('update-not-available', (info) => {
      this.patch({
        checking: false,
        available: false,
        downloaded: false,
        downloading: false,
        latestVersion: info.version ?? null,
        releaseDate: info.releaseDate ?? null,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        error: null
      })
    })

    autoUpdater.on('download-progress', () => {
      this.patch({ downloading: true, error: null })
    })

    autoUpdater.on('update-downloaded', (info) => {
      this.patch({
        checking: false,
        downloading: false,
        available: true,
        downloaded: true,
        latestVersion: info.version ?? this.state.latestVersion,
        releaseDate: info.releaseDate ?? this.state.releaseDate,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes) ?? this.state.releaseNotes,
        error: null
      })
    })

    autoUpdater.on('error', (error) => {
      this.patch({
        checking: false,
        downloading: false,
        error: error.message || String(error)
      })
    })
  }

  getState(): AppUpdateState {
    return { ...this.state }
  }

  async checkForUpdates(): Promise<AppUpdateState> {
    if (!this.state.supported) return this.getState()
    this.patch({ error: null, checking: true })

    if (this.useElectronUpdater) {
      try {
        await autoUpdater.checkForUpdates()
      } catch (error) {
        this.patch({
          checking: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
      return this.getState()
    }

    if (this.useGithubPoller) {
      await this.pollGithub()
      return this.getState()
    }

    return this.getState()
  }

  async downloadUpdate(): Promise<AppUpdateState> {
    if (!this.useElectronUpdater) return this.getState()
    if (!this.state.available) return this.getState()
    this.patch({ error: null, downloading: true })
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.patch({
        downloading: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    return this.getState()
  }

  installAndRestart(): boolean {
    if (!this.useElectronUpdater || !this.state.downloaded) return false
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true)
    })
    return true
  }

  async runBrewUpgrade(): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== 'darwin') {
      return { ok: false, error: 'brew upgrade is only supported on macOS' }
    }
    return new Promise((resolve) => {
      const script = [
        'tell application "Terminal"',
        '  activate',
        '  do script "brew upgrade --cask hydra"',
        'end tell'
      ].join('\n')
      const child = spawn('osascript', ['-e', script], { stdio: 'ignore' })
      child.once('error', (error) => resolve({ ok: false, error: error.message }))
      child.once('exit', (code) => {
        if (code === 0) resolve({ ok: true })
        else resolve({ ok: false, error: `osascript exited with code ${code ?? 'null'}` })
      })
    })
  }

  async openDownloadPage(): Promise<{ ok: boolean; error?: string }> {
    const url = this.state.downloadUrl ?? this.state.releaseUrl
    if (!url) {
      return { ok: false, error: 'No download URL available' }
    }
    try {
      await shell.openExternal(url)
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  startBackgroundPolling(intervalMs = 6 * 60 * 60 * 1000): void {
    if (!this.useGithubPoller) return
    if (this.pollTimer) return
    // Fire once immediately (outside the timer so the caller sees a result).
    void this.pollGithub().catch(() => undefined)
    this.pollTimer = setInterval(() => {
      void this.pollGithub().catch(() => undefined)
    }, intervalMs)
    // Unref so it doesn't keep the event loop alive during shutdown.
    if (typeof this.pollTimer.unref === 'function') this.pollTimer.unref()
  }

  stopBackgroundPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async pollGithub(): Promise<void> {
    this.patch({ checking: true, error: null })
    try {
      const res = await fetch(GITHUB_RELEASES_LATEST_URL, {
        headers: { Accept: 'application/vnd.github+json' }
      })
      if (!res.ok) {
        throw new Error(`GitHub API responded ${res.status}`)
      }
      const body = (await res.json()) as {
        tag_name?: string
        name?: string
        published_at?: string
        body?: string
        html_url?: string
        assets?: Array<{ name: string; browser_download_url: string }>
      }
      const tag = body.tag_name ?? ''
      const version = tag.replace(/^v/i, '')
      if (!version) {
        throw new Error('Latest release has no tag')
      }
      const current = this.state.currentVersion
      const isNewer = isNewerVersion(version, current)
      const expected = macDmgName(version)
      const asset = body.assets?.find((a) => a.name === expected)
      const downloadUrl = asset?.browser_download_url ?? null

      this.patch({
        checking: false,
        available: isNewer,
        latestVersion: version,
        releaseDate: body.published_at ?? null,
        releaseNotes: typeof body.body === 'string' ? body.body.trim() || null : null,
        releaseUrl: body.html_url ?? null,
        downloadUrl,
        error: null
      })
    } catch (error) {
      this.patch({
        checking: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private patch(next: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...next }
    this.emit('state-changed', this.getState())
  }
}
