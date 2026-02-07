import type { ViewMode } from '@shared/types'
import styles from './ViewSwitcher.module.css'

interface ViewSwitcherProps {
  viewMode: ViewMode
  onToggle: () => void
}

export function ViewSwitcher({ viewMode, onToggle }: ViewSwitcherProps) {
  return (
    <div className={styles.switcher} role="tablist">
      <button
        className={`${styles.tab} ${viewMode === 'grid' ? styles.active : ''}`}
        onClick={onToggle}
        role="tab"
        aria-selected={viewMode === 'grid'}
      >
        <GridIcon />
        Grid
      </button>
      <button
        className={`${styles.tab} ${viewMode === 'chat' ? styles.active : ''}`}
        onClick={onToggle}
        role="tab"
        aria-selected={viewMode === 'chat'}
      >
        <ChatIcon />
        Chat
      </button>
    </div>
  )
}

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}
