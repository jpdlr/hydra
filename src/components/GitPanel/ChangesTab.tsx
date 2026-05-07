import { useState, useCallback, useRef } from 'react'
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

function ExpandIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 5V2h3M10 5V2H7M2 7v3h3M10 7v3H7" />
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2v3H2M7 2v3h3M5 10V7H2M7 10V7h3" />
    </svg>
  )
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
  const [fileListWidth, setFileListWidth] = useState(240)
  const [isResizing, setIsResizing] = useState(false)
  const [diffFullscreen, setDiffFullscreen] = useState(false)
  const resizeStartRef = useRef({ x: 0, w: 0 })

  const handleResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      resizeStartRef.current = { x: e.clientX, w: fileListWidth }
      setIsResizing(true)
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - resizeStartRef.current.x
        const next = Math.min(480, Math.max(180, resizeStartRef.current.w + delta))
        setFileListWidth(next)
      }
      const onUp = () => {
        setIsResizing(false)
        target.releasePointerCapture(e.pointerId)
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
    },
    [fileListWidth]
  )
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
        setDiffFullscreen(false)
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
      <div
        className={`${hasDiff ? styles.fileListSide : ''} ${diffFullscreen ? styles.fileListHidden : ''}`.trim() || undefined}
        style={hasDiff && !diffFullscreen ? { width: fileListWidth } : undefined}
      >
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

      {/* Resize handle */}
      {hasDiff && !diffFullscreen && (
        <div
          className={`${styles.resizeHandle} ${isResizing ? styles.resizeActive : ''}`}
          onPointerDown={handleResizeDown}
        />
      )}

      {/* Diff viewer */}
      {hasDiff && (
        <div className={styles.diffSide}>
          <div className={styles.diffHeader}>
            <span className={styles.sectionLabel}>Diff: {selectedFile}</span>
            <div className={styles.diffHeaderActions}>
              <button
                className={styles.iconBtn}
                onClick={() => setDiffFullscreen((v) => !v)}
                title={diffFullscreen ? 'Exit full screen' : 'Full screen'}
              >
                {diffFullscreen ? <CollapseIcon /> : <ExpandIcon />}
              </button>
              <button
                className={styles.iconBtn}
                onClick={() => {
                  setSelectedFile(null)
                  setFileContents(null)
                  setDiffFullscreen(false)
                  onExpandedChange(false)
                }}
                title="Close diff"
              >
                ✕
              </button>
            </div>
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
