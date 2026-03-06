# Sidebar Filter & Sort Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add filter and sort controls to the sidebar so users can sort agents by recency/status/name/provider and filter by status/provider/flags/age.

**Architecture:** Two icon buttons (sort, filter) added to the SearchBar row. Each opens a dropdown popover. Active filters display as dismissible chips below the search bar. All state is local to `Sidebar.tsx` — no IPC or shared type changes.

**Tech Stack:** React, CSS Modules, existing design tokens from `src/styles/tokens.css`

---

### Task 1: Sort/Filter Types and Shared Hook

**Files:**
- Create: `src/components/Sidebar/useFilterSort.ts`

**Step 1: Create the types and hook**

```ts
import { useState, useMemo, useCallback } from 'react'
import type { AgentState, ProjectGroup, AgentStatus, ProviderId } from '@shared/types'

export type SortKey = 'recency' | 'status' | 'name' | 'provider'

export interface FilterState {
  statuses: AgentStatus[]
  providers: ProviderId[]
  yolo: boolean | null
  manager: boolean | null
  ageDays: number | null // 1, 7, 30, or null (= use default)
}

export const EMPTY_FILTER: FilterState = {
  statuses: [],
  providers: [],
  yolo: null,
  manager: null,
  ageDays: null,
}

const STATUS_ORDER: Record<string, number> = {
  running: 0,
  starting: 1,
  idle: 2,
  errored: 3,
}

function sortAgents(agents: AgentState[], key: SortKey): AgentState[] {
  const sorted = [...agents]
  switch (key) {
    case 'recency':
      return sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    case 'status':
      return sorted.sort(
        (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      )
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name))
    case 'provider':
      return sorted.sort((a, b) => a.provider.localeCompare(b.provider))
    default:
      return sorted
  }
}

function filterAgents(agents: AgentState[], filter: FilterState, ageDays: number | null): AgentState[] {
  const effectiveAge = filter.ageDays ?? ageDays
  const cutoff = effectiveAge && effectiveAge > 0
    ? Date.now() - effectiveAge * 24 * 60 * 60 * 1000
    : null

  return agents.filter((a) => {
    if (filter.statuses.length > 0 && !filter.statuses.includes(a.status)) return false
    if (filter.providers.length > 0 && !filter.providers.includes(a.provider)) return false
    if (filter.yolo === true && !a.yolo) return false
    if (filter.manager === true && !a.isManager) return false
    if (cutoff !== null) {
      const isActive = a.status === 'running' || a.status === 'starting'
      if (!isActive && new Date(a.createdAt).getTime() < cutoff) return false
    }
    return true
  })
}

export function isFilterActive(filter: FilterState): boolean {
  return (
    filter.statuses.length > 0 ||
    filter.providers.length > 0 ||
    filter.yolo !== null ||
    filter.manager !== null ||
    filter.ageDays !== null
  )
}

export interface FilterChip {
  key: string
  label: string
}

export function getActiveChips(filter: FilterState): FilterChip[] {
  const chips: FilterChip[] = []
  for (const s of filter.statuses) chips.push({ key: `status:${s}`, label: s })
  for (const p of filter.providers) chips.push({ key: `provider:${p}`, label: p })
  if (filter.yolo === true) chips.push({ key: 'flag:yolo', label: 'yolo' })
  if (filter.manager === true) chips.push({ key: 'flag:manager', label: 'manager' })
  if (filter.ageDays !== null) chips.push({ key: 'age', label: `< ${filter.ageDays}d` })
  return chips
}

export function removeChip(filter: FilterState, chipKey: string): FilterState {
  if (chipKey.startsWith('status:')) {
    const val = chipKey.slice(7) as AgentStatus
    return { ...filter, statuses: filter.statuses.filter((s) => s !== val) }
  }
  if (chipKey.startsWith('provider:')) {
    const val = chipKey.slice(9) as ProviderId
    return { ...filter, providers: filter.providers.filter((p) => p !== val) }
  }
  if (chipKey === 'flag:yolo') return { ...filter, yolo: null }
  if (chipKey === 'flag:manager') return { ...filter, manager: null }
  if (chipKey === 'age') return { ...filter, ageDays: null }
  return filter
}

export function useFilterSort(projectGroups: ProjectGroup[], defaultAgeDays: number) {
  const [sortKey, setSortKey] = useState<SortKey>('recency')
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER)

  const processed = useMemo(() => {
    return projectGroups
      .map((group) => ({
        ...group,
        agents: sortAgents(
          filterAgents(group.agents, filter, defaultAgeDays > 0 ? defaultAgeDays : null),
          sortKey
        ),
      }))
      .filter((group) => group.agents.length > 0)
  }, [projectGroups, sortKey, filter, defaultAgeDays])

  const chips = useMemo(() => getActiveChips(filter), [filter])
  const hasActiveFilter = useMemo(() => isFilterActive(filter), [filter])

  const dismissChip = useCallback(
    (chipKey: string) => setFilter((f) => removeChip(f, chipKey)),
    []
  )

  const clearAll = useCallback(() => setFilter(EMPTY_FILTER), [])

  return {
    sortKey,
    setSortKey,
    filter,
    setFilter,
    processed,
    chips,
    hasActiveFilter,
    dismissChip,
    clearAll,
  }
}
```

