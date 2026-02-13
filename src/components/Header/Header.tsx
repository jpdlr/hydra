import { ViewSwitcher } from './ViewSwitcher'
import { OpenInButton } from './OpenInButton'
import type { ViewMode, EditorId } from '@shared/types'
import styles from './Header.module.css'

interface HeaderProps {
  viewMode: ViewMode
  onToggleViewMode: () => void
  onOpenNewAgent: () => void
  globalYolo: boolean
  onToggleGlobalYolo: () => void
  onOpenSettings: () => void
  onOpenHeadless: () => void
  onOpenUsage: () => void
  onOpenUpdates: () => void
  showUpdateAction: boolean
  updateReadyToInstall: boolean
  updateAvailable: boolean
  selectedProjectName?: string
  projectDir: string | null
  defaultEditor: EditorId
  onSetDefaultEditor: (id: EditorId) => void
}

export function Header({
  viewMode,
  onToggleViewMode,
  onOpenNewAgent,
  globalYolo,
  onToggleGlobalYolo,
  onOpenSettings,
  onOpenHeadless,
  onOpenUsage,
  onOpenUpdates,
  showUpdateAction,
  updateReadyToInstall,
  updateAvailable,
  selectedProjectName,
  projectDir,
  defaultEditor,
  onSetDefaultEditor
}: HeaderProps) {
  const isMac = navigator.platform.toLowerCase().includes('mac')
  return (
    <header className={`${styles.header} ${isMac ? styles.macHeader : ''} titlebar-drag`}>
      <div className={styles.left}>
        <div className={styles.logoMark}>
          <HydraLogo />
        </div>
        <span className={styles.logo}>HYDRA</span>
        {viewMode === 'grid' && selectedProjectName && (
          <>
            <button
              className={`${styles.projectAddBtn} titlebar-no-drag`}
              onClick={onOpenNewAgent}
              title={`New agent in ${selectedProjectName}`}
            >
              <PlusIcon />
            </button>
            <span className={styles.projectName}>{selectedProjectName}</span>
          </>
        )}
      </div>

      <div className={`${styles.center} titlebar-no-drag`}>
        <ViewSwitcher viewMode={viewMode} onToggle={onToggleViewMode} />
      </div>

      <div className={`${styles.right} titlebar-no-drag`}>
        <OpenInButton
          projectDir={projectDir}
          defaultEditor={defaultEditor}
          onSetDefaultEditor={onSetDefaultEditor}
        />
        {showUpdateAction && (
          <button
            className={`${styles.updateBtn} ${updateReadyToInstall ? styles.updateReady : updateAvailable ? styles.updateAvailable : ''}`}
            onClick={onOpenUpdates}
            title={updateReadyToInstall ? 'Update ready to install' : 'Check for app updates'}
          >
            {updateReadyToInstall ? 'Install Update' : updateAvailable ? 'Update Available' : 'Updates'}
          </button>
        )}
        <button className={styles.headlessBtn} onClick={onOpenHeadless} title="Headless Runs">
          Headless
        </button>
        <button className={styles.usageBtn} onClick={onOpenUsage} title="Usage Dashboard">
          Usage
        </button>
        <button
          className={`${styles.yoloToggle} ${globalYolo ? styles.yoloActive : ''}`}
          onClick={onToggleGlobalYolo}
          title="Toggle Global YOLO"
        >
          YOLO: {globalYolo ? 'ON' : 'OFF'}
        </button>
        <button className={styles.settingsBtn} onClick={onOpenSettings} title="Settings">
          <SettingsIcon />
        </button>
      </div>
    </header>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function HydraLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
      <g transform="translate(3, 2)">
        <path d="M7.5 20 Q5.5 14 4 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <circle cx="3.5" cy="8" r="3.2" fill="currentColor"/>
        <circle cx="3.8" cy="7.4" r="0.9" fill="var(--color-surface)"/>
        <path d="M11 20 L11 8" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"/>
        <circle cx="11" cy="4.5" r="3.8" fill="currentColor"/>
        <circle cx="11" cy="3.8" r="1" fill="var(--color-surface)"/>
        <path d="M14.5 20 Q16.5 14 18 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
        <circle cx="18.5" cy="8" r="3.2" fill="currentColor"/>
        <circle cx="18.2" cy="7.4" r="0.9" fill="var(--color-surface)"/>
        <rect x="5" y="21" width="12" height="2.4" rx="1.2" fill="currentColor" opacity="0.35"/>
      </g>
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}
