import type { ObservabilityLogEventPayload } from '@shared/types'

export function createTraceId(prefix = 'ui'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}

export function logEvent(payload: ObservabilityLogEventPayload): void {
  try {
    window.hydra.logEvent(payload)
  } catch {
    // Best effort logging from renderer only.
  }
}
