import { useState, useCallback } from 'react'
import type { ViewMode } from '@shared/types'

export function useViewMode(defaultMode: ViewMode = 'chat') {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultMode)

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'chat' ? 'grid' : 'chat'))
  }, [])

  return { viewMode, setViewMode, toggleViewMode }
}
