import { app, BrowserWindow, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { writeFileSync } from 'fs'
import { join } from 'path'
import type {
  AgentState,
  AppConfig,
  ExportDiagnosticsResult,
  HeadlessRun,
  ObservabilityLogEventPayload
} from '@shared/types'
import { Logger, type StructuredLogRecord } from './Logger'

interface ObservabilityContext {
  getConfig: () => AppConfig
  getAgents: () => AgentState[]
  getHeadlessRuns: () => HeadlessRun[]
}

const SENSITIVE_KEY_PATTERN =
  /(prompt|path|project|dir|cwd|source|content|input|output|stack|token|password|secret|apiKey|api_key)/i

export class ObservabilityService {
  private readonly logger: Logger
  private readonly runtimeId = randomUUID().slice(0, 12)
  private processHandlersInstalled = false
  private isReporting = false

  constructor(private readonly context: ObservabilityContext) {
    this.logger = new Logger({
      logDir: join(app.getPath('userData'), 'logs'),
      defaultService: 'main'
    })
  }

  logMain(payload: ObservabilityLogEventPayload): StructuredLogRecord {
    const record = this.logger.log({ ...payload, service: 'main' })
    this.reportIfNeeded(record)
    return record
  }

  logRenderer(payload: ObservabilityLogEventPayload): StructuredLogRecord {
    const record = this.logger.log({ ...payload, service: payload.service ?? 'renderer' })
    this.reportIfNeeded(record)
    return record
  }

  installProcessHandlers(): void {
    if (this.processHandlersInstalled) return
    this.processHandlersInstalled = true

    process.on('uncaughtException', (error) => {
      this.logMain({
        level: 'error',
        event: 'process.uncaught-exception',
        message: error.message,
        meta: { stack: error.stack }
      })
    })

    process.on('unhandledRejection', (reason) => {
      const message = reason instanceof Error ? reason.message : String(reason)
      const stack = reason instanceof Error ? reason.stack : undefined
      this.logMain({
        level: 'error',
        event: 'process.unhandled-rejection',
        message,
        meta: { stack }
      })
    })
  }

  async exportDiagnostics(): Promise<ExportDiagnosticsResult> {
    const defaultPath = join(
      app.getPath('documents'),
      `hydra-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    )

    const ownerWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const saveResult = await dialog.showSaveDialog(ownerWindow ?? undefined, {
      title: 'Export Hydra Diagnostics',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (saveResult.canceled || !saveResult.filePath) {
      return { path: null, error: null }
    }

    try {
      const config = this.context.getConfig()
      const includeSensitive = config.includeSensitiveDiagnostics
      const snapshot = {
        generatedAt: new Date().toISOString(),
        runtimeId: this.runtimeId,
        app: {
          version: app.getVersion(),
          electron: process.versions.electron,
          chrome: process.versions.chrome,
          node: process.versions.node,
          platform: process.platform,
          arch: process.arch
        },
        config: this.sanitizeValue(config, includeSensitive),
        agents: this.sanitizeValue(this.context.getAgents(), includeSensitive),
        headlessRuns: this.sanitizeValue(this.context.getHeadlessRuns(), includeSensitive),
        logs: this.logger.readRecentLines(3000).map((line) => {
          try {
            return this.sanitizeValue(JSON.parse(line), includeSensitive)
          } catch {
            return line
          }
        })
      }

      writeFileSync(saveResult.filePath, JSON.stringify(snapshot, null, 2), 'utf-8')
      this.logMain({
        level: 'info',
        event: 'diagnostics.exported',
        message: 'Diagnostics bundle exported',
        meta: { filePath: saveResult.filePath, includeSensitive }
      })
      return { path: saveResult.filePath, error: null }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logMain({
        level: 'error',
        event: 'diagnostics.export-failed',
        message
      })
      return { path: null, error: message }
    }
  }

  private sanitizeValue(value: unknown, includeSensitive: boolean, keyHint = ''): unknown {
    if (value === null || value === undefined) return value
    if (typeof value === 'string') {
      if (!includeSensitive && SENSITIVE_KEY_PATTERN.test(keyHint)) {
        return '[redacted]'
      }
      return value
    }
    if (Array.isArray(value)) {
      return value.map((entry) => this.sanitizeValue(entry, includeSensitive, keyHint))
    }
    if (typeof value === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
        out[key] = this.sanitizeValue(next, includeSensitive, key)
      }
      return out
    }
    return value
  }

  private reportIfNeeded(record: StructuredLogRecord): void {
    if (record.level !== 'error') return
    if (this.isReporting) return

    const config = this.context.getConfig()
    const endpoint =
      config.errorReportingEndpoint.trim() || process.env.HYDRA_ERROR_REPORT_ENDPOINT?.trim() || ''
    if (!config.enableRemoteErrorReporting || !endpoint) return

    const payload = {
      runtimeId: this.runtimeId,
      sentAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      record: this.sanitizeValue(record, config.includeSensitiveDiagnostics)
    }

    this.isReporting = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) {
          this.logger.warn('remote-report.failed', {
            service: 'main',
            message: `Remote reporter returned ${response.status}`
          })
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn('remote-report.failed', {
          service: 'main',
          message
        })
      })
      .finally(() => {
        clearTimeout(timeout)
        this.isReporting = false
      })
  }
}
