export type HydraCommandId =
  | 'toggle-view'
  | 'switch-agent-by-index'
  | 'new-agent'
  | 'close-agent'
  | 'restart-agent'
  | 'toggle-yolo'
  | 'toggle-global-yolo'
  | 'toggle-editor'
  | 'toggle-terminal'
  | 'file-search'
  | 'save-file'
  | 'command-palette'
  | 'settings'
  | 'git-panel'
  | 'usage-dashboard'
  | 'updates'
  | 'close-dialogs'
  | 'headless'
  | 'remote-control'
  | 'export-diagnostics'
  | 'open-keybindings-file'

export interface KeybindingRule {
  command: HydraCommandId
  keys: string
}

export interface KeybindingCommandDefinition {
  id: HydraCommandId
  label: string
  category: string
  showInShortcuts?: boolean
  showInPalette?: boolean
}

export interface KeybindingMatch {
  command: HydraCommandId
  argument?: string
}

const COMMAND_DEFINITIONS = [
  { id: 'toggle-view', label: 'Toggle Chat / Grid View', category: 'Navigation', showInShortcuts: true, showInPalette: true },
  { id: 'switch-agent-by-index', label: 'Switch to agent by index', category: 'Navigation', showInShortcuts: true, showInPalette: false },
  { id: 'new-agent', label: 'New Agent', category: 'Agents', showInShortcuts: true, showInPalette: true },
  { id: 'close-agent', label: 'Close Selected Agent', category: 'Agents', showInShortcuts: true, showInPalette: true },
  { id: 'restart-agent', label: 'Restart Selected Agent', category: 'Agents', showInShortcuts: true, showInPalette: true },
  { id: 'toggle-yolo', label: 'Toggle YOLO for Selected Agent', category: 'Agents', showInShortcuts: true, showInPalette: true },
  { id: 'toggle-global-yolo', label: 'Toggle Global YOLO', category: 'Agents', showInShortcuts: true, showInPalette: true },
  { id: 'toggle-editor', label: 'Toggle Code Editor', category: 'Editor', showInShortcuts: true, showInPalette: true },
  { id: 'toggle-terminal', label: 'Toggle Terminal', category: 'Editor', showInShortcuts: true, showInPalette: false },
  { id: 'file-search', label: 'Search Files', category: 'Editor', showInShortcuts: true, showInPalette: true },
  { id: 'save-file', label: 'Save File', category: 'Editor', showInShortcuts: true, showInPalette: false },
  { id: 'command-palette', label: 'Open Command Palette', category: 'Panels', showInShortcuts: true, showInPalette: false },
  { id: 'settings', label: 'Open Settings', category: 'Panels', showInShortcuts: true, showInPalette: true },
  { id: 'git-panel', label: 'Git Panel', category: 'Panels', showInShortcuts: true, showInPalette: true },
  { id: 'usage-dashboard', label: 'Usage Dashboard', category: 'Panels', showInShortcuts: true, showInPalette: true },
  { id: 'updates', label: 'Check for Updates', category: 'Panels', showInShortcuts: true, showInPalette: true },
  { id: 'close-dialogs', label: 'Close Dialogs', category: 'General', showInShortcuts: true, showInPalette: false },
  { id: 'headless', label: 'Headless Runs', category: 'Panels', showInPalette: true },
  { id: 'remote-control', label: 'Remote Control', category: 'Panels', showInPalette: true },
  { id: 'export-diagnostics', label: 'Export Diagnostics', category: 'Actions', showInPalette: true },
  { id: 'open-keybindings-file', label: 'Open Keybindings File', category: 'Actions', showInPalette: true }
] as const satisfies readonly KeybindingCommandDefinition[]

export const KEYBINDING_COMMANDS: KeybindingCommandDefinition[] = [...COMMAND_DEFINITIONS]

export const KEYBINDING_COMMANDS_BY_ID: Record<HydraCommandId, KeybindingCommandDefinition> =
  Object.fromEntries(KEYBINDING_COMMANDS.map((command) => [command.id, command])) as Record<
    HydraCommandId,
    KeybindingCommandDefinition
  >

