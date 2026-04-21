import { useEffect, useMemo, useState } from 'react'
import type {
  AppConfig,
  FreeTerminalLifecyclePolicy,
  ProviderId,
  TerminalCursorStyle,
  TerminalShellMode,
  ThemeId,
  ViewMode
} from '@shared/types'
import type { KeybindingRule } from '@shared/keybindings'
import {
  PROVIDER_LABELS,
  MAX_CONCURRENT_AGENTS_HARD_LIMIT
} from '@shared/types'
import { useRuntimeProviderModels } from '../../hooks/useRuntimeProviderModels'
import { fuzzyScoreAny } from '../../lib/fuzzy'
import { ShortcutsTab } from './ShortcutsTab'
import { SkillsTab } from './SkillsTab'
import claudeIcon from '../../assets/icons/claude.svg'
import codexIcon from '../../assets/icons/codex.svg'
import opencodeIcon from '../../assets/icons/opencode.svg'
import styles from './SettingsPanel.module.css'

const PROVIDER_ICONS: Record<ProviderId, string> = { claude: claudeIcon, codex: codexIcon, opencode: opencodeIcon }

type SectionId =
  | 'appearance'
  | 'agents'
  | 'sessions'
  | 'remote'
  | 'terminal'
  | 'observability'
  | 'shortcuts'
  | 'skills'

const SECTIONS: Array<{ id: SectionId; label: string; keywords: string[] }> = [
  { id: 'appearance', label: 'Appearance', keywords: ['appearance', 'theme', 'color', 'view', 'chat', 'grid', 'sound', 'dark', 'light', 'midnight', 'terracotta'] },
  { id: 'agents', label: 'Agent Defaults', keywords: ['agent', 'provider', 'model', 'claude', 'codex', 'opencode', 'concurrent', 'max', 'yolo', 'project', 'directory'] },
  { id: 'sessions', label: 'Session Import', keywords: ['session', 'import', 'limit', 'age', 'prefix', 'hidden'] },
  { id: 'remote', label: 'Remote Control', keywords: ['remote', 'control', 'timeout'] },
  { id: 'terminal', label: 'Terminal', keywords: ['terminal', 'shell', 'bash', 'zsh', 'pwsh', 'powershell', 'font', 'cursor', 'webgl', 'path', 'scrollback', 'background', 'lru', 'idle', 'lifecycle', 'cmd+j'] },
  { id: 'observability', label: 'Observability', keywords: ['observability', 'error', 'reporting', 'diagnostics', 'sensitive', 'endpoint'] },
  { id: 'shortcuts', label: 'Shortcuts', keywords: ['shortcut', 'keybinding', 'hotkey', 'keys'] },
  { id: 'skills', label: 'Skills', keywords: ['skill', 'prompt'] }
]

const PROVIDERS: ProviderId[] = ['claude', 'codex', 'opencode']
const THEMES: Array<{ id: ThemeId; label: string; description: string; swatches: [string, string] }> = [
  {
    id: 'dark',
    label: 'Terracotta',
    description: 'Current warm dark palette with terracotta accents.',
    swatches: ['#262624', '#30302e']
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Clean modern dark palette with subtle borders.',
    swatches: ['#191919', '#232323']
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Warm light palette for daytime use.',
    swatches: ['#FAF6F1', '#FFFFFF']
  }
]

interface SettingsPanelProps {
  config: AppConfig
  keybindings: KeybindingRule[]
  keybindingsPath: string
  onUpdate: (partial: Partial<AppConfig>) => void
  onClose: () => void
  globalYolo: boolean
  onToggleGlobalYolo: () => void
}

function matchesSearch(query: string, ...keywords: string[]): boolean {
  if (!query) return true
  return fuzzyScoreAny(query, ...keywords) >= 0
}

