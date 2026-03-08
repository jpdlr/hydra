import { PROVIDER_MODELS, type ModelId, type ProviderId } from './types'

const ANSI_ESCAPE_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g

export function detectLatestModelFromTerminalOutput(
  provider: ProviderId,
  text: string
): ModelId | null {
  const cleaned = stripAnsi(text)
  if (!cleaned) return null

  if (provider === 'codex') {
    return normalizeDetectedModel(
      provider,
      lastMatch(cleaned, /\bModel changed to\s+([A-Za-z0-9._-]+)/gi) ??
      lastMatch(cleaned, /\bCurrent model[:\s]+([A-Za-z0-9._-]+)/gi) ??
      lastMatch(cleaned, /\bUsing model[:\s]+([A-Za-z0-9._-]+)/gi)
    )
  }

  return normalizeDetectedModel(
    provider,
    lastMatch(cleaned, /\b(haiku|sonnet|opus)\b/gi)
  )
}

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_REGEX, '')
}

function lastMatch(text: string, pattern: RegExp): string | null {
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  let match: RegExpExecArray | null = null
  let value: string | null = null
  while ((match = regex.exec(text)) !== null) {
    value = match[1]?.trim() || null
  }
  return value
}

function normalizeDetectedModel(provider: ProviderId, value: string | null): ModelId | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (!normalized) return null

  const knownModels = new Set(PROVIDER_MODELS[provider].map((model) => model.id.toLowerCase()))
  if (knownModels.has(normalized)) return normalized

  if (provider === 'claude') {
    if (normalized.includes('opus')) return 'opus'
    if (normalized.includes('sonnet')) return 'sonnet'
    if (normalized.includes('haiku')) return 'haiku'
    return null
  }

  if (/^gpt-[a-z0-9.-]+(?:-codex(?:-(?:mini|max))?)?$/.test(normalized)) {
    return normalized
  }

  return null
}
