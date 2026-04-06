import { useState, useRef, useEffect } from 'react'
import type { AgentStatus, ProviderId } from '@shared/types'
import type { FilterState } from './useFilterSort'
import styles from './FilterDropdown.module.css'

interface FilterDropdownProps {
  filter: FilterState
  onChange: (filter: FilterState) => void
  onClear: () => void
  hasActive: boolean
}

const STATUSES: { value: AgentStatus; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'idle', label: 'Idle' },
  { value: 'errored', label: 'Errored' },
]

const PROVIDERS: { value: ProviderId; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'opencode', label: 'OpenCode' },
]

const AGE_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Last 1d' },
  { value: 7, label: 'Last 7d' },
  { value: 30, label: 'Last 30d' },
]

export function FilterDropdown({ filter, onChange, onClear, hasActive }: FilterDropdownProps) {
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

  const toggleStatus = (s: AgentStatus) => {
    const next = filter.statuses.includes(s)
      ? filter.statuses.filter((v) => v !== s)
      : [...filter.statuses, s]
    onChange({ ...filter, statuses: next })
  }

  const toggleProvider = (p: ProviderId) => {
    const next = filter.providers.includes(p)
      ? filter.providers.filter((v) => v !== p)
      : [...filter.providers, p]
    onChange({ ...filter, providers: next })
  }

  const toggleFlag = (flag: 'yolo' | 'manager') => {
    onChange({ ...filter, [flag]: filter[flag] === true ? null : true })
  }

  const setAge = (days: number | null) => {
    onChange({ ...filter, ageDays: days })
  }

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        title="Filter agents"
      >
        <FilterIcon />
        {hasActive && <span className={styles.badge} />}
      </button>
      {open && (
        <div className={styles.dropdown}>
          <div className={styles.sectionLabel}>STATUS</div>
          {STATUSES.map((s) => {
            const checked = filter.statuses.includes(s.value)
            return (
              <button
                key={s.value}
                className={`${styles.row} ${checked ? styles.rowActive : ''}`}
                onClick={() => toggleStatus(s.value)}
              >
                <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>
                  {checked ? '✓' : ''}
                </span>
                {s.label}
              </button>
            )
          })}

          <div className={styles.divider} />
          <div className={styles.sectionLabel}>PROVIDER</div>
          {PROVIDERS.map((p) => {
            const checked = filter.providers.includes(p.value)
            return (
              <button
                key={p.value}
                className={`${styles.row} ${checked ? styles.rowActive : ''}`}
                onClick={() => toggleProvider(p.value)}
              >
                <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>
                  {checked ? '✓' : ''}
                </span>
                {p.label}
              </button>
            )
          })}

          <div className={styles.divider} />
          <div className={styles.sectionLabel}>FLAGS</div>
          {(['yolo', 'manager'] as const).map((flag) => {
            const checked = filter[flag] === true
            return (
              <button
                key={flag}
                className={`${styles.row} ${checked ? styles.rowActive : ''}`}
                onClick={() => toggleFlag(flag)}
              >
                <span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ''}`}>
                  {checked ? '✓' : ''}
                </span>
                {flag === 'yolo' ? 'Yolo' : 'Manager'}
              </button>
            )
          })}

          <div className={styles.divider} />
          <div className={styles.sectionLabel}>AGE</div>
          {AGE_OPTIONS.map((opt) => {
            const checked = filter.ageDays === opt.value
            return (
              <button
                key={opt.label}
                className={`${styles.row} ${checked ? styles.rowActive : ''}`}
                onClick={() => setAge(opt.value)}
              >
                <span className={styles.checkbox} style={{ borderRadius: 'var(--radius-full)' }}>
                  {checked ? '●' : ''}
                </span>
                {opt.label}
              </button>
            )
          })}

          {hasActive && (
            <>
              <div className={styles.divider} />
              <button className={styles.clearBtn} onClick={onClear}>
                Clear all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}
