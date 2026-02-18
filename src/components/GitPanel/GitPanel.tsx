import { useState, useEffect, useCallback } from 'react'
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

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.panel} ${isExpanded ? styles.panelExpanded : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
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
