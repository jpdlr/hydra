import { useState, useEffect, useCallback } from 'react'
import type { RemoteControlState } from '@shared/types'

const INITIAL_STATE: RemoteControlState = {
  enabled: false,
  status: 'creating',
  sessionId: null,
  qrPayload: null,
  connectedAt: null,
  expiresAt: null,
  mobileConnected: false,
  error: null
}

export function useRemoteControl() {
  const [state, setState] = useState<RemoteControlState>(INITIAL_STATE)
  const [loading, setLoading] = useState(false)

  // Fetch initial state
  useEffect(() => {
    window.hydra.getRemoteControlState().then(setState).catch(() => {/* ignore */})
  }, [])

  // Subscribe to state changes
  useEffect(() => {
    return window.hydra.onRemoteStateChange((newState) => {
      setState(newState)
      setLoading(false)
    })
  }, [])

  const enable = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.hydra.enableRemoteControl()
      setState(result)
    } finally {
      setLoading(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.hydra.disableRemoteControl()
      setState(result)
    } finally {
      setLoading(false)
    }
  }, [])

  return { state, loading, enable, disable }
}
