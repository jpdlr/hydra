import styles from './ShortcutsTab.module.css'

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

interface Shortcut {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  label: string
  shortcuts: Shortcut[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: 'Navigation',
    shortcuts: [
      { keys: [MOD, '\\'], description: 'Toggle chat / grid view' },
      { keys: [MOD, '1–9'], description: 'Switch to agent by index' },
    ],
  },
  {
    label: 'Agents',
    shortcuts: [
      { keys: [MOD, 'N'], description: 'New agent' },
      { keys: [MOD, 'W'], description: 'Close selected agent' },
      { keys: [MOD, 'R'], description: 'Restart selected agent' },
      { keys: [MOD, 'Y'], description: 'Toggle YOLO for selected agent' },
      { keys: [MOD, 'Shift', 'Y'], description: 'Toggle global YOLO' },
    ],
  },
  {
    label: 'Editor',
    shortcuts: [
      { keys: [MOD, 'E'], description: 'Toggle code editor' },
      { keys: [MOD, 'J'], description: 'Toggle terminal' },
      { keys: [MOD, 'P'], description: 'Search files' },
      { keys: [MOD, 'S'], description: 'Save file' },
    ],
  },
  {
    label: 'Panels',
    shortcuts: [
      { keys: [MOD, 'Shift', 'P'], description: 'Command palette' },
      { keys: [MOD, ','], description: 'Settings' },
      { keys: [MOD, 'G'], description: 'Git panel' },
      { keys: [MOD, 'U'], description: 'Usage dashboard' },
      { keys: [MOD, 'Shift', 'U'], description: 'Updates' },
    ],
  },
  {
    label: 'General',
    shortcuts: [
      { keys: ['Esc'], description: 'Close dialogs' },
    ],
  },
]

export function ShortcutsTab() {
  return (
    <div className={styles.container}>
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.label} className={styles.group}>
          <span className={styles.groupLabel}>{group.label}</span>
          {group.shortcuts.map((shortcut) => (
            <div key={shortcut.description} className={styles.row}>
              <span className={styles.keys}>
                {shortcut.keys.map((key, i) => (
                  <span key={i}>
                    {i > 0 && <span className={styles.separator}>+</span>}
                    <kbd className={styles.kbd}>{key}</kbd>
                  </span>
                ))}
              </span>
              <span className={styles.description}>{shortcut.description}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
