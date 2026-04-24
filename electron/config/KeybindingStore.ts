import { existsSync, mkdirSync, readFileSync, watchFile, writeFileSync } from 'fs'
import { join } from 'path'
import {
  DEFAULT_KEYBINDINGS,
  isHydraCommandId,
  mergeKeybindingsWithDefaults,
  type KeybindingRule
} from '@shared/keybindings'

interface RawKeybindingRule {
  command?: string
  keys?: string
}

export class KeybindingStore {
  private readonly keybindingsPath: string
  private keybindings: KeybindingRule[]
  private listeners = new Set<(bindings: KeybindingRule[]) => void>()

  constructor(userDataPath: string) {
    mkdirSync(userDataPath, { recursive: true })
    this.keybindingsPath = join(userDataPath, 'keybindings.json')
    this.keybindings = this.load()
    watchFile(this.keybindingsPath, { interval: 500 }, () => {
      const next = this.load()
      if (JSON.stringify(next) === JSON.stringify(this.keybindings)) return
      this.keybindings = next
      this.emit()
    })
  }

  get(): KeybindingRule[] {
    return [...this.keybindings]
  }

  getPath(): string {
    return this.keybindingsPath
  }

  subscribe(listener: (bindings: KeybindingRule[]) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    const snapshot = this.get()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private load(): KeybindingRule[] {
    try {
      if (!existsSync(this.keybindingsPath)) {
        this.writeDefaults()
        return [...DEFAULT_KEYBINDINGS]
      }
      const raw = readFileSync(this.keybindingsPath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return [...DEFAULT_KEYBINDINGS]
      }
      const rules = parsed.flatMap((item) => this.parseRule(item))
      const presentCommands = new Set(rules.map((r) => r.command))
      const missing = DEFAULT_KEYBINDINGS.filter((d) => !presentCommands.has(d.command))
      if (missing.length > 0) {
        const next = [...rules, ...missing]
        try {
          writeFileSync(this.keybindingsPath, JSON.stringify(next, null, 2), 'utf-8')
        } catch (error) {
          console.error('Failed to append missing default keybindings:', error)
        }
      }
      return mergeKeybindingsWithDefaults(rules)
    } catch {
      return [...DEFAULT_KEYBINDINGS]
    }
  }

  private parseRule(value: unknown): KeybindingRule[] {
    if (!value || typeof value !== 'object') return []
    const rule = value as RawKeybindingRule
    if (!rule.command || !rule.keys) return []
    if (!isHydraCommandId(rule.command)) return []
    const keys = rule.keys.trim()
    if (!keys) return []
    return [{ command: rule.command, keys }]
  }

  private writeDefaults(): void {
    try {
      writeFileSync(this.keybindingsPath, JSON.stringify(DEFAULT_KEYBINDINGS, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to write default keybindings:', error)
    }
  }
}
