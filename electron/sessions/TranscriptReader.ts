import { existsSync, readdirSync, readFileSync, type Dirent } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { ProviderId } from '@shared/types'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

interface TranscriptReaderOptions {
  claudeProjectsDir?: string
  codexSessionsDir?: string
}

interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const CODEX_SESSIONS_DIR = join(homedir(), '.codex', 'sessions')
const MAX_MESSAGES = 50

export function readTranscriptHistory(
  sessionId: string,
  provider: ProviderId = 'claude',
  limit: number = MAX_MESSAGES,
  options: TranscriptReaderOptions = {}
): TranscriptMessage[] {
  const filePath = findTranscriptFile(sessionId, provider, options)
  if (!filePath) return []

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const lines = raw.split('\n')
    const messages =
      provider === 'codex'
        ? parseCodexTranscript(lines)
        : parseClaudeTranscript(lines)

    return messages.slice(-limit)
  } catch {
    return []
  }
}

function parseClaudeTranscript(lines: string[]): TranscriptMessage[] {
  const messages: TranscriptMessage[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }

    const type = entry.type as string | undefined
    if (type !== 'user' && type !== 'assistant') continue

    const message = entry.message as Record<string, unknown> | undefined
    if (!message) continue

    const role = message.role as string
    if (role !== 'user' && role !== 'assistant') continue

    const timestamp = (entry.timestamp as string) || ''
    const text = extractClaudeTextFromContent(message.content)
    if (!text) continue

    messages.push({ role, text, timestamp })
  }

  return messages
}

function parseCodexTranscript(lines: string[]): TranscriptMessage[] {
  const messages: TranscriptMessage[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    let entry: Record<string, unknown>
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue
    }

    const parsed = parseCodexEntry(entry)
    if (parsed) {
      messages.push(parsed)
    }
  }

  return dedupeAdjacentTranscriptMessages(messages)
}

function parseCodexEntry(entry: Record<string, unknown>): TranscriptEntry | null {
  const type = entry.type
  const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : ''

  if (type === 'event_msg') {
    const payload = asRecord(entry.payload)
    if (!payload) return null

    if (payload.type === 'user_message' && typeof payload.message === 'string') {
      const text = payload.message.trim()
      return text ? { role: 'user', text, timestamp } : null
    }

    if (payload.type === 'agent_message' && typeof payload.message === 'string') {
      const text = payload.message.trim()
      return text ? { role: 'assistant', text, timestamp } : null
    }

    return null
  }

  if (type !== 'response_item') return null

  const payload = asRecord(entry.payload)
  if (!payload) return null

  if (payload.type !== 'message') return null

  const role = payload.role
  if (role !== 'user' && role !== 'assistant') return null

  const text = extractCodexMessageText(payload.content, role)
  return text ? { role, text, timestamp } : null
}

function extractClaudeTextFromContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (!Array.isArray(content)) return ''

  const textParts: string[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>
    if (block.type === 'text' && typeof block.text === 'string') {
      const text = block.text.trim()
      if (text) textParts.push(text)
    }
  }

  return textParts.join('\n').trim()
}

function extractCodexMessageText(content: unknown, role: 'user' | 'assistant'): string {
  if (!Array.isArray(content)) return ''

  const textParts: string[] = []
  for (const item of content) {
    if (!item || typeof item !== 'object') continue
    const block = item as Record<string, unknown>

    if (role === 'user' && block.type === 'input_text' && typeof block.text === 'string') {
      const text = block.text.trim()
      if (text) textParts.push(text)
    }

    if (role === 'assistant' && block.type === 'output_text' && typeof block.text === 'string') {
      const text = block.text.trim()
      if (text) textParts.push(text)
    }
  }

  return textParts.join('\n').trim()
}

function dedupeAdjacentTranscriptMessages(messages: TranscriptMessage[]): TranscriptMessage[] {
  const deduped: TranscriptMessage[] = []

  for (const message of messages) {
    const previous = deduped[deduped.length - 1]
    if (
      previous &&
      previous.role === message.role &&
      previous.text === message.text &&
      previous.timestamp === message.timestamp
    ) {
      continue
    }

    deduped.push(message)
  }

  return deduped
}

function findTranscriptFile(
  sessionId: string,
  provider: ProviderId,
  options: TranscriptReaderOptions
): string | null {
  if (!sessionId) return null

  if (provider === 'codex') {
    return findCodexTranscriptFile(sessionId, options.codexSessionsDir ?? CODEX_SESSIONS_DIR)
  }

  return findClaudeTranscriptFile(sessionId, options.claudeProjectsDir ?? CLAUDE_PROJECTS_DIR)
}

function findClaudeTranscriptFile(sessionId: string, projectsDir: string): string | null {
  if (!existsSync(projectsDir)) return null

  try {
    const projects = readdirSync(projectsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())

    for (const project of projects) {
      const candidate = join(projectsDir, project.name, `${sessionId}.jsonl`)
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // Ignore filesystem errors.
  }

  return null
}

function findCodexTranscriptFile(sessionId: string, sessionsDir: string): string | null {
  if (!existsSync(sessionsDir)) return null

  const stack = [sessionsDir]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    let entries: Dirent[]
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }

      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
      if (entry.name.includes(sessionId)) return fullPath
    }
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}
