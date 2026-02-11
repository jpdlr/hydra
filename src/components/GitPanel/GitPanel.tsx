import { useState, useEffect, useCallback } from 'react'
import type { GitStatus, GitCommit } from '@shared/types'
import styles from './GitPanel.module.css'

interface GitPanelProps {
  projectDir: string
  onClose: () => void
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function GitPanel({ projectDir, onClose }: GitPanelProps) {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [diff, setDiff] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [commitMsg, setCommitMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  const handleSelectFile = useCallback(
    async (file: string) => {
      setSelectedFile(file)
      try {
        const d = await window.hydra.getGitDiff(projectDir, file)
        setDiff(d || '(no changes)')
      } catch {
        setDiff('(unable to load diff)')
      }
    },
    [projectDir]
  )

  const handleCommit = useCallback(
    async (push: boolean) => {
      if (!commitMsg.trim()) return
      setBusy(true)
      setError(null)
      try {
        await window.hydra.gitCommit(projectDir, commitMsg.trim())
        if (push) {
          await window.hydra.gitPush(projectDir)
        }
        setCommitMsg('')
        setDiff(null)
        setSelectedFile(null)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Commit failed')
      } finally {
        setBusy(false)
      }
    },
    [projectDir, commitMsg, refresh]
  )

  const allFiles = status
    ? [
        ...status.staged.map((f) => ({ file: f, type: 'staged' as const })),
        ...status.modified
          .filter((f) => !status.staged.includes(f))
          .map((f) => ({ file: f, type: 'modified' as const })),
        ...status.untracked.map((f) => ({ file: f, type: 'untracked' as const }))
      ]
    : []

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
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

        <div className={styles.body}>
          {error && <div className={styles.error}>{error}</div>}

          {/* File status */}
          {status && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>
                Changes ({allFiles.length})
              </span>
              {allFiles.length === 0 ? (
                <div className={styles.empty}>Working tree clean</div>
              ) : (
                <div className={styles.fileList}>
                  {allFiles.map(({ file, type }) => (
                    <button
                      key={`${type}-${file}`}
                      className={`${styles.fileItem} ${selectedFile === file ? styles.fileItemActive : ''}`}
                      onClick={() => void handleSelectFile(file)}
                    >
                      <span
                        className={`${styles.fileStatus} ${
                          type === 'staged'
                            ? styles.statusStaged
                            : type === 'modified'
                              ? styles.statusModified
                              : styles.statusUntracked
                        }`}
                      >
                        {type === 'staged' ? 'S' : type === 'modified' ? 'M' : '?'}
                      </span>
                      <span className={styles.fileName}>{file}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Diff */}
          {diff && selectedFile && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Diff: {selectedFile}</span>
              <div className={styles.diffView}>
                {diff.split('\n').map((line, i) => {
                  let cls = ''
                  if (line.startsWith('+') && !line.startsWith('+++')) cls = styles.diffAdd
                  else if (line.startsWith('-') && !line.startsWith('---')) cls = styles.diffRemove
                  else if (line.startsWith('@@')) cls = styles.diffHunk
                  return (
                    <div key={i} className={cls}>
                      {line}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Commit */}
          {status && allFiles.length > 0 && (
            <div className={styles.commitSection}>
              <span className={styles.sectionLabel}>Commit</span>
              <textarea
                className={styles.commitInput}
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.target.value)}
                placeholder="Commit message..."
                rows={2}
              />
              <div className={styles.commitActions}>
                <button
                  className={styles.commitBtn}
                  disabled={!commitMsg.trim() || busy}
                  onClick={() => void handleCommit(false)}
                >
                  Commit
                </button>
                <button
                  className={`${styles.commitBtn} ${styles.commitBtnPrimary}`}
                  disabled={!commitMsg.trim() || busy}
                  onClick={() => void handleCommit(true)}
                >
                  Commit & Push
                </button>
              </div>
            </div>
          )}

          {/* Recent commits */}
          {commits.length > 0 && (
            <div className={styles.section}>
              <span className={styles.sectionLabel}>Recent Commits</span>
              <div className={styles.commitLog}>
                {commits.map((c) => (
                  <div key={c.hash} className={styles.logEntry}>
                    <span className={styles.logHash}>{c.hash}</span>
                    <span className={styles.logMessage}>{c.message}</span>
                    <span className={styles.logDate}>{relativeDate(c.date)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
