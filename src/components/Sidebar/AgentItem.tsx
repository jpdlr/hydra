import { useMemo, useState, useRef, useEffect } from 'react'
import type { AgentState } from '@shared/types'
import styles from './AgentItem.module.css'

interface AgentItemProps {
  agent: AgentState
  isSelected: boolean
  onSelect: () => void
  onRename: (newName: string) => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (isNaN(diff) || diff < 0) return 'now'
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

export function AgentItem({ agent, isSelected, onSelect, onRename }: AgentItemProps) {
  const age = useMemo(() => relativeTime(agent.lastActivityAt), [agent.lastActivityAt])
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu])

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  const startRename = () => {
    setContextMenu(null)
    setEditValue(agent.name)
    setEditing(true)
  }

  const commitRename = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== agent.name) {
      onRename(trimmed)
    }
    setEditing(false)
  }

  const cancelRename = () => {
    setEditing(false)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitRename()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelRename()
    }
  }

  return (
    <>
      <button
        className={`${styles.item} ${isSelected ? styles.selected : ''} ${agent.yolo ? styles.yolo : ''}`}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        title={`${agent.name} — ${agent.status}`}
      >
        <span
          className={styles.statusDot}
          style={{ color: STATUS_COLORS[agent.status] || STATUS_COLORS.idle }}
        >
          {agent.status === 'errored' ? '✖' : agent.status === 'running' || agent.status === 'starting' ? '●' : '○'}
        </span>
        {editing ? (
          <input
            ref={inputRef}
            className={styles.renameInput}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleInputKeyDown}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.name}>{agent.name}</span>
        )}
        {agent.provider === 'codex' && <span className={styles.providerBadge}>CDX</span>}
        {agent.isManager && <span className={styles.managerBadge}>MGR</span>}
        {agent.yolo && <span className={styles.yoloBadge}>Y</span>}
        <span className={styles.age}>{age}</span>
      </button>

      {contextMenu && (
        <div
          ref={menuRef}
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className={styles.contextMenuItem} onClick={startRename}>
            Rename
          </button>
        </div>
      )}
    </>
  )
}
