import styles from './TabBar.module.css'

export interface EditorTab {
  path: string
  dirty: boolean
}

interface TabBarProps {
  tabs: EditorTab[]
  activeTabPath: string | null
  projectDir?: string
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
}

export function TabBar({ tabs, activeTabPath, projectDir, onSelectTab, onCloseTab }: TabBarProps) {
  if (tabs.length === 0) return null

  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => {
        const fileName = tab.path.split('/').pop() || tab.path
        const isActive = tab.path === activeTabPath
        const absolutePath = projectDir
          ? (projectDir.endsWith('/') ? `${projectDir}${tab.path}` : `${projectDir}/${tab.path}`)
          : tab.path

        return (
          <div
            key={tab.path}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            onClick={() => onSelectTab(tab.path)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onCloseTab(tab.path)
              }
            }}
            title={tab.path}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', absolutePath)
              e.dataTransfer.setData('application/x-hydra-filepath', absolutePath)
              e.dataTransfer.effectAllowed = 'copy'
            }}
          >
            <span className={styles.tabName}>
              {tab.dirty && <span className={styles.dirtyDot} />}
              {fileName}
            </span>
            <button
              className={styles.closeBtn}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.path)
              }}
              aria-label={`Close ${fileName}`}
            >
              <CloseIcon />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  )
}
