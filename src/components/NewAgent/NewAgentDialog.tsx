import { useEffect, useMemo, useState } from 'react'
import type { ModelId, ProviderId, CreateAgentPayload, ClaudeSessionSummary, McpServerStatus, WorkMode } from '@shared/types'
import { PROVIDER_LABELS, CODEX_REASONING_LEVELS } from '@shared/types'
import { useRuntimeProviderModels } from '../../hooks/useRuntimeProviderModels'
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
  const [customModel, setCustomModel] = useState('')
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [reasoningEffort, setReasoningEffort] = useState('')
  const [yolo, setYolo] = useState(globalYolo)
  const [initialPrompt, setInitialPrompt] = useState('')
  const [isManager, setIsManager] = useState(false)
  const [workMode, setWorkMode] = useState<WorkMode>('local')
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null)
  const [resumeExisting, setResumeExisting] = useState(false)
  const [sessions, setSessions] = useState<ClaudeSessionSummary[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const { providerModels, getDefaultModel, getModelOption } = useRuntimeProviderModels()

  useEffect(() => {
    window.hydra.getMcpServerStatus().then(setMcpStatus).catch(console.error)
  }, [])

  useEffect(() => {
    let cancelled = false
    setIsLoadingSessions(true)
    window.hydra
      .listClaudeSessions({ provider, includeHidden: true, limit: 2000 })
      .then((found) => {
        if (cancelled) return
        setSessions(found)
        setSelectedSessionId((current) => {
          if (!current) return current
          return found.some((session) => session.sessionId === current) ? current : ''
        })
      })
      .catch((err) => {
        console.error(`Failed to load ${provider} sessions:`, err)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSessions(false)
      })

    return () => {
      cancelled = true
    }
  }, [provider])

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

  const selectedModelOption = useMemo(() => {
    const selectedModelId = useCustomModel ? customModel.trim() : model
    if (!selectedModelId) return null
    return getModelOption(provider, selectedModelId)
  }, [customModel, getModelOption, model, provider, useCustomModel])

  const codexReasoningOptions = useMemo(() => {
    if (provider !== 'codex') return []
    return selectedModelOption?.reasoningEfforts?.length
      ? selectedModelOption.reasoningEfforts
      : [...CODEX_REASONING_LEVELS]
  }, [provider, selectedModelOption])

  useEffect(() => {
    if (provider !== 'codex') return
    if (!reasoningEffort) return
    if (codexReasoningOptions.includes(reasoningEffort)) return
    setReasoningEffort('')
  }, [codexReasoningOptions, provider, reasoningEffort])

  const effectiveModel = useCustomModel ? customModel.trim() : model

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isManager && !projectDir.trim()) return
    if (resumeExisting && !selectedSessionId) return
    if (!effectiveModel) return

    onSubmit({
      name: name.trim(),
      projectDir: isManager ? '' : projectDir.trim(),
      provider,
      model: effectiveModel,
      reasoningEffort: provider === 'codex' && reasoningEffort ? reasoningEffort : undefined,
      yolo,
      initialPrompt: initialPrompt.trim(),
      resumeSessionId: resumeExisting ? selectedSessionId : null,
      isManager,
      workMode
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
              placeholder="Optional — auto-generated from prompt"
              autoFocus
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

          {/* Work Mode */}
          {!isManager && (
            <div className={styles.field}>
              <label className={styles.label}>Work Mode</label>
              <div className={styles.segmented}>
                <button
                  type="button"
                  className={`${styles.segment} ${workMode === 'local' ? styles.active : ''}`}
                  onClick={() => setWorkMode('local')}
                >
                  Local
                </button>
                <button
                  type="button"
                  className={`${styles.segment} ${workMode === 'worktree' ? styles.active : ''}`}
                  onClick={() => setWorkMode('worktree')}
                >
                  New Worktree
                </button>
              </div>
              <span className={styles.hint}>
                {workMode === 'worktree'
                  ? 'Creates an isolated git worktree with a new branch'
                  : 'Works directly on the current branch'}
              </span>
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
                    setModel(getDefaultModel(p))
                    setUseCustomModel(false)
                    setCustomModel('')
                    setReasoningEffort('')
                    setSelectedSessionId('')
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
            <select
              className={styles.select}
              value={useCustomModel ? '__custom__' : model}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setUseCustomModel(true)
                } else {
                  setUseCustomModel(false)
                  setCustomModel('')
                  setModel(e.target.value)
                }
              }}
            >
              {providerModels[provider].map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="__custom__">Custom...</option>
            </select>
            {useCustomModel && (
              <input
                className={styles.input}
                type="text"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                placeholder="e.g. gpt-5.3-codex"
                style={{ marginTop: '0.375rem' }}
              />
            )}
          </div>

          {/* Reasoning Effort (Codex only) */}
          {provider === 'codex' && (
            <div className={styles.field}>
              <label className={styles.label}>Reasoning Effort</label>
              <select
                className={styles.select}
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(e.target.value)}
              >
                <option value="">Default</option>
                {codexReasoningOptions.map((level) => (
                  <option key={level} value={level}>
                    {formatReasoningEffort(level)}
                  </option>
                ))}
              </select>
            </div>
          )}

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
          {!isManager && (
            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={resumeExisting}
                  onChange={(e) => setResumeExisting(e.target.checked)}
                  className={styles.checkbox}
                />
                <span>Resume existing {PROVIDER_LABELS[provider]} session</span>
                <span className={styles.hint}>
                  {provider === 'codex'
                    ? 'Import from your Codex sessions directory'
                    : 'Import from your Claude sessions directory'}
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
            disabled={(!isManager && !projectDir.trim()) || (resumeExisting && !selectedSessionId) || !effectiveModel}
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

function formatReasoningEffort(level: string): string {
  if (level === 'xhigh') return 'Extra High'
  return level.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
