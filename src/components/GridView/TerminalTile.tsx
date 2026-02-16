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

export function TerminalTile({
  agent,
  projectName,
  rawOutput,
  isExpanded,
  onToggleExpand,
  onTerminalData,
  onTerminalResize,
  onStartOrRestart,
  onRemove,
  hidden,
  dragListeners
}: TerminalTileProps) {
  if (hidden) return null

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
        {projectName && <span className={styles.projectBadge}>{projectName}</span>}
        <span className={styles.model}>{agent.model}</span>
        {agent.yolo && <span className={styles.yoloBadge}>YOLO</span>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={(e) => {
              e.stopPropagation()
              onStartOrRestart()
            }}
            title={agent.status === 'running' ? 'Restart' : 'Start / Resume'}
          >
            {agent.status === 'running' ? '↻' : '▶'}
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            title="Remove from grid"
          >
            ✕
          </button>
        </div>
        <span className={styles.expandIcon}>{isExpanded ? '⊖' : '⊕'}</span>
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
        />
      </div>
    </div>
  )
}
