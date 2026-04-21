import { useEffect, useState } from 'react'
import type { AppUpdateState } from '@shared/types'
import styles from './UpdateBanner.module.css'

interface UpdateBannerProps {
  state: AppUpdateState
  onDownload: () => Promise<AppUpdateState>
  onInstall: () => Promise<boolean>
  onRunBrewUpgrade: () => Promise<{ ok: boolean; error?: string }>
  onOpenDownload: () => Promise<{ ok: boolean; error?: string }>
}

const DISMISSED_STORAGE_KEY = 'hydra:update-banner:dismissed-version'

export function UpdateBanner({
  state,
  onDownload,
  onInstall,
  onRunBrewUpgrade,
  onOpenDownload
}: UpdateBannerProps) {
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISSED_STORAGE_KEY)
    } catch {
      return null
    }
  })
  const [busy, setBusy] = useState<'download' | 'install' | 'brew' | 'open' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Reset transient action error when the latest version changes.
  useEffect(() => {
    setActionError(null)
  }, [state.latestVersion])

  if (!state.available || !state.latestVersion) return null
  if (dismissed === state.latestVersion) return null

  const dismiss = () => {
    try {
      if (state.latestVersion) {
        localStorage.setItem(DISMISSED_STORAGE_KEY, state.latestVersion)
      }
    } catch {
      // Ignore storage errors.
    }
    setDismissed(state.latestVersion)
  }

  const runAction = async <T,>(
    key: 'download' | 'install' | 'brew' | 'open',
    fn: () => Promise<T>
  ) => {
    setBusy(key)
    setActionError(null)
    try {
      const result = (await fn()) as { ok?: boolean; error?: string } | unknown
      if (result && typeof result === 'object' && 'ok' in result && !(result as { ok?: boolean }).ok) {
        const message = (result as { error?: string }).error
        if (message) setActionError(message)
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  const primaryAction = () => {
    if (state.canAutoInstall) {
      if (state.downloaded) {
        return {
          label: busy === 'install' ? 'Installing...' : 'Install & restart',
          handler: () => runAction('install', onInstall),
          disabled: busy !== null
        }
      }
      return {
        label: state.downloading || busy === 'download' ? 'Downloading...' : 'Download update',
        handler: () => runAction('download', onDownload),
        disabled: busy !== null || state.downloading
      }
    }
    if (state.installMethod === 'brew') {
      return {
        label: busy === 'brew' ? 'Opening Terminal...' : 'Upgrade via brew',
        handler: () => runAction('brew', onRunBrewUpgrade),
        disabled: busy !== null
      }
    }
    // direct or unknown
    return {
      label: busy === 'open' ? 'Opening...' : 'Download',
      handler: () => runAction('open', onOpenDownload),
      disabled: busy !== null || !state.downloadUrl
    }
  }

  const action = primaryAction()

  return (
    <div className={styles.container} role="status" aria-live="polite">
      <div className={styles.toast}>
        <div className={styles.icon} aria-hidden="true" />
        <div className={styles.content}>
          <p className={styles.title}>Hydra {state.latestVersion} available</p>
          <p className={styles.body}>
            You&apos;re on {state.currentVersion}.
            {state.installMethod === 'brew' && !state.canAutoInstall && ' Installed via Homebrew.'}
          </p>
          {actionError && <p className={styles.error}>{actionError}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void action.handler()}
              disabled={action.disabled}
            >
              {action.label}
            </button>
            {state.releaseUrl && (
              <a
                className={styles.linkBtn}
                href={state.releaseUrl}
                target="_blank"
                rel="noreferrer"
              >
                Release notes
              </a>
            )}
          </div>
        </div>
        <button type="button" className={styles.dismiss} onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  )
}