**Step 2: Commit**

```bash
git add src/components/Sidebar/useFilterSort.ts
git commit -m "feat(sidebar): add useFilterSort hook with sort/filter logic"
```

---

### Task 2: SortDropdown Component

**Files:**
- Create: `src/components/Sidebar/SortDropdown.tsx`
- Create: `src/components/Sidebar/SortDropdown.module.css`

**Step 1: Create the CSS module**

```css
.wrapper {
  position: relative;
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.trigger:hover {
  background: var(--color-sidebar-hover);
  color: var(--color-text-secondary);
}

.triggerActive {
  color: var(--color-accent);
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 160px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-1) 0;
  z-index: 100;
}

.option {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  transition: background var(--transition-fast);
}

.option:hover {
  background: var(--color-surface-hover);
}

.optionActive {
  color: var(--color-accent);
}

.check {
  width: 14px;
  flex-shrink: 0;
  text-align: center;
}
```

**Step 2: Create the component**

```tsx
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
```

**Step 3: Commit**

```bash
git add src/components/Sidebar/SortDropdown.tsx src/components/Sidebar/SortDropdown.module.css
git commit -m "feat(sidebar): add SortDropdown component"
```

---

### Task 3: FilterDropdown Component

**Files:**
- Create: `src/components/Sidebar/FilterDropdown.tsx`
- Create: `src/components/Sidebar/FilterDropdown.module.css`

**Step 1: Create the CSS module**

```css
.wrapper {
  position: relative;
}

.trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  transition: all var(--transition-fast);
  flex-shrink: 0;
  position: relative;
}

.trigger:hover {
  background: var(--color-sidebar-hover);
  color: var(--color-text-secondary);
}

.badge {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-accent);
}

.dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 180px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-2) 0;
  z-index: 100;
}

.sectionLabel {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-muted);
  padding: var(--space-1) var(--space-3);
  letter-spacing: 0.04em;
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-1) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  transition: background var(--transition-fast);
}

.row:hover {
  background: var(--color-surface-hover);
}

.rowActive {
  color: var(--color-accent);
}

.checkbox {
  width: 14px;
  height: 14px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 10px;
  transition: all var(--transition-fast);
}

.checkboxChecked {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

.divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--space-1) 0;
}

.clearBtn {
  display: block;
  width: calc(100% - var(--space-3) * 2);
  margin: var(--space-1) var(--space-3) 0;
  padding: var(--space-1) 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
  text-align: center;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.clearBtn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}
```

**Step 2: Create the component**

```tsx
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
]

const AGE_OPTIONS: { value: number | null; label: string }[] = [
  { value: 1, label: 'Last 1d' },
  { value: 7, label: 'Last 7d' },
  { value: 30, label: 'Last 30d' },
  { value: null, label: 'All' },
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
```

**Step 3: Commit**

```bash
git add src/components/Sidebar/FilterDropdown.tsx src/components/Sidebar/FilterDropdown.module.css
git commit -m "feat(sidebar): add FilterDropdown component"
```

---

### Task 4: FilterChips Component

**Files:**
- Create: `src/components/Sidebar/FilterChips.tsx`
- Create: `src/components/Sidebar/FilterChips.module.css`

**Step 1: Create the CSS module**

```css
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  padding: 0 var(--space-3) var(--space-1);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px var(--space-2) 1px var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-accent);
  background: var(--color-accent-subtle);
  border-radius: var(--radius-full);
  white-space: nowrap;
  transition: background var(--transition-fast);
}

.chip:hover {
  background: var(--color-accent);
  color: var(--color-accent-text);
}

.chipX {
  font-size: 10px;
  margin-left: 2px;
  opacity: 0.7;
}
```

**Step 2: Create the component**

```tsx
import type { FilterChip } from './useFilterSort'
import styles from './FilterChips.module.css'

interface FilterChipsProps {
  chips: FilterChip[]
  onDismiss: (chipKey: string) => void
}

export function FilterChips({ chips, onDismiss }: FilterChipsProps) {
  if (chips.length === 0) return null
  return (
    <div className={styles.row}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          className={styles.chip}
          onClick={() => onDismiss(chip.key)}
          title={`Remove ${chip.label} filter`}
        >
          {chip.label}
          <span className={styles.chipX}>×</span>
        </button>
      ))}
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/Sidebar/FilterChips.tsx src/components/Sidebar/FilterChips.module.css
git commit -m "feat(sidebar): add FilterChips component"
```

