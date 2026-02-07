import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import type { AppConfig } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'

export class ConfigStore {
  private configPath: string
  private config: AppConfig

  constructor() {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    this.configPath = join(userDataPath, 'config.json')
    this.config = this.load()
  }

  private load(): AppConfig {
    try {
      if (existsSync(this.configPath)) {
        const raw = readFileSync(this.configPath, 'utf-8')
        const parsed = JSON.parse(raw)
        return { ...DEFAULT_CONFIG, ...parsed }
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
    this.config = { ...this.config, ...partial }
    this.save(this.config)
    return this.get()
  }

  private save(config: AppConfig): void {
    try {
      writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    } catch (err) {
      console.error('Failed to save config:', err)
    }
  }
}
