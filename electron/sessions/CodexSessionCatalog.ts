import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ClaudeSessionSummary } from '@shared/types'
import type { ListSessionOptions } from './SessionCatalog'

interface CodexSessionMetaPayload {
  id?: string
  timestamp?: string
  cwd?: string
  git?: {
    branch?: string
  }
}

const DEFAULT_CODEX_SESSIONS_DIR = join(homedir(), '.codex', 'sessions')
const SESSION_CACHE_TTL_MS = 5000
const SESSION_FILE_READ_LIMIT = 256 * 1024

function normalizePathForComparison(input: string): string {
  const normalized = input.replace(/\\/g, '/').replace(/\/+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function extractUserPrompt(record: Record<string, unknown>): string {
  if (record.type === 'event_msg') {
    const payload = record.payload
    if (payload && typeof payload === 'object') {
      const event = payload as Record<string, unknown>
      if (event.type === 'user_message' && typeof event.message === 'string') {
        return event.message.trim()
      }
    }
  }

  if (record.type === 'response_item') {
    const payload = record.payload
    if (payload && typeof payload === 'object') {
      const item = payload as Record<string, unknown>
      if (item.type === 'message' && item.role === 'user' && Array.isArray(item.content)) {
        const parts: string[] = []
        for (const block of item.content) {
          if (!block || typeof block !== 'object') continue
          const contentBlock = block as Record<string, unknown>
          if (contentBlock.type === 'input_text' && typeof contentBlock.text === 'string') {
            const text = contentBlock.text.trim()
            if (text) parts.push(text)
          }
        }
        return parts.join('\n').trim()
      }
    }
  }

  return ''
}

export class CodexSessionCatalog {
  private cache: { sessions: ClaudeSessionSummary[]; expiresAt: number } | null = null

  constructor(
    private readonly sessionsDir: string = DEFAULT_CODEX_SESSIONS_DIR,
    private readonly cacheTtlMs: number = SESSION_CACHE_TTL_MS
  ) {}

  listSessions(options: ListSessionOptions = {}): ClaudeSessionSummary[] {
    const sessions = this.getSessionSnapshot(options.forceRefresh === true)

    const hiddenIds = new Set(options.hiddenSessionIds ?? [])
    const projectPrefix = options.projectPathPrefix?.trim()
    const normalizedProjectPrefix = projectPrefix ? normalizePathForComparison(projectPrefix) : null
    const cutoff =
      typeof options.maxAgeDays === 'number' && options.maxAgeDays > 0
        ? Date.now() - options.maxAgeDays * 86_400_000
        : 0

    const filtered = sessions.filter((session) => {
      if (hiddenIds.has(session.sessionId)) return false
      if (normalizedProjectPrefix) {
        const normalizedSessionPath = normalizePathForComparison(session.projectPath)
        if (!normalizedSessionPath.startsWith(normalizedProjectPrefix)) {
          return false
        }
      }
      if (cutoff > 0 && Date.parse(session.modifiedAt) < cutoff) return false
      return true
    })

    filtered.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))

    if (typeof options.limit === 'number' && options.limit > 0) {
      return filtered.slice(0, options.limit)
    }
    return filtered
  }

  invalidateCache(): void {
    this.cache = null
  }

  private getSessionSnapshot(forceRefresh: boolean): ClaudeSessionSummary[] {
    if (forceRefresh || this.cacheTtlMs <= 0) {
      return this.refreshCache()
    }

    const now = Date.now()
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.sessions
    }
    return this.refreshCache()
  }

  private refreshCache(): ClaudeSessionSummary[] {
    const sessions = this.scanSessions()
    if (this.cacheTtlMs > 0) {
      this.cache = {
        sessions,
        expiresAt: Date.now() + this.cacheTtlMs
      }
    } else {
      this.cache = null
    }
    return sessions
  }

  private scanSessions(): ClaudeSessionSummary[] {
    if (!existsSync(this.sessionsDir)) return []

    const sessionFiles = this.collectSessionFiles(this.sessionsDir)
    const sessions: ClaudeSessionSummary[] = []

    for (const filePath of sessionFiles) {
      const session = this.readSessionFile(filePath)
      if (session) sessions.push(session)
    }

    return sessions
  }

  private collectSessionFiles(rootDir: string): string[] {
    const files: string[] = []
    const stack = [rootDir]

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) continue

      let entries
      try {
        entries = readdirSync(current, { withFileTypes: true })
      } catch {
        continue
      }

      for (const entry of entries) {
        const fullPath = join(current, entry.name)
        if (entry.isDirectory()) {
          stack.push(fullPath)
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(fullPath)
        }
      }
    }

    return files
  }

  private readSessionFile(filePath: string): ClaudeSessionSummary | null {
    try {
      const stat = statSync(filePath)
      if (stat.size <= 0) return null

      const raw = readFileSync(filePath, 'utf-8').slice(0, SESSION_FILE_READ_LIMIT)
      const lines = raw.split('\n')

      let sessionId = ''
      let projectPath = ''
      let createdAt = ''
      let firstPrompt = ''
      let gitBranch: string | null = null

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        let record: unknown
        try {
          record = JSON.parse(trimmed)
        } catch {
          continue
        }

        if (!record || typeof record !== 'object') continue
        const object = record as Record<string, unknown>

        if (object.type === 'session_meta') {
          const payload = object.payload
          if (payload && typeof payload === 'object') {
            const meta = payload as CodexSessionMetaPayload
            if (!sessionId && typeof meta.id === 'string') {
              sessionId = meta.id
            }
            if (!projectPath && typeof meta.cwd === 'string') {
              projectPath = meta.cwd
            }
            if (!createdAt && typeof meta.timestamp === 'string') {
              createdAt = meta.timestamp
            }
            if (!gitBranch && typeof meta.git?.branch === 'string') {
              gitBranch = meta.git.branch
            }
          }
        }

        if (!firstPrompt) {
          firstPrompt = extractUserPrompt(object)
        }

        if (sessionId && projectPath && firstPrompt) break
      }

      if (!sessionId || !projectPath) return null

      return {
        sessionId,
        projectPath,
        firstPrompt,
        messageCount: 0,
        createdAt: createdAt || stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
        gitBranch,
        isSidechain: false,
        sourcePath: filePath
      }
    } catch {
      return null
    }
  }
}
