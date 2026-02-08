import { useEffect, useMemo, useState } from 'react'
import type { ModelId, ProviderId, CreateAgentPayload, ClaudeSessionSummary, McpServerStatus } from '@shared/types'
import { PROVIDER_MODELS, PROVIDER_LABELS, getDefaultModelForProvider } from '@shared/types'
import styles from './NewAgentDialog.module.css'

const PROVIDERS: ProviderId[] = ['claude', 'codex']

interface NewAgentDialogProps {
  defaultProvider: ProviderId
  defaultModel: ModelId
  defaultProjectDir: string
  globalYolo: boolean
  onSubmit: (payload: CreateAgentPayload) => void
  onClose: () => void
}

export function NewAgentDialog({
  defaultProvider,
  defaultModel,
  defaultProjectDir,
  globalYolo,
  onSubmit,
  onClose
}: NewAgentDialogProps) {
  const [name, setName] = useState('')
  const [projectDir, setProjectDir] = useState(defaultProjectDir)
  const [provider, setProvider] = useState<ProviderId>(defaultProvider)
  const [model, setModel] = useState<ModelId>(defaultModel)
  const [yolo, setYolo] = useState(globalYolo)
  const [initialPrompt, setInitialPrompt] = useState('')
  const [isManager, setIsManager] = useState(false)
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null)
  const [resumeExisting, setResumeExisting] = useState(false)
  const [sessions, setSessions] = useState<ClaudeSessionSummary[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')

  useEffect(() => {
    window.hydra.getMcpServerStatus().then(setMcpStatus).catch(console.error)
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoadingSessions(true)
    window.hydra
      .listClaudeSessions({ includeHidden: true, limit: 2000 })
      .then((found) => {
        if (cancelled) return
        setSessions(found)
      })
      .catch((err) => {
        console.error('Failed to load Claude sessions:', err)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSessions(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase()
    if (!query) return sessions
    return sessions.filter((session) => {
      return (
        session.sessionId.toLowerCase().includes(query) ||
        session.projectPath.toLowerCase().includes(query) ||
        session.firstPrompt.toLowerCase().includes(query)
      )
    })
  }, [sessions, sessionSearch])

  const selectedSession = useMemo(
    () => sessions.find((session) => session.sessionId === selectedSessionId) ?? null,
    [sessions, selectedSessionId]
  )

  useEffect(() => {
    if (!resumeExisting) return
    if (selectedSessionId) return
    if (filteredSessions.length > 0) {
      setSelectedSessionId(filteredSessions[0].sessionId)
    }
  }, [resumeExisting, selectedSessionId, filteredSessions])

  useEffect(() => {
    if (!resumeExisting || !selectedSession) return
    if (selectedSession.projectPath) {
      setProjectDir(selectedSession.projectPath)
    }
  }, [resumeExisting, selectedSession])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (!isManager && !projectDir.trim()) return
    if (resumeExisting && !selectedSessionId) return

    onSubmit({
      name: name.trim(),
      projectDir: isManager ? '' : projectDir.trim(),
      provider,
      model,
      yolo,
      initialPrompt: initialPrompt.trim(),
      resumeSessionId: resumeExisting ? selectedSessionId : null,
      isManager
    })
  }

  const handleBrowse = async () => {
    const dir = await window.hydra.selectDirectory()
    if (dir) setProjectDir(dir)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <form
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className={styles.header}>
          <h2>New Agent</h2>
          <button className={styles.closeBtn} type="button" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* Name */}
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auth Module"
              autoFocus
              required
            />
          </div>

          {/* Project directory (hidden for manager agents) */}
          {!isManager && (
            <div className={styles.field}>
              <label className={styles.label}>Project Directory</label>
              <div className={styles.dirField}>
                <input
                  className={styles.dirInput}
                  type="text"
                  value={projectDir}
                  onChange={(e) => setProjectDir(e.target.value)}
                  placeholder="/path/to/project"
                  required
                />
                <button
                  className={styles.browseBtn}
                  type="button"
                  onClick={handleBrowse}
                >
                  Browse
                </button>
              </div>
            </div>
          )}

          {/* Provider */}
          <div className={styles.field}>
            <label className={styles.label}>Provider</label>
            <div className={styles.segmented}>
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`${styles.segment} ${provider === p ? styles.active : ''}`}
                  onClick={() => {
                    setProvider(p)
                    setModel(getDefaultModelForProvider(p))
                    if (p !== 'claude') setResumeExisting(false)
                  }}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Model */}
          <div className={styles.field}>
            <label className={styles.label}>Model</label>
            <div className={styles.segmented}>
              {PROVIDER_MODELS[provider].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.segment} ${model === m.id ? styles.active : ''}`}
                  onClick={() => setModel(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* YOLO */}
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={yolo}
                onChange={(e) => setYolo(e.target.checked)}
                className={styles.checkbox}
              />
              <span className={yolo ? styles.yoloText : ''}>
                YOLO Mode
              </span>
              <span className={styles.hint}>
                Skip all permission prompts
              </span>
            </label>
          </div>

          {/* Manager Agent */}
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isManager}
                onChange={(e) => {
                  const checked = e.target.checked
                  setIsManager(checked)
                  if (checked) {
                    setResumeExisting(false)
                    if (!initialPrompt.trim()) {
                      setInitialPrompt('What can you do as the Hydra Manager agent? List your available MCP tools and capabilities.')
                    }
                  }
                }}
                className={styles.checkbox}
                disabled={!mcpStatus?.running}
              />
              <span className={isManager ? styles.managerText : ''}>
                Manager Agent
              </span>
              <span className={styles.hint}>
                {mcpStatus?.running
                  ? 'Orchestrate other agents via MCP tools'
                  : mcpStatus?.error
                    ? `MCP unavailable: ${mcpStatus.error}`
                    : 'MCP server not running'}
              </span>
            </label>
          </div>

          {/* Resume existing session (hidden for manager agents and non-resumable providers) */}
          {!isManager && provider === 'claude' && (
            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={resumeExisting}
                  onChange={(e) => setResumeExisting(e.target.checked)}
                  className={styles.checkbox}
                />
                <span>Resume existing Claude session</span>
                <span className={styles.hint}>
                  Import from ~/.claude/projects
                </span>
              </label>
            </div>
          )}

          {resumeExisting && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Find Session</label>
                <input
                  className={styles.input}
                  type="text"
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="Search by project, prompt, or session id..."
                  disabled={isLoadingSessions}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Session</label>
                <select
                  className={styles.select}
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  disabled={isLoadingSessions || filteredSessions.length === 0}
                >
                  {isLoadingSessions && <option>Loading sessions...</option>}
                  {!isLoadingSessions && filteredSessions.length === 0 && (
                    <option value="">No sessions found</option>
                  )}
                  {!isLoadingSessions &&
                    filteredSessions.map((session) => (
                      <option key={session.sessionId} value={session.sessionId}>
                        {formatSessionLabel(session)}
                      </option>
                    ))}
                </select>
                {selectedSession && (
                  <div className={styles.sessionPreview}>
                    <span className={styles.sessionMeta}>
                      {selectedSession.modifiedAt
                        ? `Updated ${formatDate(selectedSession.modifiedAt)}`
                        : 'Unknown update time'}
                      {selectedSession.gitBranch
                        ? ` · branch ${selectedSession.gitBranch}`
                        : ''}
                    </span>
                    {selectedSession.firstPrompt && (
                      <span className={styles.sessionPrompt}>
                        {selectedSession.firstPrompt}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Initial prompt */}
          <div className={styles.field}>
            <label className={styles.label}>
              Initial Prompt <span className={styles.optional}>(optional)</span>
            </label>
            <textarea
              className={styles.textarea}
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder={
                resumeExisting
                  ? 'Optional follow-up prompt after resuming...'
                  : 'Work on the authentication module...'
              }
              rows={3}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.submitBtn}
            type="submit"
            disabled={!name.trim() || (!isManager && !projectDir.trim()) || (resumeExisting && !selectedSessionId)}
          >
            Create Agent
          </button>
        </div>
      </form>
    </div>
  )
}

function formatSessionLabel(session: ClaudeSessionSummary): string {
  const projectName = session.projectPath.split('/').pop() || session.projectPath
  const shortId = session.sessionId.slice(0, 8)
  return `${projectName} · ${shortId} · ${formatDate(session.modifiedAt)}`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
