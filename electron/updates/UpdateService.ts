import { app } from 'electron'
import { EventEmitter } from 'events'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateState } from '@shared/types'

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

export class UpdateService extends EventEmitter {
  private state: AppUpdateState

  constructor() {
    super()
    const supported =
      process.platform === 'win32' ||
      (process.platform === 'linux' && Boolean(process.env.APPIMAGE))

    this.state = {
      supported,
      platform: process.platform,
      checking: false,
      available: false,
      downloaded: false,
      downloading: false,
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseDate: null,
      releaseNotes: null,
      error: null
    }

    if (!supported) return

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
      this.patch({
        downloading: true,
        error: null
      })
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
    await autoUpdater.checkForUpdates()
    return this.getState()
  }

  async downloadUpdate(): Promise<AppUpdateState> {
    if (!this.state.supported) return this.getState()
    if (!this.state.available) return this.getState()
    this.patch({ error: null, downloading: true })
    await autoUpdater.downloadUpdate()
    return this.getState()
  }

  installAndRestart(): boolean {
    if (!this.state.supported || !this.state.downloaded) return false
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true)
    })
    return true
  }

  private patch(next: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...next }
    this.emit('state-changed', this.getState())
  }
}

