import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'
import type { ClaudeSessionSummary } from '@shared/types'

interface SessionsIndexFile {
  version?: number
  entries?: SessionsIndexEntry[]
  originalPath?: string
}

interface SessionsIndexEntry {
  sessionId: string
  fullPath: string
  fileMtime?: number
  firstPrompt?: string
  messageCount?: number
  created?: string
  modified?: string
  gitBranch?: string
  projectPath?: string
  isSidechain?: boolean
}

interface JsonlHeader {
  sessionId: string
  cwd: string
  gitBranch: string | null
  isSidechain: boolean
  firstPrompt: string
}

const DEFAULT_CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const INDEX_FILENAME = 'sessions-index.json'
const JSONL_MAX_HEADER_CHARS = 64 * 1024

export interface ListSessionOptions {
  limit?: number
  projectPathPrefix?: string
  hiddenSessionIds?: Iterable<string>
}

export class SessionCatalog {
  constructor(private readonly projectsDir: string = DEFAULT_CLAUDE_PROJECTS_DIR) {}

  listSessions(options: ListSessionOptions = {}): ClaudeSessionSummary[] {
    if (!existsSync(this.projectsDir)) return []

    const sessions: ClaudeSessionSummary[] = []
    const projects = readdirSync(this.projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(this.projectsDir, entry.name))

    for (const projectDir of projects) {
      sessions.push(...this.readProjectSessions(projectDir))
    }

    const hiddenIds = new Set(options.hiddenSessionIds ?? [])
    const projectPrefix = options.projectPathPrefix?.trim()
    const filtered = sessions.filter((session) => {
      if (hiddenIds.has(session.sessionId)) return false
      if (projectPrefix && !session.projectPath.startsWith(projectPrefix)) return false
      return true
    })

    filtered.sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))

    if (typeof options.limit === 'number' && options.limit > 0) {
      return filtered.slice(0, options.limit)
    }
    return filtered
  }

  private readProjectSessions(projectDir: string): ClaudeSessionSummary[] {
    const sessions: ClaudeSessionSummary[] = []
    const seenSessionIds = new Set<string>()

    const indexPath = join(projectDir, INDEX_FILENAME)
    if (existsSync(indexPath)) {
      sessions.push(...this.readFromSessionsIndex(indexPath, seenSessionIds))
    }

    // Fallback for project folders without sessions-index.json (or missing entries).
    sessions.push(...this.readFromJsonlFiles(projectDir, seenSessionIds))

    return sessions
  }

  private readFromSessionsIndex(indexPath: string, seenSessionIds: Set<string>): ClaudeSessionSummary[] {
    try {
      const raw = readFileSync(indexPath, 'utf-8')
      const parsed = JSON.parse(raw) as SessionsIndexFile
      const entries = parsed.entries ?? []

      return entries
        .filter((entry) => !!entry.sessionId && !!entry.fullPath)
        .map((entry) => {
          seenSessionIds.add(entry.sessionId)

          const modifiedAt =
            entry.modified ??
            (entry.fileMtime ? new Date(entry.fileMtime).toISOString() : new Date().toISOString())

          const createdAt = entry.created ?? modifiedAt

          return {
            sessionId: entry.sessionId,
            projectPath: entry.projectPath ?? parsed.originalPath ?? '',
            firstPrompt: (entry.firstPrompt ?? '').trim(),
            messageCount: Math.max(0, entry.messageCount ?? 0),
            createdAt,
            modifiedAt,
            gitBranch: entry.gitBranch ?? null,
            isSidechain: !!entry.isSidechain,
            sourcePath: entry.fullPath
          } satisfies ClaudeSessionSummary
        })
    } catch (err) {
      console.warn(`Failed to read session index: ${indexPath}`, err)
      return []
    }
  }

  private readFromJsonlFiles(projectDir: string, seenSessionIds: Set<string>): ClaudeSessionSummary[] {
    let files: string[] = []
    try {
      files = readdirSync(projectDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map((entry) => join(projectDir, entry.name))
    } catch {
      return []
    }

    const sessions: ClaudeSessionSummary[] = []

    for (const filePath of files) {
      const sessionId = basename(filePath, '.jsonl')
      if (seenSessionIds.has(sessionId)) continue

      const stat = statSync(filePath)
      if (stat.size <= 0) continue

      const header = this.readJsonlHeader(filePath)
      if (!header) continue

      seenSessionIds.add(header.sessionId)

      sessions.push({
        sessionId: header.sessionId,
        projectPath: header.cwd,
        firstPrompt: header.firstPrompt,
        messageCount: 0,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString(),
        gitBranch: header.gitBranch,
        isSidechain: header.isSidechain,
        sourcePath: filePath
      })
    }

    return sessions
  }

  private readJsonlHeader(filePath: string): JsonlHeader | null {
    try {
      const raw = readFileSync(filePath, 'utf-8').slice(0, JSONL_MAX_HEADER_CHARS)
      const lines = raw.split('\n')

      let sessionId = ''
      let cwd = ''
      let gitBranch: string | null = null
      let isSidechain = false
      let firstPrompt = ''

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

        if (!sessionId && typeof object.sessionId === 'string') {
          sessionId = object.sessionId
        }
        if (!cwd && typeof object.cwd === 'string') {
          cwd = object.cwd
        }
        if (!gitBranch && typeof object.gitBranch === 'string') {
          gitBranch = object.gitBranch
        }
        if (typeof object.isSidechain === 'boolean') {
          isSidechain = object.isSidechain
        }

        const message = object.message
        if (!firstPrompt && message && typeof message === 'object') {
          const msgObj = message as Record<string, unknown>
          if (msgObj.role === 'user' && typeof msgObj.content === 'string') {
            firstPrompt = msgObj.content
          }
        }

        if (sessionId && cwd && firstPrompt) break
      }

      if (!sessionId || !cwd) return null
      return {
        sessionId,
        cwd,
        gitBranch,
        isSidechain,
        firstPrompt
      }
    } catch {
      return null
    }
  }
}
