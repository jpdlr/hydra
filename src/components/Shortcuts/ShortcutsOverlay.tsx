import { useEffect, useMemo, useRef, useState } from 'react'
import {
  KEYBINDING_COMMANDS,
  formatKeybinding,
  getBindingModifiers,
  getShortcutForCommand,
  type KeybindingCommandDefinition,
  type KeybindingRule,
  type ModifierName
} from '@shared/keybindings'
import { fuzzyScore } from '../../lib/fuzzy'
import styles from './ShortcutsOverlay.module.css'

interface ShortcutsOverlayProps {
  keybindings: KeybindingRule[]
  onClose: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

interface BindingEntry {
  cmd: KeybindingCommandDefinition
  shortcut: string | null
  modifiers: Set<ModifierName>
}

function modifiersEqual(a: Set<ModifierName>, b: Set<ModifierName>): boolean {
  if (a.size !== b.size) return false
  for (const m of a) if (!b.has(m)) return false
  return true
}

export function ShortcutsOverlay({ keybindings, onClose }: ShortcutsOverlayProps) {
  const [query, setQuery] = useState('')
  const [heldMods, setHeldMods] = useState<Set<ModifierName>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus search on open.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Esc closes.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Track held modifiers — used to highlight matching rows.
  useEffect(() => {
    const updateFromEvent = (e: KeyboardEvent) => {
      const next = new Set<ModifierName>()
      if (e.metaKey) next.add('meta')
      if (e.ctrlKey) next.add('ctrl')
      if (e.altKey) next.add('alt')
      if (e.shiftKey) next.add('shift')
      setHeldMods(next)
    }
    const onBlur = () => setHeldMods(new Set())
    window.addEventListener('keydown', updateFromEvent)
    window.addEventListener('keyup', updateFromEvent)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', updateFromEvent)
      window.removeEventListener('keyup', updateFromEvent)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const allBindings = useMemo<BindingEntry[]>(() => {
    return KEYBINDING_COMMANDS
      .filter((cmd) => cmd.showInShortcuts)
      .map((cmd) => {
        const shortcut = getShortcutForCommand(keybindings, cmd.id)
        const modifiers = shortcut ? getBindingModifiers(shortcut, isMac) : new Set<ModifierName>()
        return { cmd, shortcut, modifiers }
      })
  }, [keybindings])

  const filtered = useMemo(() => {
    if (!query.trim()) return allBindings
    return allBindings
      .map((b) => {
        const labelScore = fuzzyScore(query, b.cmd.label)
        const keysScore = b.shortcut ? fuzzyScore(query, b.shortcut) : -1
        const score = Math.max(labelScore, keysScore)
        return { entry: b, score }
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.entry)
  }, [allBindings, query])

  const groups = useMemo(() => {
    const map = new Map<string, BindingEntry[]>()
    for (const entry of filtered) {
      const list = map.get(entry.cmd.category) ?? []
      list.push(entry)
      map.set(entry.cmd.category, list)
    }
    return Array.from(map.entries())
  }, [filtered])

  const heldChips = useMemo(() => {
    const order: ModifierName[] = ['meta', 'ctrl', 'alt', 'shift']
    return order.filter((m) => heldMods.has(m)).map((m) => formatModifierChip(m))
  }, [heldMods])

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Keyboard Shortcuts</span>
          {heldChips.length > 0 && (
            <span className={styles.heldChips}>
              {heldChips.map((chip, i) => (
                <kbd key={i} className={`${styles.kbd} ${styles.kbdHeld}`}>{chip}</kbd>
              ))}
            </span>
          )}
          <span className={styles.hint}>Esc to close</span>
        </div>
        <div className={styles.searchWrapper}>
          <input
            ref={inputRef}
            className={styles.search}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shortcuts..."
          />
        </div>
        <div className={styles.body}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>No matching shortcuts.</div>
          ) : (
            groups.map(([label, entries]) => (
              <div key={label} className={styles.group}>
                <div className={styles.groupLabel}>{label}</div>
                {entries.map(({ cmd, shortcut, modifiers }) => {
                  const keys = shortcut ? formatKeybinding(shortcut, isMac) : ['Unbound']
                  const highlighted = heldMods.size > 0 && modifiersEqual(modifiers, heldMods)
                  return (
                    <div
                      key={cmd.id}
                      className={`${styles.row} ${highlighted ? styles.rowHighlighted : ''}`}
                    >
                      <span className={styles.label}>{cmd.label}</span>
                      <span className={styles.keys}>
                        {keys.map((key, idx) => (
                          <span key={`${cmd.id}-${idx}`} className={styles.keysGroup}>
                            {idx > 0 && <span className={styles.separator}>+</span>}
                            <kbd className={styles.kbd}>{key}</kbd>
                          </span>
                        ))}
                      </span>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function formatModifierChip(mod: ModifierName): string {
  switch (mod) {
    case 'meta':
      return isMac ? '⌘' : 'Meta'
    case 'ctrl':
      return 'Ctrl'
    case 'alt':
      return isMac ? '⌥' : 'Alt'
    case 'shift':
      return 'Shift'
  }
}
