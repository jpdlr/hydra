import { useState, useEffect, useCallback, useRef } from 'react'
import type { GitStatus, GitCommit, ProviderId, ModelId } from '@shared/types'
import { ChangesTab } from './ChangesTab'
import { BranchesTab } from './BranchesTab'
import { PrReviewTab } from './PrReviewTab'
import styles from './GitPanel.module.css'

type GitTab = 'changes' | 'branches' | 'pr-review'

const TAB_LABELS: Record<GitTab, string> = {
  changes: 'Changes',
  branches: 'Branches',
  'pr-review': 'PR Review'
}

interface GitPanelProps {
  projectDir: string
  theme: string
  defaultProvider: ProviderId
  defaultModel: ModelId
  onClose: () => void
}

export function GitPanel({
  projectDir,
  theme,
  defaultProvider,
  defaultModel,
  onClose
}: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<GitTab>('changes')
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const COLLAPSED_WIDTH = 480
  const EXPANDED_WIDTH = 900
  const MIN_WIDTH = 360
  const getMaxWidth = () =>
    typeof window !== 'undefined' ? window.innerWidth : 4000

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('hydra.gitPanel.width')
      if (saved) return Math.max(MIN_WIDTH, Math.min(getMaxWidth(), parseInt(saved, 10)))
    } catch {
      // ignore
    }
    return COLLAPSED_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)
  const userResizedRef = useRef(false)
  const resizeStartRef = useRef({ x: 0, w: 0 })

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const [s, c] = await Promise.all([
        window.hydra.getGitStatus(projectDir),
        window.hydra.getGitLog(projectDir, 20)
      ])
      setStatus(s)
      setCommits(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not a git repository')
    }
  }, [projectDir])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isExpanded = expanded || activeTab === 'pr-review'

  // Auto-bump width when entering expanded state (diff/PR review), but never
  // shrink the user's chosen width. Once the user drags, they own it.
  useEffect(() => {
    if (userResizedRef.current) return
    if (isExpanded && panelWidth < EXPANDED_WIDTH) setPanelWidth(EXPANDED_WIDTH)
    if (!isExpanded && panelWidth > COLLAPSED_WIDTH) setPanelWidth(COLLAPSED_WIDTH)
  }, [isExpanded, panelWidth])

  const handlePanelResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizeStartRef.current = { x: e.clientX, w: panelWidth }
      setIsResizing(true)
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onMove = (ev: PointerEvent) => {
        // Panel sits on the right; dragging left grows it.
        const delta = resizeStartRef.current.x - ev.clientX
        const next = Math.min(getMaxWidth(), Math.max(MIN_WIDTH, resizeStartRef.current.w + delta))
        setPanelWidth(next)
      }
      const onUp = () => {
        setIsResizing(false)
        userResizedRef.current = true
        try {
          localStorage.setItem('hydra.gitPanel.width', String(resizeStartRef.current.w))
        } catch {
          // ignore
        }
        target.releasePointerCapture(e.pointerId)
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
    },
    [panelWidth]
  )

  // Persist on every settled change (covers the auto-bump + drag end).
  useEffect(() => {
    try {
      localStorage.setItem('hydra.gitPanel.width', String(panelWidth))
    } catch {
      // ignore
    }
  }, [panelWidth])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.panel} ${isResizing ? '' : styles.panelTransition}`}
        style={{ width: panelWidth }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`${styles.panelResize} ${isResizing ? styles.panelResizeActive : ''}`}
          onPointerDown={handlePanelResizeDown}
          title="Drag to resize"
        />
        <div className={styles.header}>
          <h2>Git</h2>
          {status && (
            <>
              <span className={styles.branchName}>{status.branch}</span>
              {status.ahead > 0 && (
                <span className={`${styles.badge} ${styles.badgeAhead}`}>+{status.ahead}</span>
              )}
              {status.behind > 0 && (
                <span className={`${styles.badge} ${styles.badgeBehind}`}>-{status.behind}</span>
              )}
            </>
          )}
          <button className={styles.refreshBtn} onClick={() => void refresh()} title="Refresh">
            ↻
          </button>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.tabBar}>
          <div className={styles.segmented}>
            {(Object.keys(TAB_LABELS) as GitTab[]).map((tab) => (
              <button
                key={tab}
                className={`${styles.segment} ${activeTab === tab ? styles.active : ''}`}
                onClick={() => {
                  setActiveTab(tab)
                  if (tab !== 'changes') setExpanded(false)
                }}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {activeTab === 'changes' && (
            <ChangesTab
              projectDir={projectDir}
              theme={theme}
              status={status}
              commits={commits}
              onRefresh={refresh}
              onExpandedChange={setExpanded}
            />
          )}
          {activeTab === 'branches' && (
            <BranchesTab projectDir={projectDir} onRefresh={refresh} />
          )}
          {activeTab === 'pr-review' && (
            <PrReviewTab
              projectDir={projectDir}
              theme={theme}
              defaultProvider={defaultProvider}
              defaultModel={defaultModel}
            />
          )}
        </div>
      </div>
    </div>
  )
}
