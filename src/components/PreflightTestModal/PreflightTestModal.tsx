import { useState, useEffect, useCallback, useRef } from 'react'
import { TerminalPane } from '../Terminal/TerminalPane'
import styles from './PreflightTestModal.module.css'

interface PreflightTestModalProps {
  onClose: () => void
  onRetryPreflight: () => void
}

export function PreflightTestModal({ onClose, onRetryPreflight }: PreflightTestModalProps) {
  const [rawOutput, setRawOutput] = useState('')
  const [exited, setExited] = useState(false)
  const spawnedRef = useRef(false)
  const handleClose = useCallback(() => {
    onRetryPreflight()
    onClose()
  }, [onClose, onRetryPreflight])

  useEffect(() => {
    if (spawnedRef.current) return
    spawnedRef.current = true

    // Register listeners BEFORE spawning to avoid missing the shell prompt
    const unsubs = [
      window.hydra.onTestTerminalOutput((data) => {
        setRawOutput((prev) => prev + data)
      }),
      window.hydra.onTestTerminalExit(() => {
        setExited(true)
      })
    ]

    window.hydra.spawnTestTerminal()

    return () => {
      unsubs.forEach((fn) => fn())
      window.hydra.killTestTerminal()
    }
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const handleData = useCallback((data: string) => {
    window.hydra.sendTestTerminalInput(data)
  }, [])

  const handleResize = useCallback((cols: number, rows: number) => {
    window.hydra.resizeTestTerminal(cols, rows)
  }, [])

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h12v10H2z" />
                <path d="M5 7l2 2-2 2" />
                <path d="M9 11h3" />
              </svg>
            </div>
            <div className={styles.headerText}>
              <h3>Test Terminal</h3>
              <p className={styles.hint}>
                Run <code>claude --version</code> to verify the CLI is available.
              </p>
            </div>
          </div>
          <button className={styles.closeIcon} onClick={handleClose} title="Close (Esc)">
            ✕
          </button>
        </div>
        <div className={styles.terminalContainer}>
          <TerminalPane
            rawOutput={rawOutput}
            onData={handleData}
            onResize={handleResize}
            fontSize={12}
          />
        </div>
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {exited && (
              <span className={styles.exitedLabel}>
                <span className={styles.exitedDot} />
                Shell exited
              </span>
            )}
          </div>
          <button className={styles.doneBtn} onClick={handleClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
