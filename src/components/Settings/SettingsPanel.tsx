import type { AppConfig, ModelId, ThemeId, ViewMode } from '@shared/types'
import styles from './SettingsPanel.module.css'

interface SettingsPanelProps {
  config: AppConfig
  onUpdate: (partial: Partial<AppConfig>) => void
  onClose: () => void
}

export function SettingsPanel({ config, onUpdate, onClose }: SettingsPanelProps) {
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

          {/* Default model */}
          <div className={styles.field}>
            <label className={styles.label}>Default Model</label>
            <select
              className={styles.select}
              value={config.defaultModel}
              onChange={(e) => onUpdate({ defaultModel: e.target.value as ModelId })}
            >
              <option value="opus">Opus</option>
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
            </select>
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
        </div>
      </div>
    </div>
  )
}
