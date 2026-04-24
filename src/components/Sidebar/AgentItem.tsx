import { useMemo, useState, useRef, useEffect } from 'react'
import type { AgentState } from '@shared/types'
import type { ProviderId } from '@shared/types'
import claudeIcon from '@/assets/icons/claude.svg'
import codexIcon from '@/assets/icons/codex.svg'
import opencodeIcon from '@/assets/icons/opencode.svg'

const PROVIDER_ICONS: Record<ProviderId, string> = { claude: claudeIcon, codex: codexIcon, opencode: opencodeIcon }
import styles from './AgentItem.module.css'

interface AgentItemProps {
  agent: AgentState
  isSelected: boolean
  onSelect: () => void
  onRename: (newName: string) => void
  onRemove: () => void
  hotkeyNumber?: number
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

export function AgentItem({ agent, isSelected, onSelect, onRename, onRemove, hotkeyNumber }: AgentItemProps) {
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
        className={`${styles.item} ${isSelected ? styles.selected : ''}`}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        title={`${agent.name} — ${agent.status}`}
      >
        {hotkeyNumber !== undefined ? (
          <span className={styles.hotkeyBadge} aria-label={`Hotkey ${hotkeyNumber}`}>
            {hotkeyNumber}
          </span>
        ) : (
          <span className={styles.statusDot}>
            <StatusIcon status={agent.status} />
          </span>
        )}
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
        {agent.isManager && <span className={styles.managerBadge}>MGR</span>}
        <img
          src={PROVIDER_ICONS[agent.provider] ?? claudeIcon}
          alt={agent.provider}
          className={styles.providerIcon}
        />
        <span className={styles.age}>{age}</span>
      </button>

      {contextMenu && (
        <div
          ref={menuRef}
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button className={styles.contextMenuItem} onClick={startRename}>
            <PencilIcon /> Rename
          </button>
          <button className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`} onClick={() => { setContextMenu(null); onRemove() }}>
            <TrashIcon /> Remove Session
          </button>
        </div>
      )}
    </>
  )
}

function StatusIcon({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.idle
  if (status === 'errored') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" fill={color} opacity="0.2" />
        <line x1="3" y1="3" x2="7" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="7" y1="3" x2="3" y2="7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === 'running' || status === 'starting') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="3.5" fill={color} />
        {status === 'running' && <circle cx="5" cy="5" r="3.5" fill={color}>
          <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
        </circle>}
      </svg>
    )
  }
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <circle cx="5" cy="5" r="3" fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  )
}