export const DEFAULT_KEYBINDINGS: KeybindingRule[] = [
  { command: 'toggle-view', keys: 'mod+\\' },
  { command: 'switch-agent-by-index', keys: 'mod+1-9' },
  { command: 'new-agent', keys: 'mod+n' },
  { command: 'close-agent', keys: 'mod+w' },
  { command: 'restart-agent', keys: 'mod+r' },
  { command: 'toggle-yolo', keys: 'mod+y' },
  { command: 'toggle-global-yolo', keys: 'mod+shift+y' },
  { command: 'toggle-editor', keys: 'mod+e' },
  { command: 'toggle-terminal', keys: 'mod+j' },
  { command: 'file-search', keys: 'mod+p' },
  { command: 'save-file', keys: 'mod+s' },
  { command: 'command-palette', keys: 'mod+shift+p' },
  { command: 'settings', keys: 'mod+,' },
  { command: 'git-panel', keys: 'mod+g' },
  { command: 'usage-dashboard', keys: 'mod+u' },
  { command: 'updates', keys: 'mod+shift+u' },
  { command: 'close-dialogs', keys: 'escape' }
]

function keybindingCommandIds(): HydraCommandId[] {
  return KEYBINDING_COMMANDS.map((command) => command.id)
}

export function isHydraCommandId(value: string): value is HydraCommandId {
  return keybindingCommandIds().includes(value as HydraCommandId)
}

export function mergeKeybindingsWithDefaults(rules: KeybindingRule[]): KeybindingRule[] {
  const overrides = new Map<HydraCommandId, string>()
  for (const rule of rules) {
    if (!isHydraCommandId(rule.command)) continue
    const normalized = rule.keys.trim()
    if (!normalized) continue
    overrides.set(rule.command, normalized)
  }

  return DEFAULT_KEYBINDINGS.map((rule) => ({
    command: rule.command,
    keys: overrides.get(rule.command) ?? rule.keys
  }))
}

function normalizeDisplayToken(token: string, isMac: boolean): string {
  switch (token) {
    case 'mod':
      return isMac ? '\u2318' : 'Ctrl'
    case 'cmd':
    case 'meta':
      return isMac ? '\u2318' : 'Meta'
    case 'ctrl':
    case 'control':
      return 'Ctrl'
    case 'alt':
    case 'option':
      return isMac ? '\u2325' : 'Alt'
    case 'shift':
      return 'Shift'
    case 'escape':
      return 'Esc'
    default:
      return token.length === 1 ? token.toUpperCase() : token
  }
}

export function formatKeybinding(keys: string, isMac: boolean): string[] {
  return keys
    .split('+')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .map((token) => normalizeDisplayToken(token, isMac))
}

function normalizeEventKey(key: string): string {
  if (key === 'Escape') return 'escape'
  if (key === 'Esc') return 'escape'
  if (key.length === 1) return key.toLowerCase()
  return key.toLowerCase()
}

function parseShortcut(keys: string): {
  wantsCtrl: boolean
  wantsMeta: boolean
  wantsAlt: boolean
  wantsShift: boolean
  key: string | null
} {
  let wantsCtrl = false
  let wantsMeta = false
  let wantsAlt = false
  let wantsShift = false
  let key: string | null = null

  for (const rawToken of keys.split('+')) {
    const token = rawToken.trim().toLowerCase()
    if (!token) continue
    switch (token) {
      case 'mod':
        wantsMeta = true
        wantsCtrl = true
        break
      case 'cmd':
      case 'meta':
        wantsMeta = true
        break
      case 'ctrl':
      case 'control':
        wantsCtrl = true
        break
      case 'alt':
      case 'option':
        wantsAlt = true
        break
      case 'shift':
        wantsShift = true
        break
      default:
        key = token
        break
    }
  }

  return { wantsCtrl, wantsMeta, wantsAlt, wantsShift, key }
}

export function matchKeybindingEvent(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  keybindings: KeybindingRule[],
  isMac: boolean
): KeybindingMatch | null {
  const key = normalizeEventKey(event.key)

  for (const binding of keybindings) {
    const parsed = parseShortcut(binding.keys)
    const expectsMeta = binding.keys.includes('mod') ? isMac : parsed.wantsMeta
    const expectsCtrl = binding.keys.includes('mod') ? !isMac : parsed.wantsCtrl

    if (event.metaKey !== expectsMeta) continue
    if (event.ctrlKey !== expectsCtrl) continue
    if (event.altKey !== parsed.wantsAlt) continue
    if (event.shiftKey !== parsed.wantsShift) continue
    if (!parsed.key) continue

    if (parsed.key === '1-9') {
      if (key >= '1' && key <= '9') {
        return { command: binding.command, argument: key }
      }
      continue
    }

    if (key === parsed.key) {
      return { command: binding.command }
    }
  }

  return null
}

export function getShortcutForCommand(
  keybindings: KeybindingRule[],
  commandId: HydraCommandId
): string | null {
  return keybindings.find((binding) => binding.command === commandId)?.keys ?? null
}
