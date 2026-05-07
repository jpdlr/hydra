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

const CATEGORY_ORDER = ['Navigation', 'Agents', 'Editor', 'Panels', 'Actions', 'General']

function categoryRank(c: string): number {
  const idx = CATEGORY_ORDER.indexOf(c)
  return idx === -1 ? CATEGORY_ORDER.length : idx
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function CommandIcon({ category }: { category: string }) {
  const common = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (category) {
    case 'Navigation':
      return (
        <svg {...common}>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )
    case 'Agents':
      return (
        <svg {...common}>
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v4" />
          <line x1="8" y1="16" x2="8" y2="16" />
          <line x1="16" y1="16" x2="16" y2="16" />
        </svg>
      )
    case 'Editor':
      return (
        <svg {...common}>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      )
    case 'Panels':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
      )
    case 'Actions':
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      )
  }
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
    const list = !q
      ? commands
      : commands.filter(
          (cmd) =>
            cmd.label.toLowerCase().includes(q) ||
            cmd.category.toLowerCase().includes(q)
        )
    return [...list].sort((a, b) => {
      const r = categoryRank(a.category) - categoryRank(b.category)
      if (r !== 0) return r
      return 0
    })
  }, [commands, query])

  const groups = useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const cmd of filtered) {
      const arr = map.get(cmd.category) ?? []
      arr.push(cmd)
      map.set(cmd.category, arr)
    }
    return Array.from(map.entries())
  }, [filtered])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const container = resultsRef.current
    if (!container) return
    const selected = container.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null
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

  let flatIndex = 0

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.popup} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.searchRow}>
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="Search commands..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className={styles.results} ref={resultsRef}>
          {filtered.length === 0 && (
            <div className={styles.empty}>No matching commands</div>
          )}
          {groups.map(([category, items]) => (
            <div key={category} className={styles.section}>
              <div className={styles.sectionHeader}>{category}</div>
              {items.map((cmd) => {
                const i = flatIndex++
                const shortcut = getShortcutForCommand(keybindings, cmd.id)
                return (
                  <button
                    key={cmd.id}
                    data-index={i}
                    className={`${styles.resultItem} ${i === selectedIndex ? styles.resultItemSelected : ''}`}
                    onMouseDown={() => handleExecute(cmd.id)}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <span className={styles.icon}>
                      <CommandIcon category={cmd.category} />
                    </span>
                    <span className={styles.label}>{cmd.label}</span>
                    {shortcut && (
                      <span className={styles.shortcut}>
                        {formatKeybinding(shortcut, isMac).map((k, j) => (
                          <kbd key={j}>{k}</kbd>
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
        <div className={styles.footer}>
          <span className={styles.footerHint}>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            Navigate
          </span>
          <span className={styles.footerHint}>
            <kbd>Enter</kbd>
            Select
          </span>
          <span className={styles.footerHint}>
            <kbd>Esc</kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  )
}
