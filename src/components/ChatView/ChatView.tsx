import { useRef, useCallback, useState } from 'react'
import { TerminalPane } from '../Terminal/TerminalPane'
import { InputBar } from './InputBar'
import type { AttachedImage } from './InputBar'
import { EditorPanel } from '../EditorPanel'
import { SplitHandle } from '../EditorPanel/SplitHandle'
import { OpenInButton } from '../Header/OpenInButton'
import type { AgentState, EditorId } from '@shared/types'
import type { EditorTab } from '../EditorPanel/TabBar'
import styles from './ChatView.module.css'

interface ChatViewProps {
  agent: AgentState | null
  rawOutput: string
  onSendInput: (input: string, images?: AttachedImage[]) => void
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
  defaultEditor?: EditorId
  onSetDefaultEditor?: (editorId: EditorId) => void
}

export function ChatView({
  agent,
  rawOutput,
  onSendInput,
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
  onSetDefaultEditor
}: ChatViewProps) {
  // Prevent browser focus-scroll from moving the outer container.
  const containerRef = useRef<HTMLDivElement>(null)
  const handleContainerScroll = useCallback(() => {
    const el = containerRef.current
    if (el && el.scrollTop !== 0) {
      el.scrollTop = 0
    }
  }, [])

  // Split panel width management
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
            <span className={styles.model}>{agent.provider === 'codex' ? 'Codex' : 'Claude'} / {agent.model}</span>
            <span className={styles.separator}>&middot;</span>
            <StatusBadge status={agent.status} />
            {agent.isManager && <span className={styles.managerBadge}>Manager</span>}
            {agent.yolo && <span className={styles.yoloBadge}>YOLO</span>}
          </div>
        </div>
        <div className={styles.agentActions}>
          {onToggleEditor && (
            <button
              className={`${styles.actionBtn} ${editorOpen ? styles.actionBtnActive : ''}`}
              onClick={onToggleEditor}
              title="Toggle Code Editor (Cmd+E)"
            >
              <CodeBracketIcon />
            </button>
          )}
          <OpenInButton
            projectDir={agent.projectDir}
            defaultEditor={defaultEditor}
            onSetDefaultEditor={onSetDefaultEditor ?? (() => {})}
          />
          <button
            className={styles.actionBtn}
            onClick={onToggleYolo}
            title={agent.yolo ? 'Disable YOLO' : 'Enable YOLO'}
          >
            <LockIcon unlocked={agent.yolo} />
          </button>
          <button className={styles.actionBtn} onClick={onRestartAgent} title="Restart">
            ↻
          </button>
          <button className={styles.actionBtn} onClick={onKillAgent} title="Stop">
            ■
          </button>
          {onRemoveAgent && (
            <button className={styles.actionBtn} onClick={onRemoveAgent} title="Close session (Cmd+W)">
              ✕
            </button>
          )}
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

      {/* Centered empty state when idle/errored with no output */}
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
        /* Terminal */
        <div className={styles.terminalWrapper}>
          <TerminalPane
            key={agent.id}
            rawOutput={rawOutput}
            onData={onTerminalData}
            onResize={onTerminalResize}
          />
        </div>
      )}

      {/* Input */}
      <InputBar
        onSend={(input, images) => onSendInput(input, images)}
        disabled={agent.status === 'starting'}
        model={agent.model}
        placeholder={
          agent.status === 'errored'
            ? 'Session disconnected. Send to auto-restart...'
            : agent.status === 'idle'
              ? 'Send to start this session...'
              : 'Send a message...'
        }
      />
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
