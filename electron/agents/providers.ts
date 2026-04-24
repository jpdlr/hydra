import { PROVIDER_MODELS, type AgentState, type ProviderId, type ModelId } from '@shared/types'
import { execFileSync } from 'child_process'

export interface ProviderConfig {
  id: ProviderId
  /** CLI command name (e.g. 'claude', 'codex') */
  command: string
  /** Build CLI arguments from agent state */
  buildArgs(state: AgentState): string[]
  /** Build CLI arguments for headless (non-interactive) runs */
  buildHeadlessArgs(model: ModelId, prompt: string, resumeSessionId: string | null, reasoningEffort?: string): string[]
  /** Whether this provider supports --resume */
  supportsResume: boolean
  /** CLI flag for auto-approve / YOLO mode, or null if unsupported */
  yoloFlag: string | null
  /** Regex to detect session IDs from PTY output, or null */
  sessionIdRegex: RegExp | null
  /** Check if the CLI binary is available. Returns path + version or error. */
  preflight(): Promise<{
    ok: boolean
    path: string | null
    version: string | null
    error: string | null
  }>
}

interface ProviderPreflightResult {
  ok: boolean
  path: string | null
  version: string | null
  error: string | null
}

function resolveCommandPath(command: string): string | null {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  try {
    const output = execFileSync(locator, [command], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    const firstLine = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)
    return firstLine ?? null
  } catch {
    return null
  }
}

function readVersion(commandPath: string, command: string): string | null {
  const targets = commandPath === command ? [commandPath] : [command, commandPath]
  for (const target of targets) {
    try {
      const output = execFileSync(target, ['--version'], {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim()
      if (output.length > 0) return output
    } catch {
      continue
    }
  }
  return null
}

function runPreflight(command: string, missingError: string): ProviderPreflightResult {
  const path = resolveCommandPath(command)
  if (!path) {
    return {
      ok: false,
      path: null,
      version: null,
      error: missingError
    }
  }

  return {
    ok: true,
    path,
    version: readVersion(path, command),
    error: null
  }
}

// ── Claude Provider ─────────────────────────────────────────────────────────

const claudeProvider: ProviderConfig = {
  id: 'claude',
  command: 'claude',
  supportsResume: true,
  yoloFlag: '--dangerously-skip-permissions',
  sessionIdRegex: /session(?:[_\s-]?id)?[:=\s]+([a-z0-9-]{8,})/i,

  buildArgs(state: AgentState): string[] {
    const args: string[] = []
    if (state.yolo) args.push('--dangerously-skip-permissions')
    args.push('--model', state.model)
    if (state.sessionId) args.push('--resume', state.sessionId)
    return args
  },

  buildHeadlessArgs(model: ModelId, prompt: string, resumeSessionId: string | null, _reasoningEffort?: string): string[] {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--model', model]
    if (resumeSessionId) args.push('--resume', resumeSessionId)
    return args
  },

  async preflight() {
    return runPreflight('claude', 'Claude CLI not found. Install it from https://claude.ai/download')
  }
}

// ── Codex Provider ──────────────────────────────────────────────────────────

const codexProvider: ProviderConfig = {
  id: 'codex',
  command: 'codex',
  supportsResume: true,
  yoloFlag: '--full-auto',
  sessionIdRegex: null,

  buildArgs(state: AgentState): string[] {
    const args: string[] = []
    if (state.sessionId) {
      args.push('resume', state.sessionId)
    }
    if (state.yolo) args.push('--full-auto')
    args.push('--model', state.model)
    if (state.reasoningEffort) {
      args.push('-c', `model_reasoning_effort="${state.reasoningEffort}"`)
    }
    return args
  },

  buildHeadlessArgs(model: ModelId, prompt: string, _resumeSessionId: string | null, reasoningEffort?: string): string[] {
    const args = ['--model', model, '-q', prompt]
    if (reasoningEffort) {
      args.push('-c', `model_reasoning_effort="${reasoningEffort}"`)
    }
    return args
  },

  async preflight() {
    return runPreflight('codex', 'Codex CLI not found. Install it with: npm install -g @openai/codex or bun add -g @openai/codex')
  }
}

// ── OpenCode Provider ──────────────────────────────────────────────────────

const opencodeProvider: ProviderConfig = {
  id: 'opencode',
  command: 'opencode',
  supportsResume: true,
  yoloFlag: null,
  sessionIdRegex: /session(?:[_\s-]?id)?[:=\s]+([a-z0-9-]{8,})/i,

  buildArgs(state: AgentState): string[] {
    const args: string[] = []
    args.push('--model', state.model)
    if (state.sessionId) args.push('--session', state.sessionId)
    return args
  },

  buildHeadlessArgs(model: ModelId, prompt: string, resumeSessionId: string | null, _reasoningEffort?: string): string[] {
    const args = ['-p', prompt, '--output-format', 'text', '--model', model]
    if (resumeSessionId) args.push('--session', resumeSessionId)
    return args
  },

  async preflight() {
    return runPreflight('opencode', 'OpenCode CLI not found. Install it from https://opencode.ai')
  }
}

// ── Registry ────────────────────────────────────────────────────────────────

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  claude: claudeProvider,
  codex: codexProvider,
  opencode: opencodeProvider
}

export function getProvider(id: ProviderId): ProviderConfig {
  const provider = PROVIDERS[id]
  if (!provider) throw new Error(`Unknown provider: ${id}`)
  return provider
}

export function getAllProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS)
}

export function isValidModelForProvider(provider: ProviderId, model: ModelId): boolean {
  return PROVIDER_MODELS[provider].some((m) => m.id === model)
}
