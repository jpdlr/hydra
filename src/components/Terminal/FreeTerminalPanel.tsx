import { useEffect, useRef, useState, useCallback } from 'react'
import { TerminalPane } from './TerminalPane'
import styles from './FreeTerminalPanel.module.css'

interface FreeTerminalPanelProps {
  projectDir: string
  onClose: () => void
}

export function FreeTerminalPanel({ projectDir, onClose }: FreeTerminalPanelProps) {
  const [rawOutput, setRawOutput] = useState('')
  const [ready, setReady] = useState(false)
  const [exited, setExited] = useState(false)
  const projectDirRef = useRef(projectDir)

  useEffect(() => {
    projectDirRef.current = projectDir
  }, [projectDir])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setExited(false)
    setRawOutput('')

    const unsubOutput = window.hydra.onFreeTerminalOutput((pd, data) => {
      if (pd !== projectDirRef.current) return
      setRawOutput((prev) => prev + data)
    })

    const unsubExit = window.hydra.onFreeTerminalExit((pd) => {
      if (pd !== projectDirRef.current) return
      setExited(true)
    })

    ;(async () => {
      try {
        const existing = await window.hydra.getFreeTerminalBuffer(projectDir)
        if (cancelled) return
        if (existing.exists) {
          setRawOutput(existing.data)
          setReady(true)
          return
        }
        await window.hydra.spawnFreeTerminal(projectDir)
        if (cancelled) return
        setReady(true)
      } catch {
        if (!cancelled) setExited(true)
      }
    })()

    return () => {
      cancelled = true
      unsubOutput()
      unsubExit()
      // Note: do NOT kill the terminal here — it keeps running in the daemon.
    }
  }, [projectDir])

  const handleData = useCallback((data: string) => {
    window.hydra.sendFreeTerminalInput(projectDir, data)
  }, [projectDir])

  const handleResize = useCallback((cols: number, rows: number) => {
    window.hydra.resizeFreeTerminal(projectDir, cols, rows)
  }, [projectDir])

  const handleRestart = useCallback(() => {
    setRawOutput('')
    setExited(false)
    setReady(false)
    window.hydra.spawnFreeTerminal(projectDir).then(() => {
      setReady(true)
    }).catch(() => {
      setExited(true)
    })
  }, [projectDir])

  const handleKill = useCallback(() => {
    window.hydra.killFreeTerminal(projectDir)
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
          {!exited && ready && (
            <button className={styles.actionBtn} onClick={handleKill} title="Kill terminal process">
              ⏻
            </button>
          )}
          <button className={styles.actionBtn} onClick={onClose} title="Hide terminal (Cmd+J) — stays running">
            ✕
          </button>
        </div>
      </div>
      <div className={styles.terminalArea}>
        {ready && (
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
