import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  HeadlessRun,
  HeadlessRunLogPayload,
  HeadlessRunStatus,
  ModelId
} from '@shared/types'
import styles from './HeadlessPanel.module.css'

interface HeadlessPanelProps {
  defaultProjectDir: string
  defaultModel: ModelId
  onClose: () => void
}

const STATUS_OPTIONS: Array<HeadlessRunStatus | 'all'> = [
  'all',
  'running',
  'completed',
  'errored',
  'canceled'
]

export function HeadlessPanel({ defaultProjectDir, defaultModel, onClose }: HeadlessPanelProps) {
  const [prompt, setPrompt] = useState('')
  const [projectDir, setProjectDir] = useState(defaultProjectDir)
  const [model, setModel] = useState<ModelId>(defaultModel)
  const [resumeSessionId, setResumeSessionId] = useState('')

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<HeadlessRunStatus | 'all'>('all')

  const [runs, setRuns] = useState<HeadlessRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [selectedRun, setSelectedRun] = useState<HeadlessRun | null>(null)
  const [selectedRunLog, setSelectedRunLog] = useState<HeadlessRunLogPayload | null>(null)

  const [isStarting, setIsStarting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingLog, setIsLoadingLog] = useState(false)

  const refreshRuns = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const next = await window.hydra.listHeadlessRuns({
        query: query.trim() || undefined,
        status: statusFilter,
        limit: 1000
      })
      setRuns(next)
      setSelectedRunId((prev) => {
        if (prev && next.some((run) => run.id === prev)) return prev
        return next[0]?.id ?? null
      })
    } finally {
      setIsRefreshing(false)
    }
  }, [query, statusFilter])

  const loadRunDetails = useCallback(async (runId: string) => {
    setIsLoadingLog(true)
    try {
      const [run, log] = await Promise.all([
        window.hydra.getHeadlessRun(runId),
        window.hydra.getHeadlessRunLog(runId, { tailLines: 1400, maxChars: 240000 })
      ])
      setSelectedRun(run)
      setSelectedRunLog(log)
    } finally {
      setIsLoadingLog(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const initial = async () => {
      await refreshRuns()
      if (!active) return
    }

    void initial()

    const interval = setInterval(() => {
      void refreshRuns()
    }, 4000)

    const unsub = window.hydra.onHeadlessRunEvent((event) => {
      if (event.runId === selectedRunId) {
        void loadRunDetails(event.runId)
      }
      void refreshRuns()
    })

    return () => {
      active = false
      clearInterval(interval)
      unsub()
    }
  }, [refreshRuns, selectedRunId, loadRunDetails])

  useEffect(() => {
    if (!selectedRunId) {
      setSelectedRun(null)
      setSelectedRunLog(null)
      return
    }
    void loadRunDetails(selectedRunId)
  }, [selectedRunId, loadRunDetails])

  const sortedRuns = useMemo(() => {
    return [...runs].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  }, [runs])

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedPrompt = prompt.trim()
    const trimmedProjectDir = projectDir.trim()
    if (!trimmedPrompt || !trimmedProjectDir) return

    setIsStarting(true)
    try {
      const created = await window.hydra.startHeadlessRun({
        prompt: trimmedPrompt,
        projectDir: trimmedProjectDir,
        model,
        resumeSessionId: resumeSessionId.trim() || null
      })
      setPrompt('')
      setRuns((prev) => [created, ...prev])
      setSelectedRunId(created.id)
      await loadRunDetails(created.id)
    } finally {
      setIsStarting(false)
    }
  }

  const selectedStatus = selectedRun?.status ?? null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Headless Runs</h2>
          <button className={styles.closeBtn} onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <form className={styles.form} onSubmit={handleStart}>
          <input
            className={styles.input}
            value={projectDir}
            onChange={(e) => setProjectDir(e.target.value)}
            placeholder="Project directory"
          />
          <textarea
            className={styles.prompt}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prompt for headless run..."
            rows={3}
          />
          <div className={styles.formRow}>
            <select
              className={styles.select}
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
            >
              <option value="opus">Opus</option>
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
            </select>
            <input
              className={styles.input}
              value={resumeSessionId}
              onChange={(e) => setResumeSessionId(e.target.value)}
              placeholder="Resume session id (optional)"
            />
            <button
              className={styles.startBtn}
              type="submit"
              disabled={isStarting || !prompt.trim() || !projectDir.trim()}
            >
              {isStarting ? 'Starting...' : 'Start'}
            </button>
          </div>
        </form>

        <div className={styles.filters}>
          <input
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search run id, prompt, project, session..."
          />
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as HeadlessRunStatus | 'all')}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button className={styles.refreshBtn} type="button" onClick={() => void refreshRuns()}>
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.list}>
            {sortedRuns.length === 0 ? (
              <div className={styles.empty}>No runs match the current filter.</div>
            ) : (
              sortedRuns.map((run) => (
                <button
                  key={run.id}
                  className={`${styles.runCard} ${run.id === selectedRunId ? styles.runCardActive : ''}`}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div className={styles.runHeader}>
                    <strong>{run.id}</strong>
                    <span className={styles.meta}>{run.status}</span>
                  </div>
                  <div className={styles.meta}>{run.model} · {formatDate(run.startedAt)}</div>
                  <div className={styles.runPrompt}>{run.prompt || '(no prompt)'}</div>
                </button>
              ))
            )}
          </div>

          <div className={styles.details}>
            {!selectedRun ? (
              <div className={styles.empty}>Select a run to inspect details and logs.</div>
            ) : (
              <>
                <div className={styles.detailsHeader}>
                  <div>
                    <h3>{selectedRun.id}</h3>
                    <div className={styles.meta}>
                      {selectedRun.model} · {selectedRun.status}
                      {selectedRun.sessionId ? ` · session ${selectedRun.sessionId}` : ''}
                    </div>
                  </div>
                  {selectedStatus === 'running' && (
                    <button
                      className={styles.cancelBtn}
                      type="button"
                      onClick={async () => {
                        await window.hydra.cancelHeadlessRun(selectedRun.id)
                        await refreshRuns()
                        await loadRunDetails(selectedRun.id)
                      }}
                    >
                      Cancel Run
                    </button>
                  )}
                </div>

                <div className={styles.meta}>Project: {selectedRun.projectDir || '(unknown)'}</div>
                <div className={styles.meta}>Started: {formatDate(selectedRun.startedAt)}</div>
                <div className={styles.meta}>
                  Ended: {selectedRun.endedAt ? formatDate(selectedRun.endedAt) : 'Running'}
                </div>
                {selectedRun.error && <div className={styles.error}>{selectedRun.error}</div>}

                <div className={styles.logHeader}>
                  <strong>Log</strong>
                  <button
                    className={styles.refreshBtn}
                    type="button"
                    onClick={() => {
                      if (selectedRunId) {
                        void loadRunDetails(selectedRunId)
                      }
                    }}
                  >
                    {isLoadingLog ? 'Loading...' : 'Reload Log'}
                  </button>
                </div>

                {selectedRunLog ? (
                  <>
                    <div className={styles.meta}>
                      Showing {selectedRunLog.returnedLines} / {selectedRunLog.totalLines} lines
                      {selectedRunLog.truncated ? ' (truncated)' : ''}
                    </div>
                    <pre className={styles.log}>{selectedRunLog.content || '(no log output)'}</pre>
                  </>
                ) : (
                  <div className={styles.empty}>No log available.</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
