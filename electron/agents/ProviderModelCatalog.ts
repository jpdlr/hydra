import { spawn, type SpawnOptions } from 'child_process'
import { PROVIDER_MODELS, type ProviderId, type ProviderModelOption } from '@shared/types'

const MODEL_CACHE_TTL_MS = 5 * 60 * 1000
const CODEX_APP_SERVER_TIMEOUT_MS = 8000
const OPENCODE_TIMEOUT_MS = 10000

interface JsonRpcSuccess<T> {
  id: string
  result: T
}

interface JsonRpcError {
  id: string
  error: {
    message?: string
  }
}

interface CodexModelPayload {
  model: string
  displayName: string
  description?: string
  hidden?: boolean
  isDefault?: boolean
  supportedReasoningEfforts?: Array<{
    reasoningEffort: string
  }>
  defaultReasoningEffort?: string | null
}

interface CodexModelListResponse {
  data: CodexModelPayload[]
  nextCursor?: string | null
}

interface OpenCodeModelPayload {
  id: string
  providerID: string
  name: string
  status: string
  variants?: Record<string, {
    reasoningEffort?: string
    thinking?: { type: string; budgetTokens?: number }
  }>
}

export class ProviderModelCatalog {
  private codexCache: { models: ProviderModelOption[]; expiresAt: number } | null = null
  private codexInFlight: Promise<ProviderModelOption[]> | null = null
  private opencodeCache: { models: ProviderModelOption[]; expiresAt: number } | null = null
  private opencodeInFlight: Promise<ProviderModelOption[]> | null = null

  async list(provider: ProviderId): Promise<ProviderModelOption[]> {
    if (provider === 'claude') return cloneModels(PROVIDER_MODELS.claude)

    if (provider === 'opencode') {
      return this.listOpenCode()
    }

    // codex
    const now = Date.now()
    if (this.codexCache && this.codexCache.expiresAt > now) {
      return cloneModels(this.codexCache.models)
    }

    if (!this.codexInFlight) {
      this.codexInFlight = this.fetchCodexModels()
        .then((models) => {
          this.codexCache = {
            models,
            expiresAt: Date.now() + MODEL_CACHE_TTL_MS
          }
          return models
        })
        .catch(() => cloneModels(PROVIDER_MODELS.codex))
        .finally(() => {
          this.codexInFlight = null
        })
    }

    return cloneModels(await this.codexInFlight)
  }

  private async listOpenCode(): Promise<ProviderModelOption[]> {
    const now = Date.now()
    if (this.opencodeCache && this.opencodeCache.expiresAt > now) {
      return cloneModels(this.opencodeCache.models)
    }

    if (!this.opencodeInFlight) {
      this.opencodeInFlight = this.fetchOpenCodeModels()
        .then((models) => {
          this.opencodeCache = {
            models,
            expiresAt: Date.now() + MODEL_CACHE_TTL_MS
          }
          return models
        })
        .catch(() => cloneModels(PROVIDER_MODELS.opencode))
        .finally(() => {
          this.opencodeInFlight = null
        })
    }

    return cloneModels(await this.opencodeInFlight)
  }

