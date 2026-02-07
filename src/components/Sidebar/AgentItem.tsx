import type { AgentState } from '@shared/types'
import styles from './AgentItem.module.css'

interface AgentItemProps {
  agent: AgentState
  isSelected: boolean
  onSelect: () => void
}

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--color-status-running)',
  idle: 'var(--color-status-idle)',
  errored: 'var(--color-status-error)',
  starting: 'var(--color-status-starting)'
}

export function AgentItem({ agent, isSelected, onSelect }: AgentItemProps) {
  return (
    <button
      className={`${styles.item} ${isSelected ? styles.selected : ''} ${agent.yolo ? styles.yolo : ''}`}
      onClick={onSelect}
      title={`${agent.name} — ${agent.status}`}
    >
      <span
        className={styles.statusDot}
        style={{ color: STATUS_COLORS[agent.status] || STATUS_COLORS.idle }}
      >
        {agent.status === 'errored' ? '✖' : agent.status === 'running' || agent.status === 'starting' ? '●' : '○'}
      </span>
      <span className={styles.name}>{agent.name}</span>
      {agent.yolo && <span className={styles.yoloBadge}>Y</span>}
    </button>
  )
}
