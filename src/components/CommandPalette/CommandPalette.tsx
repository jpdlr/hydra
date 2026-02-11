import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import styles from './CommandPalette.module.css'

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '\u2318' : 'Ctrl'

interface Command {
  id: string
  label: string
  category: string
  shortcut?: string
}

const COMMANDS: Command[] = [
  // Navigation
  { id: 'toggle-view', label: 'Toggle Chat / Grid View', category: 'Navigation', shortcut: `${MOD}+\\` },
  // Agents
  { id: 'new-agent', label: 'New Agent', category: 'Agents', shortcut: `${MOD}+N` },
  { id: 'kill-agent', label: 'Close Selected Agent', category: 'Agents', shortcut: `${MOD}+W` },
  { id: 'restart-agent', label: 'Restart Selected Agent', category: 'Agents', shortcut: `${MOD}+R` },
  { id: 'toggle-yolo', label: 'Toggle YOLO for Selected Agent', category: 'Agents', shortcut: `${MOD}+Y` },
  { id: 'toggle-global-yolo', label: 'Toggle Global YOLO', category: 'Agents', shortcut: `${MOD}+Shift+Y` },
  // Editor
  { id: 'toggle-editor', label: 'Toggle Code Editor', category: 'Editor', shortcut: `${MOD}+E` },
  { id: 'file-search', label: 'Search Files', category: 'Editor', shortcut: `${MOD}+P` },
  // Panels
  { id: 'settings', label: 'Open Settings', category: 'Panels', shortcut: `${MOD}+,` },
  { id: 'usage-dashboard', label: 'Usage Dashboard', category: 'Panels', shortcut: `${MOD}+U` },
  { id: 'updates', label: 'Check for Updates', category: 'Panels', shortcut: `${MOD}+Shift+U` },
  { id: 'headless', label: 'Headless Runs', category: 'Panels' },
  { id: 'git-panel', label: 'Git Panel', category: 'Panels', shortcut: `${MOD}+G` },
  // Actions
  { id: 'export-diagnostics', label: 'Export Diagnostics', category: 'Actions' },
]

interface CommandPaletteProps {
  onExecute: (commandId: string) => void
  onClose: () => void
}

export function CommandPalette({ onExecute, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
    )
  }, [query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const container = resultsRef.current
    if (!container) return
    const selected = container.children[selectedIndex] as HTMLElement | undefined
    if (selected?.scrollIntoView) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleExecute = useCallback(
    (id: string) => {
      onExecute(id)
      onClose()
    },
    [onExecute, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[selectedIndex]) {
            handleExecute(filtered[selectedIndex].id)
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filtered, selectedIndex, handleExecute, onClose]
  )

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.popup} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.results} ref={resultsRef}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No matching commands</div>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={`${styles.resultItem} ${i === selectedIndex ? styles.resultItemSelected : ''}`}
              onMouseDown={() => handleExecute(cmd.id)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className={styles.category}>{cmd.category}</span>
              <span className={styles.label}>{cmd.label}</span>
              {cmd.shortcut && (
                <span className={styles.shortcut}>
                  {cmd.shortcut.split('+').map((k, j) => (
                    <kbd key={j}>{k}</kbd>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
