import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import type { GitPrDiff, GitPrFile, ProviderId, ModelId } from '@shared/types'
import { PROVIDER_MODELS, PROVIDER_LABELS, getDefaultModelForProvider } from '@shared/types'
import styles from './PrReviewTab.module.css'

const Editor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.Editor }))
)

interface PrReviewTabProps {
  projectDir: string
  theme: string
  defaultProvider: ProviderId
  defaultModel: ModelId
}

type ReviewState = 'input' | 'loading' | 'loaded' | 'reviewing' | 'reviewed' | 'error'

function buildReviewPrompt(prDiff: GitPrDiff): string {
  const { metadata, files } = prDiff
  const fileSummary = files
    .map((f) => `  ${f.status.padEnd(8)} ${f.path} (+${f.additions}/-${f.deletions})`)
    .join('\n')

  const patches = files
    .map((f) => `### ${f.path}\n\`\`\`diff\n${f.patch.slice(0, 8000)}\n\`\`\``)
    .join('\n\n')

  return `Review the following GitHub Pull Request.

## PR #${metadata.number}: ${metadata.title}
- Author: ${metadata.author}
- Base: ${metadata.baseRef} <- Head: ${metadata.headRef}
- Changes: +${metadata.additions}/-${metadata.deletions} across ${metadata.changedFiles} files

### Description
${metadata.body || '(no description)'}

### Changed Files
${fileSummary}

### Diffs
${patches}

Please provide:
1. A summary of what this PR does
2. Any potential issues, bugs, or code quality concerns
3. Suggestions for improvement
4. An overall assessment (approve / request changes / comment)

Be specific and reference file names and line numbers where relevant.`
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

export function PrReviewTab({
  projectDir,
  theme,
  defaultProvider,
  defaultModel
}: PrReviewTabProps) {
  const [prInput, setPrInput] = useState('')
  const [state, setState] = useState<ReviewState>('input')
  const [prDiff, setPrDiff] = useState<GitPrDiff | null>(null)
  const [selectedFile, setSelectedFile] = useState<GitPrFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewResult, setReviewResult] = useState<string | null>(null)
  const [provider, setProvider] = useState<ProviderId>(defaultProvider)
  const [model, setModel] = useState<ModelId>(defaultModel)
  const pollingRef = useRef(false)

  // Sync provider/model defaults
  useEffect(() => {
    setProvider(defaultProvider)
    setModel(defaultModel)
  }, [defaultProvider, defaultModel])

  const handleFetch = useCallback(async () => {
    if (!prInput.trim()) return
    setState('loading')
    setError(null)
    setPrDiff(null)
    setSelectedFile(null)
    setReviewResult(null)
    try {
      const data = await window.hydra.gitFetchPr(projectDir, prInput.trim())
      setPrDiff(data)
      setState('loaded')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch PR. Is `gh` CLI installed and authenticated?')
      setState('error')
    }
  }, [projectDir, prInput])

  const handleReview = useCallback(async () => {
    if (!prDiff) return
    setState('reviewing')
    setError(null)
    setReviewResult(null)
    const prompt = buildReviewPrompt(prDiff)
    try {
      const run = await window.hydra.startHeadlessRun({
        prompt,
        projectDir,
        provider,
        model,
      })
      pollingRef.current = true
      // Poll for completion
      const maxAttempts = 300 // 5 minutes at 1s interval
      for (let i = 0; i < maxAttempts && pollingRef.current; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        const current = await window.hydra.getHeadlessRun(run.id)
        if (!current) break
        if (current.status === 'completed') {
          const log = await window.hydra.getHeadlessRunLog(run.id, {
            tailLines: 2000,
            maxChars: 200000,
          })
          setReviewResult(log?.content ?? 'Review completed but no output captured.')
          setState('reviewed')
          pollingRef.current = false
          return
        }
        if (current.status === 'errored' || current.status === 'canceled') {
          setError(`Review ${current.status}: ${current.error || 'unknown error'}`)
          setState('error')
          pollingRef.current = false
          return
        }
      }
      if (pollingRef.current) {
        setError('Review timed out after 5 minutes')
        setState('error')
        pollingRef.current = false
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start review')
      setState('error')
    }
  }, [prDiff, projectDir, provider, model])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false
    }
  }, [])

  const handleReset = useCallback(() => {
    pollingRef.current = false
    setState('input')
    setPrDiff(null)
    setSelectedFile(null)
    setReviewResult(null)
    setError(null)
  }, [])

  return (
    <div className={styles.container}>
      {/* Input state */}
      {(state === 'input' || state === 'error') && (
        <div className={styles.inputSection}>
          <span className={styles.sectionLabel}>Pull Request</span>
          <div className={styles.inputRow}>
            <input
              className={styles.prInput}
              type="text"
              placeholder="PR number or URL (e.g., 42 or https://github.com/owner/repo/pull/42)"
              value={prInput}
              onChange={(e) => setPrInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleFetch()
              }}
            />
            <button
              className={styles.fetchBtn}
              disabled={!prInput.trim()}
              onClick={() => void handleFetch()}
            >
              Fetch
            </button>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
      )}

      {/* Loading state */}
      {state === 'loading' && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Fetching PR data via gh CLI...</span>
        </div>
      )}

      {/* Loaded state — PR metadata + files + review button */}
      {(state === 'loaded' || state === 'reviewing' || state === 'reviewed') && prDiff && (
        <>
          {/* PR metadata card */}
          <div className={styles.prCard}>
            <div className={styles.prHeader}>
              <span className={styles.prNumber}>#{prDiff.metadata.number}</span>
              <span className={styles.prTitle}>{prDiff.metadata.title}</span>
              <span className={`${styles.prState} ${styles[`prState${prDiff.metadata.state}`] ?? ''}`}>
                {prDiff.metadata.state}
              </span>
            </div>
            <div className={styles.prMeta}>
              <span>{prDiff.metadata.author}</span>
              <span className={styles.prMetaSep}>&middot;</span>
              <span>{prDiff.metadata.baseRef} &larr; {prDiff.metadata.headRef}</span>
              <span className={styles.prMetaSep}>&middot;</span>
              <span className={styles.prStatAdd}>+{prDiff.metadata.additions}</span>
              <span className={styles.prStatDel}>-{prDiff.metadata.deletions}</span>
              <span className={styles.prMetaSep}>&middot;</span>
              <span>{prDiff.metadata.changedFiles} files</span>
              <span className={styles.prMetaSep}>&middot;</span>
              <span>{relativeDate(prDiff.metadata.updatedAt)}</span>
            </div>
            {prDiff.metadata.body && (
              <div className={styles.prBody}>{prDiff.metadata.body.slice(0, 500)}</div>
            )}
          </div>

          {/* File list + diff viewer */}
          <div className={styles.filesSection}>
            <span className={styles.sectionLabel}>Changed Files ({prDiff.files.length})</span>
            <div className={styles.filesDiffLayout}>
              <div className={styles.fileList}>
                {prDiff.files.map((f) => (
                  <button
                    key={f.path}
                    className={`${styles.fileItem} ${selectedFile?.path === f.path ? styles.fileItemActive : ''}`}
                    onClick={() => setSelectedFile(selectedFile?.path === f.path ? null : f)}
                  >
                    <span
                      className={`${styles.fileStatus} ${
                        f.status === 'added'
                          ? styles.statusAdded
                          : f.status === 'removed'
                            ? styles.statusRemoved
                            : styles.statusModified
                      }`}
                    >
                      {f.status === 'added' ? 'A' : f.status === 'removed' ? 'D' : f.status === 'renamed' ? 'R' : 'M'}
                    </span>
                    <span className={styles.fileName}>{f.path}</span>
                    <span className={styles.fileStat}>
                      <span className={styles.prStatAdd}>+{f.additions}</span>
                      <span className={styles.prStatDel}>-{f.deletions}</span>
                    </span>
                  </button>
                ))}
              </div>

              {selectedFile && (
                <div className={styles.patchView}>
                  <Suspense fallback={<div className={styles.loading}>Loading editor...</div>}>
                    <Editor
                      height="100%"
                      value={selectedFile.patch}
                      language="diff"
                      theme={theme === 'light' ? 'vs' : 'vs-dark'}
                      options={{
                        readOnly: true,
                        fontSize: 13,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'off',
                        padding: { top: 8 },
                      }}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          </div>

          {/* Review controls */}
          {state === 'loaded' && (
            <div className={styles.reviewSection}>
              <span className={styles.sectionLabel}>Send for Review</span>
              <div className={styles.reviewControls}>
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>Provider</label>
                  <select
                    className={styles.select}
                    value={provider}
                    onChange={(e) => {
                      const p = e.target.value as ProviderId
                      setProvider(p)
                      setModel(getDefaultModelForProvider(p))
                    }}
                  >
                    {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((p) => (
                      <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.controlGroup}>
                  <label className={styles.controlLabel}>Model</label>
                  <select
                    className={styles.select}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    {PROVIDER_MODELS[provider].map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  className={styles.reviewBtn}
                  onClick={() => void handleReview()}
                >
                  Start Review
                </button>
              </div>
            </div>
          )}

          {/* Reviewing state */}
          {state === 'reviewing' && (
            <div className={styles.reviewingSection}>
              <div className={styles.spinner} />
              <span>Agent is reviewing the PR...</span>
            </div>
          )}

          {/* Review result */}
          {state === 'reviewed' && reviewResult && (
            <div className={styles.resultSection}>
              <span className={styles.sectionLabel}>Review Result</span>
              <div className={styles.resultContent}>
                <pre className={styles.resultPre}>{reviewResult}</pre>
              </div>
            </div>
          )}

          {error && <div className={styles.error}>{error}</div>}

          {/* Reset button */}
          {state === 'reviewed' && (
            <button className={styles.resetBtn} onClick={handleReset}>
              Review Another PR
            </button>
          )}
        </>
      )}

      {/* Error-state reset */}
      {state === 'error' && !prDiff && (
        <button className={styles.resetBtn} onClick={handleReset}>
          Try Again
        </button>
      )}
    </div>
  )
}
