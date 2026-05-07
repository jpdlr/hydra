import { useSyncExternalStore } from 'react'

export type FeatureFlagKey = 'experimentalViews'

const STORAGE_PREFIX = 'hydra.featureFlag.'

const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  experimentalViews: true
}

const listeners = new Set<() => void>()

function read(key: FeatureFlagKey): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === null) return DEFAULTS[key]
    return raw === 'true'
  } catch {
    return DEFAULTS[key]
  }
}

export function getFeatureFlag(key: FeatureFlagKey): boolean {
  return read(key)
}

export function setFeatureFlag(key: FeatureFlagKey, value: boolean): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(value))
  } catch {
    // ignore — fall back to default on next read
  }
  for (const l of listeners) l()
}

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => read(key),
    () => DEFAULTS[key]
  )
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { hydraFlags?: unknown }).hydraFlags = {
    get: getFeatureFlag,
    set: setFeatureFlag,
    list: () => Object.keys(DEFAULTS) as FeatureFlagKey[]
  }
}
