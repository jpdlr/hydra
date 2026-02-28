import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { DEFAULT_CONFIG, MAX_CONCURRENT_AGENTS_HARD_LIMIT } from '@shared/types'

export class ConfigStore {
  private configPath: string
  private config: AppConfig

  constructor(userDataPath: string) {
    mkdirSync(userDataPath, { recursive: true })
    this.configPath = join(userDataPath, 'config.json')
    this.config = this.load()
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

  set(partial: Partial<AppConfig>): AppConfig {
    this.config = this.sanitize({ ...this.config, ...partial })
    this.save(this.config)
    return this.get()
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
