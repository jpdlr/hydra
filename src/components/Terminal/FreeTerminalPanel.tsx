import { useEffect, useRef, useState, useCallback } from 'react'
import { TerminalPane } from './TerminalPane'
import styles from './FreeTerminalPanel.module.css'

interface FreeTerminalPanelProps {
  projectDir: string
  onClose: () => void
}

export function FreeTerminalPanel({ projectDir, onClose }: FreeTerminalPanelProps) {
  const [rawOutput, setRawOutput] = useState('')
  const [spawned, setSpawned] = useState(false)
  const [exited, setExited] = useState(false)
  const spawnedRef = useRef(false)

  // Spawn the shell on mount
  useEffect(() => {
    if (spawnedRef.current) return
    spawnedRef.current = true

    window.hydra.spawnFreeTerminal(projectDir).then(() => {
      setSpawned(true)
    }).catch(() => {
      setExited(true)
    })

    const unsubOutput = window.hydra.onFreeTerminalOutput((data) => {
      setRawOutput((prev) => prev + data)
    })

    const unsubExit = window.hydra.onFreeTerminalExit(() => {
      setExited(true)
    })

    return () => {
      unsubOutput()
      unsubExit()
      window.hydra.killFreeTerminal()
    }
  }, [projectDir])

  const handleData = useCallback((data: string) => {
    window.hydra.sendFreeTerminalInput(data)
  }, [])

  const handleResize = useCallback((cols: number, rows: number) => {
    window.hydra.resizeFreeTerminal(cols, rows)
  }, [])

  const handleRestart = useCallback(() => {
    setRawOutput('')
    setExited(false)
    window.hydra.spawnFreeTerminal(projectDir).then(() => {
      setSpawned(true)
    }).catch(() => {
      setExited(true)
    })
  }, [projectDir])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>
          <TerminalIcon />
          Terminal
        </span>
        <div className={styles.actions}>
          {exited && (
            <button className={styles.actionBtn} onClick={handleRestart} title="Restart terminal">
              ↻
            </button>
          )}
          <button className={styles.actionBtn} onClick={onClose} title="Close terminal (Cmd+J)">
            ✕
          </button>
        </div>
      </div>
      <div className={styles.terminalArea}>
        {spawned && (
          <TerminalPane
            rawOutput={rawOutput}
            onData={handleData}
            onResize={handleResize}
            fontSize={12}
          />
        )}
        {exited && (
          <div className={styles.exitedOverlay}>
            Terminal exited. Press ↻ to restart.
          </div>
        )}
      </div>
    </div>
  )
}

function TerminalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M2 4l4 4-4 4" />
      <path d="M8 12h6" />
    </svg>
  )
}
