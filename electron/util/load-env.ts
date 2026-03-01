import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { app } from 'electron'

function parseEnvValue(raw: string): string {
  const value = raw.trim()
  if (value.length >= 2) {
    const startsWithQuote = value.startsWith('"') || value.startsWith("'")
    const endsWithSameQuote =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (startsWithQuote && endsWithSameQuote) {
      return value.slice(1, -1)
    }
  }
  return value
}

function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return

  const contents = readFileSync(filePath, 'utf8')
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex <= 0) continue

    const key = trimmed.slice(0, eqIndex).trim()
    if (!key || process.env[key] !== undefined) continue

    const rawValue = trimmed.slice(eqIndex + 1)
    process.env[key] = parseEnvValue(rawValue)
  }
}

export function loadProjectEnvFiles(): void {
  const candidatePaths = new Set<string>([
    resolve(process.cwd(), '.env'),
    resolve(app.getAppPath(), '.env'),
    resolve(app.getAppPath(), '..', '.env')
  ])

  for (const filePath of candidatePaths) {
    loadEnvFile(filePath)
  }
}
