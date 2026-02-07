import { TerminalPane } from '../Terminal/TerminalPane'
import { InputBar } from './InputBar'
import { MessageList } from './MessageList'
import type { AgentState, ChatMessage, ChatRenderMode } from '@shared/types'
import styles from './ChatView.module.css'

interface ChatViewProps {
  agent: AgentState | null
  rawOutput: string
  messages: ChatMessage[]
  chatRenderMode: ChatRenderMode
  onSendInput: (input: string) => void
  onTerminalData: (data: string) => void
  onTerminalResize: (cols: number, rows: number) => void
  onRestartAgent: () => void
  onToggleYolo: () => void
  onKillAgent: () => void
  onToggleChatRenderMode: () => void
}

export function ChatView({
  agent,
  rawOutput,
  messages,
  chatRenderMode,
  onSendInput,
  onTerminalData,
  onTerminalResize,
  onRestartAgent,
  onToggleYolo,
  onKillAgent,
  onToggleChatRenderMode
}: ChatViewProps) {
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

  return (
    <div className={styles.container}>
      {/* Agent header */}
      <div className={styles.agentHeader}>
        <div className={styles.agentInfo}>
          <h3 className={styles.agentName}>{agent.name}</h3>
          <div className={styles.agentMeta}>
            <span className={styles.model}>{agent.model}</span>
            <span className={styles.separator}>·</span>
            <StatusBadge status={agent.status} />
            {agent.yolo && <span className={styles.yoloBadge}>YOLO</span>}
          </div>
        </div>
        <div className={styles.agentActions}>
          <button
            className={`${styles.actionBtn} ${chatRenderMode === 'bubbles' ? styles.actionBtnActive : ''}`}
            onClick={onToggleChatRenderMode}
            title={chatRenderMode === 'terminal' ? 'Switch to bubbles' : 'Switch to terminal'}
          >
            {chatRenderMode === 'terminal' ? <BubblesIcon /> : <TerminalIcon />}
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => window.hydra.openInEditor(agent.projectDir)}
            title="Open in VS Code"
          >
            <VsCodeIcon />
          </button>
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
        </div>
      </div>

      {agent.status !== 'running' && (
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

      {/* Main content — terminal or bubbles */}
      {chatRenderMode === 'terminal' ? (
        <div className={styles.terminalWrapper}>
          <TerminalPane
            key={agent.id}
            rawOutput={rawOutput}
            onData={onTerminalData}
            onResize={onTerminalResize}
          />
        </div>
      ) : (
        <MessageList messages={messages} />
      )}

      {/* Input */}
      <InputBar
        onSend={onSendInput}
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
}

function VsCodeIcon() {
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
      <path d="M10.5 2.5L4 8l6.5 5.5" />
      <path d="M12 3v10" />
      <path d="M4 8L10.5 2.5" />
      <path d="M4 8l6.5 5.5" />
    </svg>
  )
}

function TerminalIcon() {
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
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M5 7l2 1.5L5 10" />
      <path d="M9 10h2" />
    </svg>
  )
}

function BubblesIcon() {
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
      <path d="M3 3h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6l-3 2v-2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M6 6h4" />
      <path d="M6 8.5h2.5" />
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

function HydraIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 28 28" fill="none" opacity="0.25">
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
