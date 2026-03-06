import { useState, useMemo, useCallback } from 'react'
import type { AgentState, ProjectGroup, AgentStatus, ProviderId } from '@shared/types'

export type SortKey = 'recency' | 'status' | 'name' | 'provider'

export interface FilterState {
  statuses: AgentStatus[]
  providers: ProviderId[]
  yolo: boolean | null
  manager: boolean | null
  ageDays: number | null
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