---

### Task 5: Update SearchBar to Accept Icon Slots

**Files:**
- Modify: `src/components/Sidebar/SearchBar.tsx`
- Modify: `src/components/Sidebar/SearchBar.module.css`

**Step 1: Add actions slot to SearchBar**

In `SearchBar.tsx`, add a `children` prop for the action buttons:

```tsx
import type { ReactNode } from 'react'
import styles from './SearchBar.module.css'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  children?: ReactNode
}

export function SearchBar({ value, onChange, children }: SearchBarProps) {
  return (
    <div className={styles.wrapper}>
      <SearchIcon />
      <input
        className={styles.input}
        type="text"
        placeholder="Search..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

// ... keep SearchIcon and ClearIcon unchanged
```

**Step 2: Add `.actions` style to `SearchBar.module.css`**

Append to the file:

```css
.actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: var(--space-1);
  flex-shrink: 0;
}
```

**Step 3: Commit**

```bash
git add src/components/Sidebar/SearchBar.tsx src/components/Sidebar/SearchBar.module.css
git commit -m "feat(sidebar): add actions slot to SearchBar"
```

---

### Task 6: Wire Everything Into Sidebar

**Files:**
- Modify: `src/components/Sidebar/Sidebar.tsx`

**Step 1: Replace the existing filter/sort logic with the hook**

Replace the full `Sidebar.tsx` content with this updated version. Key changes:
- Remove the manual `recentGroups` and `filteredGroups` useMemo blocks
- Import and use `useFilterSort` hook
- Pass sort/filter dropdowns as children to SearchBar
- Render FilterChips below the search wrapper

```tsx
import { useState, useCallback, useRef } from 'react'
import { ProjectTree } from './ProjectTree'
import { SearchBar } from './SearchBar'
import { SortDropdown } from './SortDropdown'
import { FilterDropdown } from './FilterDropdown'
import { FilterChips } from './FilterChips'
import { useFilterSort } from './useFilterSort'
import type { ProjectGroup, EditorId } from '@shared/types'
import styles from './Sidebar.module.css'

interface SidebarProps {
  projectGroups: ProjectGroup[]
  selectedAgentId: string | null
  onSelectAgent: (agentId: string) => void
  onNewAgent: () => void
  onNewAgentForProject: (projectDir: string) => void
  width: number
  onWidthChange: (width: number) => void
  sessionMaxAgeDays: number
  defaultEditor?: EditorId
}

const MIN_WIDTH = 200
const MAX_WIDTH = 480

export function Sidebar({
  projectGroups,
  selectedAgentId,
  onSelectAgent,
  onNewAgent,
  onNewAgentForProject,
  width,
  onWidthChange,
  sessionMaxAgeDays,
  defaultEditor = 'vscode'
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const {
    sortKey,
    setSortKey,
    filter,
    setFilter,
    processed,
    chips,
    hasActiveFilter,
    dismissChip,
    clearAll,
  } = useFilterSort(projectGroups, sessionMaxAgeDays)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      startXRef.current = e.clientX
      startWidthRef.current = width
      setIsDragging(true)

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onPointerMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startXRef.current
        const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta))
        onWidthChange(newWidth)
      }

      const onPointerUp = () => {
        setIsDragging(false)
        target.releasePointerCapture(e.pointerId)
        target.removeEventListener('pointermove', onPointerMove)
        target.removeEventListener('pointerup', onPointerUp)
      }

      target.addEventListener('pointermove', onPointerMove)
      target.addEventListener('pointerup', onPointerUp)
    },
    [width, onWidthChange]
  )

  const filteredGroups = searchQuery
    ? processed
        .map((group) => ({
          ...group,
          agents: group.agents.filter(
            (a) =>
              a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
              group.projectName.toLowerCase().includes(searchQuery.toLowerCase())
          )
        }))
        .filter((group) => group.agents.length > 0)
    : processed

  return (
    <aside className={styles.sidebar} style={{ width }}>
      <div className={styles.searchWrapper}>
        <SearchBar value={searchQuery} onChange={setSearchQuery}>
          <SortDropdown value={sortKey} onChange={setSortKey} />
          <FilterDropdown
            filter={filter}
            onChange={setFilter}
            onClear={clearAll}
            hasActive={hasActiveFilter}
          />
        </SearchBar>
      </div>

      <FilterChips chips={chips} onDismiss={dismissChip} />

      <div className={styles.sectionLabel}>PROJECTS</div>

      <div className={styles.treeContainer}>
        {filteredGroups.length === 0 ? (
          <div className={styles.empty}>
            {searchQuery || hasActiveFilter ? 'No matches' : 'No agents running'}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <ProjectTree
              key={group.projectDir}
              group={group}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
              onNewAgentForProject={onNewAgentForProject}
              defaultEditor={defaultEditor}
            />
          ))
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.divider} />
        <button className={styles.newAgentBtn} onClick={onNewAgent}>
          <PlusIcon />
          New Agent
        </button>
      </div>

      <div
        className={`${styles.resizeHandle} ${isDragging ? styles.resizeHandleActive : ''}`}
        onPointerDown={handlePointerDown}
      />
    </aside>
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
```

