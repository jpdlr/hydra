import { useEffect } from 'react'
import {
  KEYBINDING_COMMANDS,
  formatKeybinding,
  getShortcutForCommand,
  type KeybindingCommandDefinition,
  type KeybindingRule
} from '@shared/keybindings'
import styles from './ShortcutsOverlay.module.css'

interface ShortcutsOverlayProps {
  keybindings: KeybindingRule[]
  onClose: () => void
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

export function ShortcutsOverlay({ keybindings, onClose }: ShortcutsOverlayProps) {
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

  const groups = KEYBINDING_COMMANDS
    .filter((cmd) => cmd.showInShortcuts)
    .reduce<Map<string, KeybindingCommandDefinition[]>>((acc, cmd) => {
      const list = acc.get(cmd.category) ?? []
      acc.set(cmd.category, [...list, cmd])
      return acc
    }, new Map())

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Keyboard Shortcuts</span>
          <span className={styles.hint}>Esc to close</span>
        </div>
        <div className={styles.body}>
          {Array.from(groups.entries()).map(([label, commands]) => (
            <div key={label} className={styles.group}>
              <div className={styles.groupLabel}>{label}</div>
              {commands.map((cmd) => {
                const shortcut = getShortcutForCommand(keybindings, cmd.id)
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
          ))}
        </div>
      </div>
    </div>
  )
}
