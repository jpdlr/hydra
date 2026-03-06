import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const MAX_MESSAGES = 50

/**
 * Read conversation history from a Claude Code JSONL transcript file.
 * Extracts user and assistant text messages, filtering out tool_use,
 * tool_result, thinking, and system entries.
 */
export function readTranscriptHistory(sessionId: string, limit: number = MAX_MESSAGES): TranscriptMessage[] {
  const filePath = findTranscriptFile(sessionId)
  if (!filePath) return []

  try {
    const raw = readFileSync(filePath, 'utf-8')
    const messages: TranscriptMessage[] = []

    for (const line of raw.split('\n')) {
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
      const text = extractTextFromContent(message.content)
      if (!text) continue

      messages.push({ role: role as 'user' | 'assistant', text, timestamp })
    }

    // Return last N messages
    return messages.slice(-limit)
  } catch {
    return []
  }
}

function extractTextFromContent(content: unknown): string {
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

function findTranscriptFile(sessionId: string): string | null {
  if (!sessionId || !existsSync(CLAUDE_PROJECTS_DIR)) return null

  // Search all project directories for the session JSONL file
  try {
    const projects = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())

    for (const project of projects) {
      const candidate = join(CLAUDE_PROJECTS_DIR, project.name, `${sessionId}.jsonl`)
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // Ignore filesystem errors
  }

  return null
}
