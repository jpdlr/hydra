import { useState, useCallback, useMemo } from 'react'
import { arrayMove } from '@dnd-kit/sortable'
import type { AgentState } from '@shared/types'

const STORAGE_KEY = 'hydra:tile-order:v1'

type TileOrderMap = Record<string, string[]>

function readStoredOrders(): TileOrderMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as TileOrderMap
  } catch {
    return {}
  }
}

function writeStoredOrders(orders: TileOrderMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
  } catch {
    // Best-effort persistence
  }
}

export interface UseTileOrderResult {
  orderedIds: string[]
  handleReorder: (activeId: string, overId: string) => void
  hasCustomOrder: boolean
  resetOrder: () => void
}

export function useTileOrder(
  projectDir: string | null,
  agents: AgentState[],
  isRunningTab: boolean
): UseTileOrderResult {
  const agentIds = useMemo(() => agents.map((a) => a.id), [agents])

  const [orderMap, setOrderMap] = useState<TileOrderMap>(readStoredOrders)

  // Reconcile stored order with current agent list
  const orderedIds = useMemo(() => {
    if (isRunningTab || !projectDir) return agentIds

    const storedIds = orderMap[projectDir]
    if (!storedIds) return agentIds

    const currentSet = new Set(agentIds)

    // Remove IDs no longer present
    const filtered = storedIds.filter((id) => currentSet.has(id))
    const filteredSet = new Set(filtered)

    // Append new agents at end
    const newIds = agentIds.filter((id) => !filteredSet.has(id))

    return [...filtered, ...newIds]
  }, [agentIds, orderMap, projectDir, isRunningTab])

  const hasCustomOrder = !!(projectDir && orderMap[projectDir])

  const handleReorder = useCallback(
    (activeId: string, overId: string) => {
      if (isRunningTab || !projectDir) return

      const oldIndex = orderedIds.indexOf(activeId)
      const newIndex = orderedIds.indexOf(overId)
      if (oldIndex === -1 || newIndex === -1) return

      const newOrder = arrayMove(orderedIds, oldIndex, newIndex)

      setOrderMap((prev) => {
        const next = { ...prev, [projectDir]: newOrder }
        writeStoredOrders(next)
        return next
      })
    },
    [isRunningTab, projectDir, orderedIds]
  )

  const resetOrder = useCallback(() => {
    if (!projectDir) return

    setOrderMap((prev) => {
      const next = { ...prev }
      delete next[projectDir]
      writeStoredOrders(next)
      return next
    })
  }, [projectDir])

  return { orderedIds, handleReorder, hasCustomOrder, resetOrder }
}
