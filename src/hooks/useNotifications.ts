import { useState, useEffect, useCallback, useRef } from 'react'
import type { HydraNotification } from '@shared/types'

const MAX_VISIBLE = 5
const AUTO_DISMISS_MS = 6000

export function useNotifications() {
  const [notifications, setNotifications] = useState<HydraNotification[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    window.hydra.dismissNotification(id)
  }, [])

  useEffect(() => {
    const unsubscribe = window.hydra.onNotification((notification: HydraNotification) => {
      setNotifications((prev) => {
        const next = [...prev, notification]
        if (next.length > MAX_VISIBLE) {
          const removed = next.shift()
          if (removed) {
            const timer = timers.current.get(removed.id)
            if (timer) {
              clearTimeout(timer)
              timers.current.delete(removed.id)
            }
          }
        }
        return next
      })

      // Auto-dismiss after timeout
      const timer = setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== notification.id))
        timers.current.delete(notification.id)
      }, AUTO_DISMISS_MS)
      timers.current.set(notification.id, timer)
    })

    return () => {
      unsubscribe()
      for (const timer of timers.current.values()) {
        clearTimeout(timer)
      }
      timers.current.clear()
    }
  }, [])

  return { notifications, dismiss }
}
