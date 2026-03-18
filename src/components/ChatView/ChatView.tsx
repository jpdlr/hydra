import { useRef, useCallback, useState, useEffect, useMemo } from 'react'
import { TerminalPane } from '../Terminal/TerminalPane'
import { FreeTerminalPanel } from '../Terminal/FreeTerminalPanel'
import { InputBar } from './InputBar'
import type { AttachedImage } from './InputBar'
import { EditorPanel } from '../EditorPanel'
import { SplitHandle } from '../EditorPanel/SplitHandle'
import { OpenInButton } from '../Header/OpenInButton'
import type { AgentState, EditorId, WorkMode } from '@shared/types'
import type { EditorTab } from '../EditorPanel/TabBar'
import styles from './ChatView.module.css'

interface ChatViewProps {
  agents: AgentState[]
  agent: AgentState | null
  selectedAgentId: string | null
  rawOutput: string
  onSendInput: (input: string, images?: AttachedImage[]) => void
  onSwitchModel?: (model: string) => void
  rawOutputs: Map<string, string>
  onTerminalData: (agentId: string, data: string) => void
  onTerminalResize: (agentId: string, cols: number, rows: number) => void
  onRestartAgent: () => void
  onToggleYolo: () => void
  onKillAgent: () => void
  onRemoveAgent?: () => void
  // Editor panel
  editorOpen?: boolean
  onToggleEditor?: () => void
  editorTabs?: EditorTab[]
  editorActiveTabPath?: string | null
  editorFileContents?: Map<string, string>
  onEditorOpenFile?: (path: string) => void
  onEditorCloseTab?: (path: string) => void
  onEditorSelectTab?: (path: string) => void
  onEditorContentChange?: (path: string, content: string) => void
  onEditorSaveFile?: (path: string) => void
  theme?: string
  defaultEditor?: EditorId
  onSetDefaultEditor?: (editorId: EditorId) => void
  // Free terminal
  freeTerminalOpen?: boolean
  onToggleFreeTerminal?: () => void
  // Work mode
  onToggleWorkMode?: (mode: WorkMode) => void
}

