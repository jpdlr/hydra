import { useState, useCallback } from 'react'
import type { GitStatus, GitCommit, GitFileContents } from '@shared/types'
import { MonacoDiffViewer } from './MonacoDiffViewer'
import { PierreDiffViewer } from './PierreDiffViewer'
import { useFeatureFlag } from '../../lib/featureFlags'
import styles from './ChangesTab.module.css'

interface ChangesTabProps {
  projectDir: string
  theme: string
  status: GitStatus | null
  commits: GitCommit[]
  onRefresh: () => Promise<void>
  onExpandedChange: (expanded: boolean) => void
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

export function ChangesTab({
  projectDir,
  theme,
  status,
  commits,
  onRefresh,
  onExpandedChange
}: ChangesTabProps) {
  const useExperimentalViews = useFeatureFlag('experimentalViews')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContents, setFileContents] = useState<GitFileContents | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSelectFile = useCallback(
    async (file: string) => {
      if (selectedFile === file) {
        setSelectedFile(null)
        setFileContents(null)
        onExpandedChange(false)
        return
      }
      setSelectedFile(file)
      setLoadingDiff(true)
      onExpandedChange(true)
      try {
        const contents = await window.hydra.gitFileContents(projectDir, file)
        setFileContents(contents)
      } catch {
        setFileContents(null)
      } finally {
        setLoadingDiff(false)
      }
    },
    [projectDir, selectedFile, onExpandedChange]
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
        setSelectedFile(null)
        setFileContents(null)
        onExpandedChange(false)
        await onRefresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Commit failed')
      } finally {
        setBusy(false)
      }
    },
    [projectDir, commitMsg, onRefresh, onExpandedChange]
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

  const hasDiff = selectedFile && (fileContents || loadingDiff)

  return (
    <div className={hasDiff ? styles.splitLayout : styles.normalLayout}>
      <div className={hasDiff ? styles.fileListSide : undefined}>
        {error && <div className={styles.error}>{error}</div>}

        {/* File status */}
        {status && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Changes ({allFiles.length})</span>
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

      {/* Diff viewer */}
      {hasDiff && (
        <div className={styles.diffSide}>
          <div className={styles.diffHeader}>
            <span className={styles.sectionLabel}>Diff: {selectedFile}</span>
            <button
              className={styles.closeDiffBtn}
              onClick={() => {
                setSelectedFile(null)
                setFileContents(null)
                onExpandedChange(false)
              }}
            >
              ✕
            </button>
          </div>
          {loadingDiff ? (
            <div className={styles.loading}>Loading diff...</div>
          ) : fileContents ? (
            useExperimentalViews ? (
              <PierreDiffViewer
                original={fileContents.original}
                modified={fileContents.modified}
                language={fileContents.language}
                theme={theme}
                filePath={selectedFile!}
              />
            ) : (
              <MonacoDiffViewer
                original={fileContents.original}
                modified={fileContents.modified}
                language={fileContents.language}
                theme={theme}
                filePath={selectedFile!}
              />
            )
          ) : (
            <div className={styles.empty}>(unable to load diff)</div>
          )}
        </div>
      )}
    </div>
  )
}
