import { memo } from 'react'
import { TerminalPane } from '../Terminal/TerminalPane'
import type { AgentState } from '@shared/types'
import styles from './TerminalTile.module.css'

interface TerminalTileProps {
  agent: AgentState
  projectName?: string
  rawOutput: string
  isExpanded: boolean
  onToggleExpand: () => void
  onTerminalData: (data: string) => void
  onTerminalResize: (cols: number, rows: number) => void
  onStartOrRestart: () => void
  onStopAgent: () => void
  onRemove: () => void
  hidden: boolean
  dragListeners?: Record<string, unknown>
}

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--color-status-running)',
  idle: 'var(--color-status-idle)',
  errored: 'var(--color-status-error)',
  starting: 'var(--color-status-starting)'
}

function RestartIcon() {
  return (
    <svg className={styles.actionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.3-3.4" />
      <path d="M13 3.5v2.9h-2.9" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg className={styles.actionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className={styles.actionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 4.5h9" />
      <path d="M6 4.5v-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" />
      <path d="M5.2 6.2l.4 6a1 1 0 0 0 1 .9h2.8a1 1 0 0 0 1-.9l.4-6" />
      <path d="M7 7.2v4.2" />
      <path d="M9 7.2v4.2" />
    </svg>
  )
}

function TerminalTileInner({
  agent,
  projectName,
  rawOutput,
  isExpanded,
  onToggleExpand,
  onTerminalData,
  onTerminalResize,
  onStartOrRestart,
  onStopAgent,
  onRemove,
  hidden,
  dragListeners
}: TerminalTileProps) {
  if (hidden) return null

  const modelLabel = agent.provider === 'codex' ? `Codex / ${agent.model}` : agent.model

  return (
    <div
      className={`${styles.tile} ${agent.yolo ? styles.yolo : ''} ${isExpanded ? styles.expanded : ''}`}
    >
      {/* Tile header */}
      <div className={styles.header} onClick={onToggleExpand}>
        {dragListeners && (
          <span
            className={styles.dragHandle}
            {...dragListeners}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            ⠿
          </span>
        )}
        <span
          className={styles.statusDot}
          style={{ color: STATUS_COLORS[agent.status] }}
        >
          {agent.status === 'running' ? '●' : agent.status === 'errored' ? '✖' : '○'}
        </span>
        <span className={styles.name}>{agent.name}</span>

        <div className={styles.badges}>
          {projectName && <span className={styles.projectBadge}>{projectName}</span>}
          <span className={styles.modelBadge}>{modelLabel}</span>
          {agent.yolo && <span className={styles.yoloBadge}>YOLO</span>}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={(e) => { e.stopPropagation(); onStartOrRestart() }}
            title={agent.status === 'running' ? 'Restart' : 'Start / Resume'}
          >
            <RestartIcon />
          </button>
          {agent.status === 'running' && (
            <button
              type="button"
              className={styles.actionBtn}
              onClick={(e) => { e.stopPropagation(); onStopAgent() }}
              title="Stop"
            >
              <StopIcon />
            </button>
          )}
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.removeBtn}`}
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            title="Remove"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Terminal */}
      <div className={styles.terminalWrapper}>
        {agent.status !== 'running' && (
          <div className={styles.statusNotice}>
            <span>
              {agent.status === 'starting' && 'Starting...'}
              {agent.status === 'idle' && 'Idle'}
              {agent.status === 'errored' && 'Disconnected'}
            </span>
            {agent.status !== 'starting' && (
              <button className={styles.statusNoticeBtn} onClick={onStartOrRestart}>
                {agent.status === 'errored' ? 'Reconnect' : 'Start'}
              </button>
            )}
          </div>
        )}
        <TerminalPane
          rawOutput={rawOutput}
          onData={onTerminalData}
          onResize={onTerminalResize}
          fontSize={11}
          lineHeight={1.3}
          autoFocus={false}
        />
      </div>
    </div>
  )
}

export const TerminalTile = memo(TerminalTileInner, (prev, next) => {
  return (
    prev.agent === next.agent &&
    prev.projectName === next.projectName &&
    prev.rawOutput === next.rawOutput &&
    prev.isExpanded === next.isExpanded &&
    prev.hidden === next.hidden &&
    prev.dragListeners === next.dragListeners
  )
})