  private fetchCodexModels(): Promise<ProviderModelOption[]> {
    return new Promise((resolve, reject) => {
      const child = spawnCli('codex', ['app-server', '--listen', 'stdio://'], {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdoutBuffer = ''
      let stderrBuffer = ''
      let settled = false
      let initialized = false

      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        killChild(child)
        fn()
      }

      const timeout = setTimeout(() => {
        finish(() => reject(new Error('Timed out querying Codex model catalog')))
      }, CODEX_APP_SERVER_TIMEOUT_MS)

      const send = (payload: object): void => {
        child.stdin!.write(`${JSON.stringify(payload)}\n`)
      }

      child.on('error', (error) => {
        finish(() => reject(error))
      })

      child.on('exit', (code, signal) => {
        if (settled) return
        const detail = stderrBuffer.trim() || `code=${code ?? 'null'} signal=${signal ?? 'null'}`
        finish(() => reject(new Error(`Codex app-server exited before returning models (${detail})`)))
      })

      child.stderr!.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
      })

      child.stdout!.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        let newlineIndex = stdoutBuffer.indexOf('\n')
        while (newlineIndex >= 0) {
          const line = stdoutBuffer.slice(0, newlineIndex).trim()
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
          newlineIndex = stdoutBuffer.indexOf('\n')
          if (!line) continue

          try {
            const message = JSON.parse(line) as JsonRpcSuccess<CodexModelListResponse> | JsonRpcError
            if ('error' in message) {
              finish(() => reject(new Error(message.error.message || 'Codex app-server request failed')))
              return
            }

            if (message.id === 'initialize') {
              initialized = true
              send({
                jsonrpc: '2.0',
                id: 'model-list',
                method: 'model/list',
                params: {
                  includeHidden: false,
                  limit: 100
                }
              })
              continue
            }

            if (message.id === 'model-list') {
              const models = (message.result?.data ?? [])
                .filter((model) => !model.hidden)
                .map((model) => ({
                  id: model.model,
                  label: model.displayName || model.model,
                  description: model.description,
                  hidden: Boolean(model.hidden),
                  isDefault: Boolean(model.isDefault),
                  reasoningEfforts: model.supportedReasoningEfforts?.map((effort) => effort.reasoningEffort) ?? [],
                  defaultReasoningEffort: model.defaultReasoningEffort ?? null
                }))

              if (models.length === 0) {
                finish(() => reject(new Error('Codex app-server returned an empty model catalog')))
                return
              }

              finish(() => resolve(models))
              return
            }
          } catch (error) {
            if (!initialized) {
              finish(() => reject(error instanceof Error ? error : new Error('Failed to parse Codex app-server output')))
              return
            }
          }
        }
      })

      send({
        jsonrpc: '2.0',
        id: 'initialize',
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'hydra',
            version: '0.0.0'
          },
          capabilities: null
        }
      })
    })
  }

  private fetchOpenCodeModels(): Promise<ProviderModelOption[]> {
    return new Promise((resolve, reject) => {
      const child = spawnCli('opencode', ['models', '--verbose'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let stdoutBuffer = ''
      let settled = false

      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        fn()
      }

      const timeout = setTimeout(() => {
        killChild(child)
        finish(() => reject(new Error('Timed out querying OpenCode model catalog')))
      }, OPENCODE_TIMEOUT_MS)

      child.on('error', (error) => {
        finish(() => reject(error))
      })

      child.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString()
      })

      child.on('close', () => {
        try {
          const models = parseOpenCodeVerboseOutput(stdoutBuffer)
          if (models.length === 0) {
            finish(() => reject(new Error('OpenCode returned an empty model catalog')))
            return
          }
          finish(() => resolve(models))
        } catch (error) {
          finish(() => reject(error instanceof Error ? error : new Error('Failed to parse OpenCode model output')))
        }
      })
    })
  }
}

/**
 * Parses the `opencode models --verbose` output format.
 * Each model is a header line (`providerID/modelId`) followed by a JSON block.
 */
function parseOpenCodeVerboseOutput(output: string): ProviderModelOption[] {
  const models: ProviderModelOption[] = []
  const blocks = output.split(/^(?=\S+\/\S+$)/m)

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 2) continue

    const headerLine = lines[0].trim()
    const jsonStr = lines.slice(1).join('\n').trim()
    if (!jsonStr.startsWith('{')) continue

    try {
      const data = JSON.parse(jsonStr) as OpenCodeModelPayload
      const modelId = `${data.providerID}/${data.id}`
      const reasoningEfforts = data.variants
        ? Object.keys(data.variants).filter((k) => {
            const v = data.variants![k]
            return v.reasoningEffort || v.thinking
          })
        : []

      models.push({
        id: modelId,
        label: data.name || headerLine,
        isDefault: models.length === 0,
        reasoningEfforts: reasoningEfforts.length > 0 ? reasoningEfforts : undefined,
        defaultReasoningEffort: null
      })
    } catch {
      // Skip unparseable blocks
    }
  }

  return models
}

/** Spawn a CLI command, using cmd.exe on Windows to handle .cmd wrappers. */
function spawnCli(command: string, args: string[], options: SpawnOptions) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/c', command, ...args], options)
  }
  return spawn(command, args, options)
}

/** Kill a child process portably (Windows doesn't support SIGTERM). */
function killChild(child: ReturnType<typeof spawn>): void {
  try {
    if (process.platform === 'win32') {
      child.kill()
    } else {
      child.kill('SIGTERM')
    }
  } catch { /* already dead */ }
}

function cloneModels(models: ProviderModelOption[]): ProviderModelOption[] {
  return models.map((model) => ({
    ...model,
    reasoningEfforts: model.reasoningEfforts ? [...model.reasoningEfforts] : undefined
  }))
}
