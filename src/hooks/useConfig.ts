import { useState, useEffect, useCallback } from 'react'
import type { AppConfig, ThemeId, ViewMode } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'

export function useConfig() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.hydra.getConfig().then((c) => {
      setConfig(c)
      setLoading(false)
      document.documentElement.setAttribute('data-theme', c.theme)
    })

    const unsub = window.hydra.onConfigChange((updated) => {
      setConfig(updated)
      document.documentElement.setAttribute('data-theme', updated.theme)
    })

    return unsub
  }, [])

  const updateConfig = useCallback(async (partial: Partial<AppConfig>) => {
    const updated = await window.hydra.setConfig(partial)
    setConfig(updated)
    return updated
  }, [])

  const setTheme = useCallback(
    (theme: ThemeId) => updateConfig({ theme }),
    [updateConfig]
  )

  const setViewMode = useCallback(
    (defaultViewMode: ViewMode) => updateConfig({ defaultViewMode }),
    [updateConfig]
  )

  return { config, loading, updateConfig, setTheme, setViewMode }
}
