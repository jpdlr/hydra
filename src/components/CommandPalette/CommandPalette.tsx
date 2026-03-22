import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  KEYBINDING_COMMANDS,
  formatKeybinding,
  getShortcutForCommand,
  type HydraCommandId,
  type KeybindingRule
} from '@shared/keybindings'
import styles from './CommandPalette.module.css'

interface Command {
  id: HydraCommandId
  label: string
  category: string
}

interface CommandPaletteProps {
  keybindings: KeybindingRule[]
  onExecute: (commandId: HydraCommandId) => void
  onClose: () => void
}

export function CommandPalette({ keybindings, onExecute, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  const commands: Command[] = useMemo(
    () =>
      KEYBINDING_COMMANDS.filter((command) => command.showInPalette).map((command) => ({
        id: command.id,
        label: command.label,
        category: command.category
      })),
    []
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
    )
  }, [commands, query])

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
    (id: HydraCommandId) => {
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
              {getShortcutForCommand(keybindings, cmd.id) && (
                <span className={styles.shortcut}>
                  {formatKeybinding(getShortcutForCommand(keybindings, cmd.id) || '', isMac).map((k, j) => (
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