export function ChatView({
  agents,
  agent,
  selectedAgentId,
  rawOutput,
  onSendInput,
  onSwitchModel,
  rawOutputs,
  onTerminalData,
  onTerminalResize,
  onRestartAgent,
  onToggleYolo,
  onKillAgent,
  onRemoveAgent,
  editorOpen = false,
  onToggleEditor,
  editorTabs = [],
  editorActiveTabPath = null,
  editorFileContents,
  onEditorOpenFile,
  onEditorCloseTab,
  onEditorSelectTab,
  onEditorContentChange,
  onEditorSaveFile,
  theme = 'dark',
  defaultEditor = 'vscode',
  onSetDefaultEditor,
  freeTerminalOpen = false,
  onToggleFreeTerminal,
  onToggleWorkMode
}: ChatViewProps) {
  const [mountedTerminalIds, setMountedTerminalIds] = useState<Set<string>>(
    () => new Set(selectedAgentId ? [selectedAgentId] : [])
  )
  const agentProjectDir = agent?.projectDir ?? null
  const selectedTerminalVisible = agent ? agent.status === 'running' || rawOutput.length > 0 : false
  const runningAgentIds = useMemo(
    () => agents.filter((entry) => entry.status === 'running').map((entry) => entry.id),
    [agents]
  )

  // Git branch for the current project
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  useEffect(() => {
    if (!agentProjectDir) { setGitBranch(null); return }
    let cancelled = false
    window.hydra.getGitStatus(agentProjectDir).then((status) => {
      if (!cancelled) setGitBranch(status.branch)
    }).catch(() => {
      if (!cancelled) setGitBranch(null)
    })
    // Poll every 15s to keep branch fresh
    const interval = setInterval(() => {
      window.hydra.getGitStatus(agentProjectDir).then((status) => {
        if (!cancelled) setGitBranch(status.branch)
      }).catch(() => {})
    }, 15_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [agentProjectDir])

  // Prevent browser focus-scroll from moving the outer container.
  const containerRef = useRef<HTMLDivElement>(null)
  const handleContainerScroll = useCallback(() => {
    const el = containerRef.current
    if (el && el.scrollTop !== 0) {
      el.scrollTop = 0
    }
  }, [])

  // Split panel width management (editor)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const outerRef = useRef<HTMLDivElement>(null)

  const handleSplitDrag = useCallback((deltaX: number) => {
    const outer = outerRef.current
    if (!outer) return
    const totalWidth = outer.offsetWidth
    setSplitRatio((prev) => {
      const pxWidth = prev * totalWidth + deltaX
      const clamped = Math.max(300, Math.min(totalWidth - 300, pxWidth))
      return clamped / totalWidth
    })
  }, [])

  const handleSplitDoubleClick = useCallback(() => {
    setSplitRatio(0.5)
  }, [])

  useEffect(() => {
    if (!selectedAgentId) return
    setMountedTerminalIds((prev) => {
      if (prev.has(selectedAgentId)) return prev
      const next = new Set(prev)
      next.add(selectedAgentId)
      return next
    })
  }, [selectedAgentId])

  useEffect(() => {
    if (runningAgentIds.length === 0) {
      setMountedTerminalIds((prev) => {
        const next = new Set<string>()
        if (selectedAgentId && selectedTerminalVisible) {
          next.add(selectedAgentId)
        }
        if (prev.size === next.size && [...next].every((id) => prev.has(id))) {
          return prev
        }
        return next
      })
      return
    }

    const timer = window.setTimeout(() => {
      setMountedTerminalIds((prev) => {
        const next = new Set<string>()
        for (const id of runningAgentIds) {
          next.add(id)
        }
        if (selectedAgentId && selectedTerminalVisible) {
          next.add(selectedAgentId)
        }
        if (prev.size === next.size && [...next].every((id) => prev.has(id))) {
          return prev
        }
        return next
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [runningAgentIds, selectedAgentId, selectedTerminalVisible])

  const terminalAgents = agents.filter((entry) => {
    if (entry.id === selectedAgentId) return selectedTerminalVisible
    return entry.status === 'running' && mountedTerminalIds.has(entry.id)
  }).sort((a, b) => {
    if (a.id === selectedAgentId) return -1
    if (b.id === selectedAgentId) return 1
    return 0
  })

  if (!agent) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyContent}>
          <HydraIcon />
          <h2>No agent selected</h2>
          <p>Create a new agent or select one from the sidebar.</p>
        </div>
      </div>
    )
  }

  const terminalSide = (
    <div className={styles.terminalSide} style={editorOpen ? { flex: `0 0 ${splitRatio * 100}%` } : undefined}>
      {/* Agent header */}
      <div className={styles.agentHeader}>
        <div className={styles.agentInfo}>
          <h3 className={styles.agentName}>{agent.name}</h3>
          <div className={styles.agentMeta}>
            <span className={styles.model}>{agent.provider === 'codex' ? 'Codex' : 'Claude'} / {agent.model}</span>
            <span className={styles.separator}>&middot;</span>
            <StatusBadge status={agent.status} />
            {agent.isManager && <span className={styles.managerBadge}>Manager</span>}
            {agent.yolo && <span className={styles.yoloBadge}>YOLO</span>}
          </div>
        </div>
        <div className={styles.agentActions}>
          <div className={styles.openInSlot}>
            <OpenInButton
              projectDir={agent.projectDir}
              defaultEditor={defaultEditor}
              onSetDefaultEditor={onSetDefaultEditor ?? (() => {})}
            />
          </div>
          <div className={styles.iconActions}>
            {onToggleEditor && (
              <button
                className={`${styles.actionBtn} ${editorOpen ? styles.actionBtnActive : ''}`}
                onClick={onToggleEditor}
                title="Toggle Code Editor (Cmd+E)"
              >
                <CodeBracketIcon />
              </button>
            )}
            {onToggleFreeTerminal && (
              <button
                className={`${styles.actionBtn} ${freeTerminalOpen ? styles.actionBtnActive : ''}`}
                onClick={onToggleFreeTerminal}
                title="Toggle Terminal (Cmd+J)"
              >
                <TermShellIcon />
              </button>
            )}
            <button
              className={styles.actionBtn}
              onClick={onToggleYolo}
              title={agent.yolo ? 'Disable YOLO' : 'Enable YOLO'}
            >
              <LockIcon unlocked={agent.yolo} />
            </button>
            <button className={styles.actionBtn} onClick={onRestartAgent} title="Restart">
              <RestartIcon />
            </button>
            <button className={styles.actionBtn} onClick={onKillAgent} title="Stop">
              <StopIcon />
            </button>
            {onRemoveAgent && (
              <button
                className={`${styles.actionBtn} ${styles.removeBtn}`}
                onClick={onRemoveAgent}
                title="Close session (Cmd+W)"
              >
                <TrashIcon />
              </button>
            )}
          </div>
        </div>
      </div>

      {agent.status !== 'running' && rawOutput.length > 0 && (
        <div
          className={`${styles.statusBanner} ${
            agent.status === 'errored' ? styles.statusBannerError : styles.statusBannerNeutral
          }`}
        >
          <span>
            {agent.status === 'starting' && 'Starting Claude session...'}
            {agent.status === 'idle' && 'Session is idle. Start or send a prompt to resume.'}
            {agent.status === 'errored' && 'Session disconnected. Restart to reconnect.'}
          </span>
          {agent.status !== 'starting' && (
            <button className={styles.bannerBtn} onClick={onRestartAgent}>
              {agent.status === 'errored' ? 'Reconnect' : 'Start'}
            </button>
          )}
        </div>
      )}

      {/* Agent terminal area */}
      <div className={styles.terminalWrapper}>
        {terminalAgents.map((terminalAgent) => {
          const isSelected = terminalAgent.id === selectedAgentId
          return (
            <div
              key={terminalAgent.id}
              className={`${styles.terminalLayer} ${isSelected ? styles.terminalLayerActive : styles.terminalLayerHidden}`}
              aria-hidden={!isSelected}
            >
              <TerminalPane
                rawOutput={rawOutputs.get(terminalAgent.id) ?? ''}
                onData={isSelected ? (data) => onTerminalData(terminalAgent.id, data) : undefined}
                onResize={(cols, rows) => onTerminalResize(terminalAgent.id, cols, rows)}
                autoFocus={isSelected}
              />
            </div>
          )
        })}

        {!selectedTerminalVisible && (
          <div className={styles.idleEmptyState}>
            <div className={styles.idleEmptyContent}>
              {agent.status === 'starting' ? (
                <div className={styles.idleSpinner} />
              ) : (
                <HydraIcon size={56} />
              )}
              <h3 className={styles.idleTitle}>
                {agent.status === 'starting' && 'Starting session...'}
                {agent.status === 'idle' && 'Session is idle'}
                {agent.status === 'errored' && 'Session disconnected'}
              </h3>
              <p className={styles.idleSubtitle}>
                {agent.status === 'starting' && 'Launching the agent process.'}
                {agent.status === 'idle' && 'Send a message or start to resume.'}
                {agent.status === 'errored' && 'Restart to reconnect.'}
              </p>
              {agent.status !== 'starting' && (
                <button className={styles.idleStartBtn} onClick={onRestartAgent}>
                  {agent.status === 'errored' ? 'Reconnect' : 'Start'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.bottomDock}>
        {/* Input */}
        <InputBar
          onSend={(input, images) => onSendInput(input, images)}
          onModelChange={onSwitchModel}
          disabled={agent.status === 'starting'}
          provider={agent.provider}
          model={agent.model}
          gitBranch={gitBranch}
          projectDir={agent.projectDir}
          onBranchChanged={setGitBranch}
          workMode={agent.workMode}
          worktreeBranch={agent.worktreeBranch}
          onToggleWorkMode={onToggleWorkMode}
          placeholder={
            agent.status === 'errored'
              ? 'Session disconnected. Send to auto-restart...'
              : agent.status === 'idle'
                ? 'Send to start this session...'
                : 'Send a message...'
          }
        />

        {/* Free terminal slider (below chat input) */}
        {onToggleFreeTerminal && (
          <div
            className={`${styles.freeTerminalSlider} ${freeTerminalOpen ? styles.freeTerminalSliderOpen : ''}`}
            aria-hidden={!freeTerminalOpen}
          >
            <div className={styles.freeTerminalSliderInner}>
              {freeTerminalOpen && (
                <FreeTerminalPanel
                  projectDir={agent.projectDir}
                  onClose={onToggleFreeTerminal}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (!editorOpen) {
    return (
      <div className={styles.container} ref={containerRef} onScroll={handleContainerScroll}>
        {terminalSide}
      </div>
    )
  }

  return (
    <div className={styles.splitContainer} ref={outerRef}>
      {terminalSide}
      <SplitHandle onDrag={handleSplitDrag} onDoubleClick={handleSplitDoubleClick} />
      <div className={styles.editorSide}>
        <EditorPanel
          agentId={agent.id}
          projectDir={agent.projectDir}
          theme={theme}
          tabs={editorTabs}
          activeTabPath={editorActiveTabPath}
          fileContents={editorFileContents ?? new Map()}
          onOpenFile={onEditorOpenFile ?? (() => {})}
          onCloseTab={onEditorCloseTab ?? (() => {})}
          onSelectTab={onEditorSelectTab ?? (() => {})}
          onContentChange={onEditorContentChange ?? (() => {})}
          onSaveFile={onEditorSaveFile ?? (() => {})}
        />
      </div>
    </div>
  )
}

function CodeBracketIcon() {
  return (
    <svg
      className={styles.actionIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 3.5L2 8l3.5 4.5" />
      <path d="M10.5 3.5L14 8l-3.5 4.5" />
    </svg>
  )
}

function LockIcon({ unlocked }: { unlocked: boolean }) {
  if (unlocked) {
    return (
      <svg
        className={styles.actionIcon}
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 7h8a1 1 0 0 1 1 1v5H3V8a1 1 0 0 1 1-1Z" />
        <path d="M6 7V5.3a2.7 2.7 0 0 1 5.1-1.2" />
      </svg>
    )
  }

  return (
    <svg
      className={styles.actionIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h8a1 1 0 0 1 1 1v5H3V8a1 1 0 0 1 1-1Z" />
      <path d="M5.4 7V5.1a2.6 2.6 0 0 1 5.2 0V7" />
    </svg>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'var(--color-status-running)',
    idle: 'var(--color-status-idle)',
    errored: 'var(--color-status-error)',
    starting: 'var(--color-status-starting)'
  }

  return (
    <span className={styles.statusBadge}>
      <span className={styles.statusDot} style={{ background: colors[status] }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function TermShellIcon() {
  return (
    <svg
      className={styles.actionIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 5l3 3-3 3" />
      <path d="M8 11h5" />
    </svg>
  )
}

function RestartIcon() {
  return (
    <svg
      className={styles.actionIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 8a5 5 0 1 1-1.3-3.4" />
      <path d="M13 3.5v2.9h-2.9" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg
      className={styles.actionIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg
      className={styles.actionIcon}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 4.5h9" />
      <path d="M6 4.5v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
      <path d="M5.2 6.2l.4 6a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.4-6" />
      <path d="M7 7.2v4.2" />
      <path d="M9 7.2v4.2" />
    </svg>
  )
}

function HydraIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" opacity="0.25">
      <g transform="translate(3, 2)">
        <path d="M7.5 20 Q5.5 14 4 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <circle cx="3.5" cy="8" r="3.2" fill="currentColor"/>
        <path d="M11 20 L11 8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/>
        <circle cx="11" cy="4.5" r="3.8" fill="currentColor"/>
        <path d="M14.5 20 Q16.5 14 18 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <circle cx="18.5" cy="8" r="3.2" fill="currentColor"/>
        <rect x="5" y="21" width="12" height="2.4" rx="1.2" fill="currentColor" opacity="0.35"/>
      </g>
    </svg>
  )
}
