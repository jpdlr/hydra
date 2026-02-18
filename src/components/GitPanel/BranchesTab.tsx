import { useState, useEffect, useCallback } from 'react'
import type { GitBranch } from '@shared/types'
import styles from './BranchesTab.module.css'

interface BranchesTabProps {
  projectDir: string
  onRefresh: () => Promise<void>
}

export function BranchesTab({ projectDir, onRefresh }: BranchesTabProps) {
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [creating, setCreating] = useState(false)

  const loadBranches = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.hydra.gitListBranches(projectDir)
      setBranches(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list branches')
    } finally {
      setLoading(false)
    }
  }, [projectDir])

  useEffect(() => {
    void loadBranches()
  }, [loadBranches])

  const handleCheckout = useCallback(
    async (branchName: string) => {
      setSwitching(branchName)
      setError(null)
      try {
        await window.hydra.gitCheckout(projectDir, branchName)
        await loadBranches()
        await onRefresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Checkout failed')
      } finally {
        setSwitching(null)
      }
    },
    [projectDir, loadBranches, onRefresh]
  )

  const handleCreate = useCallback(async () => {
    if (!newBranchName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await window.hydra.gitCreateBranch(projectDir, newBranchName.trim())
      setNewBranchName('')
      setShowCreate(false)
      await loadBranches()
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch')
    } finally {
      setCreating(false)
    }
  }, [projectDir, newBranchName, loadBranches, onRefresh])

  const filtered = filter
    ? branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    : branches

  const currentBranch = branches.find((b) => b.isCurrent)

  return (
    <div className={styles.container}>
      {error && <div className={styles.error}>{error}</div>}

      {currentBranch && (
        <div className={styles.currentBranch}>
          <span className={styles.currentLabel}>Current branch</span>
          <span className={styles.currentName}>{currentBranch.name}</span>
          {currentBranch.upstream && (
            <span className={styles.upstream}>
              &rarr; {currentBranch.upstream}
              {currentBranch.aheadOfUpstream > 0 && (
                <span className={styles.badgeAhead}>+{currentBranch.aheadOfUpstream}</span>
              )}
              {currentBranch.behindUpstream > 0 && (
                <span className={styles.badgeBehind}>-{currentBranch.behindUpstream}</span>
              )}
            </span>
          )}
        </div>
      )}

      <div className={styles.toolbar}>
        <input
          className={styles.filterInput}
          type="text"
          placeholder="Filter branches..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          className={styles.newBranchBtn}
          onClick={() => setShowCreate(!showCreate)}
        >
          {showCreate ? 'Cancel' : '+ New'}
        </button>
      </div>

      {showCreate && (
        <div className={styles.createForm}>
          <input
            className={styles.createInput}
            type="text"
            placeholder="Branch name..."
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
              if (e.key === 'Escape') {
                setShowCreate(false)
                setNewBranchName('')
              }
            }}
            autoFocus
          />
          <button
            className={styles.createBtn}
            disabled={!newBranchName.trim() || creating}
            onClick={() => void handleCreate()}
          >
            {creating ? 'Creating...' : 'Create & Switch'}
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Loading branches...</div>
      ) : (
        <div className={styles.branchList}>
          <span className={styles.sectionLabel}>
            Local Branches ({filtered.length})
          </span>
          {filtered.map((branch) => (
            <button
              key={branch.name}
              className={`${styles.branchItem} ${branch.isCurrent ? styles.branchItemCurrent : ''}`}
              onClick={() => {
                if (!branch.isCurrent) void handleCheckout(branch.name)
              }}
              disabled={branch.isCurrent || switching !== null}
            >
              <span className={styles.branchIndicator}>
                {branch.isCurrent ? '●' : ''}
              </span>
              <span className={styles.branchName}>{branch.name}</span>
              {branch.upstream && (
                <span className={styles.branchUpstream}>{branch.upstream}</span>
              )}
              {branch.aheadOfUpstream > 0 && (
                <span className={styles.badgeAhead}>+{branch.aheadOfUpstream}</span>
              )}
              {branch.behindUpstream > 0 && (
                <span className={styles.badgeBehind}>-{branch.behindUpstream}</span>
              )}
              {switching === branch.name && (
                <span className={styles.switchingLabel}>switching...</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
