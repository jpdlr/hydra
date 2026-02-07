import { mkdirSync, appendFileSync, existsSync, rmSync, statSync, renameSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { ObservabilityLogEventPayload, ObservabilityLogLevel } from '@shared/types'

interface LoggerOptions {
  logDir: string
  defaultService: 'main' | 'renderer' | 'preload'
  maxFileBytes?: number
  maxRotatedFiles?: number
}

export interface StructuredLogRecord {
  ts: string
  level: ObservabilityLogLevel
  service: 'main' | 'renderer' | 'preload'
  event: string
  traceId: string
  message?: string
  agentId?: string
  sessionId?: string
  projectId?: string
  meta?: Record<string, unknown>
}

const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024
const DEFAULT_MAX_ROTATED_FILES = 5

export class Logger {
  private readonly logPath: string
  private readonly maxFileBytes: number
  private readonly maxRotatedFiles: number

  constructor(private readonly options: LoggerOptions) {
    mkdirSync(options.logDir, { recursive: true })
    this.logPath = join(options.logDir, 'hydra.log.jsonl')
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
    this.maxRotatedFiles = options.maxRotatedFiles ?? DEFAULT_MAX_ROTATED_FILES
  }

  getLogPath(): string {
    return this.logPath
  }

  getAllLogPathsNewestFirst(): string[] {
    const files: string[] = [this.logPath]
    for (let i = 1; i <= this.maxRotatedFiles; i++) {
      files.push(`${this.logPath}.${i}`)
    }
    return files.filter((file) => existsSync(file))
  }

  readRecentLines(maxLines = 3000): string[] {
    const oldestToNewest = this.getAllLogPathsNewestFirst().reverse()
    const lines: string[] = []
    for (const file of oldestToNewest) {
      const chunk = readFileSync(file, 'utf-8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
      lines.push(...chunk)
      if (lines.length > maxLines * 2) {
        lines.splice(0, lines.length - maxLines * 2)
      }
    }
    return lines.slice(-maxLines)
  }

  debug(event: string, payload: Omit<ObservabilityLogEventPayload, 'level' | 'event'> = {}): StructuredLogRecord {
    return this.log({ level: 'debug', event, ...payload })
  }

  info(event: string, payload: Omit<ObservabilityLogEventPayload, 'level' | 'event'> = {}): StructuredLogRecord {
    return this.log({ level: 'info', event, ...payload })
  }

  warn(event: string, payload: Omit<ObservabilityLogEventPayload, 'level' | 'event'> = {}): StructuredLogRecord {
    return this.log({ level: 'warn', event, ...payload })
  }

  error(event: string, payload: Omit<ObservabilityLogEventPayload, 'level' | 'event'> = {}): StructuredLogRecord {
    return this.log({ level: 'error', event, ...payload })
  }

  log(input: ObservabilityLogEventPayload): StructuredLogRecord {
    const record: StructuredLogRecord = {
      ts: new Date().toISOString(),
      level: input.level,
      service: this.normalizeService(input.service),
      event: input.event,
      traceId: input.traceId?.trim() || randomUUID().slice(0, 12),
      message: input.message,
      agentId: input.agentId,
      sessionId: input.sessionId,
      projectId: input.projectId,
      meta: this.normalizeMeta(input.meta)
    }

    this.rotateIfNeeded()
    appendFileSync(this.logPath, `${JSON.stringify(record)}\n`, 'utf-8')
    this.mirrorToConsole(record)
    return record
  }

  private normalizeService(service: unknown): 'main' | 'renderer' | 'preload' {
    if (service === 'renderer' || service === 'preload' || service === 'main') {
      return service
    }
    return this.options.defaultService
  }

  private normalizeMeta(meta: unknown): Record<string, unknown> | undefined {
    if (!meta || typeof meta !== 'object') return undefined
    try {
      return JSON.parse(JSON.stringify(meta)) as Record<string, unknown>
    } catch {
      return { parseError: 'meta-not-serializable' }
    }
  }

  private rotateIfNeeded(): void {
    if (!existsSync(this.logPath)) return
    const size = statSync(this.logPath).size
    if (size < this.maxFileBytes) return

    const oldest = `${this.logPath}.${this.maxRotatedFiles}`
    if (existsSync(oldest)) {
      rmSync(oldest, { force: true })
    }

    for (let i = this.maxRotatedFiles - 1; i >= 1; i--) {
      const current = `${this.logPath}.${i}`
      const next = `${this.logPath}.${i + 1}`
      if (existsSync(current)) {
        renameSync(current, next)
      }
    }

    renameSync(this.logPath, `${this.logPath}.1`)
  }

  private mirrorToConsole(record: StructuredLogRecord): void {
    const line = `[Hydra:${record.service}] ${record.event} ${record.message ?? ''}`.trim()
    if (record.level === 'error') {
      console.error(line)
      return
    }
    if (record.level === 'warn') {
      console.warn(line)
      return
    }
    console.log(line)
  }
}
