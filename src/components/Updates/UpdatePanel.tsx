import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import type { AppUpdateState } from '@shared/types'
import styles from './UpdatePanel.module.css'

interface UpdatePanelProps {
  state: AppUpdateState
  onCheck: () => Promise<void>
  onDownload: () => Promise<void>
  onInstall: () => Promise<void>
  onRunBrewUpgrade?: () => Promise<void>
  onOpenDownload?: () => Promise<void>
  onClose: () => void
}

type ActionKey = 'check' | 'download' | 'install' | 'brew' | 'open'

export function UpdatePanel({
  state,
  onCheck,
  onDownload,
  onInstall,
  onRunBrewUpgrade,
  onOpenDownload,
  onClose
}: UpdatePanelProps) {
  const [busyAction, setBusyAction] = useState<ActionKey | null>(null)

  const runAction = async (action: ActionKey, handler: () => Promise<void>) => {
    setBusyAction(action)
    try {
      await handler()
    } finally {
      setBusyAction(null)
    }
  }

  const statusLabel = (() => {
    if (state.downloaded) return 'Update downloaded'
    if (state.downloading) return 'Downloading update...'
    if (state.checking) return 'Checking for updates...'
    if (state.available) return 'Update available'
    return 'Up to date'
  })()

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h2>App Updates</h2>
            <p>
              Current version: <strong>{state.currentVersion}</strong>
            </p>
          </div>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        {!state.supported ? (
          <div className={styles.message}>
            Update checks aren&apos;t available on this platform yet. Install the latest build
            manually from the releases page.
          </div>
        ) : (
          <>
            <div className={styles.meta}>
              <div>
                <span className={styles.label}>Status</span>
                <span className={styles.value}>{statusLabel}</span>
              </div>
              <div>
                <span className={styles.label}>Latest</span>
                <span className={styles.value}>{state.latestVersion ?? '—'}</span>
              </div>
              <div>
                <span className={styles.label}>Released</span>
                <span className={styles.value}>{formatDate(state.releaseDate)}</span>
              </div>
            </div>

            {state.error && <div className={styles.error}>{state.error}</div>}

            {state.releaseNotes && (
              <div className={styles.notes}>
                <h3>Release Notes</h3>
                <div className={styles.notesBody}>
                  <ReactMarkdown>{state.releaseNotes}</ReactMarkdown>
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <button
                className={styles.secondaryBtn}
                onClick={() => void runAction('check', onCheck)}
                disabled={state.checking || state.downloading || busyAction !== null}
                type="button"
              >
                {busyAction === 'check' ? 'Checking...' : 'Check for Updates'}
              </button>

              {state.canAutoInstall && state.available && !state.downloaded && (
                <button
                  className={styles.primaryBtn}
                  onClick={() => void runAction('download', onDownload)}
                  disabled={state.checking || state.downloading || busyAction !== null}
                  type="button"
                >
                  {state.downloading || busyAction === 'download' ? 'Downloading...' : 'Download Update'}
                </button>
              )}

              {state.canAutoInstall && state.downloaded && (
                <button
                  className={styles.primaryBtn}
                  onClick={() => void runAction('install', onInstall)}
                  disabled={busyAction !== null}
                  type="button"
                >
                  {busyAction === 'install' ? 'Installing...' : 'Install & Restart'}
                </button>
              )}

              {!state.canAutoInstall && state.available && state.installMethod === 'brew' && onRunBrewUpgrade && (
                <button
                  className={styles.primaryBtn}
                  onClick={() => void runAction('brew', onRunBrewUpgrade)}
                  disabled={busyAction !== null}
                  type="button"
                >
                  {busyAction === 'brew' ? 'Opening Terminal...' : 'Upgrade via brew'}
                </button>
              )}

              {!state.canAutoInstall && state.available && state.installMethod !== 'brew' && onOpenDownload && (
                <button
                  className={styles.primaryBtn}
                  onClick={() => void runAction('open', onOpenDownload)}
                  disabled={busyAction !== null || !state.downloadUrl}
                  type="button"
                >
                  {busyAction === 'open' ? 'Opening...' : 'Download'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}
