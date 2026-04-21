import { existsSync, mkdirSync, readFileSync, watchFile, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { DEFAULT_CONFIG, MAX_CONCURRENT_AGENTS_HARD_LIMIT } from '@shared/types'

export class ConfigStore {
  private readonly configPath: string
  private config: AppConfig
  private lastSerialized: string
  private listeners = new Set<(config: AppConfig) => void>()

  constructor(userDataPath: string, options: { watch?: boolean } = {}) {
    mkdirSync(userDataPath, { recursive: true })
    this.configPath = join(userDataPath, 'config.json')
    this.config = this.load()
    this.lastSerialized = JSON.stringify(this.config)
    if (options.watch) {
      watchFile(this.configPath, { interval: 500 }, () => {
        const next = this.load()
        const serialized = JSON.stringify(next)
        if (serialized === this.lastSerialized) return
        this.config = next
        this.lastSerialized = serialized
        this.emit()
      })
    }
  }

  private load(): AppConfig {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        return this.sanitize({ ...DEFAULT_CONFIG, ...parsed })
      }
    } catch {
      // Corrupted config — reset to defaults
    }
    this.save(DEFAULT_CONFIG)
    return { ...DEFAULT_CONFIG }
  }

  get(): AppConfig {
    return { ...this.config }
  }

  getPath(): string {
    return this.configPath
  }

  set(partial: Partial<AppConfig>): AppConfig {
    this.config = this.sanitize({ ...this.config, ...partial })
    this.lastSerialized = JSON.stringify(this.config)
    this.save(this.config)
    return this.get()
  }

  subscribe(listener: (config: AppConfig) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(): void {
    const snapshot = this.get()
    for (const listener of this.listeners) listener(snapshot)
  }

  private sanitize(config: AppConfig): AppConfig {
    const maxAgents = Math.max(1, Math.min(MAX_CONCURRENT_AGENTS_HARD_LIMIT, config.maxAgents))
    if (maxAgents === config.maxAgents) {
      return config
    }
    return { ...config, maxAgents }
  }

  private save(config: AppConfig): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save config:', err)
    }
  }
}
