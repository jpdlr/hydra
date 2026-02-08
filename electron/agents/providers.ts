import type { AgentState, ProviderId, ModelId } from '@shared/types'

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
    try {
      const { execSync } = await import('child_process')
      const path = execSync('which claude', { encoding: 'utf-8' }).trim()
      const version = execSync('claude --version', {
        encoding: 'utf-8',
        timeout: 10000
      }).trim()
      return { ok: true, path, version, error: null }
    } catch {
      return {
        ok: false,
        path: null,
        version: null,
        error: 'Claude CLI not found. Install it from https://claude.ai/download'
      }
    }
  }
}

// ── Codex Provider ──────────────────────────────────────────────────────────

const codexProvider: ProviderConfig = {
  id: 'codex',
  command: 'codex',
  supportsResume: false,
  yoloFlag: '--full-auto',
  sessionIdRegex: null,

  buildArgs(state: AgentState): string[] {
    const args: string[] = []
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
    try {
      const { execSync } = await import('child_process')
      const path = execSync('which codex', { encoding: 'utf-8' }).trim()
      const version = execSync('codex --version', {
        encoding: 'utf-8',
        timeout: 10000
      }).trim()
      return { ok: true, path, version, error: null }
    } catch {
      return {
        ok: false,
        path: null,
        version: null,
        error: 'Codex CLI not found. Install it with: npm install -g @openai/codex'
      }
    }
  }
}

// ── Registry ────────────────────────────────────────────────────────────────

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  claude: claudeProvider,
  codex: codexProvider
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