export function SettingsPanel({
  config,
  keybindings,
  keybindingsPath,
  onUpdate,
  onClose,
  globalYolo,
  onToggleGlobalYolo
}: SettingsPanelProps) {
  const [exportState, setExportState] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>('appearance')
  const [searchQuery, setSearchQuery] = useState('')
  const [configPath, setConfigPath] = useState('')
  const { providerModels, getDefaultModel } = useRuntimeProviderModels()

  useEffect(() => {
    window.hydra.getConfigPath().then(setConfigPath).catch(() => { /* ignore */ })
  }, [])

  const searching = searchQuery.trim().length > 0
  const visibleSectionIds = useMemo<Set<SectionId>>(() => {
    if (!searching) return new Set([activeSection])
    const matched = SECTIONS.filter((s) => matchesSearch(searchQuery, ...s.keywords)).map((s) => s.id)
    return new Set(matched)
  }, [searching, searchQuery, activeSection])
  const isVisible = (id: SectionId) => visibleSectionIds.has(id)

  const openConfigJson = () => {
    if (configPath) void window.hydra.openPath(configPath)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <nav className={styles.sidebarNav}>
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  className={`${styles.sidebarItem} ${!searching && activeSection === s.id ? styles.sidebarItemActive : ''} ${searching && visibleSectionIds.has(s.id) ? styles.sidebarItemMatch : ''}`}
                  onClick={() => { setActiveSection(s.id); setSearchQuery('') }}
                >
                  {s.label}
                </button>
              ))}
            </nav>
            <div className={styles.sidebarFooter}>
              <button
                className={styles.sidebarFooterBtn}
                onClick={openConfigJson}
                disabled={!configPath}
                title={configPath || 'Open config.json in editor'}
              >
                Edit config.json
              </button>
            </div>
          </aside>

          <div className={styles.content}>
            <div className={styles.searchBar}>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className={styles.body}>
          {/* ── Appearance ─────────────────────────────────────── */}
          {isVisible('appearance') && <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Appearance</h3>

            <div className={styles.field}>
              <label className={styles.label}>Color Theme</label>
              <div className={styles.themePicker}>
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    className={`${styles.themeOption} ${config.theme === theme.id ? styles.themeOptionActive : ''}`}
                    onClick={() => onUpdate({ theme: theme.id })}
                  >
                    <span className={styles.themeSwatches}>
                      <span className={styles.themeSwatch} style={{ background: theme.swatches[0] }} />
                      <span className={styles.themeSwatch} style={{ background: theme.swatches[1] }} />
                    </span>
                    <span className={styles.themeMeta}>
                      <span className={styles.themeName}>{theme.label}</span>
                      <span className={styles.themeDescription}>{theme.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Default View</label>
              <div className={styles.segmented}>
                <button
                  className={`${styles.segment} ${config.defaultViewMode === 'chat' ? styles.active : ''}`}
                  onClick={() => onUpdate({ defaultViewMode: 'chat' as ViewMode })}
                >
                  Chat
                </button>
                <button
                  className={`${styles.segment} ${config.defaultViewMode === 'grid' ? styles.active : ''}`}
                  onClick={() => onUpdate({ defaultViewMode: 'grid' as ViewMode })}
                >
                  Grid
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.enableSoundEffects}
                  onChange={(e) => onUpdate({ enableSoundEffects: e.target.checked })}
                  className={styles.checkbox}
                />
                <span>Play sound on agent events</span>
              </label>
            </div>
          </div>}

          {/* ── Agent Defaults ─────────────────────────────────── */}
          {isVisible('agents') && <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Agent Defaults</h3>

            <div className={styles.field}>
              <label className={styles.label}>Default Provider</label>
              <div className={styles.segmented}>
                {PROVIDERS.map((p) => (
                  <button
                    key={p}
                    className={`${styles.segment} ${config.defaultProvider === p ? styles.active : ''}`}
                    onClick={() => onUpdate({
                      defaultProvider: p,
                      defaultModel: getDefaultModel(p)
                    })}
                  >
                    <img src={PROVIDER_ICONS[p]} alt="" className={styles.providerIcon} />
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Default Model</label>
              <select
                className={styles.select}
                value={
                  providerModels[config.defaultProvider].some((m) => m.id === config.defaultModel)
                    ? config.defaultModel
                    : '__custom__'
                }
                onChange={(e) => {
                  if (e.target.value !== '__custom__') {
                    onUpdate({ defaultModel: e.target.value })
                  }
                }}
              >
                {providerModels[config.defaultProvider].map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
                <option value="__custom__">Custom...</option>
              </select>
              {!providerModels[config.defaultProvider].some((m) => m.id === config.defaultModel) && (
                <input
                  className={styles.dirInput}
                  type="text"
                  value={config.defaultModel}
                  onChange={(e) => onUpdate({ defaultModel: e.target.value })}
                  placeholder="Custom model identifier"
                  style={{ marginTop: '0.375rem' }}
                />
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Max Concurrent Agents</label>
              <input
                className={styles.numberInput}
                type="number"
                min={1}
                max={MAX_CONCURRENT_AGENTS_HARD_LIMIT}
                value={config.maxAgents}
                onChange={(e) =>
                  onUpdate({
                    maxAgents: Math.max(
                      1,
                      Math.min(MAX_CONCURRENT_AGENTS_HARD_LIMIT, parseInt(e.target.value, 10) || 8)
                    )
                  })
                }
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Global YOLO Mode</label>
              <div className={styles.inlineRow}>
                <span className={styles.inlineHint}>
                  Skip all permission prompts across agents
                </span>
                <button
                  className={`${styles.yoloToggle} ${globalYolo ? styles.yoloActive : ''}`}
                  onClick={onToggleGlobalYolo}
                >
                  {globalYolo ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Default Project Directory</label>
              <div className={styles.dirField}>
                <input
                  className={styles.dirInput}
                  type="text"
                  value={config.defaultProjectDir}
                  onChange={(e) => onUpdate({ defaultProjectDir: e.target.value })}
                  placeholder="/path/to/projects"
                />
                <button
                  className={styles.browseBtn}
                  onClick={async () => {
                    const dir = await window.hydra.selectDirectory()
                    if (dir) onUpdate({ defaultProjectDir: dir })
                  }}
                >
                  Browse
                </button>
              </div>
            </div>
          </div>}

          {/* ── Session Import ─────────────────────────────────── */}
          {isVisible('sessions') && <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Session Import</h3>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.importSessionsOnStartup}
                  onChange={(e) => onUpdate({ importSessionsOnStartup: e.target.checked })}
                  className={styles.checkbox}
                />
                <span>Import Claude sessions on startup</span>
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Import Limit (0 = unlimited)</label>
              <input
                className={styles.numberInput}
                type="number"
                min={0}
                max={20000}
                value={config.sessionImportLimit}
                onChange={(e) =>
                  onUpdate({ sessionImportLimit: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Max Age (days, 0 = no limit)</label>
              <input
                className={styles.numberInput}
                type="number"
                min={0}
                max={365}
                value={config.sessionMaxAgeDays}
                onChange={(e) =>
                  onUpdate({ sessionMaxAgeDays: Math.max(0, parseInt(e.target.value, 10) || 0) })
                }
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Project Prefix Filter</label>
              <input
                className={styles.dirInput}
                type="text"
                value={config.sessionImportProjectPrefix}
                onChange={(e) => onUpdate({ sessionImportProjectPrefix: e.target.value })}
                placeholder="Optional absolute path prefix"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Hidden Imported Sessions</label>
              <div className={styles.inlineRow}>
                <span className={styles.inlineHint}>{config.hiddenSessionIds.length} hidden</span>
                <button
                  className={styles.clearBtn}
                  onClick={() => onUpdate({ hiddenSessionIds: [] })}
                  disabled={config.hiddenSessionIds.length === 0}
                >
                  Reset Hidden
                </button>
              </div>
            </div>
          </div>}

          {/* ── Remote Control ─────────────────────────────────── */}
          {isVisible('remote') && <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Remote Control</h3>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.remoteControlEnabled}
                  onChange={(e) => onUpdate({ remoteControlEnabled: e.target.checked })}
                  className={styles.checkbox}
                />
                <span>Auto-enable remote control on startup</span>
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Session Timeout (minutes)</label>
              <input
                className={styles.numberInput}
                type="number"
                min={30}
                max={1440}
                value={config.remoteSessionTimeoutMinutes}
                onChange={(e) =>
                  onUpdate({
                    remoteSessionTimeoutMinutes: Math.max(30, Math.min(1440, parseInt(e.target.value, 10) || 480))
                  })
                }
              />
            </div>
          </div>}

          {/* ── Terminal ───────────────────────────────────────── */}
          {isVisible('terminal') && <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Terminal</h3>

            <div className={styles.field}>
              <label className={styles.label}>Shell Wrapping</label>
              <div className={styles.segmented}>
                {(['auto', 'direct', 'login', 'custom'] as TerminalShellMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={`${styles.segment} ${config.terminalShellMode === mode ? styles.active : ''}`}
                    onClick={() => onUpdate({ terminalShellMode: mode })}
                  >
                    {mode === 'auto' ? 'Auto' : mode === 'direct' ? 'Direct' : mode === 'login' ? 'Login shell' : 'Custom'}
                  </button>
                ))}
              </div>
              <span className={styles.inlineHint}>
                Login shell wraps agents in <code>$SHELL -lc</code> so your PATH and rc files are loaded — fixes &quot;command not found&quot; on Arch/NixOS. Auto picks login on macOS/Linux, direct on Windows.
              </span>
            </div>

            {config.terminalShellMode === 'custom' && (
              <>
                <div className={styles.field}>
                  <label className={styles.label}>Custom Shell Path</label>
                  <input
                    className={styles.dirInput}
                    type="text"
                    value={config.terminalShellPath}
                    onChange={(e) => onUpdate({ terminalShellPath: e.target.value })}
                    placeholder="/usr/bin/fish or C:\\Program Files\\PowerShell\\7\\pwsh.exe"
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Shell Args</label>
                  <input
                    className={styles.dirInput}
                    type="text"
                    value={config.terminalShellArgs}
                    onChange={(e) => onUpdate({ terminalShellArgs: e.target.value })}
                    placeholder="-lc"
                  />
                  <span className={styles.inlineHint}>Whitespace-separated. The agent command is appended as the final argument.</span>
                </div>
              </>
            )}

            {config.terminalShellMode === 'login' && (
              <div className={styles.field}>
                <label className={styles.label}>Shell Args Override (optional)</label>
                <input
                  className={styles.dirInput}
                  type="text"
                  value={config.terminalShellArgs}
                  onChange={(e) => onUpdate({ terminalShellArgs: e.target.value })}
                  placeholder="-lc (default)"
                />
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Font Family</label>
              <input
                className={styles.dirInput}
                type="text"
                value={config.terminalFontFamily}
                onChange={(e) => onUpdate({ terminalFontFamily: e.target.value })}
                placeholder='"SF Mono", "Menlo", monospace'
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Font Size</label>
              <input
                className={styles.numberInput}
                type="number"
                min={8}
                max={32}
                value={config.terminalFontSize}
                onChange={(e) =>
                  onUpdate({
                    terminalFontSize: Math.max(8, Math.min(32, parseInt(e.target.value, 10) || 12))
                  })
                }
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Cursor Style</label>
              <div className={styles.segmented}>
                {(['bar', 'block', 'underline'] as TerminalCursorStyle[]).map((style) => (
                  <button
                    key={style}
                    className={`${styles.segment} ${config.terminalCursorStyle === style ? styles.active : ''}`}
                    onClick={() => onUpdate({ terminalCursorStyle: style })}
                  >
                    {style[0].toUpperCase() + style.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.terminalCursorBlink}
                  onChange={(e) => onUpdate({ terminalCursorBlink: e.target.checked })}
                  className={styles.checkbox}
                />
                <span>Blink cursor</span>
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.terminalEnableWebgl}
                  onChange={(e) => onUpdate({ terminalEnableWebgl: e.target.checked })}
                  className={styles.checkbox}
                />
                <span>Enable WebGL renderer (faster, requires GPU)</span>
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Background Terminals (Cmd+J)</label>
              <div className={styles.segmented}>
                {(['explicit', 'lru', 'idle'] as FreeTerminalLifecyclePolicy[]).map((policy) => (
                  <button
                    key={policy}
                    className={`${styles.segment} ${config.freeTerminalLifecyclePolicy === policy ? styles.active : ''}`}
                    onClick={() => onUpdate({ freeTerminalLifecyclePolicy: policy })}
                  >
                    {policy === 'explicit' ? 'Explicit' : policy === 'lru' ? 'LRU' : 'Idle timeout'}
                  </button>
                ))}
              </div>
              <p className={styles.hint}>
                Hidden terminals keep running per-project.{' '}
                {config.freeTerminalLifecyclePolicy === 'explicit' && 'Only killed when you press the kill button.'}
                {config.freeTerminalLifecyclePolicy === 'lru' && 'Oldest terminal is killed when the cap is reached.'}
                {config.freeTerminalLifecyclePolicy === 'idle' && 'Killed after the configured idle time with no input.'}
              </p>
            </div>

            {config.freeTerminalLifecyclePolicy === 'lru' && (
              <div className={styles.field}>
                <label className={styles.label}>Max background terminals</label>
                <input
                  className={styles.dirInput}
                  type="number"
                  min={1}
                  max={50}
                  value={config.freeTerminalMaxCount}
                  onChange={(e) =>
                    onUpdate({
                      freeTerminalMaxCount: Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 6))
                    })
                  }
                />
              </div>
            )}

            {config.freeTerminalLifecyclePolicy === 'idle' && (
              <div className={styles.field}>
                <label className={styles.label}>Idle timeout (minutes)</label>
                <input
                  className={styles.dirInput}
                  type="number"
                  min={1}
                  max={1440}
                  value={config.freeTerminalIdleTimeoutMinutes}
                  onChange={(e) =>
                    onUpdate({
                      freeTerminalIdleTimeoutMinutes: Math.max(
                        1,
                        Math.min(1440, parseInt(e.target.value, 10) || 60)
                      )
                    })
                  }
                />
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label}>Scrollback lines</label>
              <input
                className={styles.dirInput}
                type="number"
                min={100}
                max={100000}
                value={config.freeTerminalScrollbackLines}
                onChange={(e) =>
                  onUpdate({
                    freeTerminalScrollbackLines: Math.max(
                      100,
                      Math.min(100000, parseInt(e.target.value, 10) || 5000)
                    )
                  })
                }
              />
            </div>
          </div>}

          {/* ── Observability ──────────────────────────────────── */}
          {isVisible('observability') && <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Observability</h3>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.enableRemoteErrorReporting}
                  onChange={(e) => onUpdate({ enableRemoteErrorReporting: e.target.checked })}
                  className={styles.checkbox}
                />
                <span>Enable remote error reporting (opt-in)</span>
              </label>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Reporting Endpoint</label>
              <input
                className={styles.dirInput}
                type="text"
                value={config.errorReportingEndpoint}
                onChange={(e) => onUpdate({ errorReportingEndpoint: e.target.value })}
                placeholder="https://your-endpoint.example.com/hydra-errors"
              />
            </div>

            <div className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={config.includeSensitiveDiagnostics}
                  onChange={(e) => onUpdate({ includeSensitiveDiagnostics: e.target.checked })}
                  className={styles.checkbox}
                />
                <span>Include sensitive paths/prompts in exports</span>
              </label>
            </div>

            <div className={styles.field}>
              <div className={styles.inlineRow}>
                <label className={styles.label}>Diagnostics</label>
                <button
                  className={styles.clearBtn}
                  onClick={async () => {
                    setExportState('Exporting...')
                    const result = await window.hydra.exportDiagnostics()
                    if (result.error) {
                      setExportState(`Export failed: ${result.error}`)
                      return
                    }
                    if (!result.path) {
                      setExportState('Export canceled.')
                      return
                    }
                    setExportState(`Saved to ${result.path}`)
                  }}
                >
                  Export Diagnostics
                </button>
              </div>
              {exportState && <span className={styles.inlineHint}>{exportState}</span>}
            </div>
          </div>}

          {isVisible('shortcuts') && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Shortcuts</h3>
              <ShortcutsTab keybindings={keybindings} keybindingsPath={keybindingsPath} />
            </div>
          )}

          {isVisible('skills') && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Skills</h3>
              <SkillsTab />
            </div>
          )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
