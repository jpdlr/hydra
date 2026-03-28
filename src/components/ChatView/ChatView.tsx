import { useRef, useCallback, useState, useEffect } from 'react'
import { TerminalPane } from '../Terminal/TerminalPane'
import { FreeTerminalPanel } from '../Terminal/FreeTerminalPanel'
import { InputBar } from './InputBar'
import type { AttachedImage } from './InputBar'
import { EditorPanel } from '../EditorPanel'
import { SplitHandle } from '../EditorPanel/SplitHandle'
import type { AgentState, ProviderId } from '@shared/types'
import type { EditorTab } from '../EditorPanel/TabBar'
import claudeIcon from '@/assets/claude-icon.png'
import codexIcon from '@/assets/codex-icon.png'
import styles from './ChatView.module.css'

interface ChatViewProps {
  agent: AgentState | null
  rawOutput: string
  onSendInput: (input: string, images?: AttachedImage[]) => void
  onSwitchModel?: (model: string) => void
  onTerminalData: (data: string) => void
  onTerminalResize: (cols: number, rows: number) => void
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
  // Free terminal
  freeTerminalOpen?: boolean
  onToggleFreeTerminal?: () => void
  gitPanelOpen?: boolean
  onOpenGitPanel?: () => void
}

export function ChatView({
  agent,
  rawOutput,
  onSendInput,
  onSwitchModel,
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
  freeTerminalOpen = false,
  onToggleFreeTerminal,
  gitPanelOpen = false,
  onOpenGitPanel
}: ChatViewProps) {
  // Git branch for the current project
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  useEffect(() => {
    if (!agent?.projectDir) { setGitBranch(null); return }
    let cancelled = false
    window.hydra.getGitStatus(agent.projectDir).then((status) => {
      if (!cancelled) setGitBranch(status.branch)
    }).catch(() => {
      if (!cancelled) setGitBranch(null)
    })
    // Poll every 15s to keep branch fresh
    const interval = setInterval(() => {
      window.hydra.getGitStatus(agent.projectDir).then((status) => {
        if (!cancelled) setGitBranch(status.branch)
      }).catch(() => {})
    }, 15_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [agent?.projectDir])

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
            <ProviderModelPill provider={agent.provider} model={agent.model} />
            <span className={styles.separator}>&middot;</span>
            <StatusBadge status={agent.status} />
            {agent.isManager && <span className={styles.managerBadge}>Manager</span>}
            {agent.yolo && <span className={styles.yoloBadge}>YOLO</span>}
          </div>
        </div>
        <div className={styles.agentActions}>
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
            {onOpenGitPanel && (
              <button
                className={`${styles.actionBtn} ${gitPanelOpen ? styles.actionBtnActive : ''}`}
                onClick={onOpenGitPanel}
                title="Open Git Panel (Cmd+G)"
              >
                <GitIcon />
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
      {agent.status !== 'running' && rawOutput.length === 0 ? (
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
      ) : (
        <div className={styles.terminalWrapper}>
          <div className={styles.terminalStack}>
            <div className={`${styles.terminalLayer} ${styles.terminalLayerActive}`}>
              <TerminalPane
                key={agent.id}
                rawOutput={rawOutput}
                onData={onTerminalData}
                onResize={onTerminalResize}
              />
            </div>
          </div>
        </div>
      )}

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

function ProviderModelPill({ provider, model }: { provider: ProviderId; model: string }) {
  const src = provider === 'codex' ? codexIcon : claudeIcon
  const alt = provider === 'codex' ? 'Codex' : 'Claude'
  return (
    <span className={styles.modelPill}>
      <img
        src={src}
        alt={alt}
        width={14}
        height={14}
        className={styles.providerIcon}
      />
      {formatModelLabel(provider, model)}
    </span>
  )
}

function formatModelLabel(provider: ProviderId, model: string): string {
  if (provider === 'codex') return model.toUpperCase()
  return model.charAt(0).toUpperCase() + model.slice(1).toLowerCase()
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

function GitIcon() {
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
      <circle cx="4.5" cy="3.5" r="1.6" />
      <circle cx="11.5" cy="5.5" r="1.6" />
      <circle cx="4.5" cy="12.5" r="1.6" />
      <path d="M6 4.1l4 0.8" />
      <path d="M4.5 5.1v5.8" />
      <path d="M5.8 11.4l4.3-4.2" />
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
