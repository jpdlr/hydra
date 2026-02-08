import { useState } from 'react'
import type { AppConfig, ChatRenderMode, ModelId, ProviderId, ThemeId, ViewMode } from '@shared/types'
import { PROVIDER_MODELS, PROVIDER_LABELS, getDefaultModelForProvider } from '@shared/types'
import styles from './SettingsPanel.module.css'

const PROVIDERS: ProviderId[] = ['claude', 'codex']

interface SettingsPanelProps {
  config: AppConfig
  onUpdate: (partial: Partial<AppConfig>) => void
  onClose: () => void
}

export function SettingsPanel({ config, onUpdate, onClose }: SettingsPanelProps) {
  const [exportState, setExportState] = useState<string | null>(null)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* Theme */}
          <div className={styles.field}>
            <label className={styles.label}>Theme</label>
            <div className={styles.segmented}>
              <button
                className={`${styles.segment} ${config.theme === 'light' ? styles.active : ''}`}
                onClick={() => onUpdate({ theme: 'light' as ThemeId })}
              >
                Light
              </button>
              <button
                className={`${styles.segment} ${config.theme === 'dark' ? styles.active : ''}`}
                onClick={() => onUpdate({ theme: 'dark' as ThemeId })}
              >
                Dark
              </button>
            </div>
          </div>

          {/* Default view */}
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

          {/* Chat render mode */}
          <div className={styles.field}>
            <label className={styles.label}>Chat Render Mode</label>
            <div className={styles.segmented}>
              <button
                className={`${styles.segment} ${config.chatRenderMode === 'terminal' ? styles.active : ''}`}
                onClick={() => onUpdate({ chatRenderMode: 'terminal' as ChatRenderMode })}
              >
                Terminal
              </button>
              <button
                className={`${styles.segment} ${config.chatRenderMode === 'bubbles' ? styles.active : ''}`}
                onClick={() => onUpdate({ chatRenderMode: 'bubbles' as ChatRenderMode })}
              >
                Bubbles
              </button>
            </div>
          </div>

          {/* Default provider */}
          <div className={styles.field}>
            <label className={styles.label}>Default Provider</label>
            <div className={styles.segmented}>
              {PROVIDERS.map((p) => (
                <button
                  key={p}
                  className={`${styles.segment} ${config.defaultProvider === p ? styles.active : ''}`}
                  onClick={() => onUpdate({
                    defaultProvider: p,
                    defaultModel: getDefaultModelForProvider(p)
                  })}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Default model */}
          <div className={styles.field}>
            <label className={styles.label}>Default Model</label>
            <select
              className={styles.select}
              value={
                PROVIDER_MODELS[config.defaultProvider].some((m) => m.id === config.defaultModel)
                  ? config.defaultModel
                  : '__custom__'
              }
              onChange={(e) => {
                if (e.target.value !== '__custom__') {
                  onUpdate({ defaultModel: e.target.value })
                }
              }}
            >
              {PROVIDER_MODELS[config.defaultProvider].map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="__custom__">Custom...</option>
            </select>
            {!PROVIDER_MODELS[config.defaultProvider].some((m) => m.id === config.defaultModel) && (
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

          {/* Max agents */}
          <div className={styles.field}>
            <label className={styles.label}>Max Concurrent Agents</label>
            <input
              className={styles.numberInput}
              type="number"
              min={1}
              max={16}
              value={config.maxAgents}
              onChange={(e) => onUpdate({ maxAgents: parseInt(e.target.value) || 8 })}
            />
          </div>

          {/* Default project directory */}
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

          {/* Session import */}
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
            <label className={styles.label}>Session Import Limit (0 = unlimited)</label>
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
            <label className={styles.label}>Session Max Age (days, 0 = no limit)</label>
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
            <label className={styles.label}>Session Project Prefix Filter</label>
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

          <div className={styles.field}>
            <label className={styles.sectionLabel}>Observability</label>
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
            <label className={styles.label}>Remote Error Reporting Endpoint</label>
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
              <span>Include sensitive paths/prompts in exports and reports</span>
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
        </div>
      </div>
    </div>
  )
}
