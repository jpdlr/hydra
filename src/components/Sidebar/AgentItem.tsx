import { useMemo } from 'react'
import type { AgentState } from '@shared/types'
import styles from './AgentItem.module.css'

interface AgentItemProps {
  agent: AgentState
  isSelected: boolean
  onSelect: () => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}y`
}

const STATUS_COLORS: Record<string, string> = {
  running: 'var(--color-status-running)',
  idle: 'var(--color-status-idle)',
  errored: 'var(--color-status-error)',
  starting: 'var(--color-status-starting)'
}

export function AgentItem({ agent, isSelected, onSelect }: AgentItemProps) {
  const age = useMemo(() => relativeTime(agent.createdAt), [agent.createdAt])

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
      {agent.provider === 'codex' && <span className={styles.providerBadge}>CDX</span>}
      {agent.isManager && <span className={styles.managerBadge}>MGR</span>}
      {agent.yolo && <span className={styles.yoloBadge}>Y</span>}
      <span className={styles.age}>{age}</span>
    </button>
  )
}
