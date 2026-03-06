import { useState, useRef, useEffect } from 'react'
import type { SortKey } from './useFilterSort'
import styles from './SortDropdown.module.css'

const OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recency', label: 'Recent' },
  { key: 'status', label: 'Status' },
  { key: 'name', label: 'Name' },
  { key: 'provider', label: 'Provider' },
]

interface SortDropdownProps {
  value: SortKey
  onChange: (key: SortKey) => void
}

export function SortDropdown({ value, onChange }: SortDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={`${styles.trigger} ${value !== 'recency' ? styles.triggerActive : ''}`}
        onClick={() => setOpen(!open)}
        title="Sort agents"
      >
        <SortIcon />
      </button>
      {open && (
        <div className={styles.dropdown}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.key}
              className={`${styles.option} ${value === opt.key ? styles.optionActive : ''}`}
              onClick={() => {
                onChange(opt.key)
                setOpen(false)
              }}
            >
              <span className={styles.check}>{value === opt.key ? '✓' : ''}</span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function SortIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18M3 12h12M3 18h6" />
    </svg>
  )
}
