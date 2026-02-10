import { useState, useEffect, useCallback } from 'react'
import type { FsDirEntry } from '@shared/types'
import { getFileIcon } from './fileIcons'
import styles from './FileTree.module.css'

interface FileTreeProps {
  agentId: string
  rootPath: string
  activeFilePath: string | null
  onOpenFile: (path: string) => void
}

interface TreeNodeData {
  entry: FsDirEntry
  path: string
  depth: number
}

export function FileTree({ agentId, rootPath, activeFilePath, onOpenFile }: FileTreeProps) {
  const [rootEntries, setRootEntries] = useState<FsDirEntry[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [childrenCache, setChildrenCache] = useState<Map<string, FsDirEntry[]>>(new Map())
  const [loading, setLoading] = useState(true)

  const loadDir = useCallback(
    async (dirPath: string) => {
      try {
        const entries = await window.hydra.readDir(agentId, dirPath)
        return entries
      } catch {
        return []
      }
    },
    [agentId]
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadDir('.').then((entries) => {
      if (!cancelled) {
        setRootEntries(entries)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [agentId, rootPath, loadDir])

  // Listen for file system changes and refresh
  useEffect(() => {
    const unsub = window.hydra.onFsWatchEvent((payload) => {
      if (payload.agentId !== agentId) return
      // Refresh root and any expanded directories
      loadDir('.').then(setRootEntries)
      for (const dir of expandedDirs) {
        loadDir(dir).then((entries) => {
          setChildrenCache((prev) => {
            const next = new Map(prev)
            next.set(dir, entries)
            return next
          })
        })
      }
    })
    return unsub
  }, [agentId, expandedDirs, loadDir])

  const handleToggleDir = useCallback(
    async (dirPath: string) => {
      const next = new Set(expandedDirs)
      if (next.has(dirPath)) {
        next.delete(dirPath)
      } else {
        next.add(dirPath)
        if (!childrenCache.has(dirPath)) {
          const entries = await loadDir(dirPath)
          setChildrenCache((prev) => {
            const m = new Map(prev)
            m.set(dirPath, entries)
            return m
          })
        }
      }
      setExpandedDirs(next)
    },
    [expandedDirs, childrenCache, loadDir]
  )

  const handleClickEntry = useCallback(
    (entry: FsDirEntry, path: string) => {
      if (entry.isDirectory) {
        void handleToggleDir(path)
      } else {
        onOpenFile(path)
      }
    },
    [handleToggleDir, onOpenFile]
  )

  if (loading) {
    return (
      <div className={styles.tree}>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  function renderEntries(entries: FsDirEntry[], parentPath: string, depth: number) {
    return entries.map((entry) => {
      const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name
      const isExpanded = expandedDirs.has(entryPath)
      const isActive = activeFilePath === entryPath
      const children = childrenCache.get(entryPath)

      return (
        <div key={entryPath}>
          <button
            className={`${styles.node} ${isActive ? styles.nodeActive : ''}`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => handleClickEntry(entry, entryPath)}
            title={entryPath}
          >
            {entry.isDirectory && (
              <span className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}>
                <ChevronIcon />
              </span>
            )}
            <span className={styles.icon}>{getFileIcon(entry)}</span>
            <span className={styles.name}>{entry.name}</span>
          </button>
          {entry.isDirectory && isExpanded && children && (
            <div>{renderEntries(children, entryPath, depth + 1)}</div>
          )}
        </div>
      )
    })
  }

  return (
    <div className={styles.tree}>
      {rootEntries.length === 0 ? (
        <div className={styles.empty}>No files found</div>
      ) : (
        renderEntries(rootEntries, '', 0)
      )}
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
      <path d="M3 2l4 3-4 3z" />
    </svg>
  )
}

