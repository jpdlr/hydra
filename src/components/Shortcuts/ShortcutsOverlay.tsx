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
  /**
   * Modifier keys currently held. When non-empty, the overlay filters to
   * bindings whose modifier set exactly matches.
   */
  heldModifiers?: Set<ModifierName>
  /**
   * 'transient' — opened by holding modifiers; search input not focused, no
   * Esc handler (closes when modifiers released by parent).
   * 'persistent' — opened explicitly; search input focused; Esc closes.
   */
  mode?: 'transient' | 'persistent'
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

export function ShortcutsOverlay({
  keybindings,
  onClose,
  heldModifiers,
  mode = 'persistent'
}: ShortcutsOverlayProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mode !== 'persistent') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [mode, onClose])

  useEffect(() => {
    if (mode === 'persistent') inputRef.current?.focus()
  }, [mode])

  const allBindings = useMemo<BindingEntry[]>(() => {
    return KEYBINDING_COMMANDS
      .filter((cmd) => cmd.showInShortcuts)
      .map((cmd) => {
        const shortcut = getShortcutForCommand(keybindings, cmd.id)
        const modifiers = shortcut ? getBindingModifiers(shortcut, isMac) : new Set<ModifierName>()
        return { cmd, shortcut, modifiers }
      })
  }, [keybindings])

  const filteredByModifier = useMemo(() => {
    if (!heldModifiers || heldModifiers.size === 0) return allBindings
    return allBindings.filter((b) => b.shortcut && modifiersEqual(b.modifiers, heldModifiers))
  }, [allBindings, heldModifiers])

  const filtered = useMemo(() => {
    if (!query.trim()) return filteredByModifier
    return filteredByModifier
      .map((b) => {
        const labelScore = fuzzyScore(query, b.cmd.label)
        const keysScore = b.shortcut ? fuzzyScore(query, b.shortcut) : -1
        const score = Math.max(labelScore, keysScore)
        return { entry: b, score }
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.entry)
  }, [filteredByModifier, query])

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
    if (!heldModifiers || heldModifiers.size === 0) return []
    const order: ModifierName[] = ['meta', 'ctrl', 'alt', 'shift']
    return order.filter((m) => heldModifiers.has(m)).map((m) => formatModifierChip(m))
  }, [heldModifiers])

  return (
    <div
      className={`${styles.backdrop} ${mode === 'transient' ? styles.backdropTransient : ''}`}
      onClick={mode === 'persistent' ? onClose : undefined}
      role="dialog"
      aria-modal={mode === 'persistent'}
      aria-label="Keyboard shortcuts"
    >
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Keyboard Shortcuts</span>
          {heldChips.length > 0 && (
            <span className={styles.heldChips}>
              {heldChips.map((chip, i) => (
                <kbd key={i} className={styles.kbd}>{chip}</kbd>
              ))}
            </span>
          )}
          <span className={styles.hint}>{mode === 'persistent' ? 'Esc to close' : 'Release to close'}</span>
        </div>
        {mode === 'persistent' && (
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
        )}
        <div className={styles.body}>
          {filtered.length === 0 ? (
            <div className={styles.empty}>No matching shortcuts.</div>
          ) : (
            groups.map(([label, entries]) => (
              <div key={label} className={styles.group}>
                <div className={styles.groupLabel}>{label}</div>
                {entries.map(({ cmd, shortcut }) => {
                  const keys = shortcut ? formatKeybinding(shortcut, isMac) : ['Unbound']
                  return (
                    <div key={cmd.id} className={styles.row}>
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
