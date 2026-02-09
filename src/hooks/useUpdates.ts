import { useCallback, useEffect, useState } from 'react'
import type { AppUpdateState } from '@shared/types'

const EMPTY_STATE: AppUpdateState = {
  supported: false,
  platform: 'darwin',
  checking: false,
  available: false,
  downloaded: false,
  downloading: false,
  currentVersion: '0.0.0',
  latestVersion: null,
  releaseDate: null,
  releaseNotes: null,
  error: null
}

export function useUpdates() {
  const [state, setState] = useState<AppUpdateState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    window.hydra
      .getUpdateState()
      .then((next) => {
        if (!cancelled) {
          setState(next)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    const unsubscribe = window.hydra.onUpdateStateChange((next) => {
      setState(next)
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const check = useCallback(async () => {
    const next = await window.hydra.checkForUpdates()
    setState(next)
    return next
  }, [])

  const download = useCallback(async () => {
    const next = await window.hydra.downloadUpdate()
    setState(next)
    return next
  }, [])

  const install = useCallback(async () => {
    return window.hydra.installUpdateAndRestart()
  }, [])

  return { updateState: state, loading, check, download, install }
}

