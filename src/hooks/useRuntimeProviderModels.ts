import { useCallback, useEffect, useState } from 'react'
import {
  PROVIDER_MODELS,
  getDefaultModelForProvider,
  type ModelId,
  type ProviderId,
  type ProviderModelOption
} from '@shared/types'

const PROVIDERS: ProviderId[] = ['claude', 'codex', 'opencode']

export function useRuntimeProviderModels() {
  const [providerModels, setProviderModels] = useState<Record<ProviderId, ProviderModelOption[]>>({
    claude: PROVIDER_MODELS.claude,
    codex: PROVIDER_MODELS.codex,
    opencode: PROVIDER_MODELS.opencode
  })

  useEffect(() => {
    if (typeof window.hydra.listProviderModels !== 'function') return

    let cancelled = false

    void Promise.all(
      PROVIDERS.map(async (provider) => {
        try {
          const models = await window.hydra.listProviderModels(provider)
          if (!cancelled && models.length > 0) {
            setProviderModels((current) => ({
              ...current,
              [provider]: models
            }))
          }
        } catch {
          // Keep static fallback models when runtime discovery fails.
        }
      })
    )

    return () => {
      cancelled = true
    }
  }, [])

  const getDefaultModel = useCallback((provider: ProviderId): ModelId => {
    const runtimeModels = providerModels[provider]
    return (
      runtimeModels.find((model) => model.isDefault)?.id ??
      runtimeModels[0]?.id ??
      getDefaultModelForProvider(provider)
    )
  }, [providerModels])

  const getModelOption = useCallback((provider: ProviderId, modelId: string): ProviderModelOption | null => {
    return providerModels[provider].find((model) => model.id === modelId) ?? null
  }, [providerModels])

  return {
    providerModels,
    getDefaultModel,
    getModelOption
  }
}