**Step 2: Commit**

```bash
git add src/components/Sidebar/Sidebar.tsx
git commit -m "feat(sidebar): wire filter/sort into Sidebar with chips"
```

---

### Task 7: Tests

**Files:**
- Create: `src/components/Sidebar/useFilterSort.test.ts`

**Step 1: Write tests for the hook logic**

```ts
// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { AgentState, ProjectGroup } from '@shared/types'
import {
  EMPTY_FILTER,
  getActiveChips,
  isFilterActive,
  removeChip,
} from './useFilterSort'

function agent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: '1',
    name: 'Agent',
    projectDir: '/tmp',
    provider: 'claude',
    model: 'sonnet',
    yolo: false,
    isManager: false,
    sessionId: null,
    initialPrompt: '',
    createdAt: new Date().toISOString(),
    status: 'idle',
    pid: null,
    restartCount: 0,
    startedAt: null,
    ...overrides,
  }
}

describe('isFilterActive', () => {
  it('returns false for empty filter', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
  })

  it('returns true when statuses set', () => {
    expect(isFilterActive({ ...EMPTY_FILTER, statuses: ['running'] })).toBe(true)
  })

  it('returns true when ageDays set', () => {
    expect(isFilterActive({ ...EMPTY_FILTER, ageDays: 7 })).toBe(true)
  })

  it('returns true when yolo set', () => {
    expect(isFilterActive({ ...EMPTY_FILTER, yolo: true })).toBe(true)
  })
})

describe('getActiveChips', () => {
  it('returns empty for empty filter', () => {
    expect(getActiveChips(EMPTY_FILTER)).toEqual([])
  })

  it('returns chips for each active filter', () => {
    const chips = getActiveChips({
      statuses: ['running', 'idle'],
      providers: ['claude'],
      yolo: true,
      manager: null,
      ageDays: 7,
    })
    expect(chips).toHaveLength(5)
    expect(chips.map((c) => c.key)).toEqual([
      'status:running',
      'status:idle',
      'provider:claude',
      'flag:yolo',
      'age',
    ])
  })
})

describe('removeChip', () => {
  it('removes a status chip', () => {
    const f = { ...EMPTY_FILTER, statuses: ['running' as const, 'idle' as const] }
    const result = removeChip(f, 'status:running')
    expect(result.statuses).toEqual(['idle'])
  })

  it('removes age chip', () => {
    const f = { ...EMPTY_FILTER, ageDays: 7 }
    const result = removeChip(f, 'age')
    expect(result.ageDays).toBeNull()
  })

  it('removes yolo flag', () => {
    const f = { ...EMPTY_FILTER, yolo: true }
    const result = removeChip(f, 'flag:yolo')
    expect(result.yolo).toBeNull()
  })

  it('removes provider chip', () => {
    const f = { ...EMPTY_FILTER, providers: ['claude' as const, 'codex' as const] }
    const result = removeChip(f, 'provider:claude')
    expect(result.providers).toEqual(['codex'])
  })
})
```

**Step 2: Run tests**

```bash
npx vitest run src/components/Sidebar/useFilterSort.test.ts
```

Expected: All tests PASS.

**Step 3: Run full test suite**

```bash
npm test
```

Expected: All existing tests still pass.

**Step 4: Commit**

```bash
git add src/components/Sidebar/useFilterSort.test.ts
git commit -m "test(sidebar): add useFilterSort unit tests"
```

---

### Task 8: Visual QA and Final Commit

**Step 1: Run the app**

```bash
npm run dev
```

**Step 2: Verify visually**

- Sort icon visible next to search bar
- Click sort icon: dropdown appears with Recency checked
- Change sort to Status: running agents move to top
- Click filter icon: dropdown with Status/Provider/Flags/Age sections
- Check "Running" filter: only running agents visible, chip appears
- Dismiss chip: filter clears
- Set age to "Last 1d": older agents hidden
- Search still works alongside filters
- Both dropdowns close on Escape and outside click
- Filter badge dot appears when any filter active

**Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors.

**Step 4: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "feat(sidebar): filter and sort controls complete"
```
