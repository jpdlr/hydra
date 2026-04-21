import { useEffect, useRef, useState, useCallback } from 'react'
import type { FreeTerminalLayout } from '@shared/types'
import { TerminalPane } from './TerminalPane'
import styles from './FreeTerminalPanel.module.css'

interface FreeTerminalPanelProps {
  projectDir: string
  onClose: () => void
}

export function FreeTerminalPanel({ projectDir, onClose }: FreeTerminalPanelProps) {
  const [layout, setLayout] = useState<FreeTerminalLayout | null>(null)
  const projectDirRef = useRef(projectDir)

  useEffect(() => {
    projectDirRef.current = projectDir
  }, [projectDir])

  useEffect(() => {
    let cancelled = false
    setLayout(null)

    const unsubLayout = window.hydra.onFreeTerminalLayoutChanged((pd, nextLayout) => {
      if (pd !== projectDirRef.current) return
      setLayout(nextLayout)
    })

    ;(async () => {
      try {
        const existing = await window.hydra.getFreeTerminalLayout(projectDir)
        if (cancelled) return
        if (existing.groups.length === 0) {
          // No terminals for this project — spawn one
          const { layout: spawned } = await window.hydra.spawnFreeTerminal(projectDir)
          if (cancelled) return
          setLayout(spawned)
        } else {
          setLayout(existing)
        }
      } catch {
        if (!cancelled) setLayout({ projectDir, groups: [], activeGroupId: null, panes: [] })
      }
    })()

    return () => {
      cancelled = true
      unsubLayout()
    }
  }, [projectDir])

  const activeGroup = layout?.groups.find((g) => g.id === layout.activeGroupId) ?? null

  const handleAddTerminal = useCallback(async () => {
    try {
      await window.hydra.spawnFreeTerminal(projectDir)
    } catch { /* noop */ }
  }, [projectDir])

  const handleSplit = useCallback(async () => {
    if (!activeGroup) return
    try {
      await window.hydra.spawnFreeTerminal(projectDir, { groupId: activeGroup.id })
    } catch { /* noop */ }
  }, [projectDir, activeGroup])

  const handleKillActive = useCallback(() => {
    if (!activeGroup) return
    const paneId = activeGroup.activePaneId
    if (!paneId) return
    window.hydra.killFreeTerminal(paneId)
  }, [activeGroup])

  const handleActivateGroup = useCallback((groupId: string) => {
    window.hydra.activateFreeTerminal(projectDir, groupId)
  }, [projectDir])

  const handleActivatePane = useCallback((groupId: string, paneId: string) => {
    window.hydra.activateFreeTerminal(projectDir, groupId, paneId)
  }, [projectDir])

  const paneLabel = (paneId: string): string =>
    layout?.panes.find((p) => p.id === paneId)?.label ?? ''

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>
          <TerminalIcon />
          {activeGroup
            ? paneLabel(activeGroup.activePaneId) || 'Terminal'
            : 'Terminal'}
        </span>
        <div className={styles.actions}>
          <button
            className={styles.actionBtn}
            onClick={handleSplit}
            title="Split terminal"
            disabled={!activeGroup}
          >
            <SplitIcon />
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleAddTerminal}
            title="New terminal"
          >
            +
          </button>
          <button
            className={styles.actionBtn}
            onClick={handleKillActive}
            title="Kill active terminal"
            disabled={!activeGroup}
          >
            <TrashIcon />
          </button>
          <button
            className={styles.actionBtn}
            onClick={onClose}
            title="Hide terminal (Cmd+J) — stays running"
          >
            ✕
          </button>
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.paneArea}>
          {layout && layout.groups.length === 0 && (
            <div className={styles.emptyState}>
              No terminals. Press <span className={styles.kbd}>+</span> to start one.
            </div>
          )}
          {layout?.groups.map((group) => (
            <div
              key={group.id}
              className={styles.groupPanes}
              style={{ display: group.id === layout.activeGroupId ? 'flex' : 'none' }}
            >
              {group.paneIds.map((paneId) => (
                <TerminalPaneHost
                  key={paneId}
                  paneId={paneId}
                  projectDir={projectDir}
                  isActive={paneId === group.activePaneId}
                  onClick={() => handleActivatePane(group.id, paneId)}
                />
              ))}
            </div>
          ))}
        </div>
        {layout && layout.groups.length > 0 && (
          <div className={styles.tabList}>
            {layout.groups.map((group, index) => {
              const active = group.id === layout.activeGroupId
              const primaryLabel = paneLabel(group.activePaneId) || `Terminal ${index + 1}`
              return (
                <button
                  key={group.id}
                  className={`${styles.tab} ${active ? styles.tabActive : ''}`}
                  onClick={() => handleActivateGroup(group.id)}
                  title={primaryLabel}
                >
                  <TerminalIcon />
                  <span className={styles.tabLabel}>{primaryLabel}</span>
                  {group.paneIds.length > 1 && (
                    <span className={styles.tabBadge}>{group.paneIds.length}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

interface TerminalPaneHostProps {
  paneId: string
  projectDir: string
  isActive: boolean
  onClick: () => void
}

function TerminalPaneHost({ paneId, projectDir, isActive, onClick }: TerminalPaneHostProps) {
  const [rawOutput, setRawOutput] = useState('')
  const [exited, setExited] = useState(false)
  const paneIdRef = useRef(paneId)

  useEffect(() => {
    paneIdRef.current = paneId
  }, [paneId])

  useEffect(() => {
    let cancelled = false

    const unsubOutput = window.hydra.onFreeTerminalOutput((tid, _pd, data) => {
      if (tid !== paneIdRef.current) return
      setRawOutput((prev) => prev + data)
    })
    const unsubExit = window.hydra.onFreeTerminalExit((tid) => {
      if (tid !== paneIdRef.current) return
      setExited(true)
    })

    ;(async () => {
      try {
        const existing = await window.hydra.getFreeTerminalBuffer(paneId)
        if (cancelled) return
        if (existing.exists) {
          setRawOutput(existing.data)
        }
      } catch { /* noop */ }
    })()

    return () => {
      cancelled = true
      unsubOutput()
      unsubExit()
    }
  }, [paneId])

  const handleData = useCallback((data: string) => {
    window.hydra.sendFreeTerminalInput(paneId, data)
  }, [paneId])

  const handleResize = useCallback((cols: number, rows: number) => {
    window.hydra.resizeFreeTerminal(paneId, cols, rows)
  }, [paneId])

  return (
    <div
      className={`${styles.pane} ${isActive ? styles.paneActive : ''}`}
      onClick={onClick}
    >
      <TerminalPane
        rawOutput={rawOutput}
        onData={handleData}
        onResize={handleResize}
        fontSize={12}
        isVisible={isActive}
      />
      {exited && (
        <div className={styles.exitedBadge}>
          Exited · [{projectDir.split('/').pop() || ''}]
        </div>
      )}
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

function SplitIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="5" height="10" rx="1" />
      <rect x="9" y="3" width="5" height="10" rx="1" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 4h10" />
      <path d="M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
      <path d="M4 4l1 9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l1-9" />
    </svg>
  )
}
