import { spawn } from 'child_process'
import { PROVIDER_MODELS, type ProviderId, type ProviderModelOption } from '@shared/types'

const CODEX_MODEL_CACHE_TTL_MS = 5 * 60 * 1000
const CODEX_APP_SERVER_TIMEOUT_MS = 8000

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

export class ProviderModelCatalog {
  private codexCache: { models: ProviderModelOption[]; expiresAt: number } | null = null
  private codexInFlight: Promise<ProviderModelOption[]> | null = null

  async list(provider: ProviderId): Promise<ProviderModelOption[]> {
    if (provider === 'claude') return cloneModels(PROVIDER_MODELS.claude)

    const now = Date.now()
    if (this.codexCache && this.codexCache.expiresAt > now) {
      return cloneModels(this.codexCache.models)
    }

    if (!this.codexInFlight) {
      this.codexInFlight = this.fetchCodexModels()
        .then((models) => {
          this.codexCache = {
            models,
            expiresAt: Date.now() + CODEX_MODEL_CACHE_TTL_MS
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

  private fetchCodexModels(): Promise<ProviderModelOption[]> {
    return new Promise((resolve, reject) => {
      const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
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
        child.kill('SIGTERM')
        fn()
      }

      const timeout = setTimeout(() => {
        finish(() => reject(new Error('Timed out querying Codex model catalog')))
      }, CODEX_APP_SERVER_TIMEOUT_MS)

      const send = (payload: object): void => {
        child.stdin.write(`${JSON.stringify(payload)}\n`)
      }

      child.on('error', (error) => {
        finish(() => reject(error))
      })

      child.on('exit', (code, signal) => {
        if (settled) return
        const detail = stderrBuffer.trim() || `code=${code ?? 'null'} signal=${signal ?? 'null'}`
        finish(() => reject(new Error(`Codex app-server exited before returning models (${detail})`)))
      })

      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
      })

      child.stdout.on('data', (chunk) => {
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
}

function cloneModels(models: ProviderModelOption[]): ProviderModelOption[] {
  return models.map((model) => ({
    ...model,
    reasoningEfforts: model.reasoningEfforts ? [...model.reasoningEfforts] : undefined
  }))
}
