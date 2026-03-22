import {
  KEYBINDING_COMMANDS,
  formatKeybinding,
  getShortcutForCommand,
  type KeybindingCommandDefinition,
  type KeybindingRule
} from '@shared/keybindings'
import styles from './ShortcutsTab.module.css'

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

interface ShortcutsTabProps {
  keybindings: KeybindingRule[]
  keybindingsPath: string
}

export function ShortcutsTab({ keybindings, keybindingsPath }: ShortcutsTabProps) {
  const groups = KEYBINDING_COMMANDS
    .filter((command) => command.showInShortcuts)
    .reduce<Map<string, KeybindingCommandDefinition[]>>((acc, command) => {
      const existing = acc.get(command.category) ?? []
      acc.set(command.category, [...existing, command])
      return acc
    }, new Map())

  return (
    <div className={styles.container}>
      {keybindingsPath && (
        <div className={styles.group}>
          <span className={styles.groupLabel}>Config File</span>
          <div className={styles.row}>
            <span className={styles.description}>{keybindingsPath}</span>
            <button
              type="button"
              className={styles.openButton}
              onClick={() => {
                void window.hydra.openPath(keybindingsPath)
              }}
            >
              Open File
            </button>
          </div>
        </div>
      )}
      {Array.from(groups.entries()).map(([label, commands]) => (
        <div key={label} className={styles.group}>
          <span className={styles.groupLabel}>{label}</span>
          {commands.map((command) => {
            const shortcut = getShortcutForCommand(keybindings, command.id)
            const keys = shortcut ? formatKeybinding(shortcut, isMac) : ['Unbound']
            return (
              <div key={command.id} className={styles.row}>
                <span className={styles.keys}>
                  {keys.map((key, index) => (
                    <span key={`${command.id}-${index}`}>
                      {index > 0 && <span className={styles.separator}>+</span>}
                      <kbd className={styles.kbd}>{key}</kbd>
                    </span>
                  ))}
                </span>
                <span className={styles.description}>{command.label}</span>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
