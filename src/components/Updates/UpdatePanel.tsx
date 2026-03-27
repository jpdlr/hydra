import { useState } from 'react'
import type { AppUpdateState } from '@shared/types'
import styles from './UpdatePanel.module.css'

interface UpdatePanelProps {
  state: AppUpdateState
  onCheck: () => Promise<void>
  onDownload: () => Promise<void>
  onInstall: () => Promise<void>
  onClose: () => void
}

export function UpdatePanel({ state, onCheck, onDownload, onInstall, onClose }: UpdatePanelProps) {
  const [busyAction, setBusyAction] = useState<'check' | 'download' | 'install' | null>(null)

  const runAction = async (
    action: 'check' | 'download' | 'install',
    handler: () => Promise<void>
  ) => {
    setBusyAction(action)
    try {
      await handler()
    } finally {
      setBusyAction(null)
    }
  }

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
            Automatic in-app updates are currently enabled for Windows only. macOS support is planned.
          </div>
        ) : (
          <>
            <div className={styles.meta}>
              <div>
                <span className={styles.label}>Status</span>
                <span className={styles.value}>
                  {state.downloaded
                    ? 'Update downloaded'
                    : state.downloading
                      ? 'Downloading update...'
                      : state.checking
                        ? 'Checking for updates...'
                        : state.available
                          ? 'Update available'
                          : 'Up to date'}
                </span>
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
                <div
                  className={styles.notesBody}
                  dangerouslySetInnerHTML={{ __html: state.releaseNotes }}
                />
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

              {state.available && !state.downloaded && (
                <button
                  className={styles.primaryBtn}
                  onClick={() => void runAction('download', onDownload)}
                  disabled={state.checking || state.downloading || busyAction !== null}
                  type="button"
                >
                  {state.downloading || busyAction === 'download' ? 'Downloading...' : 'Download Update'}
                </button>
              )}

              {state.downloaded && (
                <button
                  className={styles.primaryBtn}
                  onClick={() => void runAction('install', onInstall)}
                  disabled={busyAction !== null}
                  type="button"
                >
                  {busyAction === 'install' ? 'Installing...' : 'Install & Restart'}
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

