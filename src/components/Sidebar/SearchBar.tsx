import { useEffect, useRef, type ReactNode } from 'react'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onEscapeWithValue?: () => void
  children?: ReactNode
}

export const SIDEBAR_SEARCH_FOCUS_EVENT = 'hydra:focus-sidebar-search'

export function SearchBar({ value, onChange, onEscapeWithValue, children }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = () => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    }
    window.addEventListener(SIDEBAR_SEARCH_FOCUS_EVENT, handler)
    return () => window.removeEventListener(SIDEBAR_SEARCH_FOCUS_EVENT, handler)
  }, [])

  return (
    <div className={styles.wrapper}>
      <SearchIcon />
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        placeholder="Search..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value && onEscapeWithValue) {
            e.preventDefault()
            e.stopPropagation()
            inputRef.current?.blur()
            onEscapeWithValue()
          }
        }}
      />
      {value && (
        <button className={styles.clear} onClick={() => onChange('')}>
          <ClearIcon />
        </button>
      )}
      {children && <div className={styles.actions}>{children}</div>}
    </div>
  )
}

function SearchIcon() {
  return (
    <svg className={styles.icon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
